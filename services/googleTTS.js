const WebSocket = require("ws");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const ttsClient = new TextToSpeechClient();

async function streamTTS(text, ws, streamSid, nearEndCallback, useChunks = true) {
  const request = {
    input: { text: text },
    voice: { languageCode: "en-US", name: "en-US-Studio-O" },
    audioConfig: {
      audioEncoding: "MULAW",
      sampleRateHertz: 8000,
      speakingRate: 1.2,        // Speed (0.25 to 4.0) - 1.0 is normal speed
      pitch: 0.0,               // Pitch (-20.0 to 20.0) - 0.0 is normal pitch
      volumeGainDb: 0.0,        // Volume (-96.0 to 16.0) - 0.0 is normal volume
      effectsProfileId: ["telephony-class-application"]  // Optimizes for phone calls
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
          console.log(`[${new Date().toISOString()}] Sent mark event`);
          resolve(); // Complete the promise
        }
      });
    };

    const totalDuration = (audioContent.length / 8000) * 1000; // Total duration in milliseconds

    // Set up near-end callback 500 ms before the audio ends
    setTimeout(() => {
      if (nearEndCallback && typeof nearEndCallback === "function") {
        nearEndCallback(); // Notify the caller that TTS is about to finish
      }
    }, totalDuration - 500);

    if (useChunks) {
      let offset = 0;

      function sendChunk() {
        if (offset >= audioContent.length) {
          console.log(`[${new Date().toISOString()}] Finished streaming TTS audio (Chunked)`);
          
          // Wait for the full audio duration before resolving
          setTimeout(() => {
            if (nearEndCallback && typeof nearEndCallback === "function") {
              nearEndCallback();
            }
            sendMarkEvent();
            resolve(); // Only resolve after audio has finished playing
          }, totalDuration + 500); // Add small buffer
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
        // Add delay between chunks based on audio duration
        const chunkDuration = (chunkSize / 8000) * 1000; // Convert to milliseconds
        setTimeout(sendChunk, chunkDuration);
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
