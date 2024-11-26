const express = require("express");
const router = express.Router();
const authenticateUser = require("../lib/authMiddleware");
const PhoneNumber = require("../models/PhoneNumber");

router.use(authenticateUser);

// Get all phone numbers available for users (only Intervo numbers)
router.get("/available-numbers", async (req, res) => {
  try {
    const phoneNumbers = await PhoneNumber.find({
      source: "intervo",
      user: null, // Only show numbers not assigned to any user
    });
    res.json({ success: true, phoneNumbers });
  } catch (error) {
    console.error("Error fetching available phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch available phone numbers" });
  }
});

router.post("/:id/take", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findOne({
      _id: req.params.id,
      user: null, // Ensure the number is available
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not available" });
    }

    phoneNumber.user = req.user.id; // Assign the current user as the owner
    await phoneNumber.save();

    res.json({
      success: true,
      message: "Phone number taken successfully",
      phoneNumber,
    });
  } catch (error) {
    console.error("Error taking phone number:", error);
    res.status(500).json({ error: "Failed to take phone number" });
  }
});

router.post("/:id/release", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findOne({
      _id: req.params.id,
      user: req.user.id, // Ensure the current user owns the number
    });

    if (!phoneNumber) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    phoneNumber.user = null; // Make the number available again
    await phoneNumber.save();

    res.json({
      success: true,
      message: "Phone number released successfully",
      phoneNumber,
    });
  } catch (error) {
    console.error("Error releasing phone number:", error);
    res.status(500).json({ error: "Failed to release phone number" });
  }
});

module.exports = router;
