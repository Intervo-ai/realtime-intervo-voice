const createGoogleSpeechRecognizeStream = require('./createGoogleSpeechRecognizeStream');
const createAzureSpeechRecognizeStream = require('./createAzureSpeechRecognizeStream');

function createSpeechRecognizeStream(config, params) {
  switch (config.sttService?.toLowerCase()) {
    case 'azure':
      return createAzureSpeechRecognizeStream(params);
    case 'google':
    default:
      return createGoogleSpeechRecognizeStream(params);
  }
}

module.exports = createSpeechRecognizeStream;

