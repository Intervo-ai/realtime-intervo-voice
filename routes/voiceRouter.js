const express = require("express");
const router = express.Router();
const { streamTTS } = require("../services/googleTTS"); // Google TTS service
const { handleOpenAIStream } = require("../services/openAI"); // OpenAI service
const fs = require("fs");
const path = require("path");

const VoiceResponse = require("twilio").twiml.VoiceResponse;

let conversationHistory = ""; // Keep conversation history

router.post("/", async (req, res) => {
  console.log("Twilio voice request received");
    console.log(req.body, "Full request body from Twilio"); // Log full body


  const userInput = req.body.SpeechResult; // Capture user's spoken input from Twilio
  const response = new VoiceResponse();

  console.log(userInput, "this is the user input");
  if (!userInput) {
    // Initial greeting
    response.say("Welcome! How can I assist you today?");
    response.gather({
      input: "speech",
      action: "/voice", // Post to the same route for next steps
      speechTimeout: "auto"
    });
  } else {
    // Add user input to conversation history
    conversationHistory += `User: ${userInput}\n`;

    // Send the user input + conversation history to OpenAI
    const openAIResponse = await handleOpenAIStream(conversationHistory);
    
    console.log(openAIResponse, "this is the response from OpenAI");
    // Append OpenAI's response to conversation history
    conversationHistory += `Assistant: ${openAIResponse}\n`;

    
    // Convert OpenAI's response to speech
    const audioContent = await streamTTS(openAIResponse);

    // Save the audio to a public directory
    const audioFilePath = path.join(__dirname, "../public", "response.mp3");
    fs.writeFileSync(audioFilePath, audioContent, "binary");

    // Serve the audio file via a public URL
    const publicAudioUrl = `https://call-plugin-api.codedesign.app/public/response.mp3`;
    response.play({ url: publicAudioUrl });

    // Continue gathering more user input
    response.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "auto",
    });
  }

  res.type("text/xml");
  res.send(response.toString());
});
module.exports = router;
