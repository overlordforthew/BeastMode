const assert = require("assert");
const crypto = require("crypto");
const { Pool } = require("pg");
const webpush = require("web-push");
const {
  calcWorkoutPoints,
  calcWorkoutPartialPoints,
  calcMeditationPoints,
  estimateAwardedPoints,
  getStreakMultiplier,
  getEvolution,
  getNextEvolution,
  getEvolutionProgress,
} = require("../public/scoring");
const {
  buildScheduledPushPayload,
  getPushBucketKey,
  getPushStatus,
  removePushSubscription,
  sendPushPayloadToUser,
  shouldSendScheduledPush,
} = require("../lib/push");

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
  const delta = await registerUser("delta");

  // Scoring and evolution math should stay sane at the edges.
  assert.strictEqual(getStreakMultiplier(1), 1, "day-one streak multiplier should be neutral");
  assert.strictEqual(getStreakMultiplier(30), 1.87, "streak multiplier should grow linearly");
  assert.strictEqual(getStreakMultiplier(100), 2, "streak multiplier should cap at 2.0x");
  assert.strictEqual(calcMeditationPoints(10, 1), 55, "first meditation should use the base meditation value");
  assert.strictEqual(calcMeditationPoints(10, 2), 44, "second meditation should get the softened session multiplier");
  assert.strictEqual(calcMeditationPoints(10, 3), 33, "later meditations should taper instead of compounding upward");
  assert.strictEqual(getEvolution(0).threshold, 0, "the first evolution tier should start at zero points");
  assert.strictEqual(getEvolutionProgress(0), 0, "zero points should produce zero evolution progress");
  assert(getNextEvolution(0)?.threshold > 0, "zero-point users should still have a next evolution tier");

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
      timezone: "America/New_York",
    },
  });

  await setTeamName(bravo.userId, "Desk Ninjas");
  await setTeamName(charlie.userId, "Desk Ninjas");

  // Basic API sanity.
  const expectedWorkoutPoints = estimateAwardedPoints(calcWorkoutPoints("pushups", 2), 1);
  const logResult = await api("/api/workout/log", {
    method: "POST",
    token: alpha.token,
    body: {
      exerciseId: "pushups",
      exerciseName: "Definitely Not Push-ups",
      exerciseEmoji: "🚫",
      points: 999,
      durationMinutes: 2,
      wasCompleted: true,
      type: "alarm",
    },
  });
  assert.strictEqual(logResult.finalPoints, expectedWorkoutPoints, "server should ignore spoofed workout points");
  assert.strictEqual(logResult.totalPoints, expectedWorkoutPoints, "canonical workout points should hit progress totals");

  const expectedPartialWorkoutPoints = estimateAwardedPoints(calcWorkoutPartialPoints("pushups", 2, 60), 1);
  const partialLogResult = await api("/api/workout/log", {
    method: "POST",
    token: alpha.token,
    body: {
      exerciseId: "pushups",
      exerciseName: "Push-ups",
      exerciseEmoji: "💪",
      points: 500,
      durationMinutes: 2,
      wasCompleted: false,
      type: "alarm",
      elapsedSeconds: 60,
    },
  });
  assert.strictEqual(partialLogResult.finalPoints, expectedPartialWorkoutPoints, "partial workouts should use elapsed time scoring");
  assert.strictEqual(partialLogResult.sessionsFinished, 1, "partial workouts should not count as finished sessions");

  const expectedMeditationPoints = estimateAwardedPoints(calcMeditationPoints(10, 1), 1);
  const meditationResult = await api("/api/workout/log", {
    method: "POST",
    token: charlie.token,
    body: {
      exerciseId: "breath",
      exerciseName: "Fake Meditation",
      exerciseEmoji: "❌",
      points: 999,
      durationMinutes: 10,
      wasCompleted: true,
      type: "meditation",
    },
  });
  assert.strictEqual(meditationResult.finalPoints, expectedMeditationPoints, "server should ignore spoofed meditation points");
  assert.strictEqual(meditationResult.sessionsFinished, 0, "meditation should not increment workout sessions");
  assert.strictEqual(meditationResult.meditationsFinished, 1, "completed meditation should increment meditation count");

  await setProgress(delta.userId, {
    streak: 50,
    max_streak: 50,
    last_active_date: todayKey,
  });
  const expectedCappedWorkoutPoints = estimateAwardedPoints(calcWorkoutPoints("burpees", 2), 50);
  const cappedWorkout = await api("/api/workout/log", {
    method: "POST",
    token: delta.token,
    body: {
      exerciseId: "burpees",
      exerciseName: "Burpees",
      exerciseEmoji: "⚡",
      points: 999,
      durationMinutes: 2,
      wasCompleted: true,
      type: "alarm",
    },
  });
  assert.strictEqual(cappedWorkout.finalPoints, expectedCappedWorkoutPoints, "high streaks should use the capped multiplier");
  assert.strictEqual(expectedCappedWorkoutPoints, 56, "the capped streak example should stay stable for regression checks");

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

  // Push registration and scheduler helpers should behave as expected.
  const fakeSubscription = {
    endpoint: `https://push.example.test/sub/${uniqueSuffix()}`,
    expirationTime: null,
    keys: {
      p256dh: "BD6x2W2eVv9rC3vS9d2U8cJ3R3ZnQnZLd2c0d2V4dG4",
      auth: "dGVzdGF1dGg",
    },
  };

  const pushStatusAfterSave = await api("/api/user/push-subscription", {
    method: "POST",
    token: alpha.token,
    body: { subscription: fakeSubscription },
  });
  assert.strictEqual(pushStatusAfterSave.subscribed, true, "push subscription route should mark the account as subscribed");
  assert.strictEqual(pushStatusAfterSave.pushEnabled, true, "push subscription route should enable pushes");

  const pushStatusFromApi = await api("/api/user/push-status", { token: alpha.token });
  assert.strictEqual(pushStatusFromApi.subscriptionCount, 1, "push status should report one linked device");

  const scheduledRow = {
    push_enabled: true,
    subscription_count: 1,
    interval_minutes: 60,
    active_days: ["sat"],
    start_hour: 8,
    end_hour: 17,
    timezone: "America/New_York",
    push_last_sent_at: null,
    last_session_at: null,
    alarm_message: "Move now",
    today_points: 18,
    sessions_finished: 1,
    meditations_finished: 0,
  };
  const dueAt = new Date("2026-04-18T13:00:00Z");
  assert.strictEqual(shouldSendScheduledPush(scheduledRow, dueAt), true, "scheduler should respect the user's local timezone");
  assert.strictEqual(
    shouldSendScheduledPush({ ...scheduledRow, push_last_sent_at: "2026-04-18T13:10:00Z" }, dueAt),
    false,
    "scheduler should suppress duplicate sends inside the same push bucket"
  );
  assert.strictEqual(
    shouldSendScheduledPush({ ...scheduledRow, active_days: ["sun"] }, dueAt),
    false,
    "scheduler should respect active day boundaries in the user's timezone"
  );
  assert.strictEqual(getPushBucketKey(dueAt, 60, "America/New_York"), "2026-04-18:9", "push bucket keys should be generated in local time");

  const scheduledPayload = buildScheduledPushPayload({ ...scheduledRow, sessions_finished: 0, meditations_finished: 0, today_points: 0 }, dueAt);
  assert.strictEqual(scheduledPayload.title, "Move now", "scheduled payload should use the user's alarm message");
  assert(scheduledPayload.body.includes("First reset"), "scheduled payload should reflect the user's current day state");

  const originalSendNotification = webpush.sendNotification;
  const sentNotifications = [];
  webpush.sendNotification = async (subscription, payload) => {
    sentNotifications.push({ subscription, payload: JSON.parse(payload) });
    return { statusCode: 201 };
  };

  try {
    const sendResult = await sendPushPayloadToUser(alpha.userId, {
      title: "Smoke push",
      body: "Push pipeline works",
      tag: "smoke-push",
      url: "https://beastmode.namibarden.com/",
    }, pool);
    assert.strictEqual(sendResult.sent, 1, "sendPushPayloadToUser should send to the saved subscription");
    assert.strictEqual(sentNotifications.length, 1, "sendPushPayloadToUser should invoke web-push once");
    assert.strictEqual(sentNotifications[0].payload.title, "Smoke push", "push payload should survive serialization");
  } finally {
    webpush.sendNotification = originalSendNotification;
  }

  const pushStatusAfterSend = await getPushStatus(alpha.userId, pool);
  assert(pushStatusAfterSend.lastPushSentAt, "sending a push should update the last sent timestamp");

  const pushStatusAfterDelete = await api("/api/user/push-subscription", {
    method: "DELETE",
    token: alpha.token,
    body: { endpoint: fakeSubscription.endpoint },
  });
  assert.strictEqual(pushStatusAfterDelete.subscribed, false, "push unsubscribe route should unlink the device");
  assert.strictEqual(pushStatusAfterDelete.pushEnabled, false, "push unsubscribe route should disable push when no devices remain");

  const finalPushStatus = await removePushSubscription(alpha.userId, null, pool);
  assert.strictEqual(finalPushStatus.subscriptionCount, 0, "cleanup should leave no push subscriptions behind");

  // Account deletion should remove the user and related data.
  await api("/api/workout/log", {
    method: "POST",
    token: delta.token,
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
  await api("/api/user/push-subscription", {
    method: "POST",
    token: delta.token,
    body: { subscription: { ...fakeSubscription, endpoint: `https://push.example.test/sub/${uniqueSuffix()}` } },
  });
  await api("/api/user/account", {
    method: "DELETE",
    token: delta.token,
    body: { confirmation: delta.username.toUpperCase() },
  });

  const deletedUserCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE id = $1", [delta.userId])).rows[0].count);
  const deletedSettingsCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM user_settings WHERE user_id = $1", [delta.userId])).rows[0].count);
  const deletedProgressCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM user_progress WHERE user_id = $1", [delta.userId])).rows[0].count);
  const deletedHistoryCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM workout_history WHERE user_id = $1", [delta.userId])).rows[0].count);
  const deletedPushCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1", [delta.userId])).rows[0].count);
  assert.strictEqual(deletedUserCount, 0, "account deletion should remove the user row");
  assert.strictEqual(deletedSettingsCount, 0, "account deletion should remove settings");
  assert.strictEqual(deletedProgressCount, 0, "account deletion should remove progress");
  assert.strictEqual(deletedHistoryCount, 0, "account deletion should remove workout history");
  assert.strictEqual(deletedPushCount, 0, "account deletion should remove push subscriptions");

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
