class OrchestrationManager {
constructor(config) {
    this.agents = new Map();
    this.responseCallbacks = new Map();
    this.ttsQueue = [];
    this.isProcessingTTS = false;
    
    this.config = config;

    this.agentProcessingRules = {
      'domain': {
        sequence: [
          {
            agents: ['intent-classifier'],
            acknowledgment: true,
            order: 1
          },
          {
            agents: ['rag'],
            order: 2
          }
        ]
      },
      'lead-question': {
        sequence: [
          {
            agents: ['intent-classifier'],
            order: 1
          }
        ]
      },
      'call-end': {
        sequence: [
          {
            agents: ['intent-classifier'],
            order: 1
          }
        ]
      },
      'default': {
        sequence: [
          {
            agents: ['quick-response', 'sentiment-analyzer'],
            excludeAgents: ['rag', 'intent-classifier'],
            order: 1
          }
        ]
      }
    };
  }

  // Add a new async initialization method
async initialize() {
    if (this.config?.conversationId) {
        this.conversationId = this.config.conversationId;
        this.state = await require('./ConversationState').getInstance(this.conversationId);
    }
    return this;
}


  registerAgent(agent) {
    this.agents.set(agent.name, agent);
  }

  onResponse({ type, callback }) {
    if (!this.responseCallbacks.has(type)) {
      this.responseCallbacks.set(type, new Set());
    }
    const callbacks = this.responseCallbacks.get(type);
    if (!Array.from(callbacks).some(cb => cb.toString() === callback.toString())) {
      callbacks.add(callback);
    }
  }

  async process(input) {

    console.log("OrchestrationManager process:", this.state.conversationPhase);
    // Initial greeting should only happen once
    if (this.state.conversationPhase === 'start') {
      this.state.conversationPhase = 'structured';
      return {
        text: this.customerName ? `Hey ${this.customerName}` : "Hey there",
        type: 'structured',
        priority: 'immediate'
      };
    }
    if (this.state.conversationPhase === 'structured') {
      return await this.handleStructuredPhase(input);
    }
    
    return await this.handleUnstructuredPhase(input);
  }

  async handleStructuredPhase(input) {
    const intentClassifier = this.agents.get('intent-classifier');
    
    const response = await intentClassifier.process(input, this.state);

    const preCallAudioManager = require('./PreCallAudioManager');
    
    
    if (this.state.structuredStep === 'greeting') {
      if (this.config.introduction) {
        const cacheKey = preCallAudioManager._generateCacheKey(
          this.config.introduction,
          this.config.ttsService,
          this.config.voiceType
        );

        const cachedAudioParts = preCallAudioManager.getAudio(cacheKey);
        console.log(cachedAudioParts, "cachedAudioParts")
        
        await this.queueTTSResponse({
          text:this.config.introduction || "Hello! Is this a good time to talk?",
          priority: 'immediate',
          agent: 'intent-classifier',
          order: 1,
          audio: cachedAudioParts
        });

        this.state.structuredStep = 'availability';
        return [response];
      }
    }
    
    if (this.state.structuredStep === 'availability') {
      if (response.type === 'affirmative') {
        
        await this.queueTTSResponse({
          text:  "I have a few questions about your business. Can we get started?",
          priority: 'immediate',
          agent: 'intent-classifier',
          order: 1,
        });
        this.state.conversationPhase = 'unstructured';
      }
      return [response];
    }
  }

  async handleUnstructuredPhase(input) {

    console.log("Unstructured phase*************************");
    console.log(this.config, "unstructured phase config");

    /* unstructured phases is a free flowing AI conversation. We provide
     * all kinds of helpers (memory, multiple agents, context etc)
     * to the AI to help it understand the user's intent and respond
     * accordingly.
     * 
     * But still - we have to classify unstructured based on the goal of the call.
    */

    const goal = this.config["leadPrompt"]? "lead-qualification" : "general";
    let memoryState = null;
    if(goal !=="general") {
     memoryState = this.state.getMemoryState();
    console.log("Memory State:", memoryState);
    }
    
    
    // Start all agent processes concurrently
    const agentPromises = new Map();
    
    // Start IntentClassifier
    const intentClassifier = this.agents.get('intent-classifier');
    agentPromises.set('intent-classifier', intentClassifier.process(input, {goal, memoryState}));

    // Start all other agents immediately
    Array.from(this.agents.values())
      .filter(agent => agent.name !== 'intent-classifier')
      .forEach(agent => {
        agentPromises.set(agent.name, agent.process(input));
      });

    // Wait for intent classification while others are running
    const intentResult = await agentPromises.get('intent-classifier');
    const context = {
      intentType: intentResult.type,
      confidence: intentResult.confidence
    };


    // If domain question, queue acknowledgment immediately
    if (intentResult.type === 'domain') {
      await this.queueTTSResponse({
        text: intentResult.acknowledgment,
        priority: 'immediate',
        agent: 'intent-classifier',
        order: 1
      });
    }

    // Wait for all other responses and process them based on intent
    const processSequence = async (sequence, agentPromises) => {
      const results = [];
      
      for (const step of sequence) {
        const stepResponses = await Promise.all(
          Array.from(agentPromises.entries())
            .filter(([name]) => {
              if (step.agents?.length > 0) {
                return step.agents.includes(name);
              }
              return !step.excludeAgents?.includes(name);
            })
            .map(async ([name, promise]) => {
              try {
                const response = await promise;
                const agent = this.agents.get(name);
                const shouldProcess = await agent.shouldProcess(input, context);

                if (shouldProcess) {
                  // Handle acknowledgment if needed
                  if (step.acknowledgment && response.acknowledgment) {
                    await this.queueTTSResponse({
                      text: response.acknowledgment,
                      priority: 'immediate',
                      agent: name,
                      order: step.order
                    });
                  }

                  return {
                    ...response,
                    agent: name,
                    order: step.order
                  };
                }
                return null;
              } catch (error) {
                console.error(`Error processing agent ${name}:`, error);
                return null;
              }
            })
        );

        results.push(...stepResponses.filter(r => r !== null));
      }
      
      return results;
    };

    const rules = this.agentProcessingRules[intentResult.type] || this.agentProcessingRules.default;
    const responses = await processSequence(rules.sequence, agentPromises);

    // Queue valid responses for TTS
    const validResponses = responses.filter(r => r !== null);
    for (const response of validResponses) {
      await this.queueTTSResponse(response);
    }

    return validResponses;
  }


  async queueTTSResponse(response) {
 

    // Notify all listeners (e.g., for UI updates)
    this.notifyListeners('general', response);

    // Add to TTS queue with priority and ordering
    this.ttsQueue.push(response);
    
    
    this.ttsQueue.sort((a, b) => {
      // Sort by priority first (immediate before delayed)
      if (a.priority !== b.priority) {
        return a.priority === 'immediate' ? -1 : 1;
      }
      // Then by order
      return a.order - b.order;
    });

    // Add debug log after sorting
    console.log('TTS Queue after sort:', this.ttsQueue.map(r => ({
      text: r.text.substring(0, 30) + '...',
      priority: r.priority,
      agent: r.agent,
      order: r.order
    })));

    // Start processing the queue if not already processing
    if (!this.isProcessingTTS) {
      await this.processTTSQueue();
    }
  }

  async processTTSQueue() {
    if (this.isProcessingTTS || this.ttsQueue.length === 0) return;

    this.isProcessingTTS = true;
    
    try {
      while (this.ttsQueue.length > 0) {
        const response = this.ttsQueue.shift();
        console.log('Processing TTS:', {
          agent: response.agent,
          hasAudio: !!response.audio,
          text: response.text.substring(0, 50) + '...'
        });
        
        // Wait for TTS to fully complete
        const callbacks = this.responseCallbacks.get('tts');
        if (callbacks) {
          for (const callback of callbacks) {
            // Pass both audio and text, letting the callback handle prioritization
            await callback({
              ...response,
              shouldUseAudio: !!response.audio // Flag to indicate audio availability
            });
          }
        }
        
        console.log(`TTS fully completed for: ${response.agent}`);
      }
    } catch (error) {
      console.error('Error in TTS queue processing:', error);
    } finally {
      this.isProcessingTTS = false;
      console.log('TTS Queue processing complete');
    }
  }

  notifyListeners(type, response) {
    const callbacks = this.responseCallbacks.get(type);
    console.log(`Notifying ${type} listeners:`, {
      hasCallbacks: !!callbacks,
      numberOfCallbacks: callbacks?.size || 0
    });
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(response);
        } catch (error) {
          console.error(`Error in ${type} callback:`, error);
        }
      });
    }
  }

  // When the conversation ends
  cleanup() {
    require('./ConversationState').cleanup(this.conversationId);
  }
}

module.exports = OrchestrationManager;  // Remove the curly braces