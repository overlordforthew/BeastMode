const bcrypt = require("bcryptjs");
const { pool } = require("../db");

const RESET_CODE_TTL = 15 * 60 * 1000;

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

async function storePasswordResetCode(email, db = pool) {
  const emailKey = normalizeEmail(email);
  if (!emailKey) {
    throw new Error("Email is required");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);

  await db.query(`
    INSERT INTO password_reset_codes (email, code_hash, expires_at, attempts, updated_at)
    VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'), 0, NOW())
    ON CONFLICT (email) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      attempts = 0,
      updated_at = NOW()
  `, [emailKey, codeHash, RESET_CODE_TTL]);

  return {
    emailKey,
    code,
    expiresAt: new Date(Date.now() + RESET_CODE_TTL).toISOString(),
    ttlMs: RESET_CODE_TTL,
  };
}

module.exports = {
  RESET_CODE_TTL,
  normalizeEmail,
  storePasswordResetCode,
};
