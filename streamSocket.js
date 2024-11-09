const WebSocket = require("ws");
const handleTwilioConnection = require('./handlers/twilioHandler');
const handleClientConnection = require('./handlers/clientHandler');

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("New WebSocket connection");

    // Get connection type from headers
    const type = req.headers['type'];
    console.log("Connection type:", type || "Twilio");

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        
        // Handle the start message which contains the parameters
        if (msg.event === 'start') {
          console.log("Start message received with parameters:", msg.start);
          // You can now access parameters like:
          // msg.start.parameters['stt-service']
          // msg.start.parameters['ai-endpoint']
          // etc...
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    });

    if (type === "client") {
      handleClientConnection(ws, req);
    } else {
      handleTwilioConnection(ws, req, wss);
    }
  });
};
