const WebSocket = require("ws");
const speech = require("@google-cloud/speech");
const { handleOpenAIStream } = require('./services/openAI');
const { streamTTS } = require('./services/googleTTS');
const { streamTTSWithPolly } = require('./services/pollyTTS');
const { handleGroqStream } = require('./services/groqAI');
const jwt = require('jsonwebtoken');
const client = new speech.SpeechClient();
const cookie = require('cookie');
const { handleAIFlowStream } = require("./services/ai-flow");

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  function startTimer() {
    const startTime = Date.now();
    return () => `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
  }

wss.on("connection", (ws, req) => {
  console.log("Twilio connected to WebSocket");

  // Extract the path and query parameters from the request URL
  const [path, queryString] = req.url.split("?");
  const params = new URLSearchParams(queryString);
  const type = params.get("type");

    console.log("Twilio connected to WebSocket", "Client:" + type||"Twilio");

    //The use of the client is jsut for the webapp. We're only sending transcriptions to the client.
  if (type === "client") {
    // Client connection - requires authentication
    const cookies = cookie.parse(req.headers.cookie || '');
    const { authToken } = cookies;
    if (!authToken) {
      ws.close(1008, "Authentication token missing");
      return;
    }

    try {
      // Verify the token
      const decoded = jwt.verify(authToken, process.env.NEXTAUTH_SECRET);
      console.log("Authenticated user:", decoded);
    } catch (error) {
      console.log(error, authToken, "error");
      ws.close(1008, "Invalid authentication token");
      return;
    }

    // Handle WebSocket connection for client type
    ws.on("close", () => {
      console.log("WebSocket connection closed for client");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error for client:", error);
    });
  } else {

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

    function createRecognizeStream() {
      const request = {
        config: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          languageCode: "en-IN",
          enableAutomaticPunctuation: false,
        },
        interimResults: true,
        singleUtterance: true,
      };
      console.log("Creating recognize stream");

      const recognizeStream = client.streamingRecognize(request)
        .on("data", async (data) => {
          if (ignoreNewTranscriptions || isProcessingTTS) return;
          console.log("Recognize stream data", ignoreNewTranscriptions);

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
            createRecognizeStream(); // Restart transcription after each end if not in TTS processing
          }
        });

      return recognizeStream;
    }

    let recognizeStream = createRecognizeStream();

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString("utf8"));

      if (data.event === "start") {
        streamSid = data.streamSid;
        console.log(`[${timer()}] Stream started with streamSid: ${streamSid}`);
      }

      if (data.event === "media") {
        const audioChunk = Buffer.from(data.media.payload, "base64");
        recognizeStream.write(audioChunk);
      }

      if (data.event === "stop") {
        console.log(`[${timer()}] Media WS: Stop event received, ending Google stream.`);
        // Send conversation summary to clients
        async function sendConversationSummary() {
          console.log("Sending conversation summary to clients", conversationHistory);
          if (conversationHistory) {
            const summaryPrompt = `Please provide a brief summary of this conversation:\n${conversationHistory}`;
            const summary = await handleOpenAIStream(summaryPrompt);
            
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client !== ws) {
                client.send(JSON.stringify({
                  event: "summary", 
                  text: summary
                }));
              }
            });
            console.log(`[${timer()}] Conversation summary sent to clients: "${summary}"`);
          }
        }
        
        sendConversationSummary();
        recognizeStream.end();
      }
    });

    ws.on("close", () => {
      console.log(`[${timer()}] WebSocket connection closed`);
      // Create a summary and send it to the
      recognizeStream.end();
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
      }, 500);
    }

    async function processTranscription(transcription) {
      console.log(`[${timer()}] Processing transcription: "${transcription}"`);

      ignoreNewTranscriptions = true;
      recognizeStream.pause();

      conversationHistory += `User: ${transcription}\n. .`;

      console.log(`[${timer()}] Sending request to OpenAI`);
      // const transcriptionResponse = await handleAIFlowStream(conversationHistory);
      // const transcriptionResponse = await handleOpenAIStream(conversationHistory);
      const transcriptionResponse = await handleGroqStream(conversationHistory);
      console.log(`[${timer()}] Received response from OpenAI: "${transcriptionResponse}"`);

      conversationHistory += `Assistant: ${transcriptionResponse}\n`;

      // Send OpenAI response to clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== ws) {
          client.send(JSON.stringify({ 
            event: "transcription", 
            text: transcriptionResponse,
            source: "ai" // Identifies this message is from the AI assistant
          }));
        }
      });

      console.log(`[${timer()}] Starting TTS processing for OpenAI response`);

      if (isProcessingTTS) {
        console.log(`[${timer()}] Waiting for current TTS to finish...`);
        return;
      }

      isProcessingTTS = true;

      const useGoogle = true;
      const ttsFunction = useGoogle ? streamTTS : streamTTSWithPolly;

      try {
        await ttsFunction(transcriptionResponse, ws, streamSid, () => {
          console.log(`[${timer()}] TTS is almost done`);
          isProcessingTTS = false;
        }, true);
        console.log(`[${timer()}] TTS processing completed`);

      } catch (error) {
        console.error("Error in TTS processing:", error);
      } finally {
        console.log("finally block executed");
        isProcessingTTS = false;
        ignoreNewTranscriptions = false;

        recognizeStream.end(); // End current stream after TTS completes
        console.log(`[${timer()}] Ready to process new transcriptions, restarting stream`);
        recognizeStream = createRecognizeStream(); // Restart new transcription stream
      }
    }
  }
});

}