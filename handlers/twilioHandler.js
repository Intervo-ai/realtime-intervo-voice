const WebSocket = require("ws");
const OrchestrationManager  = require('../services/OrchestrationManager');
const { IntentClassifierAgent } = require('../agents/IntentClassifierAgent');
const { QuickResponseAgent } = require('../agents/QuickResponseAgent');
const { RAGAgent } = require('../agents/RAGAgent');
const { SummaryAgent } = require('../agents/SummaryAgent');
// const createAzureSpeechRecognizeStream = require('../services/createAzureSpeechRecognizeStream');
const createSpeechRecognizeStream = require('../services/speechRecognizeStream');
const { getTTSService } = require('../services/ttsRouter');
const PreCallAudioManager = require('../services/PreCallAudioManager');
const handleCallStopEvent=require('../lib/callStopHandler');

function extractConfig(customParameters) {
  return {
    sttService: customParameters['stt-service'],
    aiEndpoint: customParameters['ai-endpoint'],
    ttsService: customParameters['tts-service'],
    voiceType: customParameters['voice-type'],
    leadPrompt: customParameters['lead-prompt'],
    introduction: customParameters['introduction'],
    agentId: customParameters['agent-id'],
    conversationId: customParameters['conversation-id'],
    activityId:customParameters['activity-id']
  };
}

let orchestrator;
function handleTwilioConnection(ws, req, wss) {
    let config={};
    let customParameters; // Add this to store parameters

    /* Twilio connection
     * This is where most of the Realtime stuff happens. Highly performance sensitive.
     */ 
    const timer = startTimer();
    console.log(`[${timer()}] WebSocket connection established`);

    let conversationHistory = "";
    let inactivityTimeout;
    let streamSid;
    let isProcessingTTS = false;
    let ignoreNewTranscriptions = false;
    let intentClassifier; // Store IntentClassifierAgent instance
    let callStartTime;
   
    let recognizeStream;
    ws.on("message",async (message) => {
      const data = JSON.parse(message.toString("utf8"));

      if (data.event === "start") {
        callStartTime = new Date();
        streamSid = data.streamSid;
        customParameters = data.start.customParameters; // Store custom parameters
        config = extractConfig(data.start.customParameters);
        
        console.log(`[${timer()}] Stream started with streamSid: ${streamSid}`);
        console.log('Configuration from parameters:', config);
        
        orchestrator = await new OrchestrationManager(config).initialize();
        // Initialize IntentClassifier and start greeting
        intentClassifier = new IntentClassifierAgent({
          aiService: 'groq',
          aiConfig: { temperature: 0.1 },
          customerName: config.customerName,
          conversationId: config.conversationId  // Add this line
        });

        // Send initial greeting via TTS
        const ttsFunction = getTTSService(config.ttsService);
        const greeting = await orchestrator.process('');
        if (greeting.text) {
          await ttsFunction(greeting.text, ws, streamSid);
        }

        recognizeStream = createSpeechRecognizeStream(config, {
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

      if (data.event === "media") {
        const audioChunk = Buffer.from(data.media.payload, "base64");
        recognizeStream?.write(audioChunk);
      }

      if (data.event === "stop") {
        await handleCallStopEvent(config, callStartTime, conversationHistory, wss, ws, timer);
        recognizeStream.end();
      }
    });

    ws.on("close", () => {
      console.log(`[${timer()}] WebSocket connection closed`);
      // Create a summary and send it to the
      recognizeStream?.end();
      clearTimeout(inactivityTimeout);
    });

    ws.on("error", (error) => {
      console.error(`[${timer()}] WebSocket error:`, error);
    });

    function resetInactivityTimeout(transcription) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(async () => {
        console.log(`[${timer()}] No new transcription for 1 second, processing...`);
        await processTranscription(transcription);
      }, 100);
    }

    async function processTranscription(transcription) {
      console.log(`[${timer()}] Processing transcription: "${transcription}"`);

      ignoreNewTranscriptions = true;
      recognizeStream.pause();

      // Initialize full orchestration


      
      // Register the existing IntentClassifier instance
      orchestrator.registerAgent(intentClassifier);

      // Register other agents
      orchestrator.registerAgent(new QuickResponseAgent({
        aiService: 'openai',
        aiConfig: {
          temperature: 0.7,
          maxTokens: 100 // Keep responses short
        }
      }));

      orchestrator.registerAgent(new RAGAgent({
        aiService: 'aiflow',
        aiConfig: {
          temperature: 0.7
        }
      }));

      // Add to conversation history
      conversationHistory += `User: ${transcription}\n`;

      // Register general response handler (for UI updates)
      orchestrator.onResponse({
        type: 'general',
        callback: (response) => {
          // Add to conversation history
          conversationHistory += `${response.agent}: ${response.text}\n`;

          // Send to WebSocket clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({ 
                event: "transcription", 
                text: response.text,
                source: response.agent,
                priority: response.priority
              }));
            }
          });
        }
      });

      // Register TTS-specific handler
      orchestrator.onResponse({
        type: 'tts',
        callback: async (response) => {
          try {
            // Convert callback-style TTS to Promise
            await new Promise((resolve, reject) => {
              console.log(response.shouldUseAudio, typeof response.audio, "response audio")
              if (response.shouldUseAudio && response.audio) {
                // Send audio directly to websocket
                ws.send(JSON.stringify({
                  event: 'media',
                  streamSid: streamSid,
                  media: {
                    payload: Buffer.from(response.audio).toString('base64')
                  }
                }));
                
                // Add small delay to ensure audio is processed
                setTimeout(() => {
                  console.log(`[${timer()}] Direct audio playback completed for: ${response.agent}`);
                  resolve();
                }, 0);
              } else {
                // Fallback to TTS if no audio available
                const ttsFunction = getTTSService(config.ttsService);
                ttsFunction(response.text, ws, streamSid, () => {
                  console.log(`[${timer()}] TTS completed for: ${response.agent}`);
                  setTimeout(() => {
                    console.log(`[${timer()}] TTS fully completed, ready for next response`);
                    resolve();
                  }, 0);
                }, true).catch(reject);
              }
            });
          } catch (error) {
            console.error("Error in audio/TTS processing:", error);
            throw error;
          }
        }
      });

      try {

      
        // Process the transcription through all agents
        await orchestrator.process(transcription);
      } catch (error) {
        console.error("Error in orchestration:", error);
      } finally {
        // Reset state
        ignoreNewTranscriptions = false;
        recognizeStream.end();
        console.log(`[${timer()}] Ready for new transcriptions, restarting stream`);
        recognizeStream = createSpeechRecognizeStream(config, {
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
    }
  }
function startTimer() {
  const startTime = Date.now();
  return () => `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
}

module.exports = handleTwilioConnection;