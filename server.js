const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http"); // For shared server
const WebSocket = require("ws"); // WebSocket for streaming
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(express.json());
app.use(cors());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;

// Import routers
const streamRouter = require("./routes/streamRouter");
const voiceRouter = require("./routes/voiceRouter");

app.use(express.urlencoded({ extended: true }));

// Use routers
app.use("/stream", streamRouter);
app.use("/voice", voiceRouter);

// Token generation for Twilio Client
app.get("/token", (req, res) => {
  const identity = "user-" + Math.random().toString(36).substring(7);
  const accessToken = new twilio.jwt.AccessToken(accountSid, apiKey, apiSecret, { identity });
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: appSid });
  accessToken.addGrant(voiceGrant);
  
  res.send({ identity, token: accessToken.toJwt() });
});


app.post('/call-status', (req, res) => {
  console.log("Status Callback from Twilio:", req.body);
  res.sendStatus(200);
});


// Create shared HTTP server for both Express and WebSocket
const server = http.createServer(app);

// WebSocket server for streaming
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Twilio connected to WebSocket");
  let audioBuffer = [];
  let silenceTimeout;

  const sendForTranscription = async () => {
    try {
      const audioBytes = Buffer.concat(audioBuffer).toString('base64');
      const { transcribeAudio } = require('./services/googleSpeech');
      const transcription = await transcribeAudio(audioBytes);

      console.log(`Transcription: ${transcription}`);
    } catch (error) {
      console.error("Error processing audio:", error);
    } finally {
      audioBuffer = [];
    }
  };

  ws.on("message", (message) => {
    console.log("Received audio stream from Twilio");
    audioBuffer.push(message);

    clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      console.log("Silence detected, sending for transcription");
      sendForTranscription();
    }, 2000);
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    if (audioBuffer.length > 0) {
      sendForTranscription();
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

app.use("/public", express.static(path.join(__dirname, "public")));

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
