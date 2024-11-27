const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InteractiveSessionSchema = new mongoose.Schema({
  audioPath: String,
  markdownPath: String,
  sentences: [{
    words: [{
      word: String,
      startTime: Number,
      endTime: Number
    }],
    startTime: Number,
    endTime: Number,
    transcript: String
  }],
  events: [Schema.Types.Mixed],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InteractiveSession', InteractiveSessionSchema); 