const WebSocket = require('ws');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

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
    console.log(error, authToken, "error");
    ws.close(1008, "Invalid authentication token");
    return;
  }

  ws.on("close", () => {
    console.log("WebSocket connection closed for client");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error for client:", error);
  });
}

module.exports = handleClientConnection; 