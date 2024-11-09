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

function extractConfig(customParameters) {
  return {
    sttService: customParameters['stt-service'],
    aiEndpoint: customParameters['ai-endpoint'],
    ttsService: customParameters['tts-service'],
    voiceType: customParameters['voice-type'],
    leadPrompt: customParameters['lead-prompt'],
    introduction: customParameters['introduction']
  };
}

function handleTwilioConnection(ws, req, wss) {
    let config = {};
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

   
    let recognizeStream;
    ws.on("message",async (message) => {
      const data = JSON.parse(message.toString("utf8"));

      if (data.event === "start") {
        streamSid = data.streamSid;
        config = extractConfig(data.start.customParameters);
        console.log(`[${timer()}] Stream started with streamSid: ${streamSid}`);
        console.log('Configuration from parameters:', config);
        
        // Play cached introduction if available
        if (config.introduction) {
          const cacheKey = PreCallAudioManager._generateCacheKey(
            config.introduction,
            config.ttsService,
            config.voiceType
          );
          
          const cachedAudio = PreCallAudioManager.getAudio(cacheKey);
          if (cachedAudio) {
            try {
              // Send the cached audio directly to the WebSocket
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: cachedAudio.toString('base64')
                }
              }));
              console.log(`[${timer()}] Played cached introduction`);
            } catch (error) {
              console.error("Error playing cached introduction:", error);
            }
          }
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
        console.log(`[${timer()}] Media WS: Stop event received, ending Google stream.`);
        
        // Send conversation summary to clients
        async function sendConversationSummary() {
          console.log("Sending conversation summary to clients", conversationHistory);
          if (conversationHistory) {
            // Create a new orchestrator just for summary
            const summaryOrchestrator = new OrchestrationManager();
            
            // Register summary agent
            summaryOrchestrator.registerAgent(new SummaryAgent({
              aiService: 'openai',
              aiConfig: {
                temperature: 0.3,
                maxTokens: 200
              }
            }));

            // Register response handler for summary
            summaryOrchestrator.onResponse({
              type: 'general',
              callback: (response) => {
                wss.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN && client !== ws) {
                    client.send(JSON.stringify({
                      event: "summary", 
                      text: response.text
                    }));
                  }
                });
                console.log(`[${timer()}] Conversation summary sent to clients: "${response.text}"`);
              }
            });

            // Process the conversation history
            await summaryOrchestrator.process(conversationHistory);
          }
        }
        
        sendConversationSummary();
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

      // Initialize orchestration
      const orchestrator = new OrchestrationManager();
      
      // Register agents
      orchestrator.registerAgent(new IntentClassifierAgent({
        aiService: 'groq',
        aiConfig: {
          temperature: 0.1 // Low temperature for consistent classification
        }
      }));

      orchestrator.registerAgent(new QuickResponseAgent({
        aiService: 'groq',
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
          const ttsFunction = getTTSService(config.ttsService);

          try {
            // Convert callback-style TTS to Promise
            await new Promise((resolve, reject) => {
              ttsFunction(response.text, ws, streamSid, () => {
                console.log(`[${timer()}] TTS completed for: ${response.agent}`);
                // Add a small delay after completion before resolving
                setTimeout(() => {
                  console.log(`[${timer()}] TTS fully completed, ready for next response`);
                  resolve();
                }, 0);
              }, true).catch(reject);
            });
          } catch (error) {
            console.error("Error in TTS processing:", error);
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