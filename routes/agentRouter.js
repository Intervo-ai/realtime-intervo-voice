const express = require("express");
const router = express.Router();
const Agent = require("../models/Agent");
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.NEXTAUTH_SECRET;

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.cookies.authToken;
    
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid authentication token" });
  }
};

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