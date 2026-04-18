const assert = require("assert");
const crypto = require("crypto");
const { Pool } = require("pg");

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

function dateKeyDaysAgo(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().split("T")[0];
}

function uniqueSuffix() {
  return crypto.randomBytes(4).toString("hex");
}

async function api(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function registerUser(prefix) {
  const suffix = uniqueSuffix();
  const username = `${prefix}${suffix}`;
  const email = `${username}@example.com`;
  const password = "beastmode123";
  const auth = await api("/api/auth/register", {
    method: "POST",
    body: { username, email, password },
  });
  return { username, email, password, ...auth };
}

async function setProgress(userId, values) {
  const columns = Object.keys(values);
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
  await pool.query(
    `UPDATE user_progress SET ${assignments.join(", ")}, updated_at = NOW() WHERE user_id = $${columns.length + 1}`,
    [...columns.map((column) => values[column]), userId]
  );
}

async function setTeamName(userId, teamName) {
  await pool.query(
    "UPDATE user_settings SET team_name = $1, updated_at = NOW() WHERE user_id = $2",
    [teamName, userId]
  );
}

async function upsertDailyLog(userId, logDate, values) {
  await pool.query(`
    INSERT INTO daily_log (user_id, log_date, points, sessions_finished, meditations_finished, qualified)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, log_date) DO UPDATE SET
      points = EXCLUDED.points,
      sessions_finished = EXCLUDED.sessions_finished,
      meditations_finished = EXCLUDED.meditations_finished,
      qualified = EXCLUDED.qualified
  `, [
    userId,
    logDate,
    values.points || 0,
    values.sessions_finished || 0,
    values.meditations_finished || 0,
    values.qualified || false,
  ]);
}

async function clearTodayData(userId) {
  await pool.query("DELETE FROM daily_log WHERE user_id = $1 AND log_date = $2", [userId, dateKeyDaysAgo(0)]);
}

async function main() {
  const todayKey = dateKeyDaysAgo(0);
  const yesterdayKey = dateKeyDaysAgo(1);
  const twoDaysAgoKey = dateKeyDaysAgo(2);

  const alpha = await registerUser("alpha");
  const bravo = await registerUser("bravo");
  const charlie = await registerUser("charlie");

  await api("/api/user/settings", {
    method: "PUT",
    token: alpha.token,
    body: {
      duration: 2,
      intervalMinutes: 60,
      selectedExercises: ["pushups", "plank"],
      activeDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      startHour: 8,
      endHour: 17,
      alarmMessage: "Move now",
      buddyUsername: bravo.username,
      teamName: "Desk Ninjas",
    },
  });

  await setTeamName(bravo.userId, "Desk Ninjas");
  await setTeamName(charlie.userId, "Desk Ninjas");

  // Basic API sanity.
  const logResult = await api("/api/workout/log", {
    method: "POST",
    token: alpha.token,
    body: {
      exerciseId: "pushups",
      exerciseName: "Push-ups",
      exerciseEmoji: "💪",
      points: 12,
      durationMinutes: 2,
      wasCompleted: true,
      type: "alarm",
    },
  });
  assert(logResult.totalPoints > 0, "workout logging should award points");

  // Simulate a completed stale day and confirm automatic rollover.
  await clearTodayData(alpha.userId);
  await setProgress(alpha.userId, {
    today_points: 72,
    sessions_completed: 3,
    sessions_finished: 3,
    meditations_finished: 0,
    sessions_skipped: 0,
    streak: 4,
    max_streak: 4,
    streak_freezes: 0,
    day_counter: 10,
    last_active_date: yesterdayKey,
  });
  await upsertDailyLog(alpha.userId, yesterdayKey, {
    points: 72,
    sessions_finished: 3,
    meditations_finished: 0,
    qualified: true,
  });

  const rolledProfile = await api("/api/user/profile", { token: alpha.token });
  assert.strictEqual(rolledProfile.progress.todayPoints, 0, "rollover should clear today points");
  assert.strictEqual(rolledProfile.progress.sessionsFinished, 0, "rollover should clear session count");
  assert.strictEqual(rolledProfile.progress.streak, 5, "qualified stale day should advance the streak");
  assert.strictEqual(rolledProfile.progress.streakFreezes, 1, "5th streak day should earn a freeze");
  assert.strictEqual(rolledProfile.progress.dayCounter, 11, "rollover should advance the day counter");
  assert.strictEqual(rolledProfile.progress.lastActiveDate, todayKey, "rollover should align progress to today");

  const missionAfterRollover = await api("/api/stats/daily-mission", { token: alpha.token });
  assert.strictEqual(missionAfterRollover.mission.metrics.todayPoints, 0, "mission metrics should reset to today's actual log");

  // Logging after rollover should count only for the new day.
  const postRolloverLog = await api("/api/workout/log", {
    method: "POST",
    token: alpha.token,
    body: {
      exerciseId: "plank",
      exerciseName: "Plank",
      exerciseEmoji: "🧱",
      points: 10,
      durationMinutes: 2,
      wasCompleted: true,
      type: "alarm",
    },
  });
  assert(postRolloverLog.todayPoints > 0, "new-day workout should rebuild today points from zero");
  assert.strictEqual(postRolloverLog.sessionsFinished, 1, "new-day workout should start the session count at one");

  // Simulate multiple missed days and confirm the streak resets cleanly.
  await setProgress(bravo.userId, {
    today_points: 0,
    sessions_completed: 0,
    sessions_finished: 0,
    meditations_finished: 0,
    sessions_skipped: 0,
    streak: 3,
    max_streak: 4,
    streak_freezes: 0,
    day_counter: 20,
    last_active_date: twoDaysAgoKey,
  });
  await clearTodayData(bravo.userId);

  const missedProfile = await api("/api/user/profile", { token: bravo.token });
  assert.strictEqual(missedProfile.progress.streak, 1, "multiple missed days should reset the streak");
  assert.strictEqual(missedProfile.progress.dayCounter, 22, "each missed day should advance the day counter");
  assert.strictEqual(missedProfile.progress.todayPoints, 0, "missed-day sync should keep today's counters at zero");

  // Team pressure should use today's daily log, not stale today_points from user_progress.
  await setProgress(charlie.userId, {
    today_points: 999,
    sessions_completed: 3,
    sessions_finished: 3,
    meditations_finished: 0,
    sessions_skipped: 0,
    streak: 7,
    max_streak: 7,
    streak_freezes: 1,
    day_counter: 30,
    last_active_date: yesterdayKey,
  });
  await clearTodayData(charlie.userId);

  const pressure = await api("/api/stats/pressure", { token: alpha.token });
  assert(pressure.team, "team pressure should exist when a team is configured");
  assert(pressure.team.todayPoints < 200, "team pressure should ignore stale carried-over today_points");

  console.log("Smoke test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
