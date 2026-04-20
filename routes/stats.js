const express = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { MIN_DAILY_SESSIONS, isQualifiedDay, ensureUserProgressDaySynced } = require("../lib/progress");

const router = express.Router();
router.use(authMiddleware);
const STATS_RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.STATS_RATE_LIMIT_PER_MINUTE || 180));
const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: STATS_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
  message: { error: "Too many stats requests, slow down for a minute" },
});
router.use(statsLimiter);

const LEADERBOARD_CACHE_TTL_MS = Number(process.env.LEADERBOARD_CACHE_TTL_MS || 60 * 1000);
let leaderboardCache = { expiresAt: 0, rows: [] };

function invalidateLeaderboardCache(reason = "manual") {
  const previousSize = leaderboardCache.rows.length;
  leaderboardCache = { expiresAt: 0, rows: [] };
  return {
    flushedAt: new Date().toISOString(),
    reason,
    previousSize,
  };
}

function getLeaderboardCacheStatus() {
  return {
    ttlMs: LEADERBOARD_CACHE_TTL_MS,
    cachedRows: leaderboardCache.rows.length,
    expiresAt: leaderboardCache.expiresAt ? new Date(leaderboardCache.expiresAt).toISOString() : null,
    fresh: leaderboardCache.expiresAt > Date.now(),
  };
}

router.use(async (req, res, next) => {
  try {
    await ensureUserProgressDaySynced(req.userId, pool);
    next();
  } catch (err) {
    console.error("Progress sync error:", err);
    res.status(500).json({ error: "Failed to sync progress" });
  }
});

function formatMinutes(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const DAILY_MISSION_LIBRARY = [
  {
    id: "streak_builder",
    emoji: "🔥",
    title: "Streak Builder",
    description: "Move 5 workout minutes today.",
    bonusPoints: 20,
    accent: "fire",
    target: 5,
    getProgress: (metrics) => Math.min(metrics.workoutMinutesToday, 5),
    getProgressText: (metrics) => `${formatMinutes(Math.min(metrics.workoutMinutesToday, 5))}/5 workout min`,
    isComplete: (metrics) => metrics.workoutMinutesToday >= 5,
  },
  {
    id: "mind_body_stack",
    emoji: "🧠",
    title: "Mind + Body Stack",
    description: "Stack 4 workout minutes and 1 meditation today.",
    bonusPoints: 25,
    accent: "zen",
    target: 5,
    getProgress: (metrics) => Math.min(metrics.workoutMinutesToday, 4) + Math.min(metrics.qualifyingMeditations, 1),
    getProgressText: (metrics) => `${formatMinutes(Math.min(metrics.workoutMinutesToday, 4))}/4 workout min + ${Math.min(metrics.qualifyingMeditations, 1)}/1 meditation`,
    isComplete: (metrics) => metrics.workoutMinutesToday >= 4 && metrics.qualifyingMeditations >= 1,
  },
  {
    id: "point_sprint",
    emoji: "⚡",
    title: "Point Sprint",
    description: "Earn 60 Beast Points today.",
    bonusPoints: 20,
    accent: "gold",
    target: 60,
    getProgress: (metrics) => Math.min(Math.round(metrics.todayPoints), 60),
    getProgressText: (metrics) => `${Math.round(metrics.todayPoints)}/60 points banked`,
    isComplete: (metrics) => metrics.todayPoints >= 60,
  },
  {
    id: "variety_hunt",
    emoji: "🎯",
    title: "Variety Hunt",
    description: "Complete 2 different workout moves today.",
    bonusPoints: 20,
    accent: "ember",
    target: 2,
    getProgress: (metrics) => Math.min(metrics.uniqueExercisesToday, 2),
    getProgressText: (metrics) => `${Math.min(metrics.uniqueExercisesToday, 2)}/2 unique moves`,
    isComplete: (metrics) => metrics.uniqueExercisesToday >= 2,
  },
  {
    id: "afterburn",
    emoji: "🚀",
    title: "Afterburn",
    description: "Stack 4 workout minutes and 1 extra-credit reset today.",
    bonusPoints: 25,
    accent: "boost",
    target: 5,
    getProgress: (metrics) => Math.min(metrics.workoutMinutesToday, 4) + Math.min(metrics.extraSessionsToday, 1),
    getProgressText: (metrics) => `${formatMinutes(Math.min(metrics.workoutMinutesToday, 4))}/4 workout min + ${Math.min(metrics.extraSessionsToday, 1)}/1 extra credit`,
    isComplete: (metrics) => metrics.workoutMinutesToday >= 4 && metrics.extraSessionsToday >= 1,
  },
];

function getTodayDateKey() {
  return new Date().toISOString().split("T")[0];
}

function hashSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash * 31) + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function selectDailyMissionTemplate(userId, dateKey) {
  const seed = hashSeed(`${userId}:${dateKey}`);
  return DAILY_MISSION_LIBRARY[seed % DAILY_MISSION_LIBRARY.length];
}

async function getDailyMissionMetrics(userId, dateKey, db = pool) {
  const [dailyLogR, activityR, claimR] = await Promise.all([
    db.query(`
      SELECT points, sessions_finished, session_credits, meditations_finished, qualifying_meditations
      FROM daily_log
      WHERE user_id = $1 AND log_date = $2
      LIMIT 1
    `, [userId, dateKey]),
    db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN type <> 'meditation' AND was_completed = TRUE THEN exercise_id END)::int AS unique_exercises_today,
        COUNT(*) FILTER (WHERE type = 'extra' AND was_completed = TRUE)::int AS extra_sessions_today,
        COALESCE(SUM(duration_minutes) FILTER (WHERE type <> 'meditation' AND was_completed = TRUE), 0)::real AS workout_minutes_today
      FROM workout_history
      WHERE user_id = $1
        AND created_at::date = $2::date
    `, [userId, dateKey]),
    db.query(`
      SELECT mission_id, bonus_points, created_at
      FROM daily_mission_claims
      WHERE user_id = $1 AND claim_date = $2
      LIMIT 1
    `, [userId, dateKey]),
  ]);

  return {
    todayPoints: Number(dailyLogR.rows[0]?.points || 0),
    sessionsFinished: Number(dailyLogR.rows[0]?.sessions_finished || 0),
    sessionCredits: Number((dailyLogR.rows[0]?.session_credits ?? dailyLogR.rows[0]?.sessions_finished) || 0),
    meditationsFinished: Number(dailyLogR.rows[0]?.meditations_finished || 0),
    qualifyingMeditations: Number((dailyLogR.rows[0]?.qualifying_meditations ?? dailyLogR.rows[0]?.meditations_finished) || 0),
    uniqueExercisesToday: Number(activityR.rows[0]?.unique_exercises_today || 0),
    extraSessionsToday: Number(activityR.rows[0]?.extra_sessions_today || 0),
    workoutMinutesToday: Number(activityR.rows[0]?.workout_minutes_today || 0),
    claim: claimR.rows[0] || null,
  };
}

async function getDailyMissionStatus(userId, dateKey = getTodayDateKey(), db = pool) {
  const template = selectDailyMissionTemplate(userId, dateKey);
  const metrics = await getDailyMissionMetrics(userId, dateKey, db);
  const progressCurrent = template.getProgress(metrics);
  const claimed = Boolean(metrics.claim);

  return {
    id: template.id,
    emoji: template.emoji,
    title: template.title,
    description: template.description,
    accent: template.accent,
    bonusPoints: template.bonusPoints,
    progressCurrent,
    progressTarget: template.target,
    progressRatio: Math.max(0, Math.min(progressCurrent / template.target, 1)),
    progressText: template.getProgressText(metrics),
    complete: template.isComplete(metrics),
    qualificationMet: isQualifiedDay({
      session_credits: metrics.sessionCredits,
      qualifying_meditations: metrics.qualifyingMeditations,
      sessions_finished: metrics.sessionsFinished,
      meditations_finished: metrics.meditationsFinished,
    }),
    metrics: {
      todayPoints: metrics.todayPoints,
      sessionsFinished: metrics.sessionsFinished,
      sessionCredits: metrics.sessionCredits,
      meditationsFinished: metrics.meditationsFinished,
      qualifyingMeditations: metrics.qualifyingMeditations,
      uniqueExercisesToday: metrics.uniqueExercisesToday,
      extraSessionsToday: metrics.extraSessionsToday,
      workoutMinutesToday: metrics.workoutMinutesToday,
    },
    claimed,
    claimedAt: metrics.claim?.created_at || null,
    date: dateKey,
  };
}

async function getPressureSummary(userId, db = pool, dateKey = getTodayDateKey()) {
  const [currentR, rankR] = await Promise.all([
    db.query(`
      SELECT
        u.username,
        p.total_points,
        p.streak,
        COALESCE(d.points, 0)::real AS today_points,
        us.buddy_username,
        us.team_name
      FROM users u
      JOIN user_progress p ON p.user_id = u.id
      LEFT JOIN user_settings us ON us.user_id = u.id
      LEFT JOIN daily_log d ON d.user_id = u.id AND d.log_date = $2
      WHERE u.id = $1
      LIMIT 1
    `, [userId, dateKey]),
    db.query(`
      SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM user_progress
      ) ranked
      WHERE user_id = $1
    `, [userId]),
  ]);

  const current = currentR.rows[0];
  if (!current) {
    return null;
  }

  const [aboveR, belowR, buddyR, teamSummaryR, teamLeaderR] = await Promise.all([
    db.query(`
      SELECT u.username, p.total_points, p.streak, COALESCE(d.points, 0)::real AS today_points
      FROM user_progress p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN daily_log d ON d.user_id = u.id AND d.log_date = $3
      WHERE p.user_id <> $1
        AND p.total_points > $2
      ORDER BY p.total_points ASC
      LIMIT 1
    `, [userId, current.total_points, dateKey]),
    db.query(`
      SELECT u.username, p.total_points, p.streak, COALESCE(d.points, 0)::real AS today_points
      FROM user_progress p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN daily_log d ON d.user_id = u.id AND d.log_date = $3
      WHERE p.user_id <> $1
        AND p.total_points < $2
      ORDER BY p.total_points DESC
      LIMIT 1
    `, [userId, current.total_points, dateKey]),
    current.buddy_username
      ? db.query(`
          SELECT u.username, p.total_points, p.streak, COALESCE(d.points, 0)::real AS today_points
          FROM users u
          JOIN user_progress p ON p.user_id = u.id
          LEFT JOIN daily_log d ON d.user_id = u.id AND d.log_date = $3
          WHERE LOWER(u.username) = LOWER($1)
            AND u.id <> $2
          LIMIT 1
        `, [current.buddy_username, userId, dateKey])
      : Promise.resolve({ rows: [] }),
    current.team_name
      ? db.query(`
          SELECT
            COUNT(*)::int AS member_count,
            COALESCE(SUM(COALESCE(d.points, 0)), 0)::real AS today_points,
            COALESCE(SUM(p.total_points), 0)::real AS total_points,
            COUNT(*) FILTER (
              WHERE COALESCE(d.session_credits, COALESCE(d.sessions_finished, 0)) >= $2
                OR COALESCE(d.qualifying_meditations, COALESCE(d.meditations_finished, 0)) >= 1
            )::int AS secured_today
          FROM user_settings us
          JOIN user_progress p ON p.user_id = us.user_id
          LEFT JOIN daily_log d ON d.user_id = us.user_id AND d.log_date = $3
          WHERE us.team_name IS NOT NULL
            AND LOWER(us.team_name) = LOWER($1)
        `, [current.team_name, MIN_DAILY_SESSIONS, dateKey])
      : Promise.resolve({ rows: [] }),
    current.team_name
      ? db.query(`
          SELECT u.username, COALESCE(d.points, 0)::real AS today_points, p.total_points
          FROM user_settings us
          JOIN users u ON u.id = us.user_id
          JOIN user_progress p ON p.user_id = u.id
          LEFT JOIN daily_log d ON d.user_id = u.id AND d.log_date = $2
          WHERE us.team_name IS NOT NULL
            AND LOWER(us.team_name) = LOWER($1)
          ORDER BY COALESCE(d.points, 0) DESC, p.total_points DESC
          LIMIT 1
        `, [current.team_name, dateKey])
      : Promise.resolve({ rows: [] }),
  ]);

  const above = aboveR.rows[0];
  const below = belowR.rows[0];
  const buddy = buddyR.rows[0];
  const teamSummary = teamSummaryR.rows[0];
  const teamLeader = teamLeaderR.rows[0];

  return {
    userRank: rankR.rows[0]?.rank ? Number(rankR.rows[0].rank) : null,
    rivalAbove: above ? {
      username: above.username,
      totalPoints: Number(above.total_points || 0),
      todayPoints: Number(above.today_points || 0),
      streak: Number(above.streak || 0),
      gap: Math.max(1, Math.ceil(Number(above.total_points || 0) - Number(current.total_points || 0))),
    } : null,
    rivalBelow: below ? {
      username: below.username,
      totalPoints: Number(below.total_points || 0),
      todayPoints: Number(below.today_points || 0),
      streak: Number(below.streak || 0),
      gap: Math.max(1, Math.ceil(Number(current.total_points || 0) - Number(below.total_points || 0))),
    } : null,
    buddy: buddy ? {
      username: buddy.username,
      totalPoints: Number(buddy.total_points || 0),
      todayPoints: Number(buddy.today_points || 0),
      streak: Number(buddy.streak || 0),
      gap: Math.abs(Math.ceil(Number(buddy.total_points || 0) - Number(current.total_points || 0))),
      ahead: Number(buddy.total_points || 0) >= Number(current.total_points || 0),
    } : null,
    team: current.team_name && teamSummary ? {
      teamName: current.team_name,
      memberCount: Number(teamSummary.member_count || 0),
      todayPoints: Number(teamSummary.today_points || 0),
      totalPoints: Number(teamSummary.total_points || 0),
      securedToday: Number(teamSummary.secured_today || 0),
      leader: teamLeader ? {
        username: teamLeader.username,
        todayPoints: Number(teamLeader.today_points || 0),
        totalPoints: Number(teamLeader.total_points || 0),
      } : null,
    } : null,
  };
}

async function getCachedLeaderboardRows() {
  const now = Date.now();
  if (leaderboardCache.expiresAt > now) {
    return leaderboardCache.rows;
  }

  const boardR = await pool.query(`
    SELECT u.username, p.total_points, p.streak
    FROM user_progress p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.total_points DESC
    LIMIT 50
  `);

  leaderboardCache = {
    expiresAt: now + LEADERBOARD_CACHE_TTL_MS,
    rows: boardR.rows,
  };
  return leaderboardCache.rows;
}

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
      awards: awardsR.rows.map((award) => ({ id: award.award_id, unlockedAt: award.unlocked_at })),
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// GET /api/stats/daily-log
router.get("/daily-log", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 90);
    const result = await pool.query(`
      SELECT log_date, points, sessions_finished, session_credits, meditations_finished, qualifying_meditations, qualified
      FROM daily_log WHERE user_id = $1 ORDER BY log_date DESC LIMIT $2
    `, [req.userId, limit]);

    res.json(result.rows.map((row) => ({
      date: row.log_date,
      points: row.points,
      sessionsFinished: row.sessions_finished,
      sessionCredits: row.session_credits,
      meditationsFinished: row.meditations_finished,
      qualifyingMeditations: row.qualifying_meditations,
      qualified: row.qualified,
    })));
  } catch (err) {
    console.error("Daily log error:", err);
    res.status(500).json({ error: "Failed to load daily log" });
  }
});

// GET /api/stats/daily-mission
router.get("/daily-mission", async (req, res) => {
  try {
    const mission = await getDailyMissionStatus(req.userId);
    res.json({ mission });
  } catch (err) {
    console.error("Daily mission error:", err);
    res.status(500).json({ error: "Failed to load daily mission" });
  }
});

// POST /api/stats/daily-mission/claim
router.post("/daily-mission/claim", async (req, res) => {
  const client = await pool.connect();
  try {
    const today = getTodayDateKey();
    await client.query("BEGIN");

    const mission = await getDailyMissionStatus(req.userId, today, client);
    if (mission.claimed) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Daily mission already claimed" });
    }
    if (!mission.complete) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Complete the mission before claiming the reward" });
    }

    await client.query(`
      INSERT INTO daily_mission_claims (user_id, claim_date, mission_id, bonus_points)
      VALUES ($1, $2, $3, $4)
    `, [req.userId, today, mission.id, mission.bonusPoints]);

    await client.query(`
      UPDATE user_progress
      SET
        total_points = total_points + $1,
        today_points = today_points + $1,
        updated_at = NOW()
      WHERE user_id = $2
    `, [mission.bonusPoints, req.userId]);

    await client.query(`
      INSERT INTO daily_log (user_id, log_date, points, sessions_finished, meditations_finished, qualified)
      VALUES ($1, $2, $3, 0, 0, $4)
      ON CONFLICT (user_id, log_date) DO UPDATE SET
        points = daily_log.points + EXCLUDED.points,
        qualified = daily_log.qualified OR EXCLUDED.qualified
    `, [req.userId, today, mission.bonusPoints, mission.qualificationMet]);

    const updatedProgressR = await client.query(`
      SELECT total_points, today_points
      FROM user_progress
      WHERE user_id = $1
      LIMIT 1
    `, [req.userId]);

    await client.query("COMMIT");
    invalidateLeaderboardCache("daily_mission_claimed");

    res.json({
      mission: { ...mission, claimed: true, claimedAt: new Date().toISOString() },
      totalPoints: Number(updatedProgressR.rows[0]?.total_points || 0),
      todayPoints: Number(updatedProgressR.rows[0]?.today_points || 0),
      bonusAwarded: mission.bonusPoints,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ error: "Daily mission already claimed" });
    }
    console.error("Mission claim error:", err);
    res.status(500).json({ error: "Failed to claim mission reward" });
  } finally {
    client.release();
  }
});

// GET /api/stats/pressure
router.get("/pressure", async (req, res) => {
  try {
    const pressure = await getPressureSummary(req.userId);
    res.json(pressure || {});
  } catch (err) {
    console.error("Pressure error:", err);
    res.status(500).json({ error: "Failed to load pressure data" });
  }
});

// GET /api/stats/leaderboard
router.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await getCachedLeaderboardRows();

    const rankR = await pool.query(`
      SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM user_progress
      ) ranked
      WHERE user_id = $1
    `, [req.userId]);

    res.json({
      leaderboard,
      userRank: rankR.rows[0]?.rank ? Number(rankR.rows[0].rank) : null,
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

module.exports = router;
module.exports.invalidateLeaderboardCache = invalidateLeaderboardCache;
module.exports.getLeaderboardCacheStatus = getLeaderboardCacheStatus;
