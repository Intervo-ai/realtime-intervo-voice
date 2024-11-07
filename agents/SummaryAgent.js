const { BaseAgent } = require('./BaseAgent');

class SummaryAgent extends BaseAgent {
  constructor(config = {}) {
    super('summary', {
      aiService: config.aiService || 'openai', // OpenAI preferred for summaries
      aiConfig: {
        temperature: 0.3, // Lower temperature for more consistent summaries
        maxTokens: 200,  // Limit summary length
        ...config.aiConfig
      }
    });
  }

  async process(conversationHistory) {
    console.log("SummaryAgent starting processing");
    const response = await this.generateSummary(conversationHistory);
    console.log("SummaryAgent processing complete");
    
    return {
      text: response,
      priority: 'immediate',
      type: 'summary'
    };
  }

  async generateSummary(conversationHistory) {
    const prompt = `Please provide a brief summary of this conversation:\n${conversationHistory}`;
    return this.callAI(prompt);
  }
}

module.exports = { SummaryAgent }; 