const WebSocket = require("ws");
const fetch = require("node-fetch");

async function streamTTS(text, ws, streamSid, nearEndCallback, useChunks = true) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID; // e.g., "21m00Tcm4TlvDq8ikWAM"

  // ElevenLabs API request configuration
  const request = {
    text: text,
    model_id: "eleven_monolingual_v1",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      speaking_rate: 1.2, // Similar to Google's speakingRate
      pitch: 0.0         // Similar to Google's pitch
    }
  };

  // Request synthesized speech from ElevenLabs
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?optimize_streaming_latency=3&output_format=ulaw_8000`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mulaw"  // Request mulaw format for telephony
      },
      body: JSON.stringify(request)
    }
  );

  if (!response.ok) {
    console.log(response, "response not okay");
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // Convert the audio stream to a buffer
  const audioContent = await response.buffer();
  const chunkSize = 320;  // Same chunk size as Google TTS

  return new Promise((resolve, reject) => {
    const sendMarkEvent = () => {
      const markMessage = { event: "mark", streamSid, mark: { name: "End of response" } };
      ws.send(JSON.stringify(markMessage), (error) => {
        if (error) {
          console.error(`[${new Date().toISOString()}] Error sending mark event:`, error);
          reject(error);
        } else {
          console.log(`[${new Date().toISOString()}] Sent mark event`);
          resolve();
        }
      });
    };

    const totalDuration = (audioContent.length / 8000) * 1000; // Total duration in milliseconds

    // Set up near-end callback 500 ms before the audio ends
    setTimeout(() => {
      if (nearEndCallback && typeof nearEndCallback === "function") {
        nearEndCallback();
      }
    }, totalDuration - 500);

    if (useChunks) {
      let offset = 0;

      function sendChunk() {
        if (offset >= audioContent.length) {
          console.log(`[${new Date().toISOString()}] Finished streaming TTS audio (Chunked)`);
          
          setTimeout(() => {
            if (nearEndCallback && typeof nearEndCallback === "function") {
              nearEndCallback();
            }
            sendMarkEvent();
            resolve();
          }, totalDuration + 500);
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
        const chunkDuration = (chunkSize / 8000) * 1000;
        setTimeout(sendChunk, chunkDuration);
      }

      sendChunk();

    } else {
      const audioChunk = audioContent.toString("base64");
      const mediaMessage = { event: "media", streamSid, media: { payload: audioChunk } };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(mediaMessage), (error) => {
          if (error) {
            console.error(`[${new Date().toISOString()}] Error sending full audio content:`, error);
            reject(error);
          } else {
            console.log(`[${new Date().toISOString()}] Sent full audio content (Non-Chunked)`);
            sendMarkEvent();
          }
        });
      } else {
        reject(new Error("WebSocket is closed"));
      }
    }
  });
}

module.exports = { streamTTS }; 