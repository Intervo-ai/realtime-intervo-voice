const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient();

async function transcribeAudio(audioBytes) {
  const request = {
    audio: {
      content: audioBytes,
    },
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 8000,
      languageCode: "en-US",
    },
  };
  const [response] = await speechClient.recognize(request);
  const transcription = response.results.map(result => result.alternatives[0].transcript).join("\n");
  return transcription;
}

module.exports = { transcribeAudio };
