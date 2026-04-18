require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const webpush = require("web-push");
const rateLimit = require("express-rate-limit");
const { initDb, pool } = require("./db");
const { isEmailConfigured } = require("./mailer");
const { isWebPushConfigured, startPushScheduler } = require("./lib/push");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const workoutRoutes = require("./routes/workout");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://beastmode.namibarden.com",
  "capacitor://localhost",
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8100",
  "http://127.0.0.1:8100",
];
const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS);

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function isAllowedCorsOrigin(origin) {
  return allowedOrigins.has(origin) || isLoopbackOrigin(origin);
}

// Trust reverse proxy (Traefik) for correct client IP in rate limiting
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Middleware
app.use(cors((req, callback) => {
  const origin = req.header("Origin");
  callback(null, {
    origin: !origin || isAllowedCorsOrigin(origin),
    credentials: true,
  });
}));
app.use(express.json());

app.get("/api/config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleSignInEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    passwordResetEnabled: isEmailConfigured() || process.env.ALLOW_DEV_RESET_CODES === "true",
    webPushEnabled: isWebPushConfigured(),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
});

// Service Worker — must be served from root with correct headers
app.get("/sw.js", (req, res) => {
  res.set({
    "Content-Type": "application/javascript",
    "Service-Worker-Allowed": "/",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Web Push
if (isWebPushConfigured()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@beastmode.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("Web Push configured");
}

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, try again later" } });
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/workout", workoutRoutes);
app.use("/api/stats", statsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Unknown API routes — return 404 instead of hanging
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// JSON parse error handler
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start
async function start() {
  await initDb();
  startPushScheduler(pool);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Beast Mode server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api/health`);
  });
}
start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
