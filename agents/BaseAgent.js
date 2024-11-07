class BaseAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.aiService = config.aiService || "groq";
    this.aiConfig = config.aiConfig || {};
  }



  async getAIService() {
    switch (this.aiService) {
      case 'groq':
        return require('../services/groqAI');
      case 'openai':
        return require('../services/openAI');
      case 'aiflow':
        return require('../services/ai-flow');
      default:
        throw new Error(`Unknown AI service: ${this.aiService}`);
    }
  }

   async callAI(prompt, options = {}) {
    const service = await this.getAIService();
    return service.handleStream(prompt, { ...this.aiConfig, ...options });
  }

  async process(input, context = {}) {
    throw new Error('Process method must be implemented');
  }

  async shouldProcess(input, context = {}) {
    return true; // Override in specific agents if needed
  }
}

module.exports = { BaseAgent }; 