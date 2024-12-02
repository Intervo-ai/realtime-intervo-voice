const mongoose = require('mongoose');

const phoneNumberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
  twilioSid: { type: String, required: true }, 
  friendlyName: { type: String }, // Optional name for easier identification
  phoneNumber: { type: String, required: true, unique: true }, 
  source: {
    type: String,
    enum: ['intervo', 'twilio'],
    required: true,
  }, 
  capabilities: {
    voice: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    mms: { type: Boolean, default: false },
  },
  countryCode: { type: String, required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
  price: { type: Number, default: 0 },
  priceCurrency: { type: String, default: 'USD' },
  isTemporary: { type: Boolean, default: false }, // Indicates if the number is temporary
  purchasedAt: { type: Date, default: Date.now }, // When the number was purchased
}, { timestamps: true }); 

module.exports = mongoose.model('PhoneNumber', phoneNumberSchema);
