require("dotenv").config();

const AWS = require("aws-sdk");
const Polly = new AWS.Polly({ region: process.env.AWS_REGION });

async function streamTTSWithPolly(text, ws, streamSid, useChunkss = true) {
    const useChunks = false;
  const params = {
    OutputFormat: "pcm",
    Text: text,
    VoiceId: "Joanna",
    SampleRate: "8000",
  };

  const pollyStream = Polly.synthesizeSpeech(params).createReadStream();
  const chunkSize = 320;

  pollyStream.on("data", (chunk) => {
    if (useChunks) {
      let offset = 0;
      while (offset < chunk.length) {
        const audioChunk = chunk.slice(offset, offset + chunkSize).toString("base64");
        const mediaMessage = {
          event: "media",
          streamSid: streamSid,
          media: { payload: audioChunk },
        };
        ws.send(JSON.stringify(mediaMessage));
        offset += chunkSize;
      }
    } else {
      const audioChunk = chunk.toString("base64");
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
