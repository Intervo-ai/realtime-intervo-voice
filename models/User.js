const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  authProviders: {
    google: {
      id: String,
    },
    facebook: {
      id: String,
    },
    github: {
      id: String,
    },
  },
  displayName: String,
  email: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
