const express = require("express");
const router = express.Router();
const twilioClient = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const PhoneNumber = require("../models/PhoneNumber");

router.post('/intervo/add', async (req, res) => {
  try {
    const { phoneNumber,isTemporary } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const newPhoneNumber = new PhoneNumber({
      phoneNumber,
      source: 'intervo',
      isTemporary: !!isTemporary,
    });

    await newPhoneNumber.save();

    res.status(201).json({
      message: 'Phone number added to Intervo pool successfully',
      phoneNumber: newPhoneNumber,
    });
  } catch (error) {
    console.error('Error adding phone number to Intervo pool:', error);
    res.status(500).json({ error: 'Failed to add phone number to Intervo pool' });
  }
});

router.delete('/intervo/remove/:id', async (req, res) => {
  try {
    const phoneNumber = await PhoneNumber.findById(req.params.id);
    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    await phoneNumber.remove();

    res.json({ message: 'Phone number removed from Intervo pool successfully' });
  } catch (error) {
    console.error('Error removing phone number from Intervo pool:', error);
    res.status(500).json({ error: 'Failed to remove phone number from Intervo pool' });
  }
});

router.post('/twilio/purchase', async (req, res) => {
  try {
    const { phoneNumber, areaCode, country } = req.body;

    if (!phoneNumber || !country) {
      return res.status(400).json({ error: 'Phone number and country are required' });
    }

    const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      areaCode,
      friendlyName: 'Intervo Purchased',
    });

    const newPhoneNumber = new PhoneNumber({
      phoneNumber: purchasedNumber.phoneNumber,
      twilioSid: purchasedNumber.sid,
      source: 'twilio',
      capabilities: purchasedNumber.capabilities,
    });

    await newPhoneNumber.save();

    res.status(201).json({
      message: 'Twilio phone number purchased and added to Intervo pool',
      phoneNumber: newPhoneNumber,
    });
  } catch (error) {
    console.error('Error purchasing Twilio phone number:', error);
    res.status(500).json({ error: 'Failed to purchase Twilio phone number' });
  }
});


module.exports = router;
