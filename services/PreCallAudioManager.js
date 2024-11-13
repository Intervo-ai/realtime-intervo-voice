const { getTTSService } = require('./ttsRouter');
const { RAGAgent } = require('../agents/RAGAgent');
const OrchestrationManager = require('./OrchestrationManager');
const ConversationState = require('./ConversationState');

class PreCallAudioManager {
  constructor(config) {
    this.audioCache = new Map();
    this.config = config;
    this.initializationPromise = (async () => {
      // Create OrchestrationManager instance first
      const orchestrationManager = new OrchestrationManager(this.config);
      // Then initialize it
      this.orchestrator = await orchestrationManager.initialize();
      
      this.ragAgent = new RAGAgent({
        aiService: 'groq',
        aiConfig: { temperature: 0.1 }
      });
      this.orchestrator.registerAgent(this.ragAgent);
    })();
  }

  async ensureInitialized() {
    await this.initializationPromise;
  }

  async generateQuestions(leadPrompt) {
    const prompt = `
      Based on the following requirements: "${leadPrompt}"
      Generate a series of natural, conversational questions to collect this information. Greetings like Hey, hello -not required. Instead add backchanneling sounds and phrases. Avoid Mmm-hmm since we don't know how to pronouce it.
      Also identify which fields are required vs optional.
      Return the questions and field requirements in JSON format.
      
      Format:
      {
        "questions": [
          {
            "text": "the actual question",
            "order": number (1 being first),
            "purpose": "what information this collects",
            "field": "database field name (e.g., revenue, region)",
            "required": boolean
          }
        ],
        "requiredFields": {
          "fieldName": {
            "description": "what this field represents",
            "required": boolean,
            "type": "string|number|boolean"
          }
        },
      }
      
      Make questions sound natural and conversational, not like a survey.
    `;

    try {
      const response = await this.ragAgent.callAI(prompt, {
        responseFormat: 'json'
      });
      const parsedResponse = JSON.parse(response);
      
      // Generate a unique conversation ID if not provided
      
      return parsedResponse;
    } catch (error) {
      console.error('Error generating questions:', error);
      throw error;
    }
  }

  _generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _generateCacheKey(text, ttsService) {
    return `${ttsService}_${text}`;
  }

  async prepareAudio(config) {
    await this.ensureInitialized();
    const { introduction, ttsService, leadPrompt } = config;
    const audioParts = [];
    console.log(introduction, "testing")
    // First, handle introduction if provided
    if (introduction) {
      const introAudio = await this._cacheAudio(introduction, ttsService);
      audioParts.push({
        type: 'introduction',
        cacheKey: introAudio.cacheKey,
        text: introduction,
        order: 0
      });
    }

    // Then, generate and cache questions
    if (leadPrompt) {
      const { questions, requiredFields } = await this.generateQuestions(leadPrompt);
      
      const conversationId = this._generateConversationId();
      // Initialize conversation state with required fields
      const conversationState = await ConversationState.getInstance(conversationId);
      
      // Store the pre-generated questions in the conversation state
      await conversationState.set('context', 'preGeneratedQuestions', questions);
      await conversationState.initializeRequiredFields(requiredFields);
      
      // Cache audio and build audioParts as before
      for (const question of questions) {
        const questionAudio = await this._cacheAudio(question.text, ttsService, );
        audioParts.push({
          type: 'question',
          cacheKey: questionAudio.cacheKey,
          text: question.text,
          order: question.order,
          purpose: question.purpose,
          field: question.field,
          required: question.required
        });
      }

      // Store the audio cache keys in the conversation state
      await conversationState.set('context', 'audioCacheKeys', audioParts.reduce((acc, part) => {
        acc[part.field] = part.cacheKey;
        return acc;
      }, {}));

      audioParts.metadata = {
        conversationId,
        requiredFields
      };
    }

    return audioParts.sort((a, b) => a.order - b.order);
  }

  async _cacheAudio(text, ttsService) {
    const cacheKey = this._generateCacheKey(text, ttsService);
    
    if (!this.audioCache.has(cacheKey)) {
      try {
        const virtualWs = {
          readyState: 1,
          audioChunks: [],
          send: function(data) {
            const parsed = JSON.parse(data);
            if (parsed.event === 'media') {
              this.audioChunks.push(Buffer.from(parsed.media.payload, 'base64'));
            }
          }
        };

        const ttsFunction = getTTSService(ttsService);
        await new Promise((resolve) => {
          ttsFunction(text, virtualWs, 'cache', resolve);
        });

        const fullAudio = Buffer.concat(virtualWs.audioChunks);
        this.audioCache.set(cacheKey, fullAudio);
        console.log(`Cached audio for text: "${text.substring(0, 50)}..."`);
      } catch (error) {
        console.error('Error preparing audio:', error);
        throw error;
      }
    }

    return { cacheKey };
  }

  getAudio(cacheKey) {
    console.log('Getting audio for cache key:', cacheKey, this.audioCache);

    const audio = this.audioCache.get(cacheKey);
    console.log('Audio:', audio);
    return audio;
  }

  clearAudio(cacheKey) {
    this.audioCache.delete(cacheKey);
  }

  clearCache() {
    this.audioCache.clear();
  }
}

// To:
const manager = new PreCallAudioManager();
module.exports = manager;