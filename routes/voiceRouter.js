const express = require("express");
const router = express.Router();
const { streamTTS } = require("../services/googleTTS"); // Google TTS service
const { handleOpenAIStream } = require("../services/openAI"); // OpenAI service
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // For generating unique IDs

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
      speechTimeout: "0.5",
      language: "en-IN" // Set to Indian English

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

    // Generate a unique filename
    // const uniqueId = uuidv4(); // Create a unique ID
    const uniqueId = "1234567890";
    const audioFilePath = path.join(__dirname, "../public", `${uniqueId}.mp3`);

    // Save the audio to a public directory
    fs.writeFileSync(audioFilePath, audioContent, "binary");

    // Serve the audio file via a public URL
    const publicAudioUrl = `https://${process.env.BASE_URL}/public/${uniqueId}.mp3`;
    
    console.log(publicAudioUrl, "this is the public audio url");
    response.play(publicAudioUrl);

  


    // Continue gathering more user input
    response.gather({
      input: "speech",
      action: "/voice",
      speechTimeout: "1",
    });

    // Set a timeout to delete the file after 1 minute (60000 ms)
    setTimeout(() => {
      fs.unlink(audioFilePath, (err) => {
        if (err) {
          console.error("Error deleting the audio file:", err);
        } else {
          console.log(`Deleted file: ${audioFilePath}`);
        }
      });
    }, 60000); // Adjust the delay time as needed
  }

  res.type("text/xml");
  res.send(response.toString());
});


module.exports = router;
