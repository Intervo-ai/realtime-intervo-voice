const mongoose = require("mongoose");

const twilioIntegrationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  twilioSid: { type: String, required: true },
  twilioApiKey: { type: String, required: true },
});

module.exports = mongoose.model("TwilioIntegration", twilioIntegrationSchema);
