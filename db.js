const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { logger } = require("./logger");

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
const VALID_INTERVAL_MINUTES = [15, 30, 45, 60, 90, 120];
const REQUIRED_DATABASE_URL = process.env.DATABASE_URL;

if (!REQUIRED_DATABASE_URL) {
  throw new Error("DATABASE_URL env var is required");
}

const pool = new Pool({
  connectionString: REQUIRED_DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
});

pool.on("connect", () => {
  logger.debug("Postgres client connected");
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected idle Postgres client error");
});

async function runMigration(client, description, sql, params = []) {
  try {
    await client.query(sql, params);
  } catch (error) {
    error.message = `${description}: ${error.message}`;
    throw error;
  }
}

async function initDb() {
  const client = await pool.connect();
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  try {
    await client.query("BEGIN");

    await runMigration(client, "base schema", schema);

    const migrationSteps = [
      ["users.email column", "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE"],
      ["users.google_id column", "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE"],
      ["users.password_hash nullable", "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"],
      ["user_settings.duration type", "ALTER TABLE user_settings ALTER COLUMN duration TYPE TEXT USING duration::text"],
      ["user_settings.duration default", "ALTER TABLE user_settings ALTER COLUMN duration SET DEFAULT '2'"],
      ["user_settings.interval_minutes default", "ALTER TABLE user_settings ALTER COLUMN interval_minutes SET DEFAULT 45"],
      ["user_settings.selected_exercises default", `ALTER TABLE user_settings ALTER COLUMN selected_exercises SET DEFAULT '${DEFAULT_EXERCISES}'::jsonb`],
      ["user_settings.start_hour column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS start_hour INTEGER DEFAULT 8"],
      ["user_settings.end_hour column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS end_hour INTEGER DEFAULT 17"],
      ["user_settings.alarm_message column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alarm_message TEXT DEFAULT 'Let''s Be Our Best!'"],
      ["user_settings.buddy_username column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS buddy_username TEXT"],
      ["user_settings.team_name column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS team_name TEXT"],
      ["user_settings.timezone column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'"],
      ["user_settings.push_enabled column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE"],
      ["user_settings.push_last_sent_at column", "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS push_last_sent_at TIMESTAMPTZ"],
      ["user_progress.meditations_finished column", "ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS meditations_finished INTEGER DEFAULT 0"],
      ["user_progress.session_credits column", "ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS session_credits REAL DEFAULT 0"],
      ["user_progress.qualifying_meditations column", "ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS qualifying_meditations INTEGER DEFAULT 0"],
      ["daily_log.meditations_finished column", "ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS meditations_finished INTEGER DEFAULT 0"],
      ["daily_log.session_credits column", "ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS session_credits REAL DEFAULT 0"],
      ["daily_log.qualifying_meditations column", "ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS qualifying_meditations INTEGER DEFAULT 0"],
      ["password_reset_codes table", `
        CREATE TABLE IF NOT EXISTS password_reset_codes (
          email TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          attempts INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `],
      ["daily_mission_claims table", `
        CREATE TABLE IF NOT EXISTS daily_mission_claims (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          claim_date TEXT NOT NULL,
          mission_id TEXT NOT NULL,
          bonus_points REAL NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, claim_date)
        )
      `],
      ["push_subscriptions.endpoint column", "ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT"],
      ["push_subscriptions.updated_at column", "ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"],
      ["admin_action_log table", `
        CREATE TABLE IF NOT EXISTS admin_action_log (
          id SERIAL PRIMARY KEY,
          actor_user_id INTEGER REFERENCES users(id),
          actor_username TEXT,
          actor_email TEXT,
          actor_access TEXT NOT NULL DEFAULT 'user',
          action_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'success',
          target_user_id INTEGER REFERENCES users(id),
          target_username TEXT,
          target_email TEXT,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `],
      ["normalize user_settings defaults", `
        UPDATE user_settings
        SET
          duration = COALESCE(duration, '2'),
          interval_minutes = CASE
            WHEN interval_minutes = ANY(ARRAY[${VALID_INTERVAL_MINUTES.join(",")}])
              THEN interval_minutes
            ELSE 45
          END,
          selected_exercises = COALESCE(selected_exercises, '${DEFAULT_EXERCISES}'::jsonb),
          start_hour = COALESCE(start_hour, 8),
          end_hour = COALESCE(end_hour, 17),
          alarm_message = COALESCE(alarm_message, 'Let''s Be Our Best!'),
          buddy_username = NULLIF(BTRIM(buddy_username), ''),
          team_name = NULLIF(BTRIM(team_name), ''),
          timezone = COALESCE(NULLIF(BTRIM(timezone), ''), 'UTC'),
          push_enabled = COALESCE(push_enabled, FALSE)
      `],
      ["normalize user_progress meditations", "UPDATE user_progress SET meditations_finished = COALESCE(meditations_finished, 0)"],
      ["normalize user_progress credits", `
        UPDATE user_progress
        SET
          session_credits = COALESCE(session_credits, sessions_finished, 0),
          qualifying_meditations = COALESCE(qualifying_meditations, meditations_finished, 0)
      `],
      ["normalize daily_log meditations", "UPDATE daily_log SET meditations_finished = COALESCE(meditations_finished, 0)"],
      ["normalize daily_log credits", `
        UPDATE daily_log
        SET
          session_credits = COALESCE(session_credits, sessions_finished, 0),
          qualifying_meditations = COALESCE(qualifying_meditations, meditations_finished, 0)
      `],
      ["clear expired password reset codes", "DELETE FROM password_reset_codes WHERE expires_at < NOW()"],
      ["trim usernames", "UPDATE users SET username = BTRIM(username) WHERE username <> BTRIM(username)"],
      ["normalize emails", "UPDATE users SET email = LOWER(BTRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(BTRIM(email))"],
      ["backfill push endpoints", `
        UPDATE push_subscriptions
        SET endpoint = subscription::jsonb ->> 'endpoint'
        WHERE endpoint IS NULL
          AND subscription LIKE '{%'
      `],
      ["deduplicate push endpoints", `
        DELETE FROM push_subscriptions a
        USING push_subscriptions b
        WHERE a.id < b.id
          AND a.endpoint IS NOT NULL
          AND a.endpoint = b.endpoint
      `],
      ["sync push_enabled flags", `
        UPDATE user_settings us
        SET push_enabled = EXISTS (
          SELECT 1
          FROM push_subscriptions ps
          WHERE ps.user_id = us.user_id
        )
      `],
      ["users created_at index", "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)"],
      ["user_progress last_active_date index", "CREATE INDEX IF NOT EXISTS idx_user_progress_last_active_date ON user_progress(last_active_date)"],
      ["user_settings team_name index", "CREATE INDEX IF NOT EXISTS idx_user_settings_team_name_lower ON user_settings (LOWER(team_name)) WHERE team_name IS NOT NULL"],
      ["push_subscriptions endpoint index", "CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL"],
      ["admin_action_log created_at index", "CREATE INDEX IF NOT EXISTS idx_admin_action_created_at ON admin_action_log(created_at DESC)"],
      ["admin_action_log target user index", "CREATE INDEX IF NOT EXISTS idx_admin_action_target_user_created_at ON admin_action_log(target_user_id, created_at DESC)"],
    ];

    for (const [description, sql] of migrationSteps) {
      await runMigration(client, description, sql);
    }

    const duplicateUsernameResult = await client.query(`
      SELECT LOWER(username) AS username_key, COUNT(*)::int AS matches
      FROM users
      GROUP BY LOWER(username)
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    if (duplicateUsernameResult.rows.length > 0) {
      logger.warn({ duplicates: duplicateUsernameResult.rows }, "Duplicate usernames prevent case-insensitive unique index");
    } else {
      await runMigration(client, "users_username_lower_unique index", "CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (LOWER(username))");
    }

    const duplicateEmailResult = await client.query(`
      SELECT LOWER(email) AS email_key, COUNT(*)::int AS matches
      FROM users
      WHERE email IS NOT NULL
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    if (duplicateEmailResult.rows.length > 0) {
      logger.warn({ duplicates: duplicateEmailResult.rows }, "Duplicate emails prevent case-insensitive unique index");
    } else {
      await runMigration(client, "users_email_lower_unique index", "CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email)) WHERE email IS NOT NULL");
    }

    await client.query("COMMIT");
    logger.info("Database schema initialized");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err: error }, "Database initialization failed");
    throw error;
  } finally {
    client.release();
  }
}

async function initUserData(userId) {
  await pool.query("INSERT INTO user_settings (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_progress (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO user_stats (user_id) VALUES ($1)", [userId]);
}

module.exports = { pool, initDb, initUserData };
