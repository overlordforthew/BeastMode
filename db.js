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
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS buddy_username TEXT`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS team_name TEXT`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS push_last_sent_at TIMESTAMPTZ`).catch(e => console.warn("Migration:", e.message));
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
    CREATE TABLE IF NOT EXISTS daily_mission_claims (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      claim_date TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      bonus_points REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, claim_date)
    )
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`
    UPDATE user_settings
    SET
      duration = COALESCE(duration, '2'),
      selected_exercises = COALESCE(selected_exercises, '${DEFAULT_EXERCISES}'::jsonb),
      start_hour = COALESCE(start_hour, 8),
      end_hour = COALESCE(end_hour, 17),
      alarm_message = COALESCE(alarm_message, 'Let''s Be Our Best!'),
      buddy_username = NULLIF(BTRIM(buddy_username), ''),
      team_name = NULLIF(BTRIM(team_name), ''),
      timezone = COALESCE(NULLIF(BTRIM(timezone), ''), 'UTC'),
      push_enabled = COALESCE(push_enabled, FALSE)
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE user_progress SET meditations_finished = COALESCE(meditations_finished, 0)`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE daily_log SET meditations_finished = COALESCE(meditations_finished, 0)`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`DELETE FROM password_reset_codes WHERE expires_at < NOW()`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE users SET username = BTRIM(username) WHERE username <> BTRIM(username)`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`UPDATE users SET email = LOWER(BTRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(BTRIM(email))`).catch(e => console.warn("Migration:", e.message));

  const duplicateUsernameResult = await pool.query(`
    SELECT LOWER(username) AS username_key, COUNT(*)::int AS matches
    FROM users
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
    LIMIT 10
  `).catch(e => {
    console.warn("Migration:", e.message);
    return { rows: [] };
  });
  if (duplicateUsernameResult.rows.length > 0) {
    console.warn("Migration: duplicate usernames prevent case-insensitive unique index", duplicateUsernameResult.rows);
  } else {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (LOWER(username))`).catch(e => console.warn("Migration:", e.message));
  }

  const duplicateEmailResult = await pool.query(`
    SELECT LOWER(email) AS email_key, COUNT(*)::int AS matches
    FROM users
    WHERE email IS NOT NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    LIMIT 10
  `).catch(e => {
    console.warn("Migration:", e.message);
    return { rows: [] };
  });
  if (duplicateEmailResult.rows.length > 0) {
    console.warn("Migration: duplicate emails prevent case-insensitive unique index", duplicateEmailResult.rows);
  } else {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email)) WHERE email IS NOT NULL`).catch(e => console.warn("Migration:", e.message));
  }
  await pool.query(`
    UPDATE push_subscriptions
    SET endpoint = subscription::jsonb ->> 'endpoint'
    WHERE endpoint IS NULL
      AND subscription LIKE '{%'
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`
    DELETE FROM push_subscriptions a
    USING push_subscriptions b
    WHERE a.id < b.id
      AND a.endpoint IS NOT NULL
      AND a.endpoint = b.endpoint
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`
    UPDATE user_settings us
    SET push_enabled = EXISTS (
      SELECT 1
      FROM push_subscriptions ps
      WHERE ps.user_id = us.user_id
    )
  `).catch(e => console.warn("Migration:", e.message));
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_settings_team_name_lower ON user_settings (LOWER(team_name)) WHERE team_name IS NOT NULL`).catch(e => console.warn("Migration:", e.message));
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL`).catch(e => console.warn("Migration:", e.message));
  console.log("Database schema initialized");
}

async function initUserData(userId) {
  await pool.query("INSERT INTO user_settings (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_progress (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_stats (user_id) VALUES ($1)", [userId]);
}

module.exports = { pool, initDb, initUserData };
