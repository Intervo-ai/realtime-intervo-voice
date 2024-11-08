require("dotenv").config();
const WebSocket = require("ws");
const AWS = require("aws-sdk");

async function streamTTS(text, ws, streamSid, nearEndCallback, useChunks = true) {
  const polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: process.env.AWS_REGION
  });

  const params = {
    Engine: "neural",
    OutputFormat: 'pcm',
    SampleRate: '8000',
    Text: text,
    TextType: 'text',
    VoiceId: 'Joanna'
  };

  return new Promise((resolve, reject) => {
    let audioContent = Buffer.from([]);

    polly.synthesizeSpeech(params, (err, data) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Synthesis error:`, err);
        reject(err);
        return;
      }

      const pcmBuffer = Buffer.from(data.AudioStream);
      const mulawChunk = pcmToMulaw(pcmBuffer);

      const chunkSize = 320;
      let offset = 0;

      function sendChunk() {
        if (offset >= mulawChunk.length) {
          console.log(`[${new Date().toISOString()}] Finished streaming TTS audio`);
          const totalDuration = (audioContent.length / 8000) * 1000;
          
          setTimeout(() => {
            if (nearEndCallback && typeof nearEndCallback === "function") {
              nearEndCallback();
            }
            
            const markMessage = { 
              event: "mark", 
              streamSid, 
              mark: { name: "End of response" } 
            };
            
            ws.send(JSON.stringify(markMessage), (error) => {
              if (error) {
                console.error(`[${new Date().toISOString()}] Error sending mark event:`, error);
                reject(error);
              } else {
                console.log(`[${new Date().toISOString()}] Sent mark event`);
                resolve();
              }
            });
          }, 500);
          
          return;
        }

        const audioChunk = mulawChunk.slice(offset, offset + chunkSize);
        const mediaMessage = { 
          event: "media", 
          streamSid, 
          media: { payload: audioChunk.toString("base64") } 
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(mediaMessage), (error) => {
            if (error) {
              console.error(`[${new Date().toISOString()}] Error sending chunk:`, error);
              reject(error);
              return;
            }
          });
        } else {
          reject(new Error("WebSocket is closed"));
          return;
        }

        audioContent = Buffer.concat([audioContent, audioChunk]);
        offset += chunkSize;
        
        const chunkDuration = (chunkSize / 8000) * 1000;
        setTimeout(sendChunk, chunkDuration);
      }

      sendChunk();
    });
  });
}

// PCM to μ-law conversion function
function pcmToMulaw(pcmBuffer) {
  const mulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
  
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const sample = pcmBuffer.readInt16LE(i);
    mulawBuffer[i / 2] = linearToMulaw(sample);
  }
  
  return mulawBuffer;
}

function linearToMulaw(sample) {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 32767;
  const MULAW_MIN = -32768;
  
  sample = Math.min(Math.max(sample, MULAW_MIN), MULAW_MAX);
  
  const sign = (sample < 0) ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  
  sample = sample + MULAW_BIAS;
  
  let magnitude = Math.log(1 + (255 * sample) / 32768) / Math.log(256);
  magnitude = Math.min(magnitude * 256, 255);
  
  return (~(sign | Math.floor(magnitude))) & 0xFF;
}

module.exports = { streamTTS };
