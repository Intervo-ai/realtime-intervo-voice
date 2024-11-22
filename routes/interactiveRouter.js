//https://www.twilio.com/docs/phone-numbers#explore-the-docs

const twilioClient = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const authenticateUser = require("../lib/authMiddleware");
const fs = require('fs');
//i want you to create an endpoint that will get a json encoded audio stream and an array list of events
const express = require('express');
const createSpeechRecognizeStream = require('../services/speechRecognizeStream');
const googleSpeechRecognize = require('../services/nonStreamGoogleSpeechToText');

const router = express.Router();

// Store chunks temporarily (in production, consider using Redis or another storage solution)
const audioChunks = new Map();

router.post("/", async (req, res) => {
  try {
    const { audio, format, chunkIndex, totalChunks, events } = req.body;
    
    if (chunkIndex === undefined || totalChunks === undefined) {
      // Handle single upload (small files)
      // Process the audio and events directly
      const result = await processAudioAndEvents(audio, events);
      return res.json({ success: true, data: result });
    }

    // Handle chunked upload
    const sessionId = req.headers['x-session-id']; // You should send this from frontend
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID is required for chunked uploads' 
      });
    }

    // Initialize chunk array for this session if it doesn't exist
    if (!audioChunks.has(sessionId)) {
      audioChunks.set(sessionId, new Array(totalChunks));
    }

    // Store this chunk
    const chunks = audioChunks.get(sessionId);
    chunks[chunkIndex] = audio;

    // Check if all chunks have been received
    const isComplete = chunks.every(chunk => chunk !== undefined);
    
    if (isComplete) {
      // Combine all chunks
      const completeAudio = chunks.join('');
      
      // Process the complete audio and events
      const result = await processAudioAndEvents(completeAudio, events);
      
      // Clean up
      audioChunks.delete(sessionId);
      
      return res.json({ 
        success: true, 
        data: result 
      });
    }

    // If not complete, acknowledge this chunk
    return res.json({ 
      success: true, 
      message: `Chunk ${chunkIndex + 1} of ${totalChunks} received` 
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

async function processAudioAndEvents(audio, events) {
  try {
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log("Generating the transcription");
    
    const transcription = await googleSpeechRecognize(audioBuffer);
    
    console.log(transcription, "transcription");
    return {
      transcription,
      processedEvents: await processEvents(events)
    };
  } catch (error) {
    throw new Error(`Failed to process audio and events: ${error.message}`);
  }
}

// Helper function to process events
async function processEvents(events) {
  // Implement event processing logic
  return events;
}


module.exports = router;