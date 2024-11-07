// services/workflow.js
const speech = require("@google-cloud/speech");
const { handleGroqStream } = require('./groqAI');
const { handleOpenAIStream } = require('./openAI');
const { streamTTS } = require('./googleTTS');
const speechClient = new speech.SpeechClient();
const WebSocket = require("ws");

class Workflow {
  constructor(config, ws, wss, timer) {
    this.config = config;
    this.ws = ws;
    this.wss = wss;
    this.timer = timer;
    this.isProcessingTTS = false;
    this.ignoreNewTranscriptions = false;
    this.conversationHistory = "";
    this.recognizeStream = this.createRecognizeStream();
    this.setupInactivityTimeout();
  }

  createRecognizeStream() {
    console.log("createRecognizeStream")
    const request = {
      config: {
        encoding: this.config.encoding || "MULAW",
        sampleRateHertz: this.config.sampleRateHertz || 8000,
        languageCode: this.config.languageCode || "en-IN",
        enableAutomaticPunctuation: false,
      },
      interimResults: false,
      singleUtterance: true,
    };
 const recognizeStream = speechClient.streamingRecognize(request)
      .on("data", (data) => this.handleSTTData(data))
      .on("error", (error) => console.error(`[${this.timer()}] STT error:`, error))
      .on("end", () => this.handleSTTEnd());

    return recognizeStream;
}

  async handleSTTData(data) {
    console.log("dataaa")
    if (this.ignoreNewTranscriptions || this.isProcessingTTS) return;

    const transcription = data.results[0]?.alternatives[0]?.transcript;
    const isFinal = data.results[0]?.isFinal;

    if (transcription) {
      console.log(`[${this.timer()}] Transcription received: ${transcription}`);
      this.broadcastToClients({ event: "transcription", source: "user", text: transcription });

      if (isFinal) {
        this.clearInactivityTimeout();
        await this.processTranscription(transcription);
      } else {
        this.resetInactivityTimeout(transcription);
      }
    }
  }

  async processTranscription(transcription) {
    this.ignoreNewTranscriptions = true;
    this.conversationHistory += `User: ${transcription}\n`;

    const transcriptionResponse = await this.handleAI(transcription);
    this.conversationHistory += `Assistant: ${transcriptionResponse}\n`;

    this.broadcastToClients({ event: "transcription", text: transcriptionResponse, source: "ai" });

    await this.processTTS(transcriptionResponse);
    this.resetRecognizeStream();
  }

  async handleAI(transcription) {
    const response = await (this.config.aiAgent === 'groq'
      ? handleGroqStream(this.conversationHistory)
      : handleAIFlowStream(this.conversationHistory));
    return response;
  }

  async processTTS(responseText) {
    this.isProcessingTTS = true;
    const ttsFunction = this.config.useGoogleTTS ? streamTTS : streamTTSWithPolly;

    await ttsFunction(responseText, this.ws, this.config.streamSid, () => {
      this.isProcessingTTS = false;
    });

    this.isProcessingTTS = false;
  }

  resetRecognizeStream() {
    this.recognizeStream.end();
    this.recognizeStream = this.createRecognizeStream();
    this.ignoreNewTranscriptions = false;
  }

  setupInactivityTimeout() {

    // console.log("setupInactivityTimeout")
    // this.inactivityTimeout = setTimeout(async () => {
    //   await this.processTranscription(this.conversationHistory);
    // }, 1000);
  }

  clearInactivityTimeout() {
    clearTimeout(this.inactivityTimeout);
  }

  resetInactivityTimeout(transcription) {
    this.clearInactivityTimeout();
    this.setupInactivityTimeout();
  }

  broadcastToClients(data) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== this.ws) {
        client.send(JSON.stringify(data));
      }
    });
  }

  handleSTTEnd() {
    if (!this.isProcessingTTS) {
      this.resetRecognizeStream();
    }
  }
}

module.exports = Workflow;
