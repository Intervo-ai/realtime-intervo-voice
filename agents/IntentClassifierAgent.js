const { BaseAgent } = require('./BaseAgent');

const ACKNOWLEDGMENTS = {
  happy: [
    "Wonderful to hear that",
    "That's excellent",
    "I'm glad to hear that",
    "That's great news",
    "Delighted to hear this",
    "That's fantastic",
    "I'm pleased to hear that",
    "That's wonderful",
    "Excellent news",
    "That's very good to hear"
  ],
  neutral: [
    "I understand",
    "Certainly",
    "Okay",
    "Understood",
    "Noted",
    "Very well",
    "Indeed",
    "Right",
    "Got it!",
    "Absolutely"
  ],
  casual: [
    "Thanks for sharing that",
    "I appreciate you telling me",
    "That's interesting",
    "I hear you",
    "Good to know",
    "I see what you mean",
    "That makes sense",
    "Fair enough",
    "I understand completely",
    "That's clear"
  ],
  frustrated: [
    "I understand your frustration",
    "I hear your concerns",
    "Let me help address that",
    "I apologize for the difficulty",
    "I know this can be frustrating",
    "Let's work through this together",
    "I appreciate your patience",
    "I'll help sort this out",
    "Thank you for bringing this up",
    "Let's find a solution"
  ],
};

const BACKCHANNELS = {
  happy: [
    "Ah",
    "Oh",
    "Wow",
    "Hey",
  ],
  neutral: [
    "Hmm",
    "Well",
    "So",
    "Let's see",
  ],
  casual: [
    "Oh",
    "Hey",
    "Ah",
    "Well",
  ],
  frustrated: [
    "Oh",
    "Hmm",
    "Ah",
    "Well",
  ]
};

const getAcknowledgment = (emotion, confidence, certainty) => {
  const combinedScore = (confidence * 0.6) + (certainty * 0.4);
  
  // If we're not very confident, use neutral backchannels
  if (combinedScore < 0.6) {
    const backchannel = BACKCHANNELS.neutral[Math.floor(Math.random() * BACKCHANNELS.neutral.length)];
    return `${backchannel}, ${ACKNOWLEDGMENTS.neutral[Math.floor(Math.random() * ACKNOWLEDGMENTS.neutral.length)]}`;
  }
  
  // Use emotion-appropriate backchannels
  const backchannel = BACKCHANNELS[emotion][Math.floor(Math.random() * BACKCHANNELS[emotion].length)];
  return `${backchannel}, ${ACKNOWLEDGMENTS[emotion][Math.floor(Math.random() * ACKNOWLEDGMENTS[emotion].length)]}`;
};

class IntentClassifierAgent extends BaseAgent {
  constructor(config={}) {
    super('intent-classifier', {
      aiService: config.aiService || 'groq',
      aiConfig: {
        temperature: 0.1,
        ...config.aiConfig
      }
    });
    
    
    if (!config.conversationId) {
      throw new Error('conversationId is required for IntentClassifierAgent');
    }
    
    this.customerName = config.customerName || null;
    this.introPlayed = false;
    
    // Handle async initialization
    this.initializationPromise = (async () => {
      this.state = await require('../services/ConversationState').getInstance(config.conversationId);
    })();
  }

  // Add helper method to ensure initialization
  async ensureInitialized() {
    await this.initializationPromise;
  }

  async process(input, {goal, memoryState}) {
    
    await this.ensureInitialized();
    console.log("Black sheep:", this.state.conversationPhase, goal, memoryState);
    
    // Handle other structured phases
    if (this.state.conversationPhase !== 'unstructured') {
      return await this.handleStructuredPhase(input,this.state);
    }

    if(goal === "lead-qualification") {
      return await this.handleLeadQualificationPhase(input, memoryState);
    }
    // Handle unstructured phase (existing logic)
    const response = await this.classifyIntent(input);
    return {
      type: response.isDomainRelated ? 'domain' : "",
      acknowledgment: response.isDomainRelated ? getAcknowledgment(
        response.emotion, 
        response.confidence,
        response.certainty
      ) : null,
      confidence: response.confidence,
      certainty: response.certainty,
      isDomainRelated: response.isDomainRelated
    };
  }

  async handleLeadQualificationPhase(input, memoryState) {
    // Check if there's a previous question being answered
    const previousQuestion = await this.state.get('context', 'lastQuestion');
    const expectedField = await this.state.get('context', 'expectedField');

    console.log("Previous question:", previousQuestion, "Expected field:", expectedField);

    if (previousQuestion && expectedField) {
      // Analyze the response to the previous question
      const responseAnalysis = await this.callAI(`
        Analyze if this response answers the question: "${previousQuestion}. Even if the user says, I am not interested in sharing or Straight no - that's a valid answer. "
        Input: "${input}"
        Return JSON: {
          "isValidAnswer": boolean,
          "confidence": number (0-1),
          "extractedValue": string
        }
      `, { responseFormat: 'json_object' });

      const analysis = JSON.parse(responseAnalysis);
        
      console.log(analysis, "*************$$$$$$$$$$$$$$$$$$$$$$$$$$$analysis");
      if (analysis.isValidAnswer) {
        // Update both state and memoryState
        memoryState.entities.fields[expectedField] = analysis.extractedValue;
        memoryState.entities.collected[expectedField] = true;
        
        // Also update the conversation state for persistence
        await this.state.set('entities.fields', expectedField, analysis.extractedValue);
        await this.state.set('entities.collected', expectedField, true);
      }
    }

    // Use memoryState to find next required field
    const nextField = Object.keys(memoryState.entities.required)
      .find(field => !memoryState.entities.collected[field]);

    console.log(nextField, memoryState.entities,"nextField");
    if (!nextField) {
      return {
        type: 'call-end',
        text: "Thank you for providing all that information! That's all I need for now. Someone from the team will get in touch with you shortly",
        complete: true,
        memoryState, // Return updated memoryState
        order:1
      };
    }

    // Generate the next question based on the field from memoryState
    const questionPrompt = await this.generateQuestion(nextField);
    
    // Store context for next interaction
    await this.state.set('context', 'lastQuestion', questionPrompt);
    await this.state.set('context', 'expectedField', nextField);

    return {
      type: 'lead-question',
      text: questionPrompt,
      field: nextField,
      complete: false,
      memoryState // Return updated memoryState
    };
  }

  async generateQuestion(field) {
    // First check if we have pre-generated questions
    const preGeneratedQuestions = await this.state.get('context', 'preGeneratedQuestions');
    console.log(preGeneratedQuestions,field, "preGeneratedQuestions");
    if (preGeneratedQuestions) {
      const question = preGeneratedQuestions.find(q => q.field === field);
      if (question) {
        return question.text;
      }
    }
const prompt = `
      Generate a natural, conversational question to ask about a person's "${field}".
      The question should be friendly and professional.
      Return only the question text without quotes or additional formatting.
    `;
    
    const response = await this.callAI(prompt, {
      temperature: 0.7 // Slightly higher temperature for more natural variation
    });
    
    return response.trim();
  }

  async handleStructuredPhase(input) {
    console.log("Current phase:", this.state.conversationPhase, this.state.structuredStep, "Input:", input);

    switch(this.state.structuredStep) {
  
      case 'availability':
        const timingResponse = await this.analyzeTimingResponse(input);
        
        if (timingResponse.isGoodTime) {
          return {
            text: "Great! I'd like to ask you a few questions about your business.",
            type: 'affirmative',
            priority: 'immediate',
            nextPhase: 'unstructured',
            affirmative: true
          };
        } else {
          return {
            text: "I understand. When would be a better time to call back?",
            type: 'negative',
            priority: 'immediate',
            nextAction: 'scheduleCallback',
            affirmative: false
          };
        }

      default:
        return null;
    }
  }

  async analyzeIdentityQuestion(input) {
    const prompt = `
      Determine if the user is asking about the caller's identity.
      Input: "${input}"
      Return JSON: {
        "needsIdentity": boolean,
        "confidence": number (0-1)
      }
    `;
    
    const response = await this.callAI(prompt, {
      responseFormat: 'json_object'
    });
    return JSON.parse(response);
  }

  async analyzeTimingResponse(input) {
    const prompt = `
      Determine if the user indicates it's a good time to talk.
      Input: "${input}"
      Return JSON: {
        "isGoodTime": boolean,
        "confidence": number (0-1),
        "suggestedCallback": string | null
      }
    `;
    
    const response = await this.callAI(prompt, {
      responseFormat: 'json_object'
    });
    return JSON.parse(response);
  }

  async classifyIntent(input) {
    const prompt = `Classify the emotional tone and domain relevance of this message: "${input}". When I say domain related, is the user talking about about something niche (like a product related query) or something generic.
    Return JSON format: {
      "emotion": "happy" | "neutral" | "casual",
      "confidence": number (0-1), // How confident we are in the emotion detection
      "certainty": number (0-1),  // How certain/clear the message intent is
      "isDomainRelated": boolean  // Is the message related to the domain/task at hand
    }`;
    
    const response = await this.callAI(prompt, {
      responseFormat: 'json_object'
    });

    return JSON.parse(response);
  }
}

module.exports = { IntentClassifierAgent };