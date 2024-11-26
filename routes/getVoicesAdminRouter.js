const express = require("express");
const router = express.Router();
const Voice = require("../models/Voice");

const fetchAzureVoices = require("../services/fetchVoices/fetchAzureVoices");
const fetchElevenLabsVoices = require("../services/fetchVoices/fetchElevenLabsVoices");
const fetchGoogleVoices = require("../services/fetchVoices/fetchGoogleVoices");
const fetchAWSVoices = require("../services/fetchVoices/fetchAWSVoices");

router.get("/:service", async (req, res) => {
  try {
    const { service } = req.params;
    let voices = [];

    switch (service) {
      case "azure":
        voices = await fetchAzureVoices();
        break;
      case "elevenlabs":
        voices = await fetchElevenLabsVoices();
        break;
      case "google":
        voices = await fetchGoogleVoices();
        break;
      case "aws":
        voices = await fetchAWSVoices();
        break;
      default:
        return res.status(400).json({ error: `Unsupported service: ${service}` });
    }

    res.json({ success: true, service, voices });
  } catch (error) {
    console.error(`Error fetching voices for service ${req.params.service}:`, error);
    res.status(500).json({ error: `Failed to fetch voices for ${req.params.service}` });
  }
});

// Add a new voice to the database
router.post("/add-voice", async (req, res) => {
  try {
    const { service, voiceName, customName, language, gender, premium, description, supportedFeatures } = req.body;

    const voice = new Voice({
      service,
      voiceName,
      customName,
      language,
      gender,
      premium,
      description,
      supportedFeatures,
    });

    await voice.save();
    res.status(201).json({ success: true, message: "Voice added successfully", voice });
  } catch (error) {
    console.error("Error adding voice:", error);
    res.status(500).json({ error: "Failed to add voice" });
  }
});

// Update an existing voice
router.put("/update-voice/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const voice = await Voice.findByIdAndUpdate(id, updates, { new: true });

    if (!voice) {
      return res.status(404).json({ error: "Voice not found" });
    }

    res.json({ success: true, message: "Voice updated successfully", voice });
  } catch (error) {
    console.error("Error updating voice:", error);
    res.status(500).json({ error: "Failed to update voice" });
  }
});

// Delete a voice from the database
router.delete("/remove-voice/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const voice = await Voice.findByIdAndDelete(id);

    if (!voice) {
      return res.status(404).json({ error: "Voice not found" });
    }

    res.json({ success: true, message: "Voice deleted successfully" });
  } catch (error) {
    console.error("Error deleting voice:", error);
    res.status(500).json({ error: "Failed to delete voice" });
  }
});

module.exports = router;
