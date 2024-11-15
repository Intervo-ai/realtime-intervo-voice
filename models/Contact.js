const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  fullName: { type: String, trim: true },
  email: { type: String, required: true, unique: true, trim: true,match: /.+@.+\..+/ },
  phoneNumber: { type: String, required: true, unique: true, trim: true,match: /^\+?[1-9]\d{1,14}$/ },
  country: { type: String, required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

contactSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});


module.exports = mongoose.model("Contact", contactSchema);
