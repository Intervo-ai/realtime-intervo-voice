const mongoose = require('mongoose');

const phoneNumberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
  twilioSid: { type: String, required: true }, 
  phoneNumber: { type: String, required: true, unique: true }, 
  friendlyName: { type: String }, // Optional name for easier identification
  source: {
    type: String,
    enum: ['intervo', 'twilio'],
    required: true,
  }, 
  // verificationStatus: {
  //   type: String,
  //   enum: ['unverified', 'pending', 'verified'],
  //   default: 'unverified',
  // }, // Verification status
  // verificationSid: { type: String }, // Twilio verification SID for tracking verification
  capabilities: {
    voice: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    mms: { type: Boolean, default: false },
  },
  purchasedAt: { type: Date, default: Date.now }, // When the number was purchased
  connectedAt: { type: Date }, // When the number was connected to an agent
  disconnectedAt: { type: Date }, // When the number was disconnected
}, { timestamps: true }); 

module.exports = mongoose.model('PhoneNumber', phoneNumberSchema);
