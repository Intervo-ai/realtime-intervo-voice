const express = require("express");
const dotenv = require("dotenv");
const twilio = require("twilio");
const WebSocket = require("ws");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const cors = require("cors");
const http = require("http");  // Import http to create the shared serverz
dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());
app.use(cors());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;
const client = twilio(accountSid, authToken);
const serverDomain = "call-plugin-api.codedesign.app";

// Google Cloud TTS client
const ttsClient = new TextToSpeechClient();

// Create a shared HTTP server for both Express and WebSocket
const server = http.createServer(app);

// Create WebSocket server on the shared HTTP server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Twilio connected to WebSocket");

  // When Twilio streams audio to WebSocket
  ws.on("message", async (message) => {
    console.log("Received audio stream from Twilio", message);
       
    try {
      // Simulate a response from AI or process the received audio
      const aiResponse = await handleOpenAIStream(message);
      const synthesizedVoice = await streamTTS(aiResponse);

      // Send the synthesized voice back to Twilio through the WebSocket
      ws.send(synthesizedVoice);
    } catch (error) {
      console.error("Error processing the AI response or TTS:", error);
    }
    
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


const VoiceResponse = require('twilio').twiml.VoiceResponse;

app.post("/voice", (req, res) => {
  console.log("Twilio voice request received");

  const response = new VoiceResponse();
  
  // Start the stream
  const start = response.start();
  
  const stream = start.stream({
    url: `wss://${serverDomain}`,  // Your WebSocket URL
    track: "inbound_track",  // Stream the inbound track (from the caller)
    statusCallback: `https://${serverDomain}/stream-status`,  // Callback for status events
    statusCallbackEvent: ["start", "stop", "failed"]  // Capture relevant events
  });

  // Add custom parameters (optional)
  stream.parameter({
    name: 'FirstName',
    value: 'Jane'
  });
  
  stream.parameter({
    name: 'LastName',
    value: 'Doe'
  });

  // Include a follow-up Say statement to ensure the call does not disconnect immediately
  response.say('Hey niyas! how are you?');

  // Send the generated TwiML response
  console.log("Generated TwiML:", response.toString());
  
  res.type("text/xml");
  res.send(response.toString());
});

// Endpoint to log WebSocket stream status updates
app.post("/stream-status", (req, res) => {
  const status = req.body.StreamStatus;  // Status of the stream (e.g., "start", "stop", "failed")
  const track = req.body.Track;
  console.log(`Stream event: ${status} for track: ${track}`);

  // Log any failures for debugging
  if (status === "failed") {
    console.error("WebSocket stream failed to establish.");
  }

  res.sendStatus(200);  // Acknowledge the status callback
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

// Start the shared server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
