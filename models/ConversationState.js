const mongoose = require('mongoose');

const conversationStateSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  conversationPhase: { type: String, default: 'start' },
  structuredStep: { type: String, default: 'greeting' },
  memory: {
    entities: {
      fields: { type: Map, of: mongoose.Schema.Types.Mixed },
      required: { type: Map, of: mongoose.Schema.Types.Mixed },
      collected: { type: Map, of: Boolean }
    },
    context: { type: Map, of: mongoose.Schema.Types.Mixed },
    preferences: { type: Map, of: mongoose.Schema.Types.Mixed }
  }
}, { timestamps: true });

module.exports = mongoose.model('ConversationState', conversationStateSchema);