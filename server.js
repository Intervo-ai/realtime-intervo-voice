const express = require("express");
const dotenv = require("dotenv");
const twilio = require("twilio");
const WebSocket = require("ws");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const cors = require("cors");
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;
const client = twilio(accountSid, authToken);
const serverDomain = "c6a1-79-127-222-218.ngrok-free.app";

// Google Cloud TTS client
const ttsClient = new TextToSpeechClient();

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("Twilio connected to WebSocket");

  // When Twilio streams audio to WebSocket
  ws.on("message", async (message) => {
    console.log("Received audio stream from Twilio");

    // Simulate a response from an AI (or handle OpenAI integration here)
    const aiResponse = await handleOpenAIStream(message); // Custom OpenAI handler

    // Convert AI response to speech using Google Cloud TTS
    const synthesizedVoice = await streamTTS(aiResponse);

    // Send the synthesized voice back to Twilio through the WebSocket
    ws.send(synthesizedVoice);
  });
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });
});

// Token generation for Twilio Client
app.get("/token", (req, res) => {
  const identity = "user-" + Math.random().toString(36).substring(7);
  const accessToken = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
  });
  const voiceGrant = new VoiceGrant({ outgoingApplicationSid: appSid });
  accessToken.addGrant(voiceGrant);

  res.send({ identity, token: accessToken.toJwt() });
});

// Twilio voice handler for WebRTC
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Connecting to the AI assistant. Please wait.");

  // Stream audio to WebSocket
  twiml.start().stream({
    url: `wss://${serverDomain}:8080`, // Replace with your WebSocket URL
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Google Cloud TTS integration
async function streamTTS(text) {
  const request = {
    input: { text: text },
    voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
    audioConfig: { audioEncoding: "MP3" },
  };
  const [response] = await ttsClient.synthesizeSpeech(request);
  return response.audioContent;
}

// Simulated OpenAI response handler (or integrate OpenAI API)
async function handleOpenAIStream(text) {
  // Placeholder for integrating OpenAI's real-time streaming response
  return `AI response to: ${text}`;
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
