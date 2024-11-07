const express = require("express");
const router = express.Router();
const VoiceResponse = require("twilio").twiml.VoiceResponse;


router.post("/", (req, res) => {
  console.log("Twilio voice request received (stream)");

  const serverDomain = "call-plugin-api.codedesign.app"; // Update this with your server domain

  // Create a new VoiceResponse object
  const response = new VoiceResponse();

  // Say something to the caller first
  response.say("Welcome!");
  
  // Use 'connect' instead of 'start' for bidirectional media streaming
  const connect = response.connect();
  const stream = connect.stream({
    url: `wss://${serverDomain}`,  // Your WebSocket URL
    statusCallback: `https://${serverDomain}/stream-status`,  // Callback for status events
    statusCallbackEvent: ["start", "stop", "failed"],  // Capture relevant events
  });

  // Add custom parameters to the stream
  stream.parameter({ name: "FirstName", value: "Jane" });
  stream.parameter({ name: "LastName", value: "Doe" });

  // Add a pause to ensure the connection remains open
  response.pause({ length: 10 });

  // Log and send the generated TwiML as a response
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
