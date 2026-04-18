const crypto = require("crypto");
const { pool } = require("../db");
const { extractBearerToken, verifyToken } = require("./auth");

function parseAllowlist(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasMatchingAdminKey(token) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !token) return false;

  const tokenBuffer = Buffer.from(token);
  const keyBuffer = Buffer.from(adminKey);
  if (tokenBuffer.length !== keyBuffer.length) return false;

  return crypto.timingSafeEqual(tokenBuffer, keyBuffer);
}

function isAdminUser(user) {
  const adminIds = parseAllowlist(process.env.ADMIN_USER_IDS);
  const adminEmails = parseAllowlist(process.env.ADMIN_EMAILS);
  const adminUsernames = parseAllowlist(process.env.ADMIN_USERNAMES);

  return (
    adminIds.has(String(user.id).toLowerCase()) ||
    adminEmails.has(String(user.email || "").trim().toLowerCase()) ||
    adminUsernames.has(String(user.username || "").trim().toLowerCase())
  );
}

function isAdminConfigured() {
  return Boolean(
    process.env.ADMIN_API_KEY ||
    process.env.ADMIN_USER_IDS ||
    process.env.ADMIN_EMAILS ||
    process.env.ADMIN_USERNAMES
  );
}

async function adminMiddleware(req, res, next) {
  if (!isAdminConfigured()) {
    return res.status(503).json({ error: "Admin access is not configured" });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing admin token" });
  }

  if (hasMatchingAdminKey(token)) {
    req.admin = {
      access: "api_key",
      id: null,
      username: "api-key",
      email: null,
    };
    return next();
  }

  try {
    const payload = verifyToken(token);
    if (!payload.userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const userR = await pool.query(
      "SELECT id, username, email FROM users WHERE id = $1 LIMIT 1",
      [payload.userId]
    );

    if (userR.rows.length === 0) {
      return res.status(401).json({ error: "Admin user not found" });
    }

    const user = userR.rows[0];
    if (!isAdminUser(user)) {
      return res.status(403).json({ error: "Admin access denied" });
    }

    req.userId = user.id;
    req.admin = {
      access: "user",
      id: user.id,
      username: user.username,
      email: user.email,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

module.exports = { adminMiddleware };
