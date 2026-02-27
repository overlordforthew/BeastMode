const express = require("express");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { pool, initUserData } = require("../db");
const { generateToken } = require("../middleware/auth");

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// In-memory store for password reset codes (TTL: 15 minutes)
// TODO: Replace with email delivery (e.g. Nodemailer + SendGrid) for production
const resetCodes = new Map();
const RESET_CODE_TTL = 15 * 60 * 1000;

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    if (email) {
      const emailExists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (emailExists.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id",
      [username, hash, email || null]
    );
    const userId = result.rows[0].id;
    await initUserData(userId);

    const token = generateToken(userId);
    res.status(201).json({ token, userId, username });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const result = await pool.query("SELECT id, password_hash FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: "This account uses Google sign-in" });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user.id);
    res.json({ token, userId: user.id, username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Missing Google credential" });
    }
    if (!googleClient) {
      return res.status(500).json({ error: "Google sign-in is not configured" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.email.split("@")[0];

    // Check if user exists by google_id
    let result = await pool.query("SELECT id, username FROM users WHERE google_id = $1", [googleId]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = generateToken(user.id);
      return res.json({ token, userId: user.id, username: user.username });
    }

    // Check if user exists by email — link Google account
    if (email) {
      result = await pool.query("SELECT id, username FROM users WHERE email = $1", [email]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, user.id]);
        const token = generateToken(user.id);
        return res.json({ token, userId: user.id, username: user.username });
      }
    }

    // New user — create account
    let username = name.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user";
    // Ensure unique username
    const existingUser = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existingUser.rows.length > 0) {
      username = username + Math.floor(Math.random() * 9000 + 1000);
    }

    result = await pool.query(
      "INSERT INTO users (username, google_id, email) VALUES ($1, $2, $3) RETURNING id",
      [username, googleId, email || null]
    );
    const userId = result.rows[0].id;
    await initUserData(userId);

    const token = generateToken(userId);
    res.status(201).json({ token, userId, username });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const result = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      // Don't reveal whether email exists — always return success
      return res.json({ message: "If an account with that email exists, a reset code has been sent." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(email.toLowerCase(), { code, expires: Date.now() + RESET_CODE_TTL });

    // TODO: Send code via email
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PASSWORD RESET] Code for ${email}: ${code}`);
    }

    res.json({ message: "If an account with that email exists, a reset code has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }

    const entry = resetCodes.get(email.toLowerCase());
    if (!entry || entry.code !== code || Date.now() > entry.expires) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id", [hash, email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Account not found" });
    }

    resetCodes.delete(email.toLowerCase());
    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

module.exports = router;
