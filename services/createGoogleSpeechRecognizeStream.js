const speech = require("@google-cloud/speech");
const WebSocket = require("ws");
const client = new speech.SpeechClient();

function createGoogleSpeechRecognizeStream({ timer, ws, wss, ignoreNewTranscriptions, isProcessingTTS, processTranscription, resetInactivityTimeout, inactivityTimeout }) {
  const request = {
    config: {
      encoding: "MULAW",
      sampleRateHertz: 8000,
      languageCode: "en-IN",
      enableAutomaticPunctuation: true,
    },
    interimResults: false,
    singleUtterance: true,
  };

  const recognizeStream = client.streamingRecognize(request)
    .on("data", async (data) => {
      if (ignoreNewTranscriptions) return;

      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        const isFinal = data.results[0].isFinal;

        console.log(`[${timer()}] Transcription received: ${transcription}`);
        
        // Send transcription to clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client !== ws) {
            client.send(JSON.stringify({ event: "transcription", source:"user", text: transcription }));
          }
        });

        if (isFinal) {
          clearTimeout(inactivityTimeout);
          await processTranscription(transcription);
        } else {
          resetInactivityTimeout(transcription);
        }
      }
    })
    .on("error", (error) => {
      console.error(`[${timer()}] Google Speech-to-Text error:`, error);
    })
    .on("end", () => {
      console.log(`[${timer()}] Google Speech-to-Text streaming ended.`);
      if (!isProcessingTTS) {
        console.log(`[${timer()}] Restarting transcription stream after end`);
        // createGoogleSpeechRecognizeStream({ timer, ws, wss, ignoreNewTranscriptions, isProcessingTTS, processTranscription, resetInactivityTimeout }); // Restart transcription after each end if not in TTS processing
      }
    });

  return recognizeStream;
}

module.exports = createGoogleSpeechRecognizeStream;