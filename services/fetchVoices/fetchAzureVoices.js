const axios = require("axios");

async function fetchAzureVoices() {
  try {
    const azureRegion = process.env.AZURE_REGION; 
    const azureApiKey = process.env.AZURE_API_KEY;

    // API URL for fetching supported voices
    const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`;

    // Fetch the voices using the Azure API
    const response = await axios.get(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": azureApiKey,
      },
    });

    // Map the response to a consistent format
    return response.data.map((voice) => ({
      voiceName: voice.Name,
      language: voice.Locale,
      gender: voice.Gender.toLowerCase(),
      premium: voice.VoiceType === "Neural",
      description: voice.ShortName,
    }));
  } catch (error) {
    console.error("Error fetching voices from Azure:", error.message);
    return [];
  }
}

module.exports = fetchAzureVoices;
