const express = require("express");
const router = express.Router();
const Agent = require("../models/Agent");
const Voice = require("../models/Voice");
const { v4: uuidv4 } = require('uuid');
const authenticateUser=require('../lib/authMiddleware')

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Get all agents for the authenticated user
router.get("/", async (req, res) => {
  try {
    const agents = await Agent.find({ user: req.user.id });
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// Get single agent (with user verification)
router.get("/:id", async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

// Route to get URL and API key of an agent
router.get("/:id/connect-info", async (req, res) => {
  try {
    const userId = req.user.id; 
    const agentId = req.params.id;

    // Find the agent and ensure the user owns it
    const agent = await Agent.findOne({ _id: agentId, user: userId });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }

    // Check if agent is published (has uniqueIdentifier and apiKey)
    if (!agent.uniqueIdentifier || !agent.apiKey) {
      return res.status(400).json({ 
        error: "Agent is not published", 
        message: "Please publish the agent first to get connection information" 
      });
    }

    // Generate URL dynamically
    const url = `https://call-plugin-api.codedesign.app/workflow/${agent.uniqueIdentifier}`;
    const apiKey = agent.apiKey;

    res.json({ url, apiKey });
  } catch (error) {
    console.error("Error retrieving connect info:", error);
    res.status(500).json({ error: "Failed to retrieve connect info" });
  }
});

// Create new agent
router.post("/", async (req, res) => {
  try {
    const { name, language, agentType } = req.body;
    
    // Validate required fields
    if (!name || !language || !agentType) {
      return res.status(400).json({ 
        error: "Missing required fields: name, language, and agentType are required" 
      });
    }

    const agentData = {
      name,
      language,
      agentType,
      user: req.user.id
    };
    
    const newAgent = new Agent(agentData);
    await newAgent.save();
    res.status(201).json(newAgent);
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ 
      error: "Failed to create agent",
      details: error.message 
    });
  }
});

router.post('/:agentId/assign-phone', async (req, res) => {
  try {
    const { agentId } = req.params; // agentId from URL parameter
    const { phoneNumberId } = req.body; // phoneNumberId from request body

    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Ensure the phone number is not already in use
    if (phoneNumber.user) {
      return res.status(400).json({ error: 'Phone number is already assigned to a user' });
    }

    // Assign the phone number to the agent
    phoneNumber.user = agent.user; // Assign to the same user as the agent
    await phoneNumber.save();

    res.json({
      message: 'Phone number assigned to agent successfully',
      phoneNumber,
      agent,
    });
  } catch (error) {
    console.error('Error assigning phone number to agent:', error);
    res.status(500).json({ error: 'Failed to assign phone number to agent' });
  }
});

router.post(':newAgentId/reassign-phone', async (req, res) => {
  try {
    const { newAgentId } = req.params; 
    const { phoneNumberId } = req.body; 

    // Find the phone number
    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    // Check if the new agent exists
    const newAgent = await Agent.findById(newAgentId);
    if (!newAgent) {
      return res.status(404).json({ error: 'New agent not found' });
    }

    // Verify the current user owns the phone number
    if (!phoneNumber.user || phoneNumber.user.toString() !== newAgent.user.toString()) {
      return res.status(403).json({ error: 'Phone number ownership mismatch' });
    }

    // Reassign the phone number to the new agent
    phoneNumber.user = newAgent.user;
    await phoneNumber.save();

    res.json({
      message: 'Phone number reassigned successfully',
      phoneNumber,
      newAgent,
    });
  } catch (error) {
    console.error('Error reassigning phone number:', error);
    res.status(500).json({ error: 'Failed to reassign phone number' });
  }
});

// Route to select and assign a voice to an agent
router.post("/:id/assign-voice", async (req, res) => {
  try {
    const agentId = req.params.id;
    const { voiceId} = req.body;

    if (!agentId || !voiceId) {
      return res.status(400).json({ error: "Agent ID and Voice ID are required" });
    }

    // Fetch the agent and voice from the database
    const agent = await Agent.findById(agentId);
    const voice = await Voice.findById(voiceId);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (!voice) {
      return res.status(404).json({ error: "Voice not found" });
    }

    // Update the agent to reference the selected voice
    agent.voice = voiceId;
    await agent.save();

    res.json({
      success: true,
      message: `Voice "${voice.voiceName}" assigned to Agent "${agent.name}"`,
      agent,
      voice,
    });
  } catch (error) {
    console.error("Error assigning voice to agent:", error);
    res.status(500).json({ error: "Failed to assign voice to agent" });
  }
});

module.exports = router;

// Route to save webhook configuration
router.put("/:id/webhook", async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user is authenticated
    const agentId = req.params.id;
    const { webhookName, webhookEndpoint, webhookMethod, webhookEvent } = req.body;

    // Validate required fields
    if (!webhookName || !webhookEndpoint || !webhookMethod || !webhookEvent) {
      return res.status(400).json({ error: "All webhook fields are required" });
    }

    // Find the agent and ensure the user owns it
    const agent = await Agent.findOne({ _id: agentId, user: userId });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }

    agent.webhook = {
      name: webhookName,
      endpoint: webhookEndpoint,
      method: webhookMethod,
      event: webhookEvent
    };
    await agent.save();

    res.json({ success: true, message: "Webhook configuration saved successfully", agent });
  } catch (error) {
    console.error("Error saving webhook configuration:", error);
    res.status(500).json({ error: "Failed to save webhook configuration" });
  }
});

// Route to get webhook (should be more secure?)
router.get("/:id/webhook", async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user is authenticated
    const agentId = req.params.id;
 
  const agent = await Agent.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ success: true, ...agent.webhook });
  } catch (error) {
    console.error("Error saving webhook configuration:", error);
    res.status(500).json({ error: "Failed to save webhook configuration" });
  }
});

// Update agent (with user verification)
router.put("/:id", async (req, res) => {
  try {
    const updatedAgent = await Agent.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.id // Ensure user owns this agent
      },
      req.body,
      { new: true }
    );
    
    if (!updatedAgent) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }
    res.json(updatedAgent);
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// Route to publish an agent
router.put("/:id/publish", async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user is authenticated
    const agentId = req.params.id;

    // Find the agent and ensure the user owns it
    const agent = await Agent.findOne({ _id: agentId, user: userId });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }

    if (!agent.uniqueIdentifier) {
      agent.uniqueIdentifier = uuidv4(); // Generate a unique identifier using uuid
    }

    // Generate API key if not already assigned
    if (!agent.apiKey) {
      agent.apiKey = uuidv4(); 
    }

    agent.published = true;
    await agent.save();

    // Generate URL dynamically
    const url = `https://call-plugin-api.codedesign.app/workflow/${agent.uniqueIdentifier}`;

    
    if(!agent.published){

    //call connect info endpoint
    const connectInfo = await axios.get(`${url}/connect-info`, { withCredentials: true });
    }
    res.json({ 
      success: true, 
      message: "Agent published successfully", 
      agent,
      url,
      apiKey: agent.apiKey
    });
  } catch (error) {
    console.error("Error publishing agent:", error);
    res.status(500).json({ error: "Failed to publish agent" });
  }
});

// Delete agent (with user verification)
router.delete("/:id", async (req, res) => {
  try {
    const deletedAgent = await Agent.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id // Ensure user owns this agent
    });
    
    if (!deletedAgent) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }
    res.json({ message: "Agent deleted successfully" });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

// Get agent count for user
router.get("/stats/count", async (req, res) => {
  try {
    const count = await Agent.countDocuments({ user: req.user.id });
    res.json({ count });
  } catch (error) {
    console.error("Error getting agent count:", error);
    res.status(500).json({ error: "Failed to get agent count" });
  }
});

module.exports = router; 