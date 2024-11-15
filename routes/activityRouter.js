const express = require("express");
const router = express.Router();
const Activity = require("../models/Activity");

// Create a new activity
router.post("/", async (req, res) => {
  try {
    const { 
      user, 
      agent, 
      contact, 
      conversationTranscription, 
      summary, 
      memory, 
      collectedInfo, 
      callDuration, 
      callType,
      status 
    } = req.body;
    
    const activity = new Activity({ 
      user, 
      agent, 
      contact, 
      conversationTranscription, 
      summary, 
      memory, 
      collectedInfo, 
      callDuration, 
      callType, 
      status 
    });
    
    await activity.save();
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ error: "Failed to create activity", details: error.message });
  }
});

// Get all activities
router.get("/", async (req, res) => {
  try {
    const activities = await Activity.find();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

// Get a single activity by ID
router.get("/:id", async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

// Update an activity
router.put("/:id", async (req, res) => {
  try {
    const { 
      conversationTranscription, 
      summary, 
      memory, 
      collectedInfo, 
      callDuration, 
      callType, 
      status 
    } = req.body;
    
    const activity = await Activity.findByIdAndUpdate(
      req.params.id,
      { 
        conversationTranscription, 
        summary, 
        memory, 
        collectedInfo, 
        callDuration, 
        callType, 
        status 
      },
      { new: true }
    );
    
    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: "Failed to update activity", details: error.message });
  }
});

// Partially update an activity
router.patch("/:id", async (req, res) => {
  try {
    const updates = req.body; 
    const activity = await Activity.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }

    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: "Failed to update activity", details: error.message });
  }
});  

// Delete an activity
router.delete("/:id", async (req, res) => {
  try {
    const activity = await Activity.findByIdAndDelete(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }
    res.json({ message: "Activity deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

module.exports = router;
