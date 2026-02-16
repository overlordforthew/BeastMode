const express = require("express");
const bcrypt = require("bcryptjs");
const { pool, initUserData } = require("../db");
const { generateToken } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
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

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
      [username, hash]
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

module.exports = router;
