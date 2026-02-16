const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// GET /api/stats
router.get("/", async (req, res) => {
  try {
    const [progressR, statsR, awardsR] = await Promise.all([
      pool.query("SELECT * FROM user_progress WHERE user_id = $1", [req.userId]),
      pool.query("SELECT * FROM user_stats WHERE user_id = $1", [req.userId]),
      pool.query("SELECT award_id, unlocked_at FROM user_awards WHERE user_id = $1 ORDER BY unlocked_at DESC", [req.userId]),
    ]);

    const progress = progressR.rows[0];
    const stats = statsR.rows[0];

    res.json({
      totalPoints: progress.total_points,
      streak: progress.streak,
      maxStreak: progress.max_streak,
      streakFreezes: progress.streak_freezes,
      dayCounter: progress.day_counter,
      totalSessions: stats.total_sessions,
      extraSessions: stats.extra_sessions,
      uniqueExercises: (stats.unique_exercises || []).length,
      maxDurationCompleted: stats.max_duration_completed,
      totalFreezesEarned: stats.total_freezes_earned,
      awards: awardsR.rows.map((a) => ({ id: a.award_id, unlockedAt: a.unlocked_at })),
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// GET /api/stats/daily-log
router.get("/daily-log", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 90);
    const result = await pool.query(`
      SELECT log_date, points, sessions_finished, qualified
      FROM daily_log WHERE user_id = $1 ORDER BY log_date DESC LIMIT $2
    `, [req.userId, limit]);

    res.json(result.rows.map((r) => ({
      date: r.log_date,
      points: r.points,
      sessionsFinished: r.sessions_finished,
      qualified: r.qualified,
    })));
  } catch (err) {
    console.error("Daily log error:", err);
    res.status(500).json({ error: "Failed to load daily log" });
  }
});

module.exports = router;
