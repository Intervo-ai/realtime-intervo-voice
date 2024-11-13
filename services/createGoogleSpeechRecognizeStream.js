const speech = require("@google-cloud/speech");
const WebSocket = require("ws");
const client = new speech.SpeechClient();

function createGoogleSpeechRecognizeStream({ 
  timer, 
  ws, 
  wss, 
  ignoreNewTranscriptions, 
  isProcessingTTS, 
  processTranscription, 
  resetInactivityTimeout, 
  inactivityTimeout 
}) {
  const request = {
    config: {
      encoding: "MULAW",
      sampleRateHertz: 8000,
      languageCode: "en-US",
      enableAutomaticPunctuation: false,
      useEnhanced: true,
      model: "phone_call",
    },
    speechContexts: [{
      phrases: [
        "CodeDesign",
        "CodeDesign.ai",
        "Intervo.ai",
        "Intervo",
        "Manjunath",
        "Hey",
        "hai",
      ],
      boost: 20
    }],
  };
  
  console.log("Creating recognize stream");

  const recognizeStream = client.streamingRecognize(request)
    .on("data", async (data) => {
      console.log("Recognize stream data 0 ");

      if (ignoreNewTranscriptions || isProcessingTTS) return;
      console.log("Recognize stream data", ignoreNewTranscriptions);

      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        const isFinal = data.results[0].isFinal;

        // Skip empty transcriptions
        if (!transcription.trim()) return;

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
        return createGoogleSpeechRecognizeStream({ 
          timer, 
          ws, 
          wss, 
          ignoreNewTranscriptions, 
          isProcessingTTS, 
          processTranscription, 
          resetInactivityTimeout, 
          inactivityTimeout 
        });
      }
    });

  return recognizeStream;
}

module.exports = createGoogleSpeechRecognizeStream;