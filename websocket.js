const WebSocket = require("ws");
const speech = require("@google-cloud/speech");
const { handleOpenAIStream } = require('./services/openAI');
const { streamTTS } = require('./services/googleTTS');
const { streamTTSWithPolly } = require('./services/pollyTTS');

const client = new speech.SpeechClient();

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  // Function to start and track time
  function startTimer() {
    const startTime = Date.now();
    return () => `${((Date.now() - startTime) / 1000).toFixed(2)}s`; // Returns elapsed time in seconds
  }

  wss.on("connection", (ws) => {
    console.log("Twilio connected to WebSocket");
    const timer = startTimer(); // Start timer

    console.log(`[${timer()}] WebSocket connection established`);

    let conversationHistory = "";
    let inactivityTimeout;
    let streamSid; // Variable to store the stream SID

    // Configure Google Speech-to-Text Streaming Request
    const request = {
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-IN",
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
      singleUtterance: false,
    };

    const recognizeStream = client
      .streamingRecognize(request)
      .on("data", async (data) => {
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
      });

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString("utf8"));

      if (data.event === "start") {
        streamSid = data.streamSid; // Capture streamSid from the start event
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
      }, 800);
    }

    async function processTranscription(transcription) {
      console.log(`[${timer()}] Processing transcription: "${transcription}"`);
      conversationHistory += `User: ${transcription}\n`;

      console.log(`[${timer()}] Sending request to OpenAI`);
      const transcriptionResponse = await handleOpenAIStream(conversationHistory);
      console.log(`[${timer()}] Received response from OpenAI: "${transcriptionResponse}"`);

      conversationHistory += `Assistant: ${transcriptionResponse}\n`;

      // console.log(`[${timer()}] Generating TTS audio for OpenAI response`);
      // const audioContent = await streamTTS("Kerala is in Central india and it has lots of beaches. People go to these beaches to relax and enjoy the sun and the sand. I am from Kerala and I love it here. Have you ever been to kerala, my dear friend?");

      console.log(`[${timer()}] Starting audio stream to Twilio`);
    
    const useGoogle = true;
    const ttsFunction = useGoogle ? streamTTS : streamTTSWithPolly;

    ttsFunction(transcriptionResponse, ws, streamSid, true) // Choose true or false for chunked streaming
      .then(() => console.log("TTS processing completed"))
      .catch((error) => console.error("Error in TTS processing:", error));

    }

  });
};
