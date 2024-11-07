const { AssemblyAI } = require('assemblyai');
const WebSocket = require('ws');

const assembly_api_key = process.env.ASSEMBLYAI_API_KEY;
const SAMPLE_RATE = 8000;  // AssemblyAI recommended sample rate

async function createAssemblyAIRecognizeStream({ 
  timer, 
  ws, 
  wss, 
  ignoreNewTranscriptions, 
  isProcessingTTS, 
  processTranscription, 
  resetInactivityTimeout, 
  inactivityTimeout,
  onUtteranceEnd // Pass a callback to handle end of utterance
}) {
  const client = new AssemblyAI({ apiKey: assembly_api_key });
  const transcriber = client.realtime.transcriber({
    sampleRate: SAMPLE_RATE,
    encoding: 'pcm_mulaw'
  });

  // Event listeners for AssemblyAI transcription handling
  transcriber.on('open', ({ sessionId }) => {
    console.log(`[${timer()}] AssemblyAI connection established. Session ID: ${sessionId}`);
  });

  transcriber.on('transcript', async (transcript) => {
    if (ignoreNewTranscriptions || !transcript.text) return;

    const transcription = transcript.text;
    const isFinal = transcript.message_type === 'FinalTranscript';

    console.log(`[${timer()}] Transcription received: ${transcription}`);

    // Send transcription to clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== ws) {
        client.send(JSON.stringify({ event: "transcription", source: "user", text: transcription }));
      }
    });

    if (isFinal) {
      clearTimeout(inactivityTimeout);
      await processTranscription(transcription);
      onUtteranceEnd(); // Trigger end of utterance callback
    } else {
      resetInactivityTimeout(transcription);
    }
  });

  transcriber.on('error', (error) => {
    console.error(`[${timer()}] AssemblyAI error:`, error);
  });

  transcriber.on('close', (code, reason) => {
    console.log(`[${timer()}] AssemblyAI connection closed:`, code, reason);
  });

  await transcriber.connect();
  console.log(`[${timer()}] AssemblyAI transcriber connected successfully.`);
  return transcriber;
}

// Start transcription and restart on final utterance detection
async function startTranscription(ws, wss) {
  const timer = () => new Date().toISOString();
  const ignoreNewTranscriptions = false;
  const isProcessingTTS = false;
  const inactivityTimeout = setTimeout(() => {}, 500);  // Placeholder function
  const processTranscription = async (text) => { /* process final transcription */ };
  const resetInactivityTimeout = (text) => { /* reset timeout based on activity */ };

  async function initializeStream() {
    return await createAssemblyAIRecognizeStream({
      timer, 
      ws, 
      wss, 
      ignoreNewTranscriptions, 
      isProcessingTTS, 
      inactivityTimeout, 
      processTranscription, 
      resetInactivityTimeout,
      onUtteranceEnd: async () => {
        console.log(`[${timer()}] Utterance ended. Restarting transcription...`);
        // Close current stream and start a new one
        await recognizeStream.close();
        recognizeStream = await initializeStream();
      }
    });
  }

  let recognizeStream = await initializeStream();

  if (!recognizeStream) {
    console.error("Failed to create recognizeStream. Check connection and API setup.");
    return;
  }

  // Handle incoming audio data
  ws.on('message', (audioData) => {
    const data = JSON.parse(audioData.toString("utf8"));
    if (recognizeStream && data.media) {
      const audioChunk = Buffer.from(data.media.payload, "base64");
      recognizeStream.sendAudio(audioChunk);
    }
  });
}

module.exports = startTranscription;
