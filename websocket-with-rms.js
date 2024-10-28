const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const audioBufferUtils = require("audio-buffer-utils"); // A library for audio processing
const { transcribeAudio } = require('./services/googleSpeech');
const { handleOpenAIStream } = require('./services/openAI');
const { streamTTS } = require('./services/googleTTS');

const SILENCE_THRESHOLD = 0.01; // Adjust based on testing environment
const SILENCE_DURATION_MS = 2000; // Duration of silence (2 seconds) to consider as pause
const FRAME_SIZE = 320; // Assuming 20ms frames at 16kHz
const FRAMES_PER_SECOND = 50; // 1000ms / 20ms
const SILENCE_FRAME_COUNT = SILENCE_DURATION_MS / 1000 * FRAMES_PER_SECOND;


let silentFrameCount = 0;

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("Twilio connected to WebSocket");
    let audioBuffer = [];
    let silenceTimeout;

    const saveRawAudio = () => {
      const rawAudioFilePath = path.join(__dirname, 'audio_output.raw');
      const audioData = Buffer.concat(audioBuffer);
      fs.writeFileSync(rawAudioFilePath, audioData);
      console.log(`Audio saved to: ${rawAudioFilePath}`);
      return rawAudioFilePath;
    };

    const sendForTranscription = async () => {
      if (audioBuffer.length === 0) {
        console.log("No audio to process.");
        return;
      }

      try {
        const rawAudioFilePath = saveRawAudio(); // Save raw audio before transcription
        const audioBytes = Buffer.concat(audioBuffer).toString('base64');
        const transcription = await transcribeAudio(audioBytes);
        console.log(`Transcription: ${transcription}`);

        // Send transcription to OpenAI and convert response to speech (as per previous code)
        const openAIResponse = await handleOpenAIStream(transcription);
        const audioContent = await streamTTS(openAIResponse);
        // Handle response audio...
      } catch (error) {
        console.error("Error processing audio:", error);
      } finally {
        audioBuffer = [];
      }
    };

    const isSilence = (buffer) => {
      // Calculate the RMS (volume level) of the buffer to detect silence
      const volume = calculateRMS(buffer);
      console.log(`Volume: ${volume}, Threshold: ${SILENCE_THRESHOLD}`);
      return volume < SILENCE_THRESHOLD;
    };

    const detectSilence = (buffer) => {
      if (isSilence(buffer)) {
        silentFrameCount++;
        if (silentFrameCount >= SILENCE_FRAME_COUNT) {
          console.log("Silence detected");
          silentFrameCount = 0; // Reset the counter
          return true;
        }
      } else {
        silentFrameCount = 0; // Reset the counter if non-silent frame is detected
      }
      return false;
    };

    // Add this new function to calculate RMS
 const calculateRMS = (buffer) => {
  let sum = 0.0;
  let mean = 0.0;

  // Calculate mean (DC offset) of the audio samples
  for (let i = 0; i < buffer.length; i++) {
    mean += buffer[i];
  }
  mean /= buffer.length;

  // Calculate RMS after removing DC offset
  for (let i = 0; i < buffer.length; i++) {
    const sample = (buffer[i] - mean) / 128.0 - 1.0; // Normalize to range [-1, 1]
    sum += sample * sample;
  }
  
  return Math.sqrt(sum / buffer.length);
};

    const handleSilence = () => {
      console.log("Silence detected, processing accumulated audio...");
      sendForTranscription(); // Process accumulated audio
    };

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString('utf8'));

        if (data.event === "connected") {
          console.log("Media WS: Connected event received");
        }

        if (data.event === "start") {
          console.log("Media WS: Start event received");
        }

        if (data.event === "media") {
          const audioChunk = Buffer.from(data.media.payload, 'base64');
          audioBuffer.push(audioChunk);

          // Check if the audio chunk is silence based on RMS
           if (detectSilence(audioChunk)) {
            handleSilence();
          }
        }

        if (data.event === "stop") {
          console.log("Media WS: Stop event received");
          handleSilence(); // Process final accumulated audio on stop
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      if (audioBuffer.length > 0) {
        handleSilence(); // Process any remaining audio
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });
};
