const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  caller: {
    type: String,
    required: true,
  },
  callee: {
    type: String,
    required: true,
  },
  phoneNumberUsed: {
    type: String,
    required: true,
  },
  callType: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'answered', 'missed', 'ended', 'failed'],
    default: 'initiated',
  },
  duration: {
    type: Number, // Duration in seconds
    default: 0,
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  recordingUrl: {
    type: String,
  },
  transcription: [
    {
      speaker: {
        type: String,
        enum: ['caller', 'callee'],
        required: true,
      },
      text: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  summary: {
    type: String,
  },
  notes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

callSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Call = mongoose.model('Call', callSchema);

module.exports = Call;
