require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const webpush = require("web-push");
const { initDb } = require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const workoutRoutes = require("./routes/workout");
const statsRoutes = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(express.json());

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@beastmode.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("Web Push configured");
}

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/workout", workoutRoutes);
app.use("/api/stats", statsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// SPA fallback
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start
async function start() {
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Beast Mode server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api/health`);
  });
}
start().catch(console.error);
