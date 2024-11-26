const axios = require("axios");
const fs = require("fs");

async function generateAzureVoiceSample(voiceName, text = "Hello, this is a sample of my voice.") {
  try {
    const azureRegion = process.env.AZURE_SPEECH_REGION;
    const azureApiKey = process.env.AZURE_SPEECH_KEY;

    const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const ssml = `
      <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
        <voice name='${voiceName}'>
          ${text}
        </voice>
      </speak>
    `;

    const headers = {
      "Ocp-Apim-Subscription-Key": azureApiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", // WAV format
    };

    const response = await axios.post(url, ssml, { headers, responseType: "arraybuffer" });

    const outputFile = `sample_${voiceName}.wav`;
    fs.writeFileSync(outputFile, response.data);

    console.log(`Sample voice generated and saved to ${outputFile}`);
    return outputFile;
  } catch (error) {
    console.error("Error generating voice sample:", error.message);
    return null;
  }
}

module.exports = generateAzureVoiceSample;
