const WebSocket = require("ws");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const ttsClient = new TextToSpeechClient();

async function streamTTS(text, ws, streamSid, useChunks = true) {
  const request = {
    input: { text: text },
    voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
    audioConfig: {
      audioEncoding: "MULAW",
      sampleRateHertz: 8000,
    },
  };

  // Request synthesized speech from Google TTS
  const [response] = await ttsClient.synthesizeSpeech(request);
  const audioContent = response.audioContent;
  const chunkSize = 320;

  return new Promise((resolve, reject) => {
    const sendMarkEvent = () => {
      const markMessage = { event: "mark", streamSid, mark: { name: "End of response" } };
      ws.send(JSON.stringify(markMessage), (error) => {
        if (error) {
          console.error(`[${new Date().toISOString()}] Error sending mark event:`, error);
          reject(error);
        } else {
          resolve(); // Complete the promise
        }
      });
    };

    if (useChunks) {
      let offset = 0;

      function sendChunk() {
        if (offset >= audioContent.length) {
          console.log(`[${new Date().toISOString()}] Finished streaming TTS audio (Chunked)`);
          sendMarkEvent(); // End the stream
          return;
        }

        const audioChunk = audioContent.slice(offset, offset + chunkSize).toString("base64");
        const mediaMessage = { event: "media", streamSid, media: { payload: audioChunk } };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(mediaMessage), (error) => {
            if (error) {
              console.error(`[${new Date().toISOString()}] Error sending chunk:`, error);
              reject(error);
            }
          });
        } else {
          reject(new Error("WebSocket is closed"));
          return;
        }

        offset += chunkSize;
        setImmediate(sendChunk); // Schedules next chunk immediately
      }

      sendChunk(); // Start chunked streaming

    } else {
      // Non-chunked streaming
      const audioChunk = audioContent.toString("base64");
      const mediaMessage = { event: "media", streamSid, media: { payload: audioChunk } };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(mediaMessage), (error) => {
          if (error) {
            console.error(`[${new Date().toISOString()}] Error sending full audio content:`, error);
            reject(error);
          } else {
            console.log(`[${new Date().toISOString()}] Sent full audio content (Non-Chunked)`);
            sendMarkEvent(); // End the stream
          }
        });
      } else {
        reject(new Error("WebSocket is closed"));
      }
    }
  });
}

module.exports = { streamTTS };
