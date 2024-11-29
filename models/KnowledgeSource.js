const mongoose = require("mongoose");

const knowledgeSourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  description: String,
  difySourceId: {
    type: String,
    required: true,
  },
  difyDocumentIds: {
    text: {
      type: {
        docId: { type: String },
        fileId: { type: String },
      },
      default: {}
    },
    file: {
      type: [
        {
          docId: { type: String },
          fileId: { type: String },
          fileName: { type: String },
        },
      ],
      default: [],
    },
    website: {
      type: [
        {
          id: { type: String },
            url: { type: String },
        },
      ],
      default: [],
    },
    faq: {
      type: {
        docId: { type: String },
        fileId: { type: String },
      },
      default: {}
    }
  },
  sourceType: {
    type: String,
    enum: ["text", "file", "website", "faq"],
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  metadata: {
    type: {
      tokens: {
        type: Number,
      },
      characters: {
        type: Number,
      },
    },
    default: {
      tokens: 0,
      characters: 0
    }
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

module.exports = mongoose.model("KnowledgeSource", knowledgeSourceSchema);
