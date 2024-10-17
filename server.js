// server.js
const express = require("express");
const dotenv = require("dotenv");
const twilio = require("twilio");
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const cors = require("cors");
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;
const client = twilio(accountSid, authToken);

// Endpoint to generate access token for Twilio Client
app.get("/token", (req, res) => {
  console.log("test");
  // Generate a random user identity (you can customize this as needed)
  const identity = "user-" + Math.random().toString(36).substring(7);

  // Create a new Twilio Access Token
  const accessToken = new twilio.jwt.AccessToken(
    accountSid,
    apiKey,
    apiSecret,
    { identity }
  );

  // Grant the token access to Twilio Programmable Voice
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: appSid, // Your TwiML App SID
  });

  // Add the Voice grant to the access token
  accessToken.addGrant(voiceGrant);

  // Send the token and identity back to the client
  res.send({
    identity,
    token: accessToken.toJwt(),
  });
});

// NEW: Endpoint to handle Twilio's request for TwiML instructions
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Example: Play a message when the call connects
  twiml.say("Hello! You are connected via Twilio WebRTC.");

  // Alternatively, you can forward the call to a real phone number
  // twiml.dial('+1234567890');  // Forward to a real phone number

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
