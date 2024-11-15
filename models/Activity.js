const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true },
  conversationTranscription: [
    {
      speaker: { type: String, enum: ["agent", "contact"], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  summary: { type: String },
  memory: { type: Map, of: mongoose.Schema.Types.Mixed }, // Stores key-value data important for the conversation
  collectedInfo: { type: Map, of: mongoose.Schema.Types.Mixed }, // Stores specific information collected during the call
  callDuration: { type: Number, default: 0 }, // Call duration in seconds
  callType: { type: String, enum: ["incoming", "outgoing"], required: true }, 
  status: { type: String, enum: ["completed", "in-progress", "missed"], default: "in-progress" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

activitySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Activity", activitySchema);
