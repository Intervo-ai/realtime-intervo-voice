require("dotenv").config();
const AWS = require("aws-sdk");
const Polly = new AWS.Polly({ region: process.env.AWS_REGION });

async function streamTTSWithPolly(text, ws, streamSid, useChunks = true) {
  const params = {
    OutputFormat: "pcm", // Use PCM as Polly doesn't support mu-law directly
    Text: text,
    VoiceId: "Joanna",
    SampleRate: "8000", // Ensure sample rate is 8000 Hz for compatibility
  };

  const pollyStream = Polly.synthesizeSpeech(params).createReadStream();
  const chunkSize = 320;

  pollyStream.on("data", (chunk) => {
    // Convert PCM chunk to mu-law format
    const muLawChunk = convertPcmToMuLaw(chunk); // Convert PCM to mu-law

    if (useChunks) {
      let offset = 0;
      while (offset < muLawChunk.length) {
        const audioChunk = muLawChunk.slice(offset, offset + chunkSize).toString("base64");
        const mediaMessage = {
          event: "media",
          streamSid: streamSid,
          media: { payload: audioChunk },
        };
        ws.send(JSON.stringify(mediaMessage));
        offset += chunkSize;
      }
    } else {
      // Non-chunked mode: send entire converted chunk at once
      const audioChunk = muLawChunk.toString("base64");
      ws.send(
        JSON.stringify({
          event: "media",
          streamSid: streamSid,
          media: { payload: audioChunk },
        })
      );
    }
  });

  pollyStream.on("end", () => {
    const markMessage = { event: "mark", streamSid, mark: { name: "End of response" } };
    ws.send(JSON.stringify(markMessage));
  });

  pollyStream.on("error", (error) => {
    console.error("Polly streaming error:", error);
  });
}

module.exports = { streamTTSWithPolly };



// PCM to mu-law conversion function
function linearToMuLaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const BIAS = 33;
  
  // Ensure the sample is within the range of signed 16-bit PCM
  sample = Math.max(-32768, Math.min(32767, sample));

  // Convert PCM 16-bit to 13-bit for mu-law encoding
  let sign = (sample >> 8) & 0x80; // Extract sign bit
  if (sign !== 0) sample = -sample;
  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let muLawByte = ~(sign | (exponent << 4) | mantissa);

  return muLawByte & 0xFF;
}

function convertPcmToMuLaw(pcmBuffer) {
  const muLawBuffer = Buffer.alloc(pcmBuffer.length / 2); // 8-bit mu-law encoding for each 16-bit PCM sample
  for (let i = 0; i < pcmBuffer.length / 2; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2); // Read 16-bit sample from PCM buffer
    muLawBuffer[i] = linearToMuLaw(sample); // Convert and store in mu-law buffer
  }
  return muLawBuffer;
}
