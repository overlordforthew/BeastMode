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
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  duration REAL DEFAULT 2,
  interval_minutes INTEGER DEFAULT 30,
  selected_exercises JSONB DEFAULT '["plank","pushups","situps","military_situps","squats","jumping_squats","lunges","jumping_lunges","burpees","chair_pose"]',
  active_days JSONB DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  total_points REAL DEFAULT 0,
  today_points REAL DEFAULT 0,
  streak INTEGER DEFAULT 1,
  max_streak INTEGER DEFAULT 1,
  streak_freezes INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  sessions_finished INTEGER DEFAULT 0,
  sessions_skipped INTEGER DEFAULT 0,
  last_active_date TEXT,
  day_counter INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
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
  user_id INTEGER NOT NULL REFERENCES users(id),
  award_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, award_id)
);

CREATE TABLE IF NOT EXISTS workout_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
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
  user_id INTEGER NOT NULL REFERENCES users(id),
  log_date TEXT NOT NULL,
  points REAL DEFAULT 0,
  sessions_finished INTEGER DEFAULT 0,
  qualified BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, log_date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subscription TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_user ON workout_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_log(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_awards_user ON user_awards(user_id);
