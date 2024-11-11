const { getTTSService } = require('./ttsRouter');
const { RAGAgent } = require('../agents/RAGAgent');
const OrchestrationManager = require('./OrchestrationManager');

class PreCallAudioManager {
  constructor() {
    this.audioCache = new Map();
    this.orchestrator = new OrchestrationManager();
    this.ragAgent = new RAGAgent({
      aiService: 'groq',
      aiConfig: { temperature: 0.1 }
    });
    this.orchestrator.registerAgent(this.ragAgent);
  }

  async generateQuestions(leadPrompt) {
    const prompt = `
      Based on the following requirements: "${leadPrompt}"
      Generate a series of natural, conversational questions to collect this information.
      Return the questions in JSON format with their order and purpose.
      
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
        ]
      }
      
      Make questions sound natural and conversational, not like a survey.
    `;

    try {
      const response = await this.ragAgent.callAI(prompt, {
        responseFormat: 'json'
      });
      return JSON.parse(response);
    } catch (error) {
      console.error('Error generating questions:', error);
      throw error;
    }
  }

  _generateCacheKey(text, ttsService, voiceType) {
    return `${ttsService}_${voiceType}_${text}`;
  }

  async prepareAudio(config) {
    const { introduction, ttsService, voiceType, leadPrompt } = config;
    const audioParts = [];

    // First, handle introduction if provided
    if (introduction) {
      const introAudio = await this._cacheAudio(introduction, ttsService, voiceType);
      audioParts.push({
        type: 'introduction',
        cacheKey: introAudio.cacheKey,
        text: introduction,
        order: 0
      });
    }

    // Then, generate and cache questions
    if (leadPrompt) {
      const { questions } = await this.generateQuestions(leadPrompt);
      
      // Cache audio for each question
      for (const question of questions) {
        const questionAudio = await this._cacheAudio(question.text, ttsService, voiceType);
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
    }

    // Sort by order
    return audioParts.sort((a, b) => a.order - b.order);
  }

  async _cacheAudio(text, ttsService, voiceType) {
    const cacheKey = this._generateCacheKey(text, ttsService, voiceType);
    
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
    return this.audioCache.get(cacheKey);
  }

  clearAudio(cacheKey) {
    this.audioCache.delete(cacheKey);
  }

  clearCache() {
    this.audioCache.clear();
  }
}

module.exports = new PreCallAudioManager();