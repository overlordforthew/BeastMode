const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const DEFAULT_EXERCISES = JSON.stringify([
  "plank",
  "pushups",
  "situps",
  "squats",
  "lunges",
  "burpees",
  "chair_pose",
  "jumping_jacks",
  "high_knees",
  "mountain_climbers",
]);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (() => { throw new Error("DATABASE_URL env var is required"); })(),
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  // Migrations: add columns for Google OAuth + email recovery
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ALTER COLUMN duration TYPE TEXT USING duration::text`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ALTER COLUMN duration SET DEFAULT '2'`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ALTER COLUMN selected_exercises SET DEFAULT '${DEFAULT_EXERCISES}'::jsonb`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS start_hour INTEGER DEFAULT 8`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS end_hour INTEGER DEFAULT 17`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alarm_message TEXT DEFAULT 'Let''s Be Our Best!'`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS meditations_finished INTEGER DEFAULT 0`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS meditations_finished INTEGER DEFAULT 0`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`
    UPDATE user_settings
    SET
      duration = COALESCE(duration, '2'),
      selected_exercises = COALESCE(selected_exercises, '${DEFAULT_EXERCISES}'::jsonb),
      start_hour = COALESCE(start_hour, 8),
      end_hour = COALESCE(end_hour, 17),
      alarm_message = COALESCE(alarm_message, 'Let''s Be Our Best!')
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE user_progress SET meditations_finished = COALESCE(meditations_finished, 0)`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE daily_log SET meditations_finished = COALESCE(meditations_finished, 0)`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`DELETE FROM password_reset_codes WHERE expires_at < NOW()`).catch(e => console.warn("Migration:", e.message));
  console.log("Database schema initialized");
}

async function initUserData(userId) {
  await pool.query("INSERT INTO user_settings (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_progress (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_stats (user_id) VALUES ($1)", [userId]);
}

module.exports = { pool, initDb, initUserData };
