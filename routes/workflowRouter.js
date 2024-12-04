const express = require("express");
const router = express.Router();
const axios = require("axios");
const { v4: uuidv4 } = require('uuid');
const Agent = require("../models/Agent");
const Contact = require("../models/Contact");
const Activity = require("../models/Activity");
const ConversationState=require("../models/ConversationState");

// Middleware to authenticate using apiKey from headers and uniqueIdentifier from the URL
const authenticateApiKeyAndIdentifier = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const { uniqueIdentifier } = req.params;

  if (!apiKey) {
    return res.status(401).json({ error: "API key is required" });
  }

  try {
    // Find an agent with the matching apiKey and uniqueIdentifier
    const agent = await Agent.findOne({ apiKey, uniqueIdentifier });

    if (!agent) {
      return res.status(401).json({ error: "Invalid API key or unique identifier" });
    }

    // Attach the agent to the request object for further use
    req.agent = agent;
    next();
  } catch (error) {
    console.error("Error during authentication:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Route to handle call data and update contacts/activities using query parameters
router.post("/:uniqueIdentifier", authenticateApiKeyAndIdentifier, async (req, res) => {
  try {
    const { uniqueIdentifier } = req.params;
    const {
        phoneNumber,
        callType,
        firstName = "John",
        lastName = "Caller",
        email,
        country = "Unknown"
      } = req.query; // Extract data from query parameters

    if (!phoneNumber || !callType) {
      return res.status(400).json({ error: "Phone number and call type are required" });
    }

    // Find or create a contact using the phone number
    let contact = await Contact.findOne({ phoneNumber });
    if (!contact) {
      contact = new Contact({
        phoneNumber,
        firstName,
        lastName,
        email,
        country,
        agent: req.agent._id,
        user: req.agent.user,
      });
      await contact.save();
    }

    // Create a new conversation state with a unique conversationId
    const conversationId = uuidv4();
    const newConversationState = new ConversationState({
      conversationId,
      memory: {
        entities: {
          fields: new Map(),
          required: new Map(),
          collected: new Map()
        },
        context: new Map(),
        preferences: new Map()
      }
    });

    await newConversationState.save();

    // Create a new activity record
    const newActivity = new Activity({
      user: req.agent.user,
      agent: req.agent._id,
      contact: contact._id,
      callType,
      conversationId,
      conversationTranscription: [],
      status: 'in-progress',
      createdAt: new Date(),
    });

    await newActivity.save();

    const config = {
      sttService: req.agent.sttSettings.service,
      aiEndpoint: "gpt4", 
      ttsService: req.agent.ttsSettings.service,
      voiceType: "adam", 
      leadPrompt: "I want to collect information about the business nature of our users.",
      introduction: `Hello ${firstName} ${lastName}, this is an automated call from ${req.agent.name}.`,
      conversationId,
      activityId: newActivity._id.toString(),
      agentId: req.agent._id.toString()
    };

    // Trigger a call to the /stream endpoint
    const streamApiUrl = `https://${process.env.BASE_URL}/stream`;
    try {
      const response = await axios.post(streamApiUrl, {
        aiConfig: config
      });
      console.log("Call triggered successfully:", response.data);
    } catch (error) {
      console.error("Error triggering the call to /stream:", error);
    }

    res.status(201).json({
      success: true,
      message: "Activity and contact updated successfully",
      contact,
      activity: newActivity,
      conversationState: newConversationState,
    });
  } catch (error) {
    console.error("Error processing workflow request:", error);
    res.status(500).json({ error: "Failed to process the request" });
  }
});

module.exports = router;
