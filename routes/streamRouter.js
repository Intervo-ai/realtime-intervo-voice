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
  /*
     aiConfig: '{"sttService":"google","aiEndpoint":"gpt4","ttsService":"google","voiceType":"adam","leadPrompt":"I want to collection information about the business nature of our users.","introduction":"Hey there! Thanks for getting in touch with CodeDesign.ai. How can we be of assistance."}',
10|twilio  |   AccountSid: 'AC858b3998c6cc9215e68da2f3add3d0fa'
10|twilio  | }
*/
  let aiConfig = {};
  if (req.body?.aiConfig) {
    aiConfig = JSON.parse(req.body?.aiConfig);
  }
  console.log(aiConfig, "aiConfig");
  
  const { phoneNumber, leadPrompt, introduction, sttService, aiEndpoint, ttsService, voiceType } = aiConfig;
  
  const serverDomain = "call-plugin-api.codedesign.app";

  // If no phone number, return TwiML for WebRTC client
  if (!phoneNumber) {
    const twiml = new VoiceResponse();
    
    const connect = twiml.connect();
    const stream = connect.stream({
      url: `wss://${serverDomain}?sttService=${encodeURIComponent(sttService)}&aiEndpoint=${encodeURIComponent(aiEndpoint)}&ttsService=${encodeURIComponent(ttsService)}&voiceType=${encodeURIComponent(voiceType)}&leadPrompt=${encodeURIComponent(leadPrompt)}&introduction=${encodeURIComponent(introduction)}`,
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
            <Stream url="wss://${serverDomain}?sttService=${encodeURIComponent(sttService)}&aiEndpoint=${encodeURIComponent(aiEndpoint)}&ttsService=${encodeURIComponent(ttsService)}&voiceType=${encodeURIComponent(voiceType)}&leadPrompt=${encodeURIComponent(leadPrompt)}&introduction=${encodeURIComponent(introduction)}">
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
