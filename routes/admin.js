const express = require("express");
const { pool } = require("../db");
const { logAdminAction, mapAdminActionRow } = require("../lib/admin-audit");
const { storePasswordResetCode } = require("../lib/password-reset");
const { syncUserProgressDay } = require("../lib/progress");
const { getPushStatus, sendPushPayloadToUser } = require("../lib/push");
const { isEmailConfigured, sendPasswordResetCode } = require("../mailer");
const { adminMiddleware } = require("../middleware/admin");

const router = express.Router();

const USER_BASE_CTE = `
  WITH subscription_counts AS (
    SELECT user_id, COUNT(*)::int AS subscription_count
    FROM push_subscriptions
    GROUP BY user_id
  ),
  latest_workouts AS (
    SELECT user_id, MAX(created_at) AS last_workout_at
    FROM workout_history
    GROUP BY user_id
  ),
  latest_qualified_days AS (
    SELECT user_id, MAX(log_date::date) FILTER (WHERE qualified) AS last_qualified_date
    FROM daily_log
    GROUP BY user_id
  ),
  base AS (
    SELECT
      u.id,
      u.username,
      u.email,
      u.language,
      u.created_at,
      u.updated_at,
      (u.password_hash IS NOT NULL) AS has_password,
      (u.google_id IS NOT NULL) AS has_google,
      COALESCE(p.total_points, 0)::real AS total_points,
      COALESCE(p.today_points, 0)::real AS today_points,
      COALESCE(p.streak, 0)::int AS streak,
      COALESCE(p.max_streak, 0)::int AS max_streak,
      COALESCE(p.streak_freezes, 0)::int AS streak_freezes,
      COALESCE(p.sessions_finished, 0)::int AS sessions_finished,
      COALESCE(p.session_credits, 0)::real AS session_credits,
      COALESCE(p.meditations_finished, 0)::int AS meditations_finished,
      COALESCE(p.qualifying_meditations, 0)::int AS qualifying_meditations,
      COALESCE(p.sessions_skipped, 0)::int AS sessions_skipped,
      p.last_active_date,
      COALESCE(p.day_counter, 0)::int AS day_counter,
      COALESCE(s.total_sessions, 0)::int AS total_sessions,
      COALESCE(s.extra_sessions, 0)::int AS extra_sessions,
      COALESCE(s.max_duration_completed, 0)::real AS max_duration_completed,
      COALESCE(s.total_freezes_earned, 0)::int AS total_freezes_earned,
      COALESCE(s.max_daily_sessions, 0)::int AS max_daily_sessions,
      COALESCE(jsonb_array_length(COALESCE(s.unique_exercises, '[]'::jsonb)), 0)::int AS unique_exercises_count,
      us.interval_minutes,
      us.timezone,
      us.push_enabled,
      us.push_last_sent_at,
      us.team_name,
      us.buddy_username,
      us.start_hour,
      us.end_hour,
      us.alarm_message,
      COALESCE(sc.subscription_count, 0)::int AS subscription_count,
      lw.last_workout_at,
      lq.last_qualified_date
    FROM users u
    LEFT JOIN user_progress p ON p.user_id = u.id
    LEFT JOIN user_stats s ON s.user_id = u.id
    LEFT JOIN user_settings us ON us.user_id = u.id
    LEFT JOIN subscription_counts sc ON sc.user_id = u.id
    LEFT JOIN latest_workouts lw ON lw.user_id = u.id
    LEFT JOIN latest_qualified_days lq ON lq.user_id = u.id
  )
`;

function getTodayDateKey() {
  return new Date().toISOString().split("T")[0];
}

function dateKeyDaysAgo(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().split("T")[0];
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeQuery(value) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function dayDiffFromToday(dateKey) {
  if (!dateKey) return null;
  const today = new Date(`${getTodayDateKey()}T00:00:00.000Z`);
  const active = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(active.getTime())) return null;
  return Math.max(0, Math.round((today.getTime() - active.getTime()) / 86400000));
}

function getAuthMode(row) {
  if (row.has_password && row.has_google) return "hybrid";
  if (row.has_google) return "google";
  if (row.has_password) return "password";
  return "unknown";
}

function getActivityStatus(row) {
  if (!row || !row.last_active_date) {
    return row?.total_sessions > 0 ? "inactive" : "never_started";
  }

  const daysSinceActive = dayDiffFromToday(row.last_active_date);
  if (daysSinceActive === 0) return "active_today";
  if (daysSinceActive <= 6) return "active_7d";
  if ((row.total_sessions || 0) === 0) return "never_started";
  if (daysSinceActive <= 29) return "dormant_30d";
  return "dormant_30d_plus";
}

function buildSupportFlags(row) {
  const daysSinceActive = dayDiffFromToday(row.last_active_date);
  const flags = [];

  if ((row.total_sessions || 0) === 0) flags.push("never_started");
  if ((row.total_sessions || 0) === 0 && row.created_at && (Date.now() - new Date(row.created_at).getTime()) > 2 * 86400000) {
    flags.push("onboarding_risk");
  }
  if (!row.email) flags.push("no_email");
  if ((row.subscription_count || 0) === 0 && daysSinceActive !== null && daysSinceActive <= 6) {
    flags.push("push_opportunity");
  }
  if ((row.streak || 0) >= 5 && daysSinceActive !== null && daysSinceActive >= 1) {
    flags.push("streak_watch");
  }

  return flags;
}

function summarizeUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    language: row.language || "en",
    authMode: getAuthMode(row),
    createdAt: row.created_at,
    totalPoints: Number(row.total_points || 0),
    todayPoints: Number(row.today_points || 0),
    streak: Number(row.streak || 0),
    maxStreak: Number(row.max_streak || 0),
    streakFreezes: Number(row.streak_freezes || 0),
    totalSessions: Number(row.total_sessions || 0),
    extraSessions: Number(row.extra_sessions || 0),
    sessionCredits: Number(row.session_credits || 0),
    meditationsFinished: Number(row.meditations_finished || 0),
    qualifyingMeditations: Number(row.qualifying_meditations || 0),
    uniqueExercisesCount: Number(row.unique_exercises_count || 0),
    maxDurationCompleted: Number(row.max_duration_completed || 0),
    lastActiveDate: row.last_active_date,
    daysSinceActive: dayDiffFromToday(row.last_active_date),
    activityStatus: getActivityStatus(row),
    pushEnabled: Boolean(row.push_enabled),
    subscriptionCount: Number(row.subscription_count || 0),
    pushLastSentAt: row.push_last_sent_at,
    timezone: row.timezone || "UTC",
    intervalMinutes: row.interval_minutes,
    teamName: row.team_name,
    buddyUsername: row.buddy_username,
    startHour: row.start_hour,
    endHour: row.end_hour,
    alarmMessage: row.alarm_message,
    lastWorkoutAt: row.last_workout_at,
    lastQualifiedDate: row.last_qualified_date,
    supportFlags: buildSupportFlags(row),
  };
}

function isProductionLike() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.COOLIFY_RESOURCE_UUID);
}

function allowDevResetCodes() {
  return process.env.ALLOW_DEV_RESET_CODES === "true";
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildSupportSnapshot(detail) {
  const user = detail.user;
  const recentDay = detail.dailyLog?.[0];
  const recentWorkout = detail.recentWorkouts?.[0];
  return [
    `BeastMode support snapshot`,
    `user_id: ${user.id}`,
    `username: ${user.username}`,
    `email: ${user.email || "none"}`,
    `auth_mode: ${user.authMode}`,
    `language: ${user.language}`,
    `created_at: ${user.createdAt}`,
    `activity_status: ${user.activityStatus}`,
    `last_active_date: ${user.lastActiveDate || "never"}`,
    `days_since_active: ${user.daysSinceActive ?? "n/a"}`,
    `total_points: ${user.totalPoints}`,
    `today_points: ${user.todayPoints}`,
    `streak: ${user.streak}`,
    `max_streak: ${user.maxStreak}`,
    `push_enabled: ${user.pushEnabled}`,
    `subscription_count: ${user.subscriptionCount}`,
    `timezone: ${user.timezone || "UTC"}`,
    `interval_minutes: ${user.intervalMinutes || ""}`,
    `team_name: ${user.teamName || ""}`,
    `buddy_username: ${user.buddyUsername || ""}`,
    `support_flags: ${(user.supportFlags || []).join(", ") || "none"}`,
    `latest_daily_log: ${recentDay ? `${recentDay.date} | points=${recentDay.points} | session_credits=${recentDay.sessionCredits} | qualifying_meditations=${recentDay.qualifyingMeditations} | qualified=${recentDay.qualified}` : "none"}`,
    `latest_workout: ${recentWorkout ? `${recentWorkout.createdAt} | ${recentWorkout.type} | ${recentWorkout.exerciseName} | ${recentWorkout.durationMinutes}m | ${recentWorkout.points} pts | completed=${recentWorkout.wasCompleted}` : "none"}`,
  ].join("\n");
}

function summarizeActionDetails(action) {
  const details = action.details || {};
  if (action.actionType === "password_reset") {
    const delivery = details.delivery || action.status;
    return `Password reset via ${delivery}`;
  }
  if (action.actionType === "push_test") {
    return details.previewOnly ? `Push preview on ${details.subscriptionCount || 0} device(s)` : `Push test sent to ${details.sent || 0} device(s)`;
  }
  if (action.actionType === "users_export") {
    return `Exported ${details.exportedUsers || 0} user rows`;
  }
  if (action.actionType === "support_snapshot_copy") {
    return "Support snapshot copied";
  }
  return action.actionType.replace(/_/g, " ");
}

function buildUserWhereClause(filters, values) {
  const conditions = [];
  const todayKey = getTodayDateKey();
  const day7Key = dateKeyDaysAgo(6);
  const day30Key = dateKeyDaysAgo(29);

  if (filters.q) {
    values.push(`%${filters.q}%`);
    const qParam = `$${values.length}`;
    conditions.push(`(
      LOWER(base.username) LIKE ${qParam}
      OR LOWER(COALESCE(base.email, '')) LIKE ${qParam}
      OR LOWER(COALESCE(base.team_name, '')) LIKE ${qParam}
      OR LOWER(COALESCE(base.buddy_username, '')) LIKE ${qParam}
    )`);
  }

  switch (filters.status) {
    case "active_today":
      values.push(todayKey);
      conditions.push(`base.last_active_date = $${values.length}`);
      break;
    case "active_7d":
      values.push(day7Key);
      conditions.push(`base.last_active_date >= $${values.length}`);
      break;
    case "dormant_7d":
      values.push(day7Key);
      conditions.push(`(base.last_active_date IS NULL OR base.last_active_date < $${values.length})`);
      break;
    case "dormant_30d":
      values.push(day30Key);
      conditions.push(`(base.last_active_date IS NULL OR base.last_active_date < $${values.length})`);
      break;
    case "never_started":
      conditions.push(`base.total_sessions = 0`);
      break;
    case "onboarding_risk":
      conditions.push(`base.total_sessions = 0 AND base.created_at < NOW() - INTERVAL '2 days'`);
      break;
    case "push_opportunity":
      values.push(day7Key);
      conditions.push(`base.last_active_date >= $${values.length} AND base.subscription_count = 0`);
      break;
    case "streak_watch":
      values.push(todayKey);
      conditions.push(`base.streak >= 5 AND (base.last_active_date IS NULL OR base.last_active_date < $${values.length})`);
      break;
    default:
      break;
  }

  switch (filters.push) {
    case "enabled":
      conditions.push(`COALESCE(base.push_enabled, FALSE) = TRUE`);
      break;
    case "disabled":
      conditions.push(`COALESCE(base.push_enabled, FALSE) = FALSE`);
      break;
    case "linked":
      conditions.push(`base.subscription_count > 0`);
      break;
    case "unlinked":
      conditions.push(`base.subscription_count = 0`);
      break;
    default:
      break;
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

function getUsersOrderBy(sort) {
  switch (sort) {
    case "newest":
      return "ORDER BY base.created_at DESC, base.id DESC";
    case "oldest":
      return "ORDER BY base.created_at ASC, base.id ASC";
    case "points":
      return "ORDER BY base.total_points DESC, base.last_active_date DESC NULLS LAST, base.id DESC";
    case "streak":
      return "ORDER BY base.streak DESC, base.total_points DESC, base.id DESC";
    case "name":
      return "ORDER BY LOWER(base.username) ASC, base.id ASC";
    default:
      return "ORDER BY base.last_active_date DESC NULLS LAST, base.last_workout_at DESC NULLS LAST, base.created_at DESC, base.id DESC";
  }
}

async function queryMiniUserList(whereClause, values, orderBy, limit) {
  const result = await pool.query(
    `${USER_BASE_CTE}
     SELECT base.*
     FROM base
     ${whereClause}
     ${orderBy}
     LIMIT ${Number(limit)}`,
    values
  );
  return result.rows.map(summarizeUserRow);
}

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(adminMiddleware);

router.get("/me", async (req, res) => {
  res.json({
    ok: true,
    admin: req.admin,
    configuredWith: {
      userAllowlist: Boolean(process.env.ADMIN_USER_IDS || process.env.ADMIN_EMAILS || process.env.ADMIN_USERNAMES),
      apiKey: Boolean(process.env.ADMIN_API_KEY),
    },
  });
});

router.get("/activity", async (req, res) => {
  try {
    const limit = clampInteger(req.query.limit, 20, 1, 100);
    const targetUserId = req.query.targetUserId === undefined
      ? null
      : clampInteger(req.query.targetUserId, NaN, 1, Number.MAX_SAFE_INTEGER);

    if (req.query.targetUserId !== undefined && !Number.isFinite(targetUserId)) {
      return res.status(400).json({ error: "Invalid target user id" });
    }

    const values = [];
    let whereClause = "";
    if (Number.isFinite(targetUserId)) {
      values.push(targetUserId);
      whereClause = `WHERE target_user_id = $1`;
    }
    values.push(limit);

    const result = await pool.query(`
      SELECT
        id,
        actor_user_id,
        actor_username,
        actor_email,
        actor_access,
        action_type,
        status,
        target_user_id,
        target_username,
        target_email,
        details,
        created_at
      FROM admin_action_log
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);

    const actions = result.rows.map((row) => {
      const action = mapAdminActionRow(row);
      return { ...action, summary: summarizeActionDetails(action) };
    });

    res.json({
      actions,
      filters: {
        targetUserId: Number.isFinite(targetUserId) ? targetUserId : null,
        limit,
      },
    });
  } catch (error) {
    console.error("Admin activity error:", error);
    res.status(500).json({ error: "Failed to load admin activity" });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const todayKey = getTodayDateKey();
    const day7Key = dateKeyDaysAgo(6);
    const day30Key = dateKeyDaysAgo(29);

    const [metricsR, newestUsers, onboardingRiskUsers, pushOpportunityUsers, streakWatchUsers] = await Promise.all([
      pool.query(`
        WITH subscription_counts AS (
          SELECT user_id, COUNT(*)::int AS subscription_count
          FROM push_subscriptions
          GROUP BY user_id
        )
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '7 days')::int AS new_users_7d,
          COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '30 days')::int AS new_users_30d,
          COUNT(*) FILTER (WHERE p.last_active_date = $1)::int AS active_today,
          COUNT(*) FILTER (WHERE p.last_active_date >= $2)::int AS active_7d,
          COUNT(*) FILTER (WHERE p.last_active_date >= $3)::int AS active_30d,
          COUNT(*) FILTER (WHERE p.last_active_date IS NULL OR p.last_active_date < $2)::int AS dormant_7d,
          COUNT(*) FILTER (WHERE p.last_active_date IS NULL OR p.last_active_date < $3)::int AS dormant_30d,
          COUNT(*) FILTER (WHERE COALESCE(s.total_sessions, 0) = 0)::int AS never_started,
          COUNT(*) FILTER (WHERE COALESCE(us.push_enabled, FALSE) = TRUE)::int AS push_enabled_users,
          COUNT(*) FILTER (WHERE COALESCE(sc.subscription_count, 0) > 0)::int AS push_linked_users,
          COUNT(*) FILTER (WHERE u.email IS NULL)::int AS no_email_users,
          COUNT(*) FILTER (WHERE u.password_hash IS NULL AND u.google_id IS NOT NULL)::int AS google_only_users,
          COUNT(*) FILTER (WHERE u.password_hash IS NOT NULL AND u.google_id IS NULL)::int AS password_only_users,
          COUNT(*) FILTER (WHERE u.password_hash IS NOT NULL AND u.google_id IS NOT NULL)::int AS hybrid_auth_users,
          COUNT(DISTINCT LOWER(NULLIF(us.team_name, '')))::int AS team_count
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        LEFT JOIN user_stats s ON s.user_id = u.id
        LEFT JOIN user_settings us ON us.user_id = u.id
        LEFT JOIN subscription_counts sc ON sc.user_id = u.id
      `, [todayKey, day7Key, day30Key]),
      queryMiniUserList("", [], "ORDER BY base.created_at DESC, base.id DESC", 8),
      queryMiniUserList("WHERE base.total_sessions = 0 AND base.created_at < NOW() - INTERVAL '2 days'", [], "ORDER BY base.created_at ASC, base.id ASC", 8),
      queryMiniUserList(`WHERE base.last_active_date >= $1 AND base.subscription_count = 0`, [day7Key], "ORDER BY base.last_active_date DESC NULLS LAST, base.total_points DESC, base.id DESC", 8),
      queryMiniUserList(`WHERE base.streak >= 5 AND (base.last_active_date IS NULL OR base.last_active_date < $1)`, [todayKey], "ORDER BY base.streak DESC, base.total_points DESC, base.id DESC", 8),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      metrics: metricsR.rows[0],
      cohorts: {
        newestUsers,
        onboardingRiskUsers,
        pushOpportunityUsers,
        streakWatchUsers,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const q = normalizeQuery(req.query.q);
    const status = normalizeEnum(
      String(req.query.status || "").trim(),
      new Set(["", "active_today", "active_7d", "dormant_7d", "dormant_30d", "never_started", "onboarding_risk", "push_opportunity", "streak_watch"]),
      ""
    );
    const push = normalizeEnum(
      String(req.query.push || "").trim(),
      new Set(["", "enabled", "disabled", "linked", "unlinked"]),
      ""
    );
    const sort = normalizeEnum(
      String(req.query.sort || "").trim(),
      new Set(["", "recent_activity", "newest", "oldest", "points", "streak", "name"]),
      "recent_activity"
    );
    const limit = clampInteger(req.query.limit, 50, 1, 100);
    const offset = clampInteger(req.query.offset, 0, 0, 10000);

    const filters = { q, status, push };
    const values = [];
    const whereClause = buildUserWhereClause(filters, values);

    const countR = await pool.query(
      `${USER_BASE_CTE}
       SELECT COUNT(*)::int AS total
       FROM base
       ${whereClause}`,
      values
    );

    const dataValues = [...values, limit, offset];
    const usersR = await pool.query(
      `${USER_BASE_CTE}
       SELECT base.*
       FROM base
       ${whereClause}
       ${getUsersOrderBy(sort)}
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    );

    const total = Number(countR.rows[0]?.total || 0);
    const users = usersR.rows.map(summarizeUserRow);

    res.json({
      users,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + users.length < total,
      },
      filters: { q, status, push, sort },
    });
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Failed to load users" });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const userId = clampInteger(req.params.userId, NaN, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    await syncUserProgressDay(userId, pool);

    const [summaryR, recentWorkoutsR, dailyLogR, awardsR, missionClaimsR, recentAdminActionsR] = await Promise.all([
      pool.query(
        `${USER_BASE_CTE}
         SELECT base.*
         FROM base
         WHERE base.id = $1
         LIMIT 1`,
        [userId]
      ),
      pool.query(`
        SELECT
          created_at,
          type,
          exercise_id,
          exercise_name,
          exercise_emoji,
          points,
          duration_minutes,
          was_completed
        FROM workout_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 25
      `, [userId]),
      pool.query(`
        SELECT
          log_date,
          points,
          sessions_finished,
          session_credits,
          meditations_finished,
          qualifying_meditations,
          qualified
        FROM daily_log
        WHERE user_id = $1
        ORDER BY log_date DESC
        LIMIT 21
      `, [userId]),
      pool.query(`
        SELECT award_id, unlocked_at
        FROM user_awards
        WHERE user_id = $1
        ORDER BY unlocked_at DESC
      `, [userId]),
      pool.query(`
        SELECT claim_date, mission_id, bonus_points, created_at
        FROM daily_mission_claims
        WHERE user_id = $1
        ORDER BY claim_date DESC
        LIMIT 10
      `, [userId]),
      pool.query(`
        SELECT
          id,
          actor_user_id,
          actor_username,
          actor_email,
          actor_access,
          action_type,
          status,
          target_user_id,
          target_username,
          target_email,
          details,
          created_at
        FROM admin_action_log
        WHERE target_user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 15
      `, [userId]),
    ]);

    if (summaryR.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const summary = summarizeUserRow(summaryR.rows[0]);
    res.json({
      user: summary,
      recentWorkouts: recentWorkoutsR.rows.map((row) => ({
        createdAt: row.created_at,
        type: row.type,
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        exerciseEmoji: row.exercise_emoji,
        points: Number(row.points || 0),
        durationMinutes: Number(row.duration_minutes || 0),
        wasCompleted: Boolean(row.was_completed),
      })),
      dailyLog: dailyLogR.rows.map((row) => ({
        date: row.log_date,
        points: Number(row.points || 0),
        sessionsFinished: Number(row.sessions_finished || 0),
        sessionCredits: Number(row.session_credits || 0),
        meditationsFinished: Number(row.meditations_finished || 0),
        qualifyingMeditations: Number(row.qualifying_meditations || 0),
        qualified: Boolean(row.qualified),
      })),
      awards: awardsR.rows.map((row) => ({
        awardId: row.award_id,
        unlockedAt: row.unlocked_at,
      })),
      missionClaims: missionClaimsR.rows.map((row) => ({
        date: row.claim_date,
        missionId: row.mission_id,
        bonusPoints: Number(row.bonus_points || 0),
        createdAt: row.created_at,
      })),
      recentAdminActions: recentAdminActionsR.rows.map((row) => {
        const action = mapAdminActionRow(row);
        return { ...action, summary: summarizeActionDetails(action) };
      }),
      supportSnapshot: buildSupportSnapshot({
        user: summary,
        recentWorkouts: recentWorkoutsR.rows.map((row) => ({
          createdAt: row.created_at,
          type: row.type,
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          exerciseEmoji: row.exercise_emoji,
          points: Number(row.points || 0),
          durationMinutes: Number(row.duration_minutes || 0),
          wasCompleted: Boolean(row.was_completed),
        })),
        dailyLog: dailyLogR.rows.map((row) => ({
          date: row.log_date,
          points: Number(row.points || 0),
          sessionsFinished: Number(row.sessions_finished || 0),
          sessionCredits: Number(row.session_credits || 0),
          meditationsFinished: Number(row.meditations_finished || 0),
          qualifyingMeditations: Number(row.qualifying_meditations || 0),
          qualified: Boolean(row.qualified),
        })),
      }),
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    res.status(500).json({ error: "Failed to load user detail" });
  }
});

router.post("/users/:userId/password-reset", async (req, res) => {
  try {
    const userId = clampInteger(req.params.userId, NaN, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const userR = await pool.query(
      "SELECT id, username, email FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    if (userR.rows.length === 0) {
      await logAdminAction({
        actor: req.admin,
        actionType: "password_reset",
        status: "failed",
        targetUser: { id: userId },
        details: { reason: "user_not_found" },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.status(404).json({ error: "User not found" });
    }

    const user = userR.rows[0];
    if (!user.email) {
      await logAdminAction({
        actor: req.admin,
        actionType: "password_reset",
        status: "failed",
        targetUser: user,
        details: { reason: "missing_email" },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.status(409).json({ error: "This user does not have an email address on file" });
    }

    const { emailKey, code, expiresAt } = await storePasswordResetCode(user.email, pool);
    const emailEnabled = isEmailConfigured();

    if (emailEnabled) {
      await sendPasswordResetCode(emailKey, code);
      await logAdminAction({
        actor: req.admin,
        actionType: "password_reset",
        status: "email",
        targetUser: user,
        details: { delivery: "email", expiresAt },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.json({
        success: true,
        delivery: "email",
        email: emailKey,
        expiresAt,
      });
    }

    if (!allowDevResetCodes() || isProductionLike()) {
      await logAdminAction({
        actor: req.admin,
        actionType: "password_reset",
        status: "failed",
        targetUser: user,
        details: { reason: "email_not_configured" },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.status(503).json({ error: "Password reset email is not configured" });
    }

    await logAdminAction({
      actor: req.admin,
      actionType: "password_reset",
      status: "dev",
      targetUser: user,
      details: { delivery: "dev", expiresAt },
    }).catch((error) => console.warn("Admin audit error:", error.message));
    return res.json({
      success: true,
      delivery: "dev",
      email: emailKey,
      expiresAt,
      devCode: code,
    });
  } catch (error) {
    console.error("Admin password reset error:", error);
    res.status(500).json({ error: "Failed to issue password reset" });
  }
});

router.post("/users/:userId/push-test", async (req, res) => {
  try {
    const userId = clampInteger(req.params.userId, NaN, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const userR = await pool.query(
      "SELECT id, username, email FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    if (userR.rows.length === 0) {
      await logAdminAction({
        actor: req.admin,
        actionType: "push_test",
        status: "failed",
        targetUser: { id: userId },
        details: { reason: "user_not_found" },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.status(404).json({ error: "User not found" });
    }

    const user = userR.rows[0];
    const previewOnly = req.body?.previewOnly === true;
    const status = await getPushStatus(userId, pool);
    if ((status.subscriptionCount || 0) === 0) {
      await logAdminAction({
        actor: req.admin,
        actionType: "push_test",
        status: "failed",
        targetUser: user,
        details: { reason: "no_subscription" },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.status(409).json({ error: "No active push subscription found for this user" });
    }

    if (previewOnly) {
      await logAdminAction({
        actor: req.admin,
        actionType: "push_test",
        status: "preview",
        targetUser: user,
        details: { previewOnly: true, subscriptionCount: status.subscriptionCount },
      }).catch((error) => console.warn("Admin audit error:", error.message));
      return res.json({
        success: true,
        previewOnly: true,
        sent: status.subscriptionCount,
        status,
      });
    }

    const result = await sendPushPayloadToUser(userId, {
      title: "BeastMode support nudge",
      body: `Operator test for ${user.username}. If this landed, push delivery is healthy on this account.`,
      tag: `admin-push-test-${userId}`,
      url: "https://beastmode.namibarden.com/",
    }, pool);
    const refreshedStatus = await getPushStatus(userId, pool);
    await logAdminAction({
      actor: req.admin,
      actionType: "push_test",
      status: "sent",
      targetUser: user,
      details: { previewOnly: false, sent: result.sent, subscriptionCount: refreshedStatus.subscriptionCount },
    }).catch((error) => console.warn("Admin audit error:", error.message));
    res.json({
      success: true,
      sent: result.sent,
      status: refreshedStatus,
    });
  } catch (error) {
    console.error("Admin push test error:", error);
    res.status(500).json({ error: "Failed to send admin push test" });
  }
});

router.post("/users/:userId/support-snapshot-copied", async (req, res) => {
  try {
    const userId = clampInteger(req.params.userId, NaN, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const userR = await pool.query(
      "SELECT id, username, email FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    if (userR.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logAdminAction({
      actor: req.admin,
      actionType: "support_snapshot_copy",
      status: "success",
      targetUser: userR.rows[0],
      details: { source: "admin_ui" },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Admin snapshot audit error:", error);
    res.status(500).json({ error: "Failed to record support snapshot copy" });
  }
});

router.get("/users-export.csv", async (req, res) => {
  try {
    const q = normalizeQuery(req.query.q);
    const status = normalizeEnum(
      String(req.query.status || "").trim(),
      new Set(["", "active_today", "active_7d", "dormant_7d", "dormant_30d", "never_started", "onboarding_risk", "push_opportunity", "streak_watch"]),
      ""
    );
    const push = normalizeEnum(
      String(req.query.push || "").trim(),
      new Set(["", "enabled", "disabled", "linked", "unlinked"]),
      ""
    );
    const sort = normalizeEnum(
      String(req.query.sort || "").trim(),
      new Set(["", "recent_activity", "newest", "oldest", "points", "streak", "name"]),
      "recent_activity"
    );

    const filters = { q, status, push };
    const values = [];
    const whereClause = buildUserWhereClause(filters, values);
    const usersR = await pool.query(
      `${USER_BASE_CTE}
       SELECT base.*
       FROM base
       ${whereClause}
       ${getUsersOrderBy(sort)}
       LIMIT 5000`,
      values
    );

    const users = usersR.rows.map(summarizeUserRow);
    await logAdminAction({
      actor: req.admin,
      actionType: "users_export",
      status: "success",
      details: {
        exportedUsers: users.length,
        filters: { q, status, push, sort },
      },
    }).catch((error) => console.warn("Admin audit error:", error.message));
    const rows = [
      [
        "id",
        "username",
        "email",
        "language",
        "auth_mode",
        "created_at",
        "activity_status",
        "last_active_date",
        "days_since_active",
        "total_points",
        "today_points",
        "streak",
        "max_streak",
        "total_sessions",
        "session_credits",
        "meditations_finished",
        "push_enabled",
        "subscription_count",
        "timezone",
        "interval_minutes",
        "team_name",
        "buddy_username",
        "support_flags",
      ],
      ...users.map((user) => [
        user.id,
        user.username,
        user.email || "",
        user.language || "en",
        user.authMode,
        user.createdAt,
        user.activityStatus,
        user.lastActiveDate || "",
        user.daysSinceActive ?? "",
        user.totalPoints,
        user.todayPoints,
        user.streak,
        user.maxStreak,
        user.totalSessions,
        user.sessionCredits,
        user.meditationsFinished,
        user.pushEnabled,
        user.subscriptionCount,
        user.timezone || "UTC",
        user.intervalMinutes || "",
        user.teamName || "",
        user.buddyUsername || "",
        (user.supportFlags || []).join("|"),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="beastmode-users-${getTodayDateKey()}.csv"`,
    });
    res.send(csv);
  } catch (error) {
    console.error("Admin CSV export error:", error);
    res.status(500).json({ error: "Failed to export users" });
  }
});

module.exports = router;
