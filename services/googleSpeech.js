const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient();

async function transcribeAudio(audioBytes) {
  const request = {
    audio: {
      content: audioBytes,
    },
    config: {
      encoding: "MULAW", // Twilio sends PCMU audio
      sampleRateHertz: 8000, // Common sample rate for Twilio streams
      languageCode: "en-IN", // Set the language based on your needs
    },
  };
  
  try {
    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join("\n");
    return transcription;
  } catch (error) {
    console.error("Error during transcription:", error);
    return null;
  }
}

module.exports = { transcribeAudio };
