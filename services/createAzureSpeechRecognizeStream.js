const sdk = require("microsoft-cognitiveservices-speech-sdk");
const WebSocket = require("ws");
const { Transform } = require('stream');

function createAzureSpeechRecognizeStream({ 
  timer, 
  ws, 
  wss, 
  ignoreNewTranscriptions, 
  isProcessingTTS, 
  processTranscription, 
  resetInactivityTimeout, 
  inactivityTimeout 
}) {
  let audioInputStream;
  let recognizer;

  // Create a Transform stream to maintain compatibility
  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        // Convert the base64 chunk to raw audio data
        const rawAudio = Buffer.from(chunk, 'base64');
        audioInputStream.write(rawAudio);
        this.push(chunk);
      } catch (error) {
        console.error(`[${timer()}] Error processing audio chunk:`, error);
      }
      callback();
    }
  });

  // Configure speech config
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY, 
    process.env.AZURE_SPEECH_REGION
  );
  
  // Create audio format for 8kHz mulaw (matches Twilio's format)
  const format = sdk.AudioStreamFormat.getWaveFormatPCM(8000, 8, 1);
  audioInputStream = sdk.AudioInputStream.createPushStream(format);
  const audioConfig = sdk.AudioConfig.fromStreamInput(audioInputStream);

  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.enableDictation();
  
  recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  
  const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer);
  phraseList.addPhrase("CodeDesign");
  phraseList.addPhrase("CodeDesign.ai");
  phraseList.addPhrase("Hey");
  phraseList.addPhrase("hai");

  // Handle recognition results
  recognizer.recognized = async (s, e) => {
    if (ignoreNewTranscriptions || isProcessingTTS) return;
    
    if (e.result.text) {
      const transcription = e.result.text;
      console.log(`[${timer()}] Transcription received: ${transcription}`);
      
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== ws) {
          client.send(JSON.stringify({ event: "transcription", source: "user", text: transcription }));
        }
      });

      clearTimeout(inactivityTimeout);
      await processTranscription(transcription);
    }
  };

  recognizer.recognizing = (s, e) => {
    if (ignoreNewTranscriptions || isProcessingTTS) return;
    
    if (e.result.text) {
      const transcription = e.result.text;
      console.log(`[${timer()}] Interim transcription: ${transcription}`);
      
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== ws) {
          client.send(JSON.stringify({ event: "transcription", source: "user", text: transcription }));
        }
      });

      resetInactivityTimeout(transcription);
    }
  };

  recognizer.canceled = (s, e) => {
    console.error(`[${timer()}] Azure Speech-to-Text error:`, e.errorDetails);
    transformStream.emit('error', new Error(e.errorDetails));
  };

  // Start continuous recognition
  recognizer.startContinuousRecognitionAsync();

  // Add end and pause methods to match Google's interface
  transformStream.end = () => {
    if (recognizer) {
      recognizer.stopContinuousRecognitionAsync();
    }
    transformStream.destroy();
  };

  transformStream.pause = () => {
    if (recognizer) {
      recognizer.stopContinuousRecognitionAsync();
    }
  };

  return transformStream;
}

module.exports = createAzureSpeechRecognizeStream; 