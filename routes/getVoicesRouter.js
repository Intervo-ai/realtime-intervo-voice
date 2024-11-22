const express = require("express");
const router = express.Router();
const authenticateUser = require("../lib/authMiddleware");
const fetchAzureVoices = require("../services/fetchVoices/fetchAzureVoices");
const fetchElevenLabsVoices = require("../services/fetchVoices/fetchElevenLabsVoices");
const fetchGoogleVoices = require("../services/fetchVoices/fetchGoogleVoices");
const fetchAWSVoices = require("../services/fetchVoices/fetchAWSVoices");

router.use(authenticateUser);

// Fetch voices from a specific service
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

module.exports = router;
