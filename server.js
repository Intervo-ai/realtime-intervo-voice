const express = require("express");
const dotenv = require("dotenv");
dotenv.config();

const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const connectDB = require('./config/dbConfig');
const cookieParser = require('cookie-parser');

const passport = require("./config/passportConfig");

const app = express();
const port = process.env.PORT || 3003;

const corsOptions = {
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true, // Important for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposedHeaders: ["Set-Cookie"] 
}


const apiLogger = (req, res, next) => {
  const startHrTime = process.hrtime(); // Record start time

  // Capture response finish event
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startHrTime);
    const durationInMilliseconds = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationInMilliseconds}ms`);
  });

  // Capture response error event
  res.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.originalUrl} - ${err.message}`);
  });

  next();
};



app.use(cors(corsOptions));
app.options('*', cors()); // Handle preflight requests
app.use(cookieParser()); // Add this line

// Use the middleware
app.use(apiLogger);
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWILIO_APP_SID;

// // Session middleware for authentication
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production
      sameSite: 'lax', // Helps handle cross-origin requests properly
    },
  })
);

// Initialize passport and session
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
connectDB();
// Import routers
const streamRouter = require("./routes/streamRouter");
const voiceRouter = require("./routes/voiceRouter");
const authRouter = require("./routes/authRouter");
const userRouter = require("./routes/userRouter");
const agentRouter = require("./routes/agentRouter");
const contactRouter = require("./routes/contactRouter");
const activityRouter = require("./routes/activityRouter");
const workflowRouter = require("./routes/workflowRouter");
const phoneNumbersAdminRouter = require("./routes/phoneNumbersAdminRouter");
const phoneNumbersRouter = require("./routes/phoneNumbersRouter");
const getVoicesRouter = require("./routes/getVoicesRouter");
const getVoicesAdminRouter = require("./routes/getVoicesAdminRouter");
const twilioRouter = require("./routes/twilioRouter");

// Token generation for Twilio Client
app.get("/token", (req, res) => {
  const identity = "user-" + Math.random().toString(36).substring(7);
  const accessToken = new twilio.jwt.AccessToken(accountSid, apiKey, apiSecret, { identity });
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: appSid });
  accessToken.addGrant(voiceGrant);

  res.send({ identity, token: accessToken.toJwt() });
});

// Status callback for call
app.post('/call-status', (req, res) => {
  console.log("Status Callback from Twilio:", req.body);
  res.sendStatus(200);
});

// Use routers
app.use("/stream", streamRouter);
app.use("/voice", voiceRouter);
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/agent", agentRouter);
app.use("/contacts", contactRouter);
app.use("/activities", activityRouter);
app.use("/workflow", workflowRouter);
app.use("/phone-number", phoneNumbersRouter);
app.use("/admin-phone-number",phoneNumbersAdminRouter);
app.use("/get-voices",getVoicesRouter);
app.use("/get-admin-voices",getVoicesAdminRouter);
app.use("./twilio",twilioRouter);

// Create shared HTTP server for both Express and WebSocket
const server = http.createServer(app);

// Import WebSocket logic from separate file
require('./streamSocket')(server);

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

