const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const PhoneNumber = require("../models/PhoneNumber");
//!Incomplete module.
const authenticateUser = require("../lib/authMiddleware");
const TwilioIntegration = require("../models/TwilioIntegration");
const { encrypt, decrypt } = require("../utils/encryption");

// Apply authentication middleware
router.use(authenticateUser);

// Save and validate Twilio credentials
router.post("/integration", async (req, res) => {
  const { accountSid, apiKey, apiSecret } = req.body;
  try {
    const client = twilio(apiKey, apiSecret, { accountSid });
    await client.api.accounts(accountSid).fetch();
    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = encrypt(apiSecret);
    const newIntegration = new TwilioIntegration({
      user: req.user.id,
      twilioSid: accountSid,
      twilioApiKey: encryptedApiKey,
      twilioApiSecret: encryptedApiSecret,
    });
    await newIntegration.save();
    res.json({ success: true, message: "Twilio integration successful" });
  } catch (error) {
    console.error("Error validating Twilio credentials:", error);
    res.status(400).json({ error: "Invalid Twilio credentials" });
  }
});

// Fetch stored Twilio credentials
router.get("/credentials", async (req, res) => {
  try {
    const credentials = await TwilioIntegration.findOne({ user: req.user.id });
    if (!credentials) {
      return res.status(404).json({ error: "No Twilio credentials found" });
    }
    res.json({
      accountSid: credentials.twilioSid,
      apiKey: decrypt(credentials.twilioApiKey),
      apiSecret: decrypt(credentials.twilioApiSecret),
    });
  } catch (error) {
    console.error("Error fetching Twilio credentials:", error);
    res.status(
        500).json({ error: "Failed to fetch Twilio credentials" });
    }
  });
  
  // Fetch numbers owned by the user in their Twilio account
  router.get("/numbers/owned", async (req, res) => {
    try {
      const credentials = await TwilioIntegration.findOne({ user: req.user.id });
      if (!credentials) {
        return res.status(404).json({ error: "Twilio credentials not found" });
      }
  
      const client = twilio(
        decrypt(credentials.twilioApiKey),
        decrypt(credentials.twilioApiSecret),
        { accountSid: credentials.twilioSid }
      );
  
      const numbers = await client.incomingPhoneNumbers.list();
      res.json({ success: true, numbers });
    } catch (error) {
      console.error("Error fetching Twilio-owned numbers:", error);
      res.status(500).json({ error: "Failed to fetch Twilio-owned numbers" });
    }
  });
  
  // Add a Twilio number to the Intervo pool
  router.post("/numbers/add-to-intervo", async (req, res) => {
    const { phoneNumber} = req.body;
  
    try {
      const existingNumber = await PhoneNumber.findOne({ phoneNumber });
      if (existingNumber) {
        return res.status(400).json({ error: "Phone number already exists in the Intervo pool" });
      }
  
      const newPhoneNumber = new PhoneNumber({
        phoneNumber,
        source: "intervo", 
      });
  
      await newPhoneNumber.save();
  
      res.json({ success: true, message: "Number added to Intervo pool successfully", phoneNumber: newPhoneNumber });
    } catch (error) {
      console.error("Error adding Twilio number to Intervo pool:", error);
      res.status(500).json({ error: "Failed to add number to Intervo pool" });
    }
  });
  
  /**
   * @route   PUT /api/twilio/numbers/release/:id
   * @desc    Release a Twilio number added to the Intervo pool
   * @access  Authenticated
   */
  router.put("/numbers/release/:id", async (req, res) => {
    try {
      const phoneNumber = await PhoneNumber.findById(req.params.id);
  
      if (!phoneNumber) {
        return res.status(404).json({ error: "Phone number not found" });
      }
  
      if (phoneNumber.source !== "intervo") {
        return res.status(400).json({ error: "Only Intervo pool numbers can be released" });
      }
  
      if (phoneNumber.status !== "active") {
        return res.status(400).json({ error: "Phone number is already released or deleted" });
      }
  
      // Mark the number as released
      phoneNumber.status = "released";
      await phoneNumber.save();
  
      res.json({ success: true, message: "Phone number released successfully" });
    } catch (error) {
      console.error("Error releasing phone number:", error);
      res.status(500).json({ error: "Failed to release phone number" });
    }
  });
  
  /**
   * @route   GET /api/phone-numbers/intervo
   * @desc    Fetch available Intervo numbers
   * @access  Authenticated
   */
  router.get("/numbers/intervo", async (req, res) => {
    try {
      const intervoNumbers = await PhoneNumber.find({
        user: null,
        source: "intervo",
        status: "active", // Exclude released or deleted numbers
      });
  
      res.json({ success: true, intervoNumbers });
    } catch (error) {
      console.error("Error fetching Intervo phone numbers:", error);
      res.status(500).json({ error: "Failed to fetch Intervo phone numbers" });
    }
  });
  
  module.exports = router;
  