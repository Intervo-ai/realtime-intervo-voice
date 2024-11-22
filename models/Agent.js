const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  apiKey: { type: String, unique: true }, 
  published: { type: Boolean, default: false },
  uniqueIdentifier: { type: String, unique: true },
  webhook: {
    name: { type: String },
    endpoint: { type: String },
    method: { type: String, enum: ['GET', 'POST', 'PUT','PATCH', 'DELETE'] },
    event: { type: String }
  },
  subAgents: {
    intentAgent: {
      type: String,
    },
    ragAgent: {
      type: String,
    },
    quickAgent: {
      type: Object,
      default: {
        name: String,
        temperature: Number,
        maxTokens: Number
      }
    }
  },
  sttSettings: {
    service: {
      type: String,
      enum: ['Google Speech-to-Text', 'Azure Speech Services', "Assembly AI"],
      default: 'Google Speech-to-Text'
    },
    rawTranscriptionMode: {
      type: Boolean,
      default: false
    }
  },
  ttsSettings: {
    service: {
      type: String,
      enum: ['Azure Speech Services'],
      default: 'Azure Speech Services'
    },
    voice: String
  },
  voice: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voice'
  },
  agentType: {
    type: String,
    enum: ['Lead Qualification', 'Customer Services','Interactive Product Assistance' ,'Receptionist'],
    required: true,
    default: 'Lead Qualification'
  },
  callDirection: {
    type: String,
    enum: ['incoming', 'outgoing', 'both'],
  },
  introduction: {
    type: String,
  },
  interactionSettings: {
    ambientAudio: {
      type: String,
      default: 'None'
    },
    responseThreshold: {
      type: Number,
      default: 0.5
    },
    conversationalFeedback: {
      type: Boolean,
      default: false
    },
    lexicalEnhancement: {
      terms: [String],
      enabled: {
        type: Boolean,
        default: false
      }
    },
    utteranceOptimization: {
      type: Boolean,
      default: false
    }
  },
  knowledgeBase: {
    sources: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeSource'
    }]
  },
  systemPrompt: {
    type: String,
  },
  prompt: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  language: {
    type: String,
    required: true,
    default: 'en-US'
  }
});

// Update timestamp on save
agentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Agent", agentSchema); 