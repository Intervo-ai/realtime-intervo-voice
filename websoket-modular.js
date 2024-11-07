// index.js or main WebSocket server file
const WebSocket = require("ws");
const Workflow = require("./services/workflow");
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const [path, queryString] = req.url.split("?");
    const params = new URLSearchParams(queryString);
    const type = params.get("type");

    if (type === "client") {
      handleClientConnection(ws, req);
    } else {
      handleTwilioConnection(ws, req, wss);
    }
  });

  function handleClientConnection(ws, req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const { authToken } = cookies;
    if (!authToken) {
      ws.close(1008, "Authentication token missing");
      return;
    }

    try {
      const decoded = jwt.verify(authToken, process.env.NEXTAUTH_SECRET);
      console.log("Authenticated user:", decoded);
    } catch (error) {
      console.log(error, "Invalid auth token");
      ws.close(1008, "Invalid token");
      return;
    }

    ws.on("close", () => console.log("Client WebSocket closed"));
    ws.on("error", (error) => console.error("Client WebSocket error:", error));
  }

  function handleTwilioConnection(ws, req, wss) {
      const startTime = Date.now();

  const timer = () => `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
    const config = {
      encoding: "MULAW",
      sampleRateHertz: 8000,
      languageCode: "en-IN",
    aiAgent: "groq",
      useGoogleTTS: true
    };

    console.log(`[${timer()}] Twilio WebSocket connected`);
    const workflow = new Workflow(config, ws, wss, timer);

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString("utf8"));
      if (data.event === "start") {
        config.streamSid = data.streamSid;
        console.log(`[${timer()}] Stream started with SID: ${config.streamSid}`);
      } else if (data.event === "media") {
        const audioChunk = Buffer.from(data.media.payload, "base64");
        workflow.recognizeStream.write(audioChunk);
      } else if (data.event === "stop") {
        workflow.recognizeStream.end();
      }
    });

    ws.on("close", () => console.log(`[${timer()}] Twilio WebSocket closed`));
    ws.on("error", (error) => console.error(`[${timer()}] Twilio WebSocket error:`, error));
  }
};
