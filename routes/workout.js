const express = require("express");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const {
  MIN_DAILY_SESSIONS,
  isQualifiedDay,
  applyQualifiedDay,
  applyMissedDay,
  syncUserProgressDay,
} = require("../lib/progress");
const {
  getWorkoutExercise,
  getMeditationType,
  isSupportedWorkoutDuration,
  isSupportedMeditationDuration,
  calcWorkoutPoints,
  calcWorkoutPartialPoints,
  calcMeditationPoints,
  calcMeditationPartialPoints,
  estimateAwardedPoints,
} = require("../public/scoring");

const router = express.Router();
router.use(authMiddleware);

async function syncProgressIfNeeded(req, res, next) {
  try {
    await syncUserProgressDay(req.userId, pool);
    next();
  } catch (err) {
    console.error("Progress sync error:", err);
    res.status(500).json({ error: "Failed to sync progress" });
  }
}

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

// POST /api/workout/log
router.post("/log", syncProgressIfNeeded, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      exerciseId,
      durationMinutes,
      wasCompleted,
      type,
      elapsedSeconds,
    } = req.body || {};

    if (!exerciseId) {
      return res.status(400).json({ error: "Invalid exercise data" });
    }

    const safeType = ["alarm", "extra", "meditation"].includes(type) ? type : "alarm";
    const completed = toBoolean(wasCompleted);

    await client.query("BEGIN");

    const progR = await client.query("SELECT * FROM user_progress WHERE user_id = $1 LIMIT 1 FOR UPDATE", [req.userId]);
    const progress = progR.rows[0];
    if (!progress) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User progress not found" });
    }

    const safeDuration = Number(durationMinutes);
    const nextMeditationSession = Number(progress.meditations_finished || 0) + 1;
    const activity = safeType === "meditation"
      ? getMeditationType(exerciseId)
      : getWorkoutExercise(exerciseId);

    const durationIsSupported = safeType === "meditation"
      ? isSupportedMeditationDuration(safeDuration)
      : isSupportedWorkoutDuration(safeDuration);

    if (!activity || !durationIsSupported) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Unsupported workout configuration" });
    }

    const rawPoints = safeType === "meditation"
      ? (
        completed
          ? calcMeditationPoints(safeDuration, nextMeditationSession)
          : calcMeditationPartialPoints(safeDuration, nextMeditationSession, elapsedSeconds)
      )
      : (
        completed
          ? calcWorkoutPoints(activity.id, safeDuration)
          : calcWorkoutPartialPoints(activity.id, safeDuration, elapsedSeconds)
      );
    const finalPts = estimateAwardedPoints(rawPoints, progress.streak);
    const today = new Date().toISOString().split("T")[0];

    // Insert workout with the actual awarded points so history stays truthful after reloads.
    await client.query(
      `INSERT INTO workout_history (user_id, exercise_id, exercise_name, exercise_emoji, points, duration_minutes, was_completed, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.userId, activity.id, activity.name, activity.emoji, finalPts, safeDuration, completed, safeType]
    );

    const countsAsWorkout = completed && safeType !== "meditation";
    const countsAsMeditation = completed && safeType === "meditation";
    const newSessionsFinished = countsAsWorkout ? progress.sessions_finished + 1 : progress.sessions_finished;
    const newMeditationsFinished = countsAsMeditation ? (progress.meditations_finished || 0) + 1 : (progress.meditations_finished || 0);
    const qualifiedToday = newSessionsFinished >= MIN_DAILY_SESSIONS || newMeditationsFinished >= 1;

    // Update progress
    await client.query(`
      UPDATE user_progress SET
        total_points = total_points + $1, today_points = today_points + $1,
        sessions_completed = sessions_completed + $5,
        sessions_finished = $2,
        meditations_finished = $3,
        last_active_date = $4, updated_at = NOW()
      WHERE user_id = $6
    `, [finalPts, newSessionsFinished, newMeditationsFinished, today, completed ? 1 : 0, req.userId]);

    // Update stats if completed
    if (completed) {
      const statsR = await client.query("SELECT unique_exercises FROM user_stats WHERE user_id = $1 LIMIT 1", [req.userId]);
      const statsRow = statsR.rows[0] || { unique_exercises: [] };
      const uniqueEx = new Set(statsRow.unique_exercises || []);
      if (safeType !== "meditation") {
        uniqueEx.add(activity.id);
      }

      await client.query(`
        UPDATE user_stats SET
          total_sessions = total_sessions + 1,
          extra_sessions = extra_sessions + $1,
          unique_exercises = $2,
          max_duration_completed = GREATEST(max_duration_completed, $3::real),
          max_daily_sessions = GREATEST(max_daily_sessions, $4),
          updated_at = NOW()
        WHERE user_id = $5
      `, [
        safeType === "extra" ? 1 : 0,
        JSON.stringify([...uniqueEx]),
        safeType === "meditation" ? 0 : safeDuration,
        safeType === "meditation" ? progress.sessions_finished : newSessionsFinished,
        req.userId,
      ]);
    }

    // Upsert daily log
    await client.query(`
      INSERT INTO daily_log (user_id, log_date, points, sessions_finished, meditations_finished, qualified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, log_date) DO UPDATE SET
        points = daily_log.points + $3,
        sessions_finished = daily_log.sessions_finished + $4,
        meditations_finished = daily_log.meditations_finished + $5,
        qualified = (daily_log.sessions_finished + $4) >= $7 OR (daily_log.meditations_finished + $5) >= 1
    `, [
      req.userId,
      today,
      finalPts,
      countsAsWorkout ? 1 : 0,
      countsAsMeditation ? 1 : 0,
      qualifiedToday,
      MIN_DAILY_SESSIONS,
    ]);

    const updated = await client.query("SELECT total_points, today_points, sessions_finished, meditations_finished FROM user_progress WHERE user_id = $1", [req.userId]);
    await client.query("COMMIT");

    let newAwards = [];
    try {
      newAwards = await checkAndUnlockAwards(req.userId);
    } catch (awardErr) {
      console.error("Award check error:", awardErr);
    }

    const u = updated.rows[0];

    res.json({
      finalPoints: finalPts,
      rawPoints,
      totalPoints: u.total_points,
      todayPoints: u.today_points,
      sessionsFinished: u.sessions_finished,
      meditationsFinished: u.meditations_finished,
      newAwards,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Workout log error:", err);
    res.status(500).json({ error: "Failed to log workout" });
  } finally {
    client.release();
  }
});

// POST /api/workout/end-day
router.post("/end-day", async (req, res) => {
  try {
    const progR = await pool.query("SELECT * FROM user_progress WHERE user_id = $1", [req.userId]);
    const progress = progR.rows[0];
    const qualified = isQualifiedDay(progress);
    const advanced = qualified ? applyQualifiedDay(progress) : applyMissedDay(progress);
    const newStreak = advanced.streak;
    const newFreezes = advanced.streak_freezes;
    const freezeUsed = advanced.freezeUsed;
    const freezeEarned = advanced.freezeEarned;
    const newMaxStreak = advanced.max_streak;
    const newDayCounter = Number(progress.day_counter || 0) + 1;

    await pool.query(`
      UPDATE user_progress SET
        streak = $1, max_streak = $2, streak_freezes = $3,
        today_points = 0, sessions_completed = 0, sessions_finished = 0, meditations_finished = 0, sessions_skipped = 0,
        day_counter = $4, updated_at = NOW()
      WHERE user_id = $5
    `, [newStreak, newMaxStreak, newFreezes, newDayCounter, req.userId]);

    if (freezeEarned) {
      await pool.query("UPDATE user_stats SET total_freezes_earned = total_freezes_earned + 1, updated_at = NOW() WHERE user_id = $1", [req.userId]);
    }

    const newAwards = await checkAndUnlockAwards(req.userId);

    await pool.query("UPDATE user_stats SET max_daily_sessions = 0, updated_at = NOW() WHERE user_id = $1", [req.userId]);
    const showWeekly = newDayCounter % 7 === 0;
    const weeklyData = showWeekly ? await getWeeklySummary(req.userId) : null;

    res.json({ streak: newStreak, maxStreak: newMaxStreak, streakFreezes: newFreezes, dayCounter: newDayCounter, qualified, freezeUsed, freezeEarned, newAwards, showWeekly, weeklyData });
  } catch (err) {
    console.error("End day error:", err);
    res.status(500).json({ error: "Failed to end day" });
  }
});

// POST /api/workout/missed-day
router.post("/missed-day", async (req, res) => {
  try {
    const progR = await pool.query("SELECT * FROM user_progress WHERE user_id = $1", [req.userId]);
    const progress = progR.rows[0];

    const advanced = applyMissedDay(progress);
    const newStreak = advanced.streak;
    const newFreezes = advanced.streak_freezes;
    const freezeUsed = advanced.freezeUsed;
    const newDayCounter = Number(progress.day_counter || 0) + 1;
    await pool.query(`
      UPDATE user_progress SET
        streak = $1, streak_freezes = $2, today_points = 0,
        sessions_completed = 0, sessions_finished = 0, meditations_finished = 0, sessions_skipped = 0,
        day_counter = $3, updated_at = NOW()
      WHERE user_id = $4
    `, [newStreak, newFreezes, newDayCounter, req.userId]);

    const showWeekly = newDayCounter % 7 === 0;
    const weeklyData = showWeekly ? await getWeeklySummary(req.userId) : null;

    res.json({ streak: newStreak, streakFreezes: newFreezes, dayCounter: newDayCounter, freezeUsed, showWeekly, weeklyData });
  } catch (err) {
    console.error("Missed day error:", err);
    res.status(500).json({ error: "Failed to process missed day" });
  }
});

// GET /api/workout/history
router.get("/history", syncProgressIfNeeded, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await pool.query(`
      SELECT exercise_id, exercise_name, exercise_emoji, points, duration_minutes, was_completed, type, created_at
      FROM workout_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
    `, [req.userId, limit]);

    res.json(result.rows.map((r) => ({
      exercise: { id: r.exercise_id, name: r.exercise_name, emoji: r.exercise_emoji },
      points: r.points, durationMinutes: r.duration_minutes,
      wasCompleted: r.was_completed, type: r.type, time: r.created_at,
    })));
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

// GET /api/workout/weekly
router.get("/weekly", syncProgressIfNeeded, async (req, res) => {
  try {
    const data = await getWeeklySummary(req.userId);
    res.json(data);
  } catch (err) {
    console.error("Weekly error:", err);
    res.status(500).json({ error: "Failed to load weekly summary" });
  }
});

// ─── Helpers ─────────────────────────────────────

async function getWeeklySummary(userId) {
  const daysR = await pool.query(`
    SELECT log_date, points, sessions_finished, meditations_finished, qualified
    FROM daily_log WHERE user_id = $1 ORDER BY log_date DESC LIMIT 7
  `, [userId]);

  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const dayData = daysR.rows.reverse().map((d, i) => ({
    label: labels[i % 7],
    points: d.points,
    sessions: d.sessions_finished + (d.meditations_finished || 0),
    active: d.sessions_finished > 0 || (d.meditations_finished || 0) > 0,
  }));
  while (dayData.length < 7) dayData.unshift({ label: labels[(7 - dayData.length) % 7], points: 0, sessions: 0, active: false });

  const totalSessions = dayData.reduce((s, d) => s + d.sessions, 0);
  const totalPts = Math.round(dayData.reduce((s, d) => s + d.points, 0) * 10) / 10;
  const activeDays = dayData.filter((d) => d.active).length;
  const completionRate = activeDays > 0 ? Math.round((totalSessions / (activeDays * MIN_DAILY_SESSIONS)) * 100) : 0;

  const topExR = await pool.query(`
    SELECT exercise_id, exercise_name, exercise_emoji, COUNT(*) as cnt, SUM(points) as total_pts
    FROM workout_history WHERE user_id = $1 AND was_completed = TRUE AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY exercise_id, exercise_name, exercise_emoji ORDER BY cnt DESC LIMIT 1
  `, [userId]);

  const awardsR = await pool.query("SELECT COUNT(*) as cnt FROM user_awards WHERE user_id = $1 AND unlocked_at >= NOW() - INTERVAL '7 days'", [userId]);

  const topEx = topExR.rows[0];
  return {
    sessions: totalSessions, points: totalPts, days: dayData,
    topExercise: topEx ? { id: topEx.exercise_id, name: topEx.exercise_name, emoji: topEx.exercise_emoji, count: parseInt(topEx.cnt), points: Math.round(topEx.total_pts * 10) / 10 } : null,
    completionRate: Math.min(completionRate, 100),
    awardsEarned: parseInt(awardsR.rows[0].cnt),
  };
}

const AWARD_CHECKS = [
  { id: "first_workout", check: (s) => s.totalSessions >= 1 },
  { id: "sessions_10", check: (s) => s.totalSessions >= 10 },
  { id: "sessions_50", check: (s) => s.totalSessions >= 50 },
  { id: "sessions_100", check: (s) => s.totalSessions >= 100 },
  { id: "sessions_500", check: (s) => s.totalSessions >= 500 },
  { id: "streak_3", check: (s) => s.maxStreak >= 3 },
  { id: "streak_7", check: (s) => s.maxStreak >= 7 },
  { id: "streak_14", check: (s) => s.maxStreak >= 14 },
  { id: "streak_30", check: (s) => s.maxStreak >= 30 },
  { id: "streak_100", check: (s) => s.maxStreak >= 100 },
  { id: "pts_100", check: (s) => s.totalPoints >= 100 },
  { id: "pts_1000", check: (s) => s.totalPoints >= 1000 },
  { id: "pts_5000", check: (s) => s.totalPoints >= 5000 },
  { id: "pts_10000", check: (s) => s.totalPoints >= 10000 },
  { id: "try_all", check: (s) => s.uniqueExercises >= 10 },
  { id: "dur_5", check: (s) => s.maxDurationCompleted >= 5 },
  { id: "dur_7", check: (s) => s.maxDurationCompleted >= 7 },
  { id: "freeze_earn", check: (s) => s.totalFreezesEarned >= 1 },
  { id: "extra_1", check: (s) => s.extraSessions >= 1 },
  { id: "extra_10", check: (s) => s.extraSessions >= 10 },
  { id: "perfect_day", check: (s) => s.maxDailySessions >= 5 },
  { id: "first_meditation", check: (s) => s.totalMeditations >= 1 },
  { id: "med_sessions_10", check: (s) => s.totalMeditations >= 10 },
  { id: "med_sessions_50", check: (s) => s.totalMeditations >= 50 },
  { id: "med_60", check: (s) => s.maxMeditationDuration >= 60 },
  { id: "med_3_in_day", check: (s) => s.maxMeditationsInDay >= 3 },
  { id: "try_all_med", check: (s) => s.uniqueMeditationTypes >= 6 },
];

async function checkAndUnlockAwards(userId) {
  const [existingR, progressR, statsR, meditationTotalsR, maxMeditationsDayR] = await Promise.all([
    pool.query("SELECT award_id FROM user_awards WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM user_progress WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM user_stats WHERE user_id = $1", [userId]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE type = 'meditation' AND was_completed = TRUE) AS total_meditations,
        COALESCE(MAX(CASE WHEN type = 'meditation' AND was_completed = TRUE THEN duration_minutes END), 0) AS max_meditation_duration,
        COUNT(DISTINCT CASE WHEN type = 'meditation' AND was_completed = TRUE THEN exercise_id END) AS unique_meditation_types
      FROM workout_history
      WHERE user_id = $1
    `, [userId]),
    pool.query(`
      SELECT COALESCE(MAX(day_count), 0) AS max_meditations_in_day
      FROM (
        SELECT COUNT(*) AS day_count
        FROM workout_history
        WHERE user_id = $1 AND type = 'meditation' AND was_completed = TRUE
        GROUP BY created_at::date
      ) meditation_days
    `, [userId]),
  ]);

  const existing = new Set(existingR.rows.map((r) => r.award_id));
  const progress = progressR.rows[0];
  const stats = statsR.rows[0];
  const meditationTotals = meditationTotalsR.rows[0];
  const maxMeditationsDay = maxMeditationsDayR.rows[0];

  const snapshot = {
    totalSessions: stats.total_sessions,
    extraSessions: stats.extra_sessions,
    maxStreak: progress.max_streak,
    uniqueExercises: (stats.unique_exercises || []).length,
    maxDurationCompleted: stats.max_duration_completed,
    totalFreezesEarned: stats.total_freezes_earned,
    maxDailySessions: stats.max_daily_sessions,
    totalPoints: progress.total_points,
    totalMeditations: Number(meditationTotals.total_meditations || 0),
    maxMeditationDuration: Number(meditationTotals.max_meditation_duration || 0),
    uniqueMeditationTypes: Number(meditationTotals.unique_meditation_types || 0),
    maxMeditationsInDay: Number(maxMeditationsDay.max_meditations_in_day || 0),
  };

  const newlyUnlocked = [];
  for (const award of AWARD_CHECKS) {
    if (!existing.has(award.id) && award.check(snapshot)) {
      await pool.query("INSERT INTO user_awards (user_id, award_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, award.id]);
      newlyUnlocked.push(award.id);
    }
  }
  return newlyUnlocked;
}

module.exports = router;
