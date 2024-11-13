const ConversationStateModel = require('../models/ConversationState');

class ConversationState {
    static instances = new Map();
    
    constructor(conversationId) {
        this.conversationId = conversationId;
        
        // Conversation state
        this._conversationPhase = 'start';
        this._structuredStep = 'greeting';
        
        // Memory state (from MemoryManager)
        this._memory = {
            entities: {
                fields: {},      // Stores all entity values
                required: {},    // Marks which fields are required
                collected: {},   // Tracks which required fields are collected
            },
            context: {},       // Conversation context
            preferences: {}    // User preferences
        };
    }

    // Getters and setters for conversationPhase
    get conversationPhase() {
        return this._conversationPhase;
    }
    
    set conversationPhase(value) {
        console.log(`Setting conversationPhase to: ${value}`);
        this._conversationPhase = value;
        this.save().catch(console.error);
    }

    // Getters and setters for structuredStep
    get structuredStep() {
        return this._structuredStep;
    }
    
    set structuredStep(value) {
        console.log(`Setting structuredStep to: ${value}`);
        this._structuredStep = value;
        this.save().catch(console.error);
    }

    // Memory Management methods
    async initializeRequiredFields(requiredFields) {
        Object.entries(requiredFields).forEach(([field, config]) => {
            this._memory.entities.required[field] = config;
            if (!this._memory.entities.fields[field]) {
                this._memory.entities.fields[field] = null;
            }
        });
        await this.save();
    }

    set(category, key, value) {
        if (category === 'entities') {
            this._memory.entities.fields[key] = value;
            if (this._memory.entities.required[key]?.required) {
                this._memory.entities.collected[key] = true;
            }
        } else {
            if (!this._memory[category]) {
                this._memory[category] = {};
            }
            this._memory[category][key] = value;
        }
        this.save().catch(console.error);
    }

    get(category, key) {
        if (category === 'entities') {
            return this._memory.entities.fields[key];
        }
        return this._memory[category]?.[key];
    }

    getRemainingRequiredFields() {
        return Object.entries(this._memory.entities.required)
            .filter(([field, config]) => {
                return config.required && !this._memory.entities.collected[field];
            })
            .map(([field, config]) => ({
                field,
                ...config
            }));
    }

    areRequiredFieldsCollected() {
        return this.getRemainingRequiredFields().length === 0;
    }

    getFormattedContext() {
        return JSON.stringify(this.getFullState(), null, 2);
    }

    static async getInstance(conversationId) {
        if (!conversationId) {
            throw new Error('ConversationId is required');
        }
        
        if (!ConversationState.instances.has(conversationId)) {
            try {
                // Try to load from MongoDB first
                const savedState = await ConversationStateModel.findOne({ 
                    conversationId 
                });
                
                const instance = new ConversationState(conversationId);
                
                if (savedState) {
                    // Restore state from MongoDB
                    instance._conversationPhase = savedState.conversationPhase;
                    instance._structuredStep = savedState.structuredStep;
                    instance._memory = savedState.memory;
                }
                
                ConversationState.instances.set(conversationId, instance);
            } catch (error) {
                console.error('Error loading conversation state:', error);
                throw error;
            }
        }
        return ConversationState.instances.get(conversationId);
    }

    static async cleanup(conversationId) {
        try {
            await ConversationStateModel.deleteOne({ conversationId });
            ConversationState.instances.delete(conversationId);
        } catch (error) {
            console.error('Error cleaning up conversation state:', error);
            throw error;
        }
    }

    // Conversation State Convenience Methods
    getConversationState() {
        return {
            phase: this._conversationPhase,
            structuredStep: this._structuredStep
        };
    }

    getMemoryState() {
        return {
            entities: this._memory.entities,
            context: this._memory.context,
            preferences: this._memory.preferences,

        };
    }

    // Combined state getter
    getFullState() {
        return {
            conversation: this.getConversationState(),
            memory: this.getMemoryState(),
            metadata: {
                hasAllRequiredFields: this.areRequiredFieldsCollected(),
                remainingRequired: this.getRemainingRequiredFields(),
                fieldDescriptions: this._memory.entities.required
            }
        };
    }

    // Add save method
    async save() {
        try {
            const stateData = {
                conversationId: this.conversationId,
                conversationPhase: this._conversationPhase,
                structuredStep: this._structuredStep,
                memory: this._memory
            };

            await ConversationStateModel.findOneAndUpdate(
                { conversationId: this.conversationId },
                stateData,
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('Error saving conversation state:', error);
            throw error;
        }
    }
}

module.exports = ConversationState; 