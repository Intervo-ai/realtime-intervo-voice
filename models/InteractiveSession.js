const mongoose = require('mongoose');

const StepSchema = new mongoose.Schema({
  stepId: String,
  audioPath: String,
  sentences: [{
    words: Array,
    startTime: Number,
    endTime: Number,
    transcript: String
  }],
  events: Array,
  markdownPath: String,
  startTime: Number,
  endTime: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const InteractiveSessionSchema = new mongoose.Schema({
  steps: [StepSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('InteractiveSession', InteractiveSessionSchema); 