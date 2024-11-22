const axios = require("axios");

async function fetchGoogleVoices() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const response = await axios.get(
      `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`
    );
    return response.data.voices.map((voice) => ({
      voiceName: voice.name,
      language: voice.languageCodes[0],
      gender: voice.ssmlGender.toLowerCase(),
      premium: voice.naturalSampleRateHertz >= 24000,
    }));
  } catch (error) {
    console.error("Error fetching voices from Google:", error);
    return [];
  }
}

module.exports = fetchGoogleVoices;
