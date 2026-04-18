const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { syncUserProgressDay } = require("../lib/progress");
const {
  getPushStatus,
  isWebPushConfigured,
  removePushSubscription,
  savePushSubscription,
  sendPushPayloadToUser,
} = require("../lib/push");

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

function sanitizeTimezone(value) {
  if (value === undefined) return undefined;
  if (value === null) return "UTC";
  if (typeof value !== "string") return "UTC";

  const cleaned = value.trim();
  if (!cleaned) return "UTC";

  try {
    Intl.DateTimeFormat("en-US", { timeZone: cleaned }).format(new Date());
    return cleaned;
  } catch {
    return "UTC";
  }
}

// GET /api/user/profile
router.get("/profile", async (req, res) => {
  try {
    await syncUserProgressDay(req.userId, pool);
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
        timezone: settings.timezone || "UTC",
        pushEnabled: settings.push_enabled,
        pushLastSentAt: settings.push_last_sent_at,
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
      timezone,
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
    const safeTimezone = sanitizeTimezone(timezone);

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
        timezone = COALESCE($10, timezone),
        updated_at = NOW()
      WHERE user_id = $11
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
      safeTimezone,
      req.userId,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Settings update error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// GET /api/user/push-status
router.get("/push-status", async (req, res) => {
  try {
    const status = await getPushStatus(req.userId, pool);
    res.json(status);
  } catch (err) {
    console.error("Push status error:", err);
    res.status(500).json({ error: "Failed to load push status" });
  }
});

// POST /api/user/push-subscription
router.post("/push-subscription", async (req, res) => {
  try {
    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: "Web push is not configured" });
    }

    const { subscription } = req.body || {};
    const status = await savePushSubscription(req.userId, subscription, pool);
    res.json(status);
  } catch (err) {
    console.error("Push subscription error:", err);
    res.status(400).json({ error: err.message || "Failed to save push subscription" });
  }
});

// DELETE /api/user/push-subscription
router.delete("/push-subscription", async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    const status = await removePushSubscription(req.userId, endpoint || null, pool);
    res.json(status);
  } catch (err) {
    console.error("Push unsubscribe error:", err);
    res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

// POST /api/user/push-test
router.post("/push-test", async (req, res) => {
  try {
    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: "Web push is not configured" });
    }

    const result = await sendPushPayloadToUser(req.userId, {
      title: "BeastMode test nudge",
      body: "Push is live on this device. Your next reset can now reach you even when the app is closed.",
      tag: "beastmode-test",
      url: "https://beastmode.namibarden.com/",
    }, pool);

    if (result.sent === 0) {
      return res.status(409).json({ error: "No active push subscription found for this account" });
    }

    const status = await getPushStatus(req.userId, pool);
    res.json({ ...status, sent: result.sent });
  } catch (err) {
    console.error("Push test error:", err);
    res.status(500).json({ error: "Failed to send test push" });
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
