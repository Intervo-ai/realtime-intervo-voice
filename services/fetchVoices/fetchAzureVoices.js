const axios = require("axios");

async function fetchAzureVoices() {
  try {
    const azureRegion = process.env.AZURE_SPEECH_REGION; 
    const azureApiKey = process.env.AZURE_SPEECH_KEY;

    // API URL for fetching supported voices
    const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`;

    // Fetch the voices using the Azure API
    const response = await axios.get(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": azureApiKey,
      },
    });
    console.log(response.data);

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
