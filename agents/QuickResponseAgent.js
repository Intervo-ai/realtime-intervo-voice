const { BaseAgent } = require('./BaseAgent');

class QuickResponseAgent extends BaseAgent {
  constructor(config = {}) {
    super('quick-response', {
      aiService: config.aiService || 'groq', // Fast model for quick responses
      aiConfig: {
        temperature: 0.8,
        maxTokens: 100, // Keep responses short
        ...config.aiConfig
      }
    });
  }

  async process(input) {
    console.log("QuickResponseAgent starting processing");
    const response = await this.generateQuickResponse(input);
    console.log("QuickResponseAgent complete");
    
    return {
      text: response,
      priority: 'immediate'
    };
  }

  async generateQuickResponse(input) {
    return this.callAI(input, {
      systemPrompt: "You are a friendly AI assistant. Keep responses brief and casual."
    });
  }
}

module.exports = { QuickResponseAgent };    