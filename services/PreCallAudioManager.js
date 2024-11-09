const { getTTSService } = require('./ttsRouter');
const { EventEmitter } = require('events');

class PreCallAudioManager {
  constructor() {
    this.audioCache = new Map();
  }

  _generateCacheKey(text, ttsService, voiceType) {
    return `${ttsService}_${voiceType}_${text}`;
  }

  async prepareAudio(config) {
    const { introduction, ttsService, voiceType } = config;
    const audioParts = [];

    if (introduction) {
      const cacheKey = this._generateCacheKey(introduction, ttsService, voiceType);
      
      // Check if audio is already cached
      if (!this.audioCache.has(cacheKey)) {
        try {
          // Create a virtual WebSocket to capture the audio
          const virtualWs = {
            readyState: 1,
            audioChunks: [],
            send: function(data) {
              const parsed = JSON.parse(data);
              if (parsed.event === 'media') {
                this.audioChunks.push(Buffer.from(parsed.media.payload, 'base64'));
              }
            }
          };

          // Get the TTS service and generate audio
          const ttsFunction = getTTSService(ttsService);
          await new Promise((resolve) => {
            ttsFunction(introduction, virtualWs, 'cache', resolve);
          });

          // Combine all chunks into one buffer
          const fullAudio = Buffer.concat(virtualWs.audioChunks);
          this.audioCache.set(cacheKey, fullAudio);
          console.log(`Cached audio for introduction: "${introduction.substring(0, 50)}..."`);
        } catch (error) {
          console.error('Error preparing audio:', error);
          throw error;
        }
      }
      
      audioParts.push({
        type: 'introduction',
        cacheKey,
        text: introduction
      });
    }

    return audioParts;
  }

  getAudio(cacheKey) {
    return this.audioCache.get(cacheKey);
  }

  clearAudio(cacheKey) {
    this.audioCache.delete(cacheKey);
  }

  clearCache() {
    this.audioCache.clear();
  }
}

module.exports = new PreCallAudioManager();