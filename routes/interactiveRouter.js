//https://www.twilio.com/docs/phone-numbers#explore-the-docs

const twilioClient = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const authenticateUser = require("../lib/authMiddleware");
const fs = require('fs');
const path = require('path');
//i want you to create an endpoint that will get a json encoded audio stream and an array list of events
const express = require('express');
const createSpeechRecognizeStream = require('../services/speechRecognizeStream');
const googleSpeechRecognize = require('../services/nonStreamGoogleSpeechToText');

const router = express.Router();

// Store chunks temporarily (in production, consider using Redis or another storage solution)
const audioChunks = new Map();

// Add this before processing any requests
const transcriptDir = path.join('public', 'transcripts');
if (!fs.existsSync(transcriptDir)){
    fs.mkdirSync(transcriptDir, { recursive: true });
}

router.post("/", async (req, res) => {
  try {
    const { audio, format, chunkIndex, totalChunks, events, metadata } = req.body;
    
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
    
    // Save the audio file
    const audioFileName = `audio-${Date.now()}.wav`;
    const audioPath = `public/audio/${audioFileName}`;
    
    await fs.promises.writeFile(audioPath, audioBuffer);
    console.log(`Audio saved to ${audioPath}`);
    
    console.log("Generating the transcription");
    const transcription = await googleSpeechRecognize(audioBuffer);
    
    // Merge transcription and events chronologically
    const mergedTimeline = mergeTranscriptionAndEvents(transcription.phrases, events);
    
    // Generate markdown content
    const markdownContent = generateMarkdown(mergedTimeline);
    
    // Save markdown file
    const mdFileName = `timeline-${Date.now()}.md`;
    const mdPath = `public/transcripts/${mdFileName}`;
    await fs.promises.writeFile(mdPath, markdownContent);
    
    return {
      timeline: mergedTimeline,
      audioPath: audioPath,
      markdownPath: mdPath
    };
  } catch (error) {
    throw new Error(`Failed to process audio and events: ${error.message}`);
  }
}

function mergeTranscriptionAndEvents(phrases, events) {
  const timeline = [];

  console.log(phrases.length, events.length, "processing phrases and events")
  
  // Convert phrases to timeline events
  const voiceEvents = phrases.map(phrase => ({
    type: 'voice',
    startTime: phrase.startTime,
    endTime: phrase.endTime,
    transcript: phrase.transcript,
    words: phrase.words
  }));
  
  // Convert UI events to consistent format
  const uiEvents = events.map(event => ({
    type: event.type,
    startTime: event.startTime,
    endTime: event.endTime,
    target: event.target,
    timestamp: event.timestamp
  }));
  
  // Combine and sort all events by startTime
  const allEvents = [...voiceEvents, ...uiEvents].sort((a, b) => {
    if (a.startTime === b.startTime) {
      // If timestamps match, voice events get precedence
      return a.type === 'voice' ? -1 : 1;
    }
    return a.startTime - b.startTime;
  });
  
  return allEvents;
}

function generateMarkdown(timeline) {
  let markdown = '# Session Timeline\n\n';
  
  timeline.forEach((event, index) => {
    const timeStart = formatTime(event.startTime);
    const timeEnd = formatTime(event.endTime);
    
    markdown += `## Event ${index + 1} (${timeStart} - ${timeEnd})\n\n`;
    
    if (event.type === 'voice') {
      markdown += `**Type:** Voice Transcription\n`;
      markdown += `**Transcript:** ${event.transcript}\n\n`;
    } else {
      markdown += `**Type:** ${event.type}\n`;
      markdown += `**Target:** ${event.target.tagName} (${event.target.className})\n`;
      markdown += `**XPath:** ${event.target.xpath}\n\n`;
    }
  });
  
  return markdown;
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
}

// Helper function to process events
async function processEvents(events) {
  // Implement event processing logic
  return events;
}


module.exports = router;