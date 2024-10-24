const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const ttsClient = new TextToSpeechClient();

async function streamTTS(text) {
  const request = {
    input: { text: text },
    voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
    audioConfig: { audioEncoding: "MP3" },
  };
  const [response] = await ttsClient.synthesizeSpeech(request);
  return response.audioContent;
}

module.exports = { streamTTS };
