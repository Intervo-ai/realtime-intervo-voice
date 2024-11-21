//https://www.twilio.com/docs/phone-numbers#explore-the-docs

const express = require("express");
const router = express.Router();
const twilioClient = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const PhoneNumber = require("../models/PhoneNumber");
const authenticateUser = require("../lib/authMiddleware");

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Fetch available phone numbers with voice capability
router.get("/available-numbers", async (req, res) => {
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

//https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource
router.post("/purchase", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Purchase the number from Twilio
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber,
    });

    // Save the purchased number in the database
    const newPhoneNumber = new PhoneNumber({
      number: purchasedNumber.phoneNumber,
      user: req.user.id,
    });

    await newPhoneNumber.save();

    res.status(201).json({
      message: "Phone number purchased successfully",
      phoneNumber: newPhoneNumber,
    });
  } catch (error) {
    console.error("Error purchasing number:", error);
    res.status(500).json({ error: "Failed to purchase phone number" });
  }
});

// Connect phone number to agent
router.post("/:id/connect", async (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: "Agent ID is required" });
    }

    // Find the phone number
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber || phoneNumber.user.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    // Ensure the agent exists
    const agent = await Agent.findById(agentId);
    if (!agent || agent.user.toString() !== req.user.id) {
      return res.status(404).json({ error: "Agent not found or unauthorized" });
    }

    // Update the phone number with the agent
    phoneNumber.agent = agentId;
    phoneNumber.connectedAt = new Date();
    await phoneNumber.save();

    res.json({
      message: "Phone number connected to agent successfully",
      phoneNumber,
    });
  } catch (error) {
    console.error("Error connecting phone number to agent:", error);
    res.status(500).json({ error: "Failed to connect phone number to agent" });
  }
});

// Disconnect phone number from agent
router.post("/:id/disconnect", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber || phoneNumber.user.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    // Disconnect the agent
    phoneNumber.agent = null;
    phoneNumber.disconnectedAt = new Date();
    await phoneNumber.save();

    res.json({
      message: "Phone number disconnected from agent successfully",
      phoneNumber,
    });
  } catch (error) {
    console.error("Error disconnecting phone number from agent:", error);
    res
      .status(500)
      .json({ error: "Failed to disconnect phone number from agent" });
  }
});

// Remove a phone number
router.delete("/:id", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber || phoneNumber.user.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    await phoneNumber.remove();

    // Release the number from Twilio
    await client.incomingPhoneNumbers(phoneNumber.numberSid).remove();

    res.json({ message: "Phone number removed successfully" });
  } catch (error) {
    console.error("Error removing phone number:", error);
    res.status(500).json({ error: "Failed to remove phone number" });
  }
});

// Only for phone Numbers provided by companies to our platform
//https://www.twilio.com/docs/verify/api/verification
// Start Phone Number Verification
router.post("/:id/verify/start", async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber || phoneNumber.user.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: phoneNumber.phoneNumber,
        channel: "sms",
      });

    phoneNumber.verificationStatus = "pending";
    phoneNumber.verificationSid = verification.sid;
    await phoneNumber.save();

    res.json({
      message: "Verification started",
      verificationSid: verification.sid,
    });
  } catch (error) {
    console.error("Error starting verification:", error);
    res.status(500).json({ error: "Failed to start verification" });
  }
});

//https://www.twilio.com/docs/verify/api/verification-check
//  Verify phone numebr with SMS code
router.post("/:id/verify/complete", async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Verification code is required" });
    }

    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber || phoneNumber.user.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ error: "Phone number not found or unauthorized" });
    }

    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber.phoneNumber,
        code,
      });

    if (verificationCheck.status === "approved") {
      phoneNumber.verificationStatus = "verified";
      await phoneNumber.save();
      res.json({ message: "Phone number verified successfully", phoneNumber });
    } else {
      res.status(400).json({ error: "Invalid verification code" });
    }
  } catch (error) {
    console.error("Error completing verification:", error);
    res.status(500).json({ error: "Failed to complete verification" });
  }
});

module.exports = router;
