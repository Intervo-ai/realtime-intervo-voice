const speech = require("@google-cloud/speech");
const client = new speech.SpeechClient();

async function googleSpeechRecognize(audioBuffer) {
  const request = {
    config: {
      languageCode: "en-US",
      enableWordTimeOffsets: true  // Add this line to enable word timestamps
    },
    audio: {
      content: audioBuffer.toString('base64')
    }
  };
  
  try {
    console.log("Starting speech recognition");
    const [response] = await client.recognize(request);
    
    if (response.results) {
      // Keep each result as a separate phrase
      const phrases = response.results.map(result => {
        const alternative = result.alternatives[0];
        const words = alternative?.words || [];
        
        // Convert seconds + nanos to milliseconds
        const startTime = words[0]?.startTime 
          ? (words[0].startTime.seconds * 1000) + (words[0].startTime.nanos / 1000000)
          : 0;
        
        const endTime = words[words.length - 1]?.endTime
          ? (words[words.length - 1].endTime.seconds * 1000) + (words[words.length - 1].endTime.nanos / 1000000)
          : 0;

        return {
          transcript: alternative?.transcript || '',
          words: words,
          startTime,  // Now in milliseconds
          endTime    // Now in milliseconds
        };
      });

      return {
        phrases: phrases
      };
    }
    
    return {
      phrases: []
    };
  } catch (error) {
    console.error('Speech recognition error:', error);
    throw new Error(`Speech recognition failed: ${error.message}`);
  }
}

module.exports = googleSpeechRecognize;
 