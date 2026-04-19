require("dotenv").config();

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const path = require("path");
const webpush = require("web-push");
const rateLimit = require("express-rate-limit");
const { initDb, pool } = require("./db");
const { httpLogger, logger } = require("./logger");
const { isEmailConfigured } = require("./mailer");
const { isWebPushConfigured, startPushScheduler, stopPushScheduler } = require("./lib/push");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/user");
const workoutRoutes = require("./routes/workout");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;
let server = null;
let shuttingDown = false;
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
app.use(httpLogger);
app.use(compression());
app.use(cors((req, callback) => {
  const origin = req.header("Origin");
  callback(null, {
    origin: !origin || isAllowedCorsOrigin(origin),
    credentials: true,
  });
}));
app.use(express.json({ limit: "250kb" }));

const APP_VERSION = require("./package.json").version;

function sendPublicConfig(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleSignInEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    passwordResetEnabled: isEmailConfigured() || process.env.ALLOW_DEV_RESET_CODES === "true",
    webPushEnabled: isWebPushConfigured(),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    latestAppVersion: APP_VERSION,
    downloadUrl: process.env.APK_DOWNLOAD_URL || null,
  });
}

app.get(["/api/config", "/api/v1/config"], sendPublicConfig);

// Service Worker — must be served from root with correct headers
app.get("/sw.js", (req, res) => {
  res.set({
    "Content-Type": "application/javascript",
    "Service-Worker-Allowed": "/",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

const PUBLIC_PAGE_ROUTES = {
  "/admin": "admin.html",
  "/privacy": "privacy.html",
  "/support": "support.html",
  "/delete-account": "delete-account.html",
};

for (const [routePath, fileName] of Object.entries(PUBLIC_PAGE_ROUTES)) {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(__dirname, "public", fileName));
  });
}

function sendAndroidApk(req, res) {
  const apkPath = path.join(__dirname, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
  res.download(apkPath, "beastmode-android.apk", (error) => {
    if (!error) return;
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Android APK is not available on this build yet" });
    }
    console.error("APK download error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to download APK" });
    }
  });
}

app.get("/beastmode.apk", sendAndroidApk);
app.get("/downloads/beastmode.apk", sendAndroidApk);

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Web Push
if (isWebPushConfigured()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@beastmode.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  logger.info("Web Push configured");
}

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, try again later" } });
app.use(["/api/auth", "/api/v1/auth"], authLimiter, authRoutes);
app.use(["/api/admin", "/api/v1/admin"], adminRoutes);
app.use(["/api/user", "/api/v1/user"], userRoutes);
app.use(["/api/workout", "/api/v1/workout"], workoutRoutes);
app.use(["/api/stats", "/api/v1/stats"], statsRoutes);

async function sendHealth(req, res) {
  try {
    await pool.query("SELECT 1");
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok", time: new Date().toISOString(), database: "ok" });
  } catch (error) {
    req.log?.error({ err: error }, "Health check failed");
    res.status(503).json({ status: "error", database: "down" });
  }
}

app.get(["/api/health", "/api/v1/health"], sendHealth);

// Unknown API routes — return 404 instead of hanging
app.all(["/api/*", "/api/v1/*"], (req, res) => {
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
  req.log?.error({ err }, "Unhandled request error");
  res.status(500).json({ error: "Internal server error" });
});

// Start
async function start() {
  await initDb();
  startPushScheduler(pool);
  server = app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "Beast Mode server running");
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  stopPushScheduler();

  const forceExitTimer = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown timed out");
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000));
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end();
    clearTimeout(forceExitTimer);
    logger.info({ signal }, "Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
