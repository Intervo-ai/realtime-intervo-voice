const WebSocket = require("ws");
const speech = require("@google-cloud/speech");
const { handleOpenAIStream } = require('./services/openAI');
const { streamTTS } = require('./services/googleTTS');

const client = new speech.SpeechClient();

// Add these required packages at the top of your file
const { Transform } = require('stream');
const wav = require('wav');
const mulaw = require('mu-law');


module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("Twilio connected to WebSocket");

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

          console.log(`Transcription: ${transcription}`);
          if (isFinal) {
            clearTimeout(inactivityTimeout);
            await processTranscription(transcription);
          } else {
            resetInactivityTimeout(transcription);
          }
        }
      })
      .on("error", (error) => {
        console.error("Google Speech-to-Text error:", error);
      })
      .on("end", () => {
        console.log("Google Speech-to-Text streaming ended.");
      });


    ws.on("message", (message) => {
      const data = JSON.parse(message.toString("utf8"));

      if (data.event === "start") {
        // Capture streamSid from the start event
        streamSid = data.streamSid;
        console.log(`Stream started with streamSid: ${streamSid}`);
      }

      if (data.event === "media") {
        const audioChunk = Buffer.from(data.media.payload, "base64");
        recognizeStream.write(audioChunk);
      }

      if (data.event === "stop") {
        console.log("Media WS: Stop event received, ending Google stream.");
        recognizeStream.end();
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      recognizeStream.end();
      clearTimeout(inactivityTimeout);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    function resetInactivityTimeout(transcription) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(async () => {
        console.log("No new transcription for 1 second, processing...");
        await processTranscription(transcription);
      }, 500);
    }

    async function processTranscription(transcription) {
      conversationHistory += `User: ${transcription}\n`;

      const openAIResponse = await handleOpenAIStream(conversationHistory);
      console.log(`OpenAI Response: ${openAIResponse}`);

      conversationHistory += `Assistant: ${openAIResponse}\n`;

      // Generate TTS audio for the OpenAI response
      const audioContent = await streamTTS(openAIResponse);

      // Send the audio content directly to Twilio via WebSocket
      streamAudioToTwilio(audioContent);
    }

    function streamAudioToTwilio(audioContent, useChunks = true) {
      const chunkSize = 320; // Each chunk represents 20 ms at 8 kHz
      let offset = 0;

      if (useChunks) {
        // Chunked Streaming
        function sendChunk() {
          if (offset >= audioContent.length) {
            console.log("Finished streaming TTS audio to Twilio (Chunked)");

            // Send a "mark" event to signal the end of the audio stream
            const markMessage = {
              event: "mark",
              streamSid: streamSid,
              mark: { name: "End of response" },
            };
            console.log(`[${new Date().toISOString()}] Sending mark event (Chunked)`);
            ws.send(JSON.stringify(markMessage));
            return;
          }

          const audioChunk = audioContent.slice(offset, offset + chunkSize).toString("base64");
          const mediaMessage = {
            event: "media",
            streamSid: streamSid,
            media: {
              payload: audioChunk,
            },
          };

          // Log timestamp and send chunk
          console.log(`[${new Date().toISOString()}] Sending audio chunk`);
          ws.send(JSON.stringify(mediaMessage));

          offset += chunkSize;
          setTimeout(sendChunk, 20); // 20ms delay to simulate real-time playback
        }

        sendChunk();
      } else {
        // Non-Chunked Streaming
        const audioChunk = audioContent.toString("base64");
        const mediaMessage = {
          event: "media",
          streamSid: streamSid,
          media: {
            payload: audioChunk,
          },
        };

        // Log timestamp and send full audio content
        console.log(`[${new Date().toISOString()}] Sending full audio content`);
        ws.send(JSON.stringify(mediaMessage), (error) => {
          if (error) {
            console.error("Error sending audio to Twilio:", error);
          } else {
            console.log("Sent full audio content to Twilio (Non-Chunked)");

            // Send a "mark" event to indicate the end of the audio stream
            const markMessage = {
              event: "mark",
              streamSid: streamSid,
              mark: { name: "End of response" },
            };
            console.log(`[${new Date().toISOString()}] Sending mark event (Non-Chunked)`);
            ws.send(JSON.stringify(markMessage));
          }
        });
      }
    }

  });
};
