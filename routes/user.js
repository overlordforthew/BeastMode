const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// GET /api/user/profile
router.get("/profile", async (req, res) => {
  try {
    const [userR, settingsR, progressR] = await Promise.all([
      pool.query("SELECT id, username, language, created_at FROM users WHERE id = $1", [req.userId]),
      pool.query("SELECT * FROM user_settings WHERE user_id = $1", [req.userId]),
      pool.query("SELECT * FROM user_progress WHERE user_id = $1", [req.userId]),
    ]);

    if (userR.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userR.rows[0];
    const settings = settingsR.rows[0];
    const progress = progressR.rows[0];

    res.json({
      id: user.id,
      username: user.username,
      language: user.language,
      createdAt: user.created_at,
      settings: {
        duration: settings.duration,
        intervalMinutes: settings.interval_minutes,
        selectedExercises: settings.selected_exercises,
        activeDays: settings.active_days,
      },
      progress: {
        totalPoints: progress.total_points,
        todayPoints: progress.today_points,
        streak: progress.streak,
        maxStreak: progress.max_streak,
        streakFreezes: progress.streak_freezes,
        sessionsCompleted: progress.sessions_completed,
        sessionsFinished: progress.sessions_finished,
        lastActiveDate: progress.last_active_date,
        dayCounter: progress.day_counter,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /api/user/settings
router.put("/settings", async (req, res) => {
  try {
    const { duration, intervalMinutes, selectedExercises, activeDays } = req.body;

    await pool.query(`
      UPDATE user_settings SET
        duration = COALESCE($1, duration),
        interval_minutes = COALESCE($2, interval_minutes),
        selected_exercises = COALESCE($3, selected_exercises),
        active_days = COALESCE($4, active_days),
        updated_at = NOW()
      WHERE user_id = $5
    `, [duration, intervalMinutes, selectedExercises ? JSON.stringify(selectedExercises) : null, activeDays ? JSON.stringify(activeDays) : null, req.userId]);

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
