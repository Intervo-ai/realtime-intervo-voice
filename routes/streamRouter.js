const express = require("express");
const router = express.Router();
const VoiceResponse = require("twilio").twiml.VoiceResponse;

router.post("/", (req, res) => {
  console.log("Twilio voice request received (stream)");

  const serverDomain = "call-plugin-api.codedesign.app"; // Update this with your server domain

  const response = new VoiceResponse();

      response.say("Welcome! How can I assist you today?");
  
  const start = response.start();
  const stream = start.stream({
    url: `wss://${serverDomain}`,  // Your WebSocket URL
    track: "inbound_track",  // Stream the inbound track (from the caller)
    statusCallback: `https://${serverDomain}/stream-status`,  // Callback for status events
    statusCallbackEvent: ["start", "stop", "failed"],  // Capture relevant events
  });

  stream.parameter({ name: "FirstName", value: "Jane" });
  stream.parameter({ name: "LastName", value: "Doe" });

  response.pause({ length: 10 });

  console.log("Generated TwiML:", response.toString());
  res.type("text/xml");
  res.send(response.toString());
});

router.post("/stream-status", (req, res) => {
  const status = req.body.StreamStatus;
  const track = req.body.Track;
  console.log(`Stream event: ${status} for track: ${track}`);

  if (status === "failed") {
    console.error("WebSocket stream failed to establish.");
  }

  res.sendStatus(200);
});

module.exports = router;
