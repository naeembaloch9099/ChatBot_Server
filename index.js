const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
// axios is used in controllers

// Load server-specific env first (server/.env). Use __dirname so this works
// whether nodemon is started from project root or server folder.
const path = require("path");
dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const cookieParser = require("cookie-parser");

// CORS configuration
const corsOptions = {
  origin: [
    "https://chat-bot-frontend-eight-gray.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Simple request logger (redacts sensitive fields)
app.use((req, res, next) => {
  try {
    const safeBody =
      req.body && typeof req.body === "object" ? { ...req.body } : req.body;
    if (safeBody && typeof safeBody === "object") {
      ["password", "passwordHash", "otp"].forEach((k) => {
        if (k in safeBody) safeBody[k] = "[REDACTED]";
      });
    }
    console.log(`[req] ${req.method} ${req.originalUrl} body:`, safeBody);
  } catch {
    // ignore logger errors
  }
  next();
});

const PORT = process.env.PORT || 8080;

// MongoDB setup
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI is not set in .env");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("Connected to MongoDB");
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
    });
}

// Mount routers
const messagesRouter = require("./routes/messages");
const geminiRouter = require("./routes/gemini");
const modelsRouter = require("./routes/models");
const authRouter = require("./routes/auth");
const chatsRouter = require("./routes/chats");
const uploadsRouter = require("./routes/uploads");

app.use("/api/messages", messagesRouter);
app.use("/api/gemini", geminiRouter);
app.use("/api/models", modelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/chats", chatsRouter);
app.use("/api", uploadsRouter);

try {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Validate email configuration on startup
    try {
      const { validateEmailConfig } = require("./utils/email");
      console.log(`[Startup] 📧 Checking email configuration...`);
      validateEmailConfig();
    } catch (emailError) {
      console.error(
        `[Startup] ⚠️  Email configuration error:`,
        emailError.message
      );
      console.error(
        `[Startup] 💡 OTP emails will not work until this is fixed!`
      );
    }
  });
} catch (err) {
  console.error("Failed to start server:", err.message);
}

// Global error handler to ensure errors are logged and JSON is returned
/* eslint-disable-next-line no-unused-vars */
app.use((err, req, res, _next) => {
  try {
    const stack = err && err.stack ? err.stack : String(err);
    // derive a short error id to correlate logs <-> client
    const errorId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // attempt to extract file/line from stack (first relevant frame)
    const firstFrame = stack.split("\n")[1] || "";
    let location = firstFrame.trim();
    const m = firstFrame.match(/\(([^)]+)\)/);
    if (m && m[1]) location = m[1];

    console.error(
      `[error:${errorId}] ${err && err.message ? err.message : String(err)}`
    );
    console.error(`[error:${errorId}] location: ${location}`);
    console.error(`[error:${errorId}] stack:\n${stack}`);

    const payload = {
      error: err && err.message ? err.message : String(err),
      errorId,
      file: location,
    };
    if (process.env.NODE_ENV !== "production") payload.stack = stack;

    res.status(500).json(payload);
  } catch (e) {
    try {
      res.status(500).send(String(err || e));
    } catch {
      // nothing
    }
  }
});
