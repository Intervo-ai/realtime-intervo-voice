const sdk = require("microsoft-cognitiveservices-speech-sdk");
const WebSocket = require("ws");
const { Transform } = require('stream');

function mulawToPcm(mulawData) {
  // µ-law to linear PCM conversion table
  const MULAW_DECODE_TABLE = new Int16Array([
    -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
    -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
    -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
    -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
    -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
    -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
    -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
    -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
    -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
    -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
    -876, -844, -812, -780, -748, -716, -684, -652,
    -620, -588, -556, -524, -492, -460, -428, -396,
    -372, -356, -340, -324, -308, -292, -276, -260,
    -244, -228, -212, -196, -180, -164, -148, -132,
    -120, -112, -104, -96, -88, -80, -72, -64,
    -56, -48, -40, -32, -24, -16, -8, 0,
    32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
    23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
    15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
    11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
    7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
    5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
    3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
    2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
    1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
    1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
    876, 844, 812, 780, 748, 716, 684, 652,
    620, 588, 556, 524, 492, 460, 428, 396,
    372, 356, 340, 324, 308, 292, 276, 260,
    244, 228, 212, 196, 180, 164, 148, 132,
    120, 112, 104, 96, 88, 80, 72, 64,
    56, 48, 40, 32, 24, 16, 8, 0
  ]);

  const pcmData = new Int16Array(mulawData.length);
  
  for (let i = 0; i < mulawData.length; i++) {
    pcmData[i] = MULAW_DECODE_TABLE[mulawData[i]];
  }
  
  return Buffer.from(pcmData.buffer);
}

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

  // Create a Transform stream to maintain compatibility. Adjust `transformStream` to add a delay in pushing chunks
  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      console.log(`[${timer()}] Transforming chunk: ${chunk.length} bytes`, encoding);
      try {
        const rawAudio = Buffer.from(chunk, 'base64');
        
        // Convert µ-law to PCM
        const pcmAudio = mulawToPcm(rawAudio);
        console.log(`[${timer()}] PCM audio buffer length: ${pcmAudio.length}`);
        console.log(`[${timer()}] First few PCM bytes:`, pcmAudio.slice(0, 10));
        
        audioInputStream.write(pcmAudio);
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
  const format = sdk.AudioStreamFormat.getWaveFormatPCM(8000, 16, 1);
  audioInputStream = sdk.AudioInputStream.createPushStream(format);

  const audioConfig = sdk.AudioConfig.fromStreamInput(audioInputStream);

  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.setProperty("SPEECH-LoggingLevel", "Detailed");

  speechConfig.enableDictation();
  
  recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  
  const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer);
  phraseList.addPhrase("CodeDesign");
  phraseList.addPhrase("CodeDesign.ai");
  phraseList.addPhrase("Hey");
  phraseList.addPhrase("hai");

  recognizer.startContinuousRecognitionAsync(
    () => {
      console.log(`[${timer()}] Recognizer started successfully.`);
    },
    (error) => {
      console.error(`[${timer()}] Recognizer failed to start:`, error);
    }
  );
  // Handle recognition results
  recognizer.recognized = async (s, e) => {
    console.log(`[${timer()}] Recognition event:`, {
      eventType: 'recognized',
      offset: e.result.offset,
      duration: e.result.duration,
      resultId: e.result.resultId,
      reason: e.result.reason,
      text: e.result.text
    });

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
    console.log(`[${timer()}] Recognition event:`, {
      eventType: 'recognizing',
      offset: e.result.offset,
      duration: e.result.duration,
      resultId: e.result.resultId,
      reason: e.result.reason,
      text: e.result.text
    });

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
    console.error(`[${timer()}] Recognition canceled:`, {
      errorCode: e.errorCode,
      errorDetails: e.errorDetails,
      reason: e.reason
    });
    transformStream.emit('error', new Error(e.errorDetails));
  };

  // Add session stopped handler
  recognizer.sessionStopped = (s, e) => {
    console.log(`[${timer()}] Session stopped event:`, e);
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