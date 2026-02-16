const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres",
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Database schema initialized");
}

async function initUserData(userId) {
  await pool.query("INSERT INTO user_settings (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_progress (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_stats (user_id) VALUES ($1)", [userId]);
}

module.exports = { pool, initDb, initUserData };
