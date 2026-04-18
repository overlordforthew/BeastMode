const webpush = require("web-push");
const { pool } = require("../db");
const { MIN_DAILY_SESSIONS, MIN_DAILY_SESSION_CREDITS, isQualifiedDay, syncUserProgressDay } = require("./progress");

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const zonedFormatterCache = new Map();

let schedulerTimeout = null;
let schedulerInterval = null;
let sweepRunning = false;

function isWebPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function normalizeIntervalMinutes(value) {
  const interval = Number(value);
  if (!Number.isFinite(interval)) return 45;
  const rounded = Math.round(interval);
  return [15, 30, 45, 60, 90, 120].includes(rounded) ? rounded : 45;
}

function normalizeTimezone(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "UTC";
  }

  const cleaned = value.trim();
  try {
    Intl.DateTimeFormat("en-US", { timeZone: cleaned }).format(new Date());
    return cleaned;
  } catch {
    return "UTC";
  }
}

function getZonedFormatter(timeZone) {
  const normalized = normalizeTimezone(timeZone);
  if (!zonedFormatterCache.has(normalized)) {
    zonedFormatterCache.set(normalized, new Intl.DateTimeFormat("en-US", {
      timeZone: normalized,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }));
  }
  return zonedFormatterCache.get(normalized);
}

function getZonedParts(now, timeZone) {
  const formatter = getZonedFormatter(timeZone);
  return formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

function getZonedDateKey(now, timeZone) {
  const parts = getZonedParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getZonedWeekdayIndex(now, timeZone) {
  const weekday = getZonedParts(now, timeZone).weekday?.toLowerCase?.();
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const normalizedWeekday = weekday ? weekday.slice(0, 3) : "sun";
  const index = dayKeys.indexOf(normalizedWeekday);
  return index >= 0 ? index : 0;
}

function getZonedTotalMinutes(now, timeZone) {
  const parts = getZonedParts(now, timeZone);
  return (Number(parts.hour || 0) * 60) + Number(parts.minute || 0);
}

function normalizeActiveDays(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isWithinActiveWindow(row, now) {
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const timezone = normalizeTimezone(row.timezone);
  const activeDays = normalizeActiveDays(row.active_days);
  if (activeDays.length > 0 && !activeDays.includes(dayKeys[getZonedWeekdayIndex(now, timezone)])) {
    return false;
  }

  const startHour = Number.isInteger(row.start_hour) ? row.start_hour : 0;
  const endHour = Number.isInteger(row.end_hour) ? row.end_hour : 23;
  if (startHour === endHour) {
    return true;
  }

  const currentMinutes = getZonedTotalMinutes(now, timezone);
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function getPushBucketKey(now, intervalMinutes, timeZone = "UTC") {
  const totalMinutes = getZonedTotalMinutes(now, timeZone);
  return `${getZonedDateKey(now, timeZone)}:${Math.floor(totalMinutes / intervalMinutes)}`;
}

function shouldSendScheduledPush(row, now = new Date()) {
  if (!row.push_enabled || Number(row.subscription_count || 0) <= 0) {
    return false;
  }

  const timezone = normalizeTimezone(row.timezone);
  const intervalMinutes = normalizeIntervalMinutes(row.interval_minutes);
  const totalMinutes = getZonedTotalMinutes(now, timezone);
  if (totalMinutes % intervalMinutes !== 0) {
    return false;
  }

  if (!isWithinActiveWindow(row, now)) {
    return false;
  }

  if (row.push_last_sent_at) {
    const lastSentAt = new Date(row.push_last_sent_at);
    if (getPushBucketKey(lastSentAt, intervalMinutes, timezone) === getPushBucketKey(now, intervalMinutes, timezone)) {
      return false;
    }
  }

  if (row.last_session_at) {
    const lastSessionAt = new Date(row.last_session_at);
    const cooldownMs = Math.min(intervalMinutes * 60 * 1000, 15 * 60 * 1000);
    if ((now - lastSessionAt) < cooldownMs) {
      return false;
    }
  }

  return true;
}

function buildScheduledPushPayload(row, now = new Date()) {
  const baseTitle = (row.alarm_message || "").trim() || "BeastMode reset ready";
  const sessionsFinished = Number(row.sessions_finished || 0);
  const sessionCredits = Number((row.session_credits ?? row.sessions_finished) || 0);
  const meditationsFinished = Number(row.meditations_finished || 0);
  const qualifyingMeditations = Number((row.qualifying_meditations ?? row.meditations_finished) || 0);
  const todayPoints = Math.round(Number(row.today_points || 0));
  const qualified = isQualifiedDay({
    session_credits: sessionCredits,
    qualifying_meditations: qualifyingMeditations,
    sessions_finished: sessionsFinished,
    meditations_finished: meditationsFinished,
  });
  const remainingCredits = Math.max(0, MIN_DAILY_SESSION_CREDITS - sessionCredits);
  const timezone = normalizeTimezone(row.timezone);

  let body = "Two minutes. Keep the streak moving.";
  if (!qualified && sessionsFinished === 0 && meditationsFinished === 0) {
    body = "First reset of the day. Start small and lock in momentum.";
  } else if (!qualified && remainingCredits > 0 && qualifyingMeditations === 0) {
    body = remainingCredits <= 0.5
      ? "One quick 30-second finisher secures today's streak."
      : `${remainingCredits} more workout credit${remainingCredits === 1 ? "" : "s"} to secure today's streak.`;
  } else if (qualified) {
    body = todayPoints > 0
      ? `Streak secured. You already banked ${todayPoints} points today. Push for extra credit or switch to calm mode.`
      : "Streak secured. Keep the pace with an extra-credit reset.";
  }

  return {
    title: baseTitle,
    body,
    tag: `beastmode-scheduled-${getPushBucketKey(now, normalizeIntervalMinutes(row.interval_minutes), timezone)}`,
    url: "https://beastmode.namibarden.com/",
  };
}

function parseSubscription(input) {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return input;
}

function extractEndpoint(subscription) {
  return subscription && typeof subscription.endpoint === "string" ? subscription.endpoint : null;
}

async function getPushStatus(userId, db = pool) {
  const [settingsR, subsR] = await Promise.all([
    db.query(`
      SELECT push_enabled, push_last_sent_at
      FROM user_settings
      WHERE user_id = $1
      LIMIT 1
    `, [userId]),
    db.query(`
      SELECT COUNT(*)::int AS subscription_count, MAX(updated_at) AS last_subscription_at
      FROM push_subscriptions
      WHERE user_id = $1
    `, [userId]),
  ]);

  const settings = settingsR.rows[0] || {};
  const subs = subsR.rows[0] || {};
  const subscriptionCount = Number(subs.subscription_count || 0);

  return {
    webPushEnabled: isWebPushConfigured(),
    pushEnabled: Boolean(settings.push_enabled) && subscriptionCount > 0,
    subscribed: subscriptionCount > 0,
    subscriptionCount,
    lastPushSentAt: settings.push_last_sent_at || null,
    lastSubscriptionAt: subs.last_subscription_at || null,
  };
}

async function savePushSubscription(userId, subscription, db = pool) {
  const parsed = parseSubscription(subscription);
  const endpoint = extractEndpoint(parsed);
  if (!endpoint) {
    throw new Error("Valid push subscription endpoint required");
  }

  await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  await db.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, subscription, created_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
  `, [userId, endpoint, JSON.stringify(parsed)]);

  await db.query(`
    UPDATE user_settings
    SET push_enabled = TRUE, updated_at = NOW()
    WHERE user_id = $1
  `, [userId]);

  return getPushStatus(userId, db);
}

async function removePushSubscription(userId, endpoint = null, db = pool) {
  if (endpoint) {
    await db.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [userId, endpoint]);
  } else {
    await db.query("DELETE FROM push_subscriptions WHERE user_id = $1", [userId]);
  }

  const remainingR = await db.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1", [userId]);
  const remaining = Number(remainingR.rows[0]?.count || 0);
  await db.query(`
    UPDATE user_settings
    SET push_enabled = $2, updated_at = NOW()
    WHERE user_id = $1
  `, [userId, remaining > 0]);

  return getPushStatus(userId, db);
}

async function sendPushPayloadToUser(userId, payload, db = pool) {
  if (!isWebPushConfigured()) {
    return { sent: 0, removed: 0 };
  }

  const subsR = await db.query(`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = $1
  `, [userId]);

  let sent = 0;
  let removed = 0;

  for (const row of subsR.rows) {
    const subscription = parseSubscription(row.subscription);
    if (!extractEndpoint(subscription)) {
      await db.query("DELETE FROM push_subscriptions WHERE id = $1", [row.id]);
      removed += 1;
      continue;
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query("DELETE FROM push_subscriptions WHERE id = $1", [row.id]);
        removed += 1;
      } else {
        console.warn("Push send failed:", err.message);
      }
    }
  }

  const remainingR = await db.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1", [userId]);
  const remaining = Number(remainingR.rows[0]?.count || 0);

  await db.query(`
    UPDATE user_settings
    SET
      push_enabled = $2,
      push_last_sent_at = CASE WHEN $3 > 0 THEN NOW() ELSE push_last_sent_at END,
      updated_at = NOW()
    WHERE user_id = $1
  `, [userId, remaining > 0, sent]);

  return { sent, removed, remaining };
}

async function getScheduledPushUsers(now = new Date(), db = pool) {
  const subscriptionUsersR = await db.query(`
    SELECT DISTINCT ps.user_id, us.timezone
    FROM push_subscriptions ps
    JOIN user_settings us ON us.user_id = ps.user_id
  `);
  for (const row of subscriptionUsersR.rows) {
    await syncUserProgressDay(row.user_id, db, getZonedDateKey(now, row.timezone));
  }

  const result = await db.query(`
    SELECT
      u.id AS user_id,
      us.interval_minutes,
      us.start_hour,
      us.end_hour,
      us.active_days,
      us.timezone,
      us.alarm_message,
      us.push_enabled,
      us.push_last_sent_at,
      COUNT(ps.id)::int AS subscription_count,
      COALESCE(d.points, 0)::real AS today_points,
      COALESCE(d.sessions_finished, 0)::int AS sessions_finished,
      COALESCE(d.session_credits, COALESCE(d.sessions_finished, 0))::real AS session_credits,
      COALESCE(d.meditations_finished, 0)::int AS meditations_finished,
      COALESCE(d.qualifying_meditations, COALESCE(d.meditations_finished, 0))::int AS qualifying_meditations,
      recent.last_session_at
    FROM users u
    JOIN user_settings us ON us.user_id = u.id
    JOIN push_subscriptions ps ON ps.user_id = u.id
    LEFT JOIN daily_log d ON d.user_id = u.id
      AND d.log_date = TO_CHAR(($1::timestamptz AT TIME ZONE COALESCE(NULLIF(us.timezone, ''), 'UTC')), 'YYYY-MM-DD')
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_session_at
      FROM workout_history
      WHERE user_id = u.id
        AND was_completed = TRUE
        AND TO_CHAR((created_at AT TIME ZONE COALESCE(NULLIF(us.timezone, ''), 'UTC')), 'YYYY-MM-DD')
          = TO_CHAR(($1::timestamptz AT TIME ZONE COALESCE(NULLIF(us.timezone, ''), 'UTC')), 'YYYY-MM-DD')
    ) recent ON TRUE
    WHERE us.push_enabled = TRUE
    GROUP BY
      u.id,
      us.interval_minutes,
      us.start_hour,
      us.end_hour,
      us.active_days,
      us.timezone,
      us.alarm_message,
      us.push_enabled,
      us.push_last_sent_at,
      d.points,
      d.sessions_finished,
      d.session_credits,
      d.meditations_finished,
      d.qualifying_meditations,
      recent.last_session_at
  `, [now.toISOString()]);

  return result.rows;
}

async function runDuePushSweep(now = new Date(), db = pool) {
  if (!isWebPushConfigured() || sweepRunning) {
    return { sentUsers: 0, dueUsers: 0, skipped: true };
  }

  sweepRunning = true;
  try {
    const users = await getScheduledPushUsers(now, db);
    let dueUsers = 0;
    let sentUsers = 0;

    for (const row of users) {
      if (!shouldSendScheduledPush(row, now)) {
        continue;
      }

      dueUsers += 1;
      const payload = buildScheduledPushPayload(row, now);
      const result = await sendPushPayloadToUser(row.user_id, payload, db);
      if (result.sent > 0) {
        sentUsers += 1;
      }
    }

    return { sentUsers, dueUsers, skipped: false };
  } finally {
    sweepRunning = false;
  }
}

function startPushScheduler(db = pool) {
  if (!isWebPushConfigured() || schedulerInterval || schedulerTimeout) {
    return;
  }

  const msUntilNextMinute = ((60 - new Date().getSeconds()) * 1000) + 200;
  schedulerTimeout = setTimeout(async () => {
    schedulerTimeout = null;
    await runDuePushSweep(new Date(), db).catch((err) => {
      console.error("Scheduled push sweep failed:", err);
    });

    schedulerInterval = setInterval(() => {
      runDuePushSweep(new Date(), db).catch((err) => {
        console.error("Scheduled push sweep failed:", err);
      });
    }, SCHEDULER_INTERVAL_MS);
  }, msUntilNextMinute);
}

module.exports = {
  isWebPushConfigured,
  getPushStatus,
  savePushSubscription,
  removePushSubscription,
  sendPushPayloadToUser,
  shouldSendScheduledPush,
  buildScheduledPushPayload,
  getPushBucketKey,
  runDuePushSweep,
  startPushScheduler,
};
