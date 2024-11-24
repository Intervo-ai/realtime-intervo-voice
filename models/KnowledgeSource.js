const mongoose = require('mongoose');

const knowledgeSourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: String,
  difySourceId: {
    type: String,
    required: true
  },
  difyDocumentIds: {
    text: {
      type: String
    },
    file: {
      type: String
    },
    website: {
      type: String
    },
    faq: {
      type: String
    }
  },
  sourceType: {
    type: String,
    enum: ['text', 'file', 'website', 'faq'],
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('KnowledgeSource', knowledgeSourceSchema); 