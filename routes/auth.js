const express = require("express");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { pool, initUserData } = require("../db");
const { generateToken } = require("../middleware/auth");
const { isEmailConfigured, sendPasswordResetCode } = require("../mailer");

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
const RESET_CODE_TTL = 15 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function isProductionLike() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.COOLIFY_RESOURCE_UUID);
}

function allowDevResetCodes() {
  return process.env.ALLOW_DEV_RESET_CODES === "true";
}

function buildAuthResponse(user, token) {
  return {
    token,
    userId: user.id,
    username: user.username,
    user: {
      id: user.id,
      username: user.username,
      language: user.language || "en",
    },
  };
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim() : "";
}

function normalizeUsernameKey(username) {
  return normalizeUsername(username).toLowerCase();
}

function normalizeLanguage(language, fallback = "en") {
  const cleaned = typeof language === "string" ? language.trim().toLowerCase() : "";
  if (!cleaned) return fallback;
  if (cleaned === "es" || cleaned.startsWith("es-")) return "es";
  if (cleaned === "ja" || cleaned.startsWith("ja-")) return "ja";
  if (cleaned === "en" || cleaned.startsWith("en-")) return "en";
  return fallback;
}

function buildUsernameCandidate(rawValue, fallback = "beastmode") {
  const cleaned = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  return cleaned || fallback;
}

async function createUniqueUsername(baseCandidate) {
  const base = buildUsernameCandidate(baseCandidate);
  let candidate = base;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(username) = $1", [candidate]);
    if (existing.rows.length === 0) {
      return candidate;
    }

    const suffix = String(Math.floor(Math.random() * 9000 + 1000));
    candidate = buildUsernameCandidate(base.slice(0, Math.max(6, 20 - suffix.length)), "beast") + suffix;
  }

  return `${base.slice(0, 12)}${Date.now().toString().slice(-6)}`;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password, email, language } = req.body;
    const normalizedUsername = normalizeUsername(username);
    const usernameKey = normalizeUsernameKey(normalizedUsername);
    const normalizedLanguage = normalizeLanguage(language);
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email ? normalizeEmail(email) : null;
    const [existingUsername, existingEmail] = await Promise.all([
      pool.query("SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1", [usernameKey]),
      normalizedEmail
        ? pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [normalizedEmail])
        : Promise.resolve({ rows: [] }),
    ]);
    if (existingUsername.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, email, language) VALUES ($1, $2, $3, $4) RETURNING id, username, language",
      [normalizedUsername, hash, normalizedEmail, normalizedLanguage]
    );
    const user = result.rows[0];
    const userId = user.id;
    await initUserData(userId);

    const token = generateToken(userId);
    res.status(201).json(buildAuthResponse(user, token));
  } catch (err) {
    if (err.code === "23505") {
      const detail = err.detail || "";
      if (detail.includes("username")) return res.status(409).json({ error: "Username already taken" });
      if (detail.includes("email")) return res.status(409).json({ error: "Email already in use" });
      return res.status(409).json({ error: "Account already exists" });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, identifier, password, language } = req.body;
    const loginIdentifier = normalizeUsername(identifier || username);
    const loginKey = normalizeUsernameKey(identifier || username);
    const normalizedLanguage = normalizeLanguage(language);
    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: "Username or email and password are required" });
    }

    const result = await pool.query(
      `SELECT id, username, language, password_hash
       FROM users
       WHERE LOWER(username) = $1 OR LOWER(email) = $1
       LIMIT 1`,
      [loginKey]
    );
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

    if (normalizedLanguage && user.language !== normalizedLanguage) {
      await pool.query("UPDATE users SET language = $1, updated_at = NOW() WHERE id = $2", [normalizedLanguage, user.id]);
      user.language = normalizedLanguage;
    }

    const token = generateToken(user.id);
    res.json(buildAuthResponse(user, token));
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential, preferredLanguage } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Missing Google credential" });
    }
    if (!googleClient) {
      return res.status(500).json({ error: "Google sign-in is not configured" });
    }
    const normalizedLanguage = normalizeLanguage(preferredLanguage);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      return res.status(400).json({ error: "Invalid Google account" });
    }

    const googleId = payload.sub;
    const email = payload.email ? normalizeEmail(payload.email) : null;
    if (email && payload.email_verified === false) {
      return res.status(400).json({ error: "Google account email must be verified" });
    }
    const name = payload.name || (email ? email.split("@")[0] : `user${googleId.slice(-6)}`);

    // Check if user exists by google_id
    let result = await pool.query("SELECT id, username, language FROM users WHERE google_id = $1", [googleId]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (normalizedLanguage && user.language !== normalizedLanguage) {
        await pool.query("UPDATE users SET language = $1, updated_at = NOW() WHERE id = $2", [normalizedLanguage, user.id]);
        user.language = normalizedLanguage;
      }
      const token = generateToken(user.id);
      return res.json(buildAuthResponse(user, token));
    }

    // Check if user exists by email — link Google account
    if (email) {
      result = await pool.query("SELECT id, username, language FROM users WHERE LOWER(email) = $1", [email]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        await pool.query(
          "UPDATE users SET google_id = $1, language = $2, updated_at = NOW() WHERE id = $3",
          [googleId, normalizedLanguage || user.language || "en", user.id]
        );
        user.language = normalizedLanguage || user.language || "en";
        const token = generateToken(user.id);
        return res.json(buildAuthResponse(user, token));
      }
    }

    // New user — create account
    const username = await createUniqueUsername(name || `beast${googleId.slice(-6)}`);

    result = await pool.query(
      "INSERT INTO users (username, google_id, email, language) VALUES ($1, $2, $3, $4) RETURNING id, username, language",
      [username, googleId, email || null, normalizedLanguage || "en"]
    );
    const user = result.rows[0];
    const userId = user.id;
    await initUserData(userId);

    const token = generateToken(userId);
    res.status(201).json(buildAuthResponse(user, token));
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

    const emailKey = normalizeEmail(email);
    const emailEnabled = isEmailConfigured();
    const productionLike = isProductionLike();
    if (!emailEnabled && productionLike && !allowDevResetCodes()) {
      return res.status(503).json({ error: "Password reset email is not configured" });
    }

    const result = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [emailKey]);
    if (result.rows.length === 0) {
      return res.json({ message: "If an account with that email exists, a reset code has been sent." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    await pool.query(`
      INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, updated_at)
      VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'), 0, NOW())
      ON CONFLICT (email) DO UPDATE SET
        code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        attempts = 0,
        updated_at = NOW()
    `, [emailKey, codeHash, RESET_CODE_TTL]);

    if (emailEnabled) {
      await sendPasswordResetCode(emailKey, code);
      return res.json({ message: "If an account with that email exists, a reset code has been sent." });
    }

    if (!allowDevResetCodes()) {
      return res.status(503).json({ error: "Password reset email is not configured" });
    }

    console.log(`[PASSWORD RESET] Code for ${emailKey}: ${code}`);
    res.json({ message: "Reset code generated for development.", devCode: code });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const emailKey = normalizeEmail(email);
    const resetR = await pool.query("SELECT code_hash, expires_at, attempts FROM password_reset_codes WHERE email = $1", [emailKey]);
    if (resetR.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const reset = resetR.rows[0];
    if (reset.attempts >= MAX_RESET_ATTEMPTS) {
      await pool.query("DELETE FROM password_reset_codes WHERE email = $1", [emailKey]);
      return res.status(429).json({ error: "Too many attempts. Request a new code." });
    }

    if (new Date(reset.expires_at).getTime() <= Date.now()) {
      await pool.query("DELETE FROM password_reset_codes WHERE email = $1", [emailKey]);
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const valid = await bcrypt.compare(code, reset.code_hash);
    if (!valid) {
      await pool.query("UPDATE password_reset_codes SET attempts = attempts + 1, updated_at = NOW() WHERE email = $1", [emailKey]);
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query("UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2 RETURNING id", [hash, emailKey]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Account not found" });
    }

    await pool.query("DELETE FROM password_reset_codes WHERE email = $1", [emailKey]);
    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

module.exports = router;
