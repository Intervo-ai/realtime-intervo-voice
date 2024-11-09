class MemoryManager {
  constructor() {
    this.memory = {
      entities: {
        fields: {},      // Stores all entity values
        required: {},    // Marks which fields are required
        collected: {},   // Tracks which required fields are collected
      },
      context: {},       // Conversation context
      preferences: {}    // User preferences
    };
  }

  initializeRequiredFields(requiredFields) {
    // requiredFields can be an object like:
    // { name: { required: true, description: "Customer's full name" },
    //   email: { required: true, description: "Contact email" },
    //   company: { required: false, description: "Company name" } }
    
    Object.entries(requiredFields).forEach(([field, config]) => {
      this.memory.entities.required[field] = config;
      // Initialize the field in the main storage if not exists
      if (!this.memory.entities.fields[field]) {
        this.memory.entities.fields[field] = null;
      }
    });
  }

  set(category, key, value) {
    if (category === 'entities') {
      this.memory.entities.fields[key] = value;
      
      // If this is a required field, mark it as collected
      if (this.memory.entities.required[key]?.required) {
        this.memory.entities.collected[key] = true;
      }
    } else {
      if (!this.memory[category]) {
        this.memory[category] = {};
      }
      this.memory[category][key] = value;
    }
  }

  get(category, key) {
    if (category === 'entities') {
      return this.memory.entities.fields[key];
    }
    return this.memory[category]?.[key];
  }

  getRemainingRequiredFields() {
    return Object.entries(this.memory.entities.required)
      .filter(([field, config]) => {
        return config.required && !this.memory.entities.collected[field];
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
    const remainingFields = this.getRemainingRequiredFields();
    
    return JSON.stringify({
      entities: this.memory.entities.fields,
      context: this.memory.context,
      preferences: this.memory.preferences,
      _metadata: {
        hasAllRequiredFields: this.areRequiredFieldsCollected(),
        remainingRequired: remainingFields,
        fieldDescriptions: this.memory.entities.required
      }
    }, null, 2);
  }
}

module.exports = MemoryManager; 