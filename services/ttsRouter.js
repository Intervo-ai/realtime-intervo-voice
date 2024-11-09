const { streamTTS: azureStreamTTS } = require('./azureTTS');
const { streamTTS: elevenLabsStreamTTS } = require('./elevenlabsTTS');
const { streamTTS: googleStreamTTS } = require('./googleTTS');
const { streamTTS: awsStreamTTS } = require('./pollyTTS');

function getTTSService(ttsService) {
    switch (ttsService) {
        case 'azure':
            return azureStreamTTS;
        case 'elevenlabs':
            return elevenLabsStreamTTS;
        case 'google':
            return googleStreamTTS;
        case 'aws':
            return awsStreamTTS;
        default:
            console.warn(`Unknown TTS service: ${ttsService}, falling back to Azure`);
            return azureStreamTTS;
    }
}

module.exports = { getTTSService }; 