const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const TwilioMediaStreamSaveAudioFile = require("./lib/twilio-media-stream-save-audio-file");

const mediaStreamSaver = new TwilioMediaStreamSaveAudioFile({
  saveLocation: __dirname,
  saveFilename: "my-twilio-media-stream-output",
  onSaved: () => console.log("File was saved!"),
});



// WebSocket logic
module.exports = function(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("start", (ws) => {
    console.log("Received Start event from Twilio");
  });

  wss.on("connection", (ws) => {
    console.log("Twilio connected to WebSocket");
    let audioBuffer = [];
    let hasTranscriptionBeenSent = false;

    const saveRawAudio = () => {
      const rawAudioFilePath = path.join(__dirname, 'audio_output.raw');
      const audioData = Buffer.concat(audioBuffer);

      // Save the audio buffer to a file
      fs.writeFileSync(rawAudioFilePath, audioData);
      console.log(`Audio saved to: ${rawAudioFilePath}`);
      
      return rawAudioFilePath;
    };

    const sendForTranscription = async () => {
      if (hasTranscriptionBeenSent) {
        return; // Prevent multiple calls to transcription
      }
      hasTranscriptionBeenSent = true; // Set the flag to true after the first call
      
      console.log(audioBuffer.length, "audioBuffer.length")
      if (audioBuffer.length === 0) {
        console.log("No audio to process.");
        return;
      }

      try {
        const rawAudioFilePath = saveRawAudio(); // Save raw audio before transcription
        convertToWav(rawAudioFilePath, (wavFilePath) => {
          console.log(`WAV file saved at: ${wavFilePath}`);
        });

        const audioBytes = Buffer.concat(audioBuffer).toString('base64');
        const { transcribeAudio } = require('./services/googleSpeech');
        const transcription = await transcribeAudio(audioBytes);

        console.log(`Transcription: ${transcription}`);
      } catch (error) {
        console.error("Error processing audio:", error);
      } finally {
        audioBuffer = [];
      }
    };

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString('utf8'));

        if (data.event === "connected") {
          console.log("Media WS: Connected event received", data);
        }

        if (data.event === "start") {
          console.log("Media WS: Start event received", data);
          mediaStreamSaver.twilioStreamStart();
        }

        if (data.event === "media") {
          // Process only media events
          console.log(`Received audio chunk of size: ${data.media.payload.length} bytes`);
          audioBuffer.push(Buffer.from(data.media.payload, 'base64'));  // Decode and buffer the media
          mediaStreamSaver.twilioStreamMedia(data.media.payload);
        }

        if (data.event === "stop") {
          console.log("Media WS: Stop event received", data);
          mediaStreamSaver.twilioStreamStop();
          sendForTranscription();  // Transcribe when stop event occurs
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      if (audioBuffer.length > 0) {
        sendForTranscription();
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  const convertToWav = (rawAudioFilePath, callback) => {
    const wavFilePath = path.join(__dirname, 'output.wav');

    ffmpeg(rawAudioFilePath)
      .inputFormat('mulaw') // Set to 'mulaw' if using Twilio PCMU format
      .audioCodec('pcm_s16le') // Convert to PCM 16-bit for WAV
      .output(wavFilePath)
      .on('end', () => {
        console.log('Conversion to WAV completed.');
        callback(wavFilePath);
      })
      .on('error', (err) => {
        console.error('Error during conversion:', err);
      })
      .run();
  };
};
