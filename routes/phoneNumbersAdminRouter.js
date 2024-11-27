const express = require("express");
const router = express.Router();
const twilioClient = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const PhoneNumber = require("../models/PhoneNumber");

// Fetch available phone numbers from Twilio with voice capability
router.get("/twilio/available-numbers", async (req, res) => {
  const { country, areaCode } = req.query;

  if (!country) {
    return res.status(400).json({ error: "Country code is required" });
  }

  try {
    const numbers = await twilioClient
      .availablePhoneNumbers(country)
      .local.list({ areaCode });

    // Filter numbers that support voice
    const voiceNumbers = numbers.filter((number) => number.capabilities.voice);

    res.json(voiceNumbers);
  } catch (error) {
    console.error("Error fetching available phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch available phone numbers" });
  }
});

// Purchase a phone number from Twilio to twilio pool
router.post("/twilio/purchase", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
    });

    const newPhoneNumber = new PhoneNumber({
      phoneNumber: purchasedNumber.phoneNumber,
      twilioSid: purchasedNumber.sid,
      source: "twilio",
      capabilities: purchasedNumber.capabilities,
    });

    await newPhoneNumber.save();

    res.status(201).json({
      message: "Phone number purchased successfully",
      phoneNumber: newPhoneNumber,
    });
  } catch (error) {
    console.error("Error purchasing phone number:", error);
    res.status(500).json({ error: "Failed to purchase phone number" });
  }
});

// Release a Twilio phone number from twilio pool
router.delete("/twilio/release/:id", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    if (phoneNumber.source !== "twilio") {
      return res
        .status(400)
        .json({ error: "Only Twilio phone numbers can be released" });
    }

    // Release the phone number from Twilio
    try {
      await twilioClient.incomingPhoneNumbers(phoneNumber.twilioSid).remove();
    } catch (twilioError) {
      console.error("Error releasing phone number from Twilio:", twilioError);
      return res
        .status(500)
        .json({ error: "Failed to release phone number from Twilio" });
    }

    // Remove the phone number from the database
    await phoneNumber.remove();

    res.json({ message: "Phone number released successfully" });
  } catch (error) {
    console.error("Error releasing phone number:", error);
    res.status(500).json({ error: "Failed to release phone number" });
  }
});

// Add an Intervo phone number to the pool
router.post("/intervo/add", async (req, res) => {
  try {
    const { phoneNumber, friendlyName, capabilities } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const newPhoneNumber = new PhoneNumber({
      phoneNumber,
      friendlyName,
      source: "intervo",
      capabilities,
    });

    await newPhoneNumber.save();

    res.status(201).json({
      message: "Intervo phone number added successfully",
      phoneNumber: newPhoneNumber,
    });
  } catch (error) {
    console.error("Error adding Intervo phone number:", error);
    res.status(500).json({ error: "Failed to add Intervo phone number" });
  }
});

// Modify an Intervo phone number to set its source to Twilio i.e, remove from intervo pool
router.patch("/intervo/remove/:id", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    if (phoneNumber.source !== "intervo") {
      return res
        .status(400)
        .json({ error: "Only Intervo phone numbers can be modified" });
    }

    // Update the source to 'twilio'
    phoneNumber.source = "twilio";
    await phoneNumber.save();

    res.json({
      message: "Phone number source updated to Twilio successfully",
      phoneNumber,
    });
  } catch (error) {
    console.error("Error updating phone number source:", error);
    res.status(500).json({ error: "Failed to update phone number source" });
  }
});

module.exports = router;
