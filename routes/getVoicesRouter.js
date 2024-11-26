const express = require("express");
const router = express.Router();
const Voice = require("../models/Voice");
const authenticateUser = require("../lib/authMiddleware");

router.use(authenticateUser);

/**
 * GET /voices
 * Fetch all curated voices from the database
 * Query parameters: language, gender, premium (optional filters)
 */
router.get("/", async (req, res) => {
  try {
    const { language, gender, premium } = req.query;

    // Build query object dynamically based on provided filters
    const query = {};
    if (language) query.language = language;
    if (gender) query.gender = gender;
    if (premium !== undefined) query.premium = premium === "true";

    // Fetch voices from the database based on query
    const voices = await Voice.find(query);

    res.json({
      success: true,
      voices,
    });
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

/**
 * GET /voices/:id
 * Fetch details of a specific voice by its ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const voice = await Voice.findById(id);

    if (!voice) {
      return res.status(404).json({ error: "Voice not found" });
    }

    res.json({
      success: true,
      voice,
    });
  } catch (error) {
    console.error("Error fetching voice details:", error);
    res.status(500).json({ error: "Failed to fetch voice details" });
  }
});

module.exports = router;
