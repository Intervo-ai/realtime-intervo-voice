const axios = require("axios");

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = "https://api.openai.com/v1/chat/completions";
  }

  async handleStream(prompt, config = {}) {
    try {
      const {
        model = "gpt-4-turbo-preview",
        temperature = 0.7,
        maxTokens = 150,
        systemPrompt = "You are a helpful voice assistant. Your job is to reply exactly how a native english speaker would reply over a call. Keep it short and only reply with the response. No need of additional words like Assistant: etc.",
        responseFormat = null
      } = config;

      const response = await axios.post(
        this.baseURL,
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          max_tokens: maxTokens,
          temperature,
          ...(responseFormat && { response_format: { type: responseFormat } })
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error interacting with OpenAI:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      if (error.response?.status === 404) {
        throw new Error("Configuration error: Model not found. Please check the model name.");
      }
      
      throw new Error("Failed to process request with OpenAI service");
    }
  }
}

// Export a singleton instance
module.exports = new OpenAIService();