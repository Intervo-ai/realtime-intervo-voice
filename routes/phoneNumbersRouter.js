const express = require("express");
const router = express.Router();
const PhoneNumber = require("../models/PhoneNumber");
const authenticateUser = require("../middleware/authenticateUser");

// Apply authentication middleware
router.use(authenticateUser);

// Fetch all phone numbers owned by the user
router.get("/user", async (req, res) => {
  try {
    const userNumbers = await PhoneNumber.find({ user: req.user.id });
    res.json({ success: true, userNumbers });
  } catch (error) {
    console.error("Error fetching user's phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch user's phone numbers" });
  }
});

// Fetch the user's temporary number
router.get("/temporary", async (req, res) => {
  try {
    const temporaryNumber = await PhoneNumber.findOne({
      user: req.user.id,
      isTemporary: true,
    });
    if (!temporaryNumber) {
      return res.status(404).json({ error: "No temporary number found" });
    }
    res.json({ success: true, temporaryNumber });
  } catch (error) {
    console.error("Error fetching temporary number:", error);
    res.status(500).json({ error: "Failed to fetch temporary number" });
  }
});

// Request a temporary number from the Intervo pool
router.post("/temporary/request", async (req, res) => {
  try {
    const existingTemporaryNumber = await PhoneNumber.findOne({
      user: req.user.id,
      isTemporary: true,
    });
    if (existingTemporaryNumber) {
      return res.status(400).json({ error: "You already have a temporary number" });
    }
    const availableNumber = await PhoneNumber.findOne({
      user: null,
      isTemporary: true,
      source: "intervo",
    });
    if (!availableNumber) {
      return res.status(404).json({ error: "No temporary numbers available" });
    }
    availableNumber.user = req.user.id;
    await availableNumber.save();
    res.json({ success: true, message: "Temporary number assigned", phoneNumber: availableNumber });
  } catch (error) {
    console.error("Error assigning temporary number:", error);
    res.status(500).json({ error: "Failed to assign temporary number" });
  }
});

// Release the user's temporary number back to the Intervo pool
router.delete("/temporary/release", async (req, res) => {
  try {
    const temporaryNumber = await PhoneNumber.findOne({
      user: req.user.id,
      isTemporary: true,
    });
    if (!temporaryNumber) {
      return res.status(404).json({ error: "No temporary number found to release" });
    }
    temporaryNumber.user = null;
    await temporaryNumber.save();
    res.json({ success: true, message: "Temporary number released successfully" });
  } catch (error) {
    console.error("Error releasing temporary phone number:", error);
    res.status(500).json({ error: "Failed to release temporary phone number" });
  }
});

// Fetch available Intervo numbers from the pool
router.get("/intervo", async (req, res) => {
  try {
    const intervoNumbers = await PhoneNumber.find({
      user: null,
      source: "intervo",
    });
    res.json({ success: true, intervoNumbers });
  } catch (error) {
    console.error("Error fetching Intervo phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch Intervo phone numbers" });
  }
});

// Purchase an Intervo number
router.put("/intervo/purchase/:id", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findOne({
      _id: req.params.id,
      user: null,
      source: "intervo",
    });
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not available for purchase" });
    }
    phoneNumber.user = req.user.id;
    await phoneNumber.save();
    res.json({ success: true, message: "Phone number purchased successfully", phoneNumber });
  } catch (error) {
    console.error("Error purchasing Intervo phone number:", error);
    res.status(500).json({ error: "Failed to purchase phone number" });
  }
});

// Release an Intervo number back to the pool
router.delete("/intervo/release/:id", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findOne({
      _id: req.params.id,
      source: "intervo",
    });
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }
    phoneNumber.user = null;
    await phoneNumber.save();
    res.json({ success: true, message: "Phone number released successfully" });
  } catch (error) {
    console.error("Error releasing phone number:", error);
    res.status(500).json({ error: "Failed to release phone number" });
  }
});

module.exports = router;
