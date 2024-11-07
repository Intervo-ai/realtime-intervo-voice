const express = require("express");
const router = express.Router();
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const twilio = require('twilio');

// Create Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

router.post("/", async (req, res) => {
  console.log("Twilio voice request received (stream)");
  
  const { phoneNumber } = req.body;
  const serverDomain = "call-plugin-api.codedesign.app";

  // If no phone number, return TwiML for WebRTC client
  if (!phoneNumber) {
    const twiml = new VoiceResponse();
    twiml.say('Welcome!');
    const connect = twiml.connect();
    const stream = connect.stream({
      url: `wss://${serverDomain}`,
    });
    stream.parameter({
      name: 'FirstName',
      value: 'Jane',
    });
    stream.parameter({
      name: 'LastName',
      value: 'Doe',
    });
    twiml.pause({ length: 10 });

    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // If phone number exists, make outbound call
  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: `
        <Response>
          <Say>Welcome!</Say>
          <Connect>
            <Stream url="wss://${serverDomain}">
              <Parameter name="FirstName" value="Jane"/>
              <Parameter name="LastName" value="Doe"/>
            </Stream>
          </Connect>
          <Pause length="10"/>
        </Response>
      `,
      statusCallback: `https://${serverDomain}/stream-status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    console.log("Call initiated with SID:", call.sid);
    res.json({ success: true, callSid: call.sid });
    
  } catch (error) {
    console.error("Error initiating call:", error);
    res.status(500).json({ error: error.message });
  }
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
