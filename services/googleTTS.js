const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const ttsClient = new TextToSpeechClient();

async function streamTTS(text, ws, streamSid, useChunks = true) {
  const request = {
    input: { text: text },
    voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
    audioConfig: {
      audioEncoding: "MULAW",
      sampleRateHertz: 8000, // Ensure the sample rate is 8 kHz
    },
  };

  // Request synthesized speech from Google TTS
  const [response] = await ttsClient.synthesizeSpeech(request);
  const audioContent = response.audioContent;

  return new Promise((resolve, reject) => {
    try {
      const chunkSize = 320; // Each chunk represents 20 ms at 8 kHz
      let offset = 0;
      let isCompleted = false;

      function sendMarkEvent() {
        const markMessage = {
          event: "mark",
          streamSid: streamSid,
          mark: { name: "End of response" },
        };
        console.log(`[${new Date().toISOString()}] Sending mark event`);
        ws.send(JSON.stringify(markMessage), (error) => {
          if (error) {
            console.error(`[${new Date().toISOString()}] Error sending mark event:`, error);
            reject(error);
          } else {
            isCompleted = true;
            resolve();
          }
        });
      }

      if (useChunks) {
        // Function to send audio in chunks
        function sendChunk() {
          if (offset >= audioContent.length) {
            console.log(`[${new Date().toISOString()}] Finished streaming TTS audio to Twilio (Chunked)`);
            sendMarkEvent(); // Send final mark event and resolve
            return;
          }

          const audioChunk = audioContent.slice(offset, offset + chunkSize).toString("base64");
          const mediaMessage = {
            event: "media",
            streamSid: streamSid,
            media: {
              payload: audioChunk,
            },
          };

          // Log timestamp and send chunk
          console.log(`[${new Date().toISOString()}] Sending audio chunk`);
          ws.send(JSON.stringify(mediaMessage), (error) => {
            if (error) {
              console.error(`[${new Date().toISOString()}] Error sending audio chunk:`, error);
              reject(error);
            }
          });

          offset += chunkSize;
          setTimeout(sendChunk, 20); // 20ms delay to simulate real-time playback
        }

        sendChunk();
      } else {
        // Non-Chunked Streaming
        const audioChunk = audioContent.toString("base64");
        const mediaMessage = {
          event: "media",
          streamSid: streamSid,
          media: {
            payload: audioChunk,
          },
        };

        console.log(`[${new Date().toISOString()}] Sending full audio content`);
        ws.send(JSON.stringify(mediaMessage), (error) => {
          if (error) {
            console.error(`[${new Date().toISOString()}] Error sending audio to Twilio:`, error);
            reject(error);
          } else {
            console.log(`[${new Date().toISOString()}] Sent full audio content to Twilio (Non-Chunked)`);
            sendMarkEvent(); // Send final mark event and resolve
          }
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { streamTTS };
