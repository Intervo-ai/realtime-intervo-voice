const axios = require('axios');
const Agent = require('../models/Agent');
const Activity = require('../models/Activity');
const Contact = require('../models/Contact');
const ConversationState = require('../models/ConversationState');
const OpenAIService = require('../services/openAI');

async function handleCallStopEvent(config, callStartTime, conversationHistory, wss, ws, timer) {
    console.log(config, "config");
    console.log(`[${timer()}] Media WS: Stop event received, ending stream.`);
    console.log("Call ended, preparing to process and send data.");

    // Retrieve the related `Activity` based on agent and contact
    const activityId = config.activityId;
    if (!activityId) {
        console.error("Activity ID is missing in custom parameters.");
        return;
    }
    const activity = await Activity.findById(activityId);

    if (!activity) {
        console.error("Activity not found.");
        return;
    }

    const contact = await Contact.findById(activity.contact);
    if (!contact) {
        console.error("Contact not found.");
        return;
    }

    // Generate a summary using OpenAI based on the conversation history
    try {
        const summary = await OpenAIService.handleStream(conversationHistory, {
            model: 'gpt-4-turbo-preview',
            temperature: 0.5,
            maxTokens: 300,
            systemPrompt: 'Summarize the following conversation in a concise manner, focusing on key points discussed:'
        });
        activity.summary = summary;
        activity.status = 'completed';
        activity.callDuration = ((Date.now() - callStartTime) / 1000).toFixed(2); // Set call duration in seconds
        await activity.save();

        console.log("Summary generated and activity updated successfully.");
    } catch (error) {
        console.error("Error generating summary with OpenAI:", error);
    }

    const conversationState = await ConversationState.getInstance(config.conversationId);
    const memoryState = conversationState.getMemoryState();
    // Prepare call details
    const callDetails = {
        conversationId: config.conversationId,
        conversationHistory: conversationHistory,
        summary: activity.summary,
        memoryState: memoryState,
        startTime: callStartTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: `${activity.callDuration} seconds`,
        callType: activity.callType,
        status: activity.status,
        contact: {
            name: `${contact.firstName} ${contact.lastName}`,
            email: contact.email,
            phoneNumber: contact.phoneNumber,
            country: contact.country
        },
        config:config
    };

    const agent = await Agent.findById(activity.agent);
    if (agent) {
        await sendToWebhook(agent, callDetails);
    } else {
        console.error("Agent not found.");
    }

    // Function to send data to the webhook
    async function sendToWebhook(agent, data) {
        if (!agent.webhook || !agent.webhook.endpoint) {
            console.error("Webhook not configured for this agent.");
            return;
        }

        try {
            const response = await axios({
                method: agent.webhook.method,
                url: agent.webhook.endpoint,
                data: {
                    event: agent.webhook.event,
                    payload: data
                }
            });
            console.log("Data sent to webhook successfully:", response.data);
        } catch (error) {
            console.error("Error sending data to webhook:", error);
        }
    }

    // Send conversation summary to WebSocket clients
    async function sendConversationSummary() {
        console.log("Sending conversation summary to clients", conversationHistory);
        if (conversationHistory) {
            // // Get conversation state
            // const conversationState = await ConversationState.getInstance(config.conversationId);
            // const memoryState = conversationState.getMemoryState();

            // Broadcast summary and memory state to clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client !== ws) {
                    client.send(JSON.stringify({
                        event: "summary",
                        text: activity.summary,
                        memory: memoryState,
                        config:config
                    }));
                }
            });
        }
    }

    await sendConversationSummary();
}

module.exports = handleCallStopEvent;
