const WebSocket = require("ws");
const speech = require("@google-cloud/speech");
const { handleOpenAIStream } = require('./services/openAI');
const { streamTTS } = require('./services/googleTTS');
const { streamTTSWithPolly } = require('./services/pollyTTS');

const client = new speech.SpeechClient();

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  function startTimer() {
    const startTime = Date.now();
    return () => `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
  }

  wss.on("connection", (ws) => {
    console.log("Twilio connected to WebSocket");
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
        recognizeStream.end();
      }
    });

    ws.on("close", () => {
      console.log(`[${timer()}] WebSocket connection closed`);
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

      conversationHistory += `User: ${transcription}\n`;

      console.log(`[${timer()}] Sending request to OpenAI`);
      const transcriptionResponse = await handleOpenAIStream(conversationHistory);
      console.log(`[${timer()}] Received response from OpenAI: "${transcriptionResponse}"`);

      conversationHistory += `Assistant: ${transcriptionResponse}\n`;

      console.log(`[${timer()}] Starting TTS processing for OpenAI response`);

      if (isProcessingTTS) {
        console.log(`[${timer()}] Waiting for current TTS to finish...`);
        return;
      }

      isProcessingTTS = true;

      const useGoogle = true;
      const ttsFunction = useGoogle ? streamTTS : streamTTSWithPolly;

      try {
        await ttsFunction(transcriptionResponse, ws, streamSid, true);
        console.log(`[${timer()}] TTS processing completed`);
      } catch (error) {
        console.error("Error in TTS processing:", error);
      } finally {
        console.log("finally block executed");
        isProcessingTTS = false;
        ignoreNewTranscriptions = false;

        recognizeStream.end(); // End current stream after TTS completes
        console.log(`[${timer()}] Ready to process new transcriptions, restarting stream`);
        recognizeStream =  createRecognizeStream(); // Restart new transcription stream
      }
    }
  });
};
