const WebSocket = require("ws");
const handleTwilioConnection = require('./handlers/twilioHandler');
const handleClientConnection = require('./handlers/clientHandler');

module.exports = function (server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("New WebSocket connection");

    const [path, queryString] = req.url.split("?");
    const params = new URLSearchParams(queryString);
    const type = params.get("type");

    console.log("Connection type:", type || "Twilio");

    if (type === "client") {
      handleClientConnection(ws, req);
    } else {
      handleTwilioConnection(ws, req, wss);
    }
  });
}