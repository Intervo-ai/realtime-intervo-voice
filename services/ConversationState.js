class ConversationState {
    static instances = new Map();
    
    constructor(conversationId) {
        this.conversationId = conversationId;
        this._conversationPhase = 'start';
        this._structuredStep = 'greeting';
    }

    // Getters and setters for conversationPhase
    get conversationPhase() {
        return this._conversationPhase;
    }
    
    set conversationPhase(value) {
        console.log(`Setting conversationPhase to: ${value}`);
        this._conversationPhase = value;
    }

    // Getters and setters for structuredStep
    get structuredStep() {
        return this._structuredStep;
    }
    
    set structuredStep(value) {
        console.log(`Setting structuredStep to: ${value}`);
        this._structuredStep = value;
    }

    static getInstance(conversationId) {
        if (!conversationId) {
            throw new Error('ConversationId is required');
        }
        
        if (!ConversationState.instances.has(conversationId)) {
            ConversationState.instances.set(
                conversationId, 
                new ConversationState(conversationId)
            );
        }
        return ConversationState.instances.get(conversationId);
    }

    static cleanup(conversationId) {
        ConversationState.instances.delete(conversationId);
    }
}

module.exports = ConversationState; 