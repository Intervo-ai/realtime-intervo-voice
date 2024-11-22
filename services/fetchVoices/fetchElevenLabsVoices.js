const axios = require("axios");

async function fetchElevenLabsVoices() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    return response.data.voices.map((voice) => ({
      voiceName: voice.name,
      language: "en", // ElevenLabs typically supports English
      gender: "neutral",
      premium: voice.premium,
    }));
  } catch (error) {
    console.error("Error fetching voices from ElevenLabs:", error);
    return [];
  }
}

module.exports = fetchElevenLabsVoices;
