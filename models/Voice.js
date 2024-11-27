const mongoose = require("mongoose");

const voiceSchema = new mongoose.Schema({
  service: {
    type: String,
    enum: ["azure", "elevenlabs", "google", "aws"],
    required: true,
  },
  voiceName: { type: String, required: true }, // Original name from service
  customName: { type: String, required: true }, // Custom name
  language: { type: String, required: true },
  gender: { type: String, enum: ["male", "female", "neutral"], required: true },
  premium: { type: Boolean, default: false },
  description: { type: String },
  supportedFeatures: {
    type: [String],
    default: ["text-to-speech"], // Features like "text-to-speech", "custom-voice-models", etc.
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Voice", voiceSchema);
