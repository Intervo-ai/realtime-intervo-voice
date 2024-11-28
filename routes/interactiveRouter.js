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
const InteractiveSession = require('../models/InteractiveSession');

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


router.post("/step", async (req, res) => {
  try {
    const { audio, format, chunkIndex, totalChunks, events, sessionId, stepId } = req.body

    console.log(sessionId, stepId, "session and step id")
    let session;
    if (!sessionId || sessionId === "undefined") {
      console.log("creating new session")
      session = new InteractiveSession();
      await session.save();
      console.log(session._id, "new session id")
    } else {
      session = await InteractiveSession.findById(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
    }
    if (chunkIndex === undefined || totalChunks === undefined) {
      // Handle single upload (small files)
      const result = await processAudioAndEvents(audio, events, session._id, stepId);
      return res.json({ 
        success: true, 
        data: result,
        sessionId: session._id 
      });
    }
    // Handle chunked upload
    if (!audioChunks.has(stepId)) {
      audioChunks.set(stepId, new Array(totalChunks));
    }
   // Store this chunk
    const chunks = audioChunks.get(stepId);
    chunks[chunkIndex] = audio;

    // Check if all chunks have been received
    const isComplete = chunks.every(chunk => chunk !== undefined);
    
    if (isComplete) {
      // Combine all chunks
      const completeAudio = chunks.join('');
      
      // Process the complete audio and events
      const result = await processAudioAndEvents(completeAudio, events, session._id, stepId);
      
      // Clean up
      audioChunks.delete(stepId);
      
      return res.json({ 
        success: true, 
        data: result,
        sessionId: session._id
      });
    }

    // If not complete, acknowledge this chunk
    return res.json({ 
      success: true, 
      sessionId: session._id,
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

router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await InteractiveSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Transform file paths to URLs if needed
    const steps = session.steps.map(step => ({
      ...step.toObject(),
      audioPath: step.audioPath?.replace('public/', '/'),
      markdownPath: step.markdownPath?.replace('public/', '/')
    }));

    return res.json({
      success: true,
      data: {
        _id: session._id,
        sessionId: session._id,
        steps,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });

  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


async function processAudioAndEvents(audio, eventsOriginal, sessionId, stepId) {
  try {
    // Local flag for using existing session
    const useExistingSession = false;  // Set this to true to use existing session
    const existingSessionId = '67469f8fce591d99b7b78a56';

    let sentences;
    let audioPath;
    let session;
    let events;

    if (useExistingSession) {
      // Use existing session
      session = await InteractiveSession.findById(existingSessionId);
      
      if (!session) {
        throw new Error('Existing session not found');
      }
      
      sentences = session.sentences;
      audioPath = session.audioPath;
      events = session.events;

    } else {
      events = eventsOriginal;
      // Process new audio
      const audioBuffer = Buffer.from(audio, 'base64');
      const audioFileName = `audio-${Date.now()}.wav`;
      audioPath = `public/audio/${audioFileName}`;
      
      await fs.promises.writeFile(audioPath, audioBuffer);
      console.log(`Audio saved to ${audioPath}`);
      
      console.log("Generating the transcription");
      const transcription = await googleSpeechRecognize({
        audioPath: audioPath,
        isLongRunning: true
      });
      
      sentences = generateSentences(transcription.phrases);
    }

    const filteredEvents = filterEvents(events);
    const mergedTimeline = mergeTranscriptionAndEvents(sentences, filteredEvents);
    
    // Generate markdown content
    const markdownContent = generateMarkdown(mergedTimeline);
    
    // Save markdown file
    const mdFileName = `timeline-${Date.now()}.md`;
    const mdPath = `public/transcripts/${mdFileName}`;
    await fs.promises.writeFile(mdPath, markdownContent);
    if(!useExistingSession) {
      // Update or create step in session
    session = await InteractiveSession.findById(sessionId);
    const stepIndex = session.steps.findIndex(step => step.stepId === stepId);
    
    const stepData = {
      stepId,
      audioPath,
      sentences,
      events: filteredEvents,
      markdownPath: mdPath,
      startTime: Math.min(
        sentences[0]?.startTime ?? Infinity,
        filteredEvents[0]?.startTime ?? Infinity
      ),
      endTime: Math.max(
        sentences[sentences.length - 1]?.endTime ?? -Infinity,
        filteredEvents[filteredEvents.length - 1]?.endTime ?? -Infinity
      )
    };
      if (stepIndex === -1) {
        session.steps.push(stepData);
      } else {
      session.steps[stepIndex] = stepData;
    }

    session.updatedAt = new Date();
      await session.save();
    }
    
    return {
      timeline: mergedTimeline,
      audioPath: audioPath,
      markdownPath: mdPath,
      sessionId: session._id
    };
    
  } catch (error) {
    throw new Error(`Failed to process audio and events: ${error.message}`);
  }
}

function filterEvents(events) {
  const HOVER_THRESHOLD = 500; // 500ms for hover events
  const GENERAL_THRESHOLD = 100; // 100ms for other events
  
  return events.filter(event => {
    const duration = event.endTime - event.startTime;
    
    // Filter out hover events shorter than HOVER_THRESHOLD
    if (event.type === 'mouseover' || event.type === 'mouseenter') {
      return duration >= HOVER_THRESHOLD;
    }
    
    // Filter out other events shorter than GENERAL_THRESHOLD
    return duration >= GENERAL_THRESHOLD;
  });
}
function generateSentences(phrases) {
  const sentences = [];
  let currentSentence = {
    words: [],
    startTime: null,
    endTime: null,
    transcript: ''
  };

  phrases.forEach(phrase => {
    phrase.words.forEach(word => {
      // Convert Duration object to milliseconds
      const startTimeMs = (word.startTime.seconds.low * 1000) + (word.startTime.nanos / 1000000);
      const endTimeMs = (word.endTime.seconds.low * 1000) + (word.endTime.nanos / 1000000);
      
      const processedWord = {
        ...word,
        startTime: startTimeMs,
        endTime: endTimeMs
      };

      currentSentence.words.push(processedWord);
      if (!currentSentence.startTime) {
        currentSentence.startTime = startTimeMs;
      }
      currentSentence.endTime = endTimeMs;
      currentSentence.transcript += (currentSentence.transcript ? ' ' : '') + word.word;

      // Check for end of sentence
      if (word.word.match(/[.!?]$/)) {
        sentences.push({ ...currentSentence });
        currentSentence = {
          words: [],
          startTime: null,
          endTime: null,
          transcript: ''
        };
      }
    });
  });

  // Push the last sentence if it exists
  if (currentSentence.words.length > 0) {
    sentences.push(currentSentence);
  }

  return sentences;
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