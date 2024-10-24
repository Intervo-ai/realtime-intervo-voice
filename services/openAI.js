const axios = require("axios");

async function handleOpenAIStream(conversationHistory) {
  try {
    const apiKey = process.env.OPENAI_API_KEY; // Ensure your OpenAI API key is set in your environment variables
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini", // Use GPT-4-turbo model
        messages: [
          { role: "system", content: "You are a helpful voice assistant. Your job is to reply exactly how a native english speaker would reply over a call. Keep it short and only reply with the response. No need of additional words like Assistant: etc." },
          { role: "user", content: conversationHistory }
        ],
        max_tokens: 150, // Adjust this value based on how long you want the response to be
        temperature: 0.7, // Adjust for creativity
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    // Return the response from OpenAI (GPT-4-turbo)
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error interacting with OpenAI:", error);
    return "I'm sorry, I couldn't process your request at the moment.";
  }
}

module.exports = { handleOpenAIStream };
