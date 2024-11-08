const WebSocket = require("ws");
const sdk = require("microsoft-cognitiveservices-speech-sdk");

async function streamTTS(text, ws, streamSid, nearEndCallback, useChunks = true) {
  // Azure Speech configuration
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );

  // Configure for high-quality neural voice
  speechConfig.speechSynthesisVoiceName = "en-US-JennyMultilingualNeural";
  
  // Set output format for telephony using the correct property
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw;

  // Optional voice configuration
  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
      <voice name="en-US-JennyMultilingualNeural">
        <prosody rate="0.9" pitch="0%">
          ${text}
        </prosody>
      </voice>
    </speak>`;

  return new Promise((resolve, reject) => {
    let audioContent = Buffer.from([]);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    // Handle audio data as it comes in
   synthesizer.synthesizing = (s, e) => {
  if (e.result.reason === sdk.ResultReason.SynthesizingAudio) {
    const chunk = Buffer.from(e.result.audioData);
    const audioChunk = chunk.toString("base64");
    const mediaMessage = { event: "media", streamSid, media: { payload: audioChunk } };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(mediaMessage), (error) => {
        if (error) {
          console.error(`[${new Date().toISOString()}] Error sending chunk:`, error);
        }
      });
    } else {
      console.error("WebSocket is closed");
    }
      }
    };    

    // Start synthesis
    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        if (result.errorDetails) {
          console.error(`[${new Date().toISOString()}] Synthesis error:`, result.errorDetails);
          synthesizer.close();
          reject(new Error(result.errorDetails));
          return;
        }

        synthesizer.close();
        const chunkSize = 320;

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

        const totalDuration = (audioContent.length / 8000) * 1000;

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
      },
      error => {
        console.error(`[${new Date().toISOString()}] Synthesis error:`, error);
        synthesizer.close();
        reject(error);
      }
    );
  });
}

module.exports = { streamTTS };