const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

const VALID_ACTIVE_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function normalizeDuration(value) {
  if (value === "random") return "random";
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 2;
}

function sanitizeHour(value) {
  if (value === undefined || value === null || value === "") return null;
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function sanitizeExerciseIds(value) {
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  return cleaned.length > 0 ? [...new Set(cleaned)] : [];
}

function sanitizeActiveDays(value) {
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => VALID_ACTIVE_DAYS.has(item));

  return cleaned.length > 0 ? [...new Set(cleaned)] : [];
}

function sanitizeUsernameReference(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}

function sanitizeTeamName(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}

// GET /api/user/profile
router.get("/profile", async (req, res) => {
  try {
    const [userR, settingsR, progressR, awardsR] = await Promise.all([
      pool.query("SELECT id, username, language, created_at FROM users WHERE id = $1", [req.userId]),
      pool.query("SELECT * FROM user_settings WHERE user_id = $1", [req.userId]),
      pool.query("SELECT * FROM user_progress WHERE user_id = $1", [req.userId]),
      pool.query("SELECT award_id FROM user_awards WHERE user_id = $1", [req.userId]),
    ]);

    if (userR.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userR.rows[0];
    const settings = settingsR.rows[0];
    const progress = progressR.rows[0];

    res.json({
      user: {
        id: user.id,
        username: user.username,
        language: user.language,
        createdAt: user.created_at,
      },
      settings: {
        duration: normalizeDuration(settings.duration),
        intervalMinutes: settings.interval_minutes,
        selectedExercises: settings.selected_exercises,
        activeDays: settings.active_days,
        startHour: settings.start_hour,
        endHour: settings.end_hour,
        alarmMessage: settings.alarm_message,
        buddyUsername: settings.buddy_username,
        teamName: settings.team_name,
      },
      progress: {
        totalPoints: progress.total_points,
        todayPoints: progress.today_points,
        streak: progress.streak,
        maxStreak: progress.max_streak,
        streakFreezes: progress.streak_freezes,
        sessionsCompleted: progress.sessions_completed,
        sessionsFinished: progress.sessions_finished,
        meditationsFinished: progress.meditations_finished,
        sessionsSkipped: progress.sessions_skipped,
        lastActiveDate: progress.last_active_date,
        dayCounter: progress.day_counter,
      },
      awards: awardsR.rows.map((row) => row.award_id),
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /api/user/settings
router.put("/settings", async (req, res) => {
  try {
    const {
      duration,
      intervalMinutes,
      selectedExercises,
      activeDays,
      startHour,
      endHour,
      alarmMessage,
      buddyUsername,
      teamName,
    } = req.body;

    const safeDuration = duration === undefined ? null : String(duration === "random" ? "random" : normalizeDuration(duration));
    const safeInterval = intervalMinutes === undefined ? null : Number(intervalMinutes);
    const safeSelectedExercises = sanitizeExerciseIds(selectedExercises);
    const safeActiveDays = sanitizeActiveDays(activeDays);
    const safeStartHour = sanitizeHour(startHour);
    const safeEndHour = sanitizeHour(endHour);
    const safeAlarmMessage = typeof alarmMessage === "string" && alarmMessage.trim()
      ? alarmMessage.trim().slice(0, 120)
      : alarmMessage === ""
        ? ""
        : null;
    const safeBuddyUsername = sanitizeUsernameReference(buddyUsername);
    const safeTeamName = sanitizeTeamName(teamName);

    if (safeInterval !== null && (!Number.isInteger(safeInterval) || safeInterval <= 0 || safeInterval > 720)) {
      return res.status(400).json({ error: "Interval must be a whole number between 1 and 720 minutes" });
    }

    await pool.query(`
      UPDATE user_settings SET
        duration = COALESCE($1, duration),
        interval_minutes = COALESCE($2, interval_minutes),
        selected_exercises = COALESCE($3, selected_exercises),
        active_days = COALESCE($4, active_days),
        start_hour = COALESCE($5, start_hour),
        end_hour = COALESCE($6, end_hour),
        alarm_message = COALESCE($7, alarm_message),
        buddy_username = $8,
        team_name = $9,
        updated_at = NOW()
      WHERE user_id = $10
    `, [
      safeDuration,
      safeInterval,
      safeSelectedExercises ? JSON.stringify(safeSelectedExercises) : null,
      safeActiveDays ? JSON.stringify(safeActiveDays) : null,
      safeStartHour,
      safeEndHour,
      safeAlarmMessage,
      safeBuddyUsername ?? null,
      safeTeamName ?? null,
      req.userId,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Settings update error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// PUT /api/user/language
router.put("/language", async (req, res) => {
  try {
    const { language } = req.body;
    if (!language || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return res.status(400).json({ error: "Valid language code required (e.g. en, pt-BR)" });
    }

    await pool.query("UPDATE users SET language = $1, updated_at = NOW() WHERE id = $2", [language, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Language update error:", err);
    res.status(500).json({ error: "Failed to update language" });
  }
});

module.exports = router;
