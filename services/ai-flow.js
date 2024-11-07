const axios = require("axios");

class AIFlowService {
  constructor() {
    this.apiKey = process.env.AI_FLOW_API_KEY;
    this.baseURL = "https://ai-flow.codedesign.ai/v1/chat-messages";
    this.conversationId = null;
  }

  async handleStream(prompt, config = {}) {
    try {
      const {
        responseMode = "blocking",
        userId = "user123",
        inputs = {},
        systemPrompt = null
      } = config;

      console.log("conversationId", this.conversationId);
      const response = await axios.post(
        this.baseURL,
        {
          query: prompt,
          response_mode: responseMode,
          user: userId,
          inputs: inputs,
          ...(this.conversationId && { conversation_id: this.conversationId })
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          }
        }
      );

      if (!this.conversationId && response.data.conversation_id) {
        this.conversationId = response.data.conversation_id;
        console.log(`New conversation started: ${this.conversationId}`);
      }

      return response.data.answer.trim();
    } catch (error) {
      console.error("Error interacting with AI Flow:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });

      if (error.response) {
        console.error("Error Response Data:", error.response.data);
        console.error("Error Response Status:", error.response.status);
        console.error("Error Response Headers:", error.response.headers);
      } else if (error.request) {
        console.error("Error Request:", error.request);
      } else {
        console.error("Error Message:", error.message);
      }
      
      throw new Error("Failed to process request with AI Flow service");
    }
  }

  clearConversationState() {
    this.conversationId = null;
    console.log('Cleared conversation state');
  }
}

module.exports = new AIFlowService();