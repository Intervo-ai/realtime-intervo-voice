const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http"); // For shared server
const WebSocket = require("ws"); // WebSocket for streaming
const twilio = require("twilio");
const path = require("path");

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(express.json());
app.use(cors());

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;

// Import routers
const streamRouter = require("./routes/streamRouter");
const voiceRouter = require("./routes/voiceRouter");

// Token generation for Twilio Client
app.get("/token", (req, res) => {
  const identity = "user-" + Math.random().toString(36).substring(7);
  const accessToken = new twilio.jwt.AccessToken(accountSid, apiKey, apiSecret, { identity });
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: appSid });
  accessToken.addGrant(voiceGrant);
  
  res.send({ identity, token: accessToken.toJwt() });
});

// Status callback for call
app.post('/call-status', (req, res) => {
  console.log("Status Callback from Twilio:", req.body);
  res.sendStatus(200);
});

// Use routers
app.use("/stream", streamRouter);
app.use("/voice", voiceRouter);
app.use("/public", express.static(path.join(__dirname, "public")));

// Create shared HTTP server for both Express and WebSocket
const server = http.createServer(app);

// Import WebSocket logic from separate file
require('./websocket')(server);

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
