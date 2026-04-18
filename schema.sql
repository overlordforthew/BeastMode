-- Beast Mode Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  email TEXT UNIQUE,
  google_id TEXT UNIQUE,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  duration TEXT DEFAULT '2',
  interval_minutes INTEGER DEFAULT 45,
  selected_exercises JSONB DEFAULT '["plank","pushups","situps","squats","lunges","burpees","chair_pose","jumping_jacks","high_knees","mountain_climbers"]',
  active_days JSONB DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]',
  start_hour INTEGER DEFAULT 8,
  end_hour INTEGER DEFAULT 17,
  alarm_message TEXT DEFAULT 'Let''s Be Our Best!',
  buddy_username TEXT,
  team_name TEXT,
  timezone TEXT DEFAULT 'UTC',
  push_enabled BOOLEAN DEFAULT FALSE,
  push_last_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points REAL DEFAULT 0,
  today_points REAL DEFAULT 0,
  streak INTEGER DEFAULT 1,
  max_streak INTEGER DEFAULT 1,
  streak_freezes INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  sessions_finished INTEGER DEFAULT 0,
  session_credits REAL DEFAULT 0,
  meditations_finished INTEGER DEFAULT 0,
  qualifying_meditations INTEGER DEFAULT 0,
  sessions_skipped INTEGER DEFAULT 0,
  last_active_date TEXT,
  day_counter INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  extra_sessions INTEGER DEFAULT 0,
  unique_exercises JSONB DEFAULT '[]',
  max_duration_completed REAL DEFAULT 0,
  total_freezes_earned INTEGER DEFAULT 0,
  max_daily_sessions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_awards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  award_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, award_id)
);

CREATE TABLE IF NOT EXISTS workout_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  exercise_emoji TEXT NOT NULL,
  points REAL DEFAULT 0,
  duration_minutes REAL,
  was_completed BOOLEAN DEFAULT TRUE,
  type TEXT DEFAULT 'alarm',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  points REAL DEFAULT 0,
  sessions_finished INTEGER DEFAULT 0,
  session_credits REAL DEFAULT 0,
  meditations_finished INTEGER DEFAULT 0,
  qualifying_meditations INTEGER DEFAULT 0,
  qualified BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, log_date)
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_mission_claims (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  bonus_points REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, claim_date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT,
  subscription TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_action_log (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_email TEXT,
  actor_access TEXT NOT NULL DEFAULT 'user',
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_username TEXT,
  target_email TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_user ON workout_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_log(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_awards_user ON user_awards(user_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_user_progress_last_active_date ON user_progress(last_active_date);
CREATE INDEX IF NOT EXISTS idx_user_settings_team_name_lower ON user_settings(LOWER(team_name)) WHERE team_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscriptions(endpoint) WHERE endpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_action_created_at ON admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_target_user_created_at ON admin_action_log(target_user_id, created_at DESC);
