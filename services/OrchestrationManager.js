class OrchestrationManager {
  constructor() {
    this.agents = new Map();
    this.responseCallbacks = new Map();
    this.ttsQueue = [];
    this.isProcessingTTS = false;
  }

  registerAgent(agent) {
    this.agents.set(agent.name, agent);
  }

  onResponse({ type, callback }) {
    if (!this.responseCallbacks.has(type)) {
      this.responseCallbacks.set(type, new Set());
    }
    this.responseCallbacks.get(type).add(callback);
  }

  async process(input) {

    console.log(input, this.agents, "OrchestrationManager")
    // Start all agent processes concurrently
    const agentPromises = new Map();

    // Start IntentClassifier
    const intentClassifier = this.agents.get('intent-classifier');
    agentPromises.set('intent-classifier', intentClassifier.process(input));

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

        // Add debug logs
    console.log('Intent Result:', intentResult);
    console.log('Registered Agents:', Array.from(this.agents.keys()));
    console.log('Agent Promises:', Array.from(agentPromises.keys()));

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
    const responses = await Promise.all(
      Array.from(agentPromises.entries())
        .filter(([name]) => {
          // Skip intent-classifier always
          if (name === 'intent-classifier') return false;
          // For domain questions, ONLY allow RAG
          if (intentResult.type === 'domain') {
            return name === 'rag';
          }
          // For non-domain questions, skip RAG
          if (name === 'rag') return false;
          return true;
        })
        .map(async ([name, promise]) => {
          try {
            const response = await promise;
            const agent = this.agents.get(name);
            
            // Add debug logs
            console.log(`Processing response from ${name}:`, response);
            // Check if this agent should process based on intent
            const shouldProcess = await agent.shouldProcess(input, context);
            console.log(`${name} shouldProcess:`, shouldProcess);

            
            if (shouldProcess) {
              return {
                ...response,
                agent: name,
                order: this.getAgentOrder(name, intentResult.type)
              };
            }
            return null;
          } catch (error) {
            console.error(`Error processing agent ${name}:`, error);
            return null;
          }
        })
    );

    console.log('Valid responses:', responses);
    // Queue valid responses for TTS
    const validResponses = responses.filter(r => r !== null);
    for (const response of validResponses) {
      await this.queueTTSResponse(response);
    }

    return validResponses;
  }

  getAgentOrder(agentName, intentType) {

    // Add debug log
    console.log(`Getting order for ${agentName} with intent ${intentType}`);
    
    // Define the order of agent responses
    const orderMap = {
      'quick-response': intentType === 'casual' ? 2 : 4,
      'rag': intentType === 'domain' ? 2 : 3
    };
    return orderMap[agentName] || 99;
  }

  async queueTTSResponse(response) {
    // Add debug log
    console.log('Queueing TTS response:', {
      text: response.text,
      priority: response.priority,
      agent: response.agent,
      order: response.order
    });

    // Notify all listeners (e.g., for UI updates)
    this.notifyListeners('general', response);

    // Add to TTS queue with priority and ordering
    this.ttsQueue.push(response);
    
    // Add debug log before sorting
    console.log('TTS Queue before sort:', this.ttsQueue.map(r => ({
      text: r.text.substring(0, 30) + '...',
      priority: r.priority,
      agent: r.agent,
      order: r.order
    })));
    
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
          text: response.text.substring(0, 50) + '...'
        });
        
        // Wait for TTS to fully complete
        const callbacks = this.responseCallbacks.get('tts');
        if (callbacks) {
          for (const callback of callbacks) {
            await callback(response);
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
}

module.exports = OrchestrationManager;  // Remove the curly braces