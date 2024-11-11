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
    
    this.conversationPhase = 'start';
    this.customerName = config.customerName || null;
    this.introPlayed = false;
  }

  async process(input) {
    console.log("IntentClassifierAgent process:", this.conversationPhase);
    
    // Initial greeting should only happen once
    if (this.conversationPhase === 'start') {
      this.conversationPhase = 'waitForGreeting';
      return {
        text: this.customerName ? `Hey ${this.customerName}` : "Hey there",
        type: 'structured',
        priority: 'immediate'
      };
    }
    
    // Handle other structured phases
    if (this.conversationPhase !== 'unstructured') {
      return await this.handleStructuredPhase(input);
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

  async handleStructuredPhase(input) {
    console.log("Current phase:", this.conversationPhase, "Input:", input);

    switch(this.conversationPhase) {
      case 'waitForGreeting':
        if (!input.trim()) return null;
        
        this.conversationPhase = 'availability';
        return {
          type: 'structured',
          priority: 'immediate',
          nextAction: 'playIntro'  // Now play the introduction
        };

      case 'intro':
        // Analyze if user is asking about identity
        const identityResponse = await this.analyzeIdentityQuestion(input);
        this.conversationPhase = 'availability';
        
        return {
          text: identityResponse.needsIdentity ? 
            "I'm an AI assistant calling on behalf of [Company]. Is this a good time to talk?" :
            "Is this a good time to talk?",
          type: 'structured',
          priority: 'immediate'
        };

      case 'availability':
        const timingResponse = await this.analyzeTimingResponse(input);
        
        if (timingResponse.isGoodTime) {
          this.conversationPhase = 'unstructured';
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
      responseFormat: 'json'
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
      responseFormat: 'json'
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
      responseFormat: 'json'
    });

    return JSON.parse(response);
  }
}

module.exports = { IntentClassifierAgent };