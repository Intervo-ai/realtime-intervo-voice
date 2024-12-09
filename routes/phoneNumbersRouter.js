const express = require("express");
const router = express.Router();
const PhoneNumber = require("../models/PhoneNumber");
const authenticateUser = require("../lib/authMiddleware");
const twilio = require('twilio');

// Apply authentication middleware
router.use(authenticateUser);

// Fetch all phone numbers owned by the user: Called when the user goes to phone numbers page
router.get("/user", async (req, res) => {
  try {
    const userNumbers = await PhoneNumber.find({ user: req.user.id }).populate('agent', 'agentType name');
    res.json({ success: true, userNumbers });
} catch (error) {
    console.error("Error fetching user's phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch user's phone numbers" });
  }
});

// To be removed: Fetch available Intervo numbers from the pool? (not used in the UI)
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


// Fetch the user's temporary number: Called when the user opens the add phone number popup.
router.get("/temporary", async (req, res) => {
  console.log("Fetching temporary number for user:", req.user.id);
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

// Happens when the user makes a purchase. To be completed Request a temporary number from the Intervo pool
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
//!important: missing in the UI
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



// Fetch Twilio numbers purchased by the user. Called when the user opens add phone number popup.
router.get("/twilio/purchased", async (req, res) => {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });

    res.json({ 
      success: true, 
      purchasedNumbers: numbers.map(num => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality,
        region: num.region,
        voiceEnabled: num.capabilities.voice,
        smsEnabled: num.capabilities.SMS
      }))
    });
  } catch (error) {
    console.error("Error fetching purchased Twilio phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch purchased Twilio phone numbers" });
  }
});

// Add a Twilio number to our database. Called when the user adds a Twilio number to their account.
router.post("/twilio/add", async (req, res) => {
  try {
    const { phoneNumber, agentId, friendlyName } = req.body;
    
    // Initialize Twilio client
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    
    // Fetch number details from Twilio
    const twilioNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber
    });

    if (!twilioNumbers || twilioNumbers.length === 0) {
      return res.status(404).json({ 
        error: "Phone number not found in your Twilio account" 
      });
    }

    const twilioNumber = twilioNumbers[0];

    // Check if number already exists in our database
    const existingNumber = await PhoneNumber.findOne({ 
      twilioSid: twilioNumber.sid 
    });

    if (existingNumber) {
      return res.status(400).json({ 
        error: "This number is already in our database" 
      });
    }

    // Create new phone number entry
    const newPhoneNumber = new PhoneNumber({
      user: req.user.id,
      twilioSid: twilioNumber.sid,
      friendlyName: friendlyName || twilioNumber.friendlyName,
      phoneNumber: twilioNumber.phoneNumber,
      source: 'twilio',
      capabilities: {
        voice: twilioNumber.capabilities.voice,
        sms: twilioNumber.capabilities.SMS,
        mms: twilioNumber.capabilities.MMS,
      },
      countryCode: twilioNumber.countryCode || twilioNumber.phoneNumber.slice(1, 3),
      agent: agentId || null,
      price: twilioNumber.pricePerMonth || 0,
      priceCurrency: 'USD',
      purchasedAt: new Date(twilioNumber.dateCreated)
    });

    await newPhoneNumber.save();

    const populatedPhoneNumber = await PhoneNumber.findById(newPhoneNumber._id).populate('agent', 'agentType name');

    res.json({
      success: true,
      message: "Phone number added successfully",
      phoneNumber: populatedPhoneNumber,
    });

  } catch (error) {
    console.error("Error adding Twilio phone number:", error);
    res.status(500).json({ error: "Failed to add Twilio phone number" });
  }
});

// Assign an agent to a phone number; Called when the user assigns an agent to a phone number. Either from the phone number module or from the playground
router.put("/assign-agent/:phoneNumberId", async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const { agentId } = req.body;

    const phoneNumber = await PhoneNumber.findOne({
      _id: phoneNumberId,
      user: req.user.id
    });

    if (!phoneNumber) {
      return res.status(404).json({ 
        error: "Phone number not found or you don't have permission" 
      });
    }

    phoneNumber.agent = agentId;
    await phoneNumber.save();


    res.json({ 
      success: true, 
      message: "Agent assigned successfully", 
    });
  } catch (error) {
    console.error("Error assigning agent to phone number:", error);
    res.status(500).json({ error: "Failed to assign agent" });
  }
});

// Remove agent from a phone number. Called when the user removes an agent from a phone number. Either from the phone number module or from the playground.
router.delete("/remove-agent/:phoneNumberId", async (req, res) => {
  try {
    const { phoneNumberId } = req.params;

    const phoneNumber = await PhoneNumber.findOne({
      _id: phoneNumberId,
      user: req.user.id
    });

    if (!phoneNumber) {
      return res.status(404).json({ 
        error: "Phone number not found or you don't have permission" 
      });
    }

    phoneNumber.agent = null;
    await phoneNumber.save();

    res.json({ 
      success: true, 
      message: "Agent removed successfully", 
      phoneNumber 
    });
  } catch (error) {
    console.error("Error removing agent from phone number:", error);
    res.status(500).json({ error: "Failed to remove agent" });
  }
});



// Unlink (delete) a Twilio phone number from the database. Called in the phone numbers module. Probably from the three dot icon dropdown.
router.delete("/unlink/:phoneNumberId", async (req, res) => {
  try {
    const { phoneNumberId } = req.params;

    // Find the phone number and verify ownership
    const phoneNumber = await PhoneNumber.findOne({
      _id: phoneNumberId,
      user: req.user.id
    });

    if (!phoneNumber) {
      return res.status(404).json({ 
        error: "Phone number not found or you don't have permission" 
      });
    }

    // Verify it's a Twilio number
    if (phoneNumber.source !== 'twilio') {
      return res.status(400).json({ 
        error: "Only Twilio numbers can be unlinked" 
      });
    }

    // Delete the phone number from database
    await PhoneNumber.deleteOne({ _id: phoneNumberId });

    res.json({ 
      success: true, 
      message: "Phone number unlinked successfully",
      unlinkedNumber: phoneNumber.phoneNumber
    });
  } catch (error) {
    console.error("Error unlinking phone number:", error);
    res.status(500).json({ error: "Failed to unlink phone number" });
  }
});

module.exports = router;
