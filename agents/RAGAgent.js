const { BaseAgent } = require('./BaseAgent');

class RAGAgent extends BaseAgent {
  constructor(config = {}) {
    super('rag', {
      aiService: config.aiService || 'aiflow', // AIFlow/Dify for RAG
      aiConfig: {
        temperature: 0.7,
        maxTokens: 1000,
        ...config.aiConfig
      }
    });
  }

  async process(input) {
    console.log("RAGAgent starting processing");
    const response = await this.generateDetailedResponse(input);
    console.log("RAGAgent processing complete");
    
    return {
      text: response,
      priority: 'delayed'
    };
  }

  async generateDetailedResponse(input) {
    // AIFlow/Dify already has RAG setup, so we can use it directly
    return this.callAI(input);
  }
}

module.exports = { RAGAgent };