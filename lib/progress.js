const MIN_DAILY_SESSIONS = 3;
const MAX_FREEZES = 3;
const FREEZE_EARN_INTERVAL = 5;

function getTodayDateKey(now = new Date()) {
  return now.toISOString().split("T")[0];
}

function parseDateKey(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function diffDateKeys(fromDateKey, toDateKey) {
  const diffMs = parseDateKey(toDateKey) - parseDateKey(fromDateKey);
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isQualifiedDay(progress) {
  return toNumber(progress.sessions_finished, 0) >= MIN_DAILY_SESSIONS
    || toNumber(progress.meditations_finished, 0) >= 1;
}

function applyQualifiedDay(progress) {
  const nextStreak = toNumber(progress.streak, 1) + 1;
  const currentFreezes = toNumber(progress.streak_freezes, 0);
  const freezeEarned = nextStreak % FREEZE_EARN_INTERVAL === 0 && currentFreezes < MAX_FREEZES;

  return {
    ...progress,
    streak: nextStreak,
    max_streak: Math.max(toNumber(progress.max_streak, 1), nextStreak),
    streak_freezes: freezeEarned ? Math.min(currentFreezes + 1, MAX_FREEZES) : currentFreezes,
    freezeEarned,
    freezeUsed: false,
    qualified: true,
  };
}

function applyMissedDay(progress) {
  const currentFreezes = toNumber(progress.streak_freezes, 0);
  const freezeUsed = currentFreezes > 0;
  const nextStreak = freezeUsed ? toNumber(progress.streak, 1) : 1;

  return {
    ...progress,
    streak: nextStreak,
    max_streak: Math.max(toNumber(progress.max_streak, 1), nextStreak),
    streak_freezes: freezeUsed ? currentFreezes - 1 : currentFreezes,
    freezeEarned: false,
    freezeUsed,
    qualified: false,
  };
}

function resetDailyCounters(progress, dateKey) {
  return {
    ...progress,
    today_points: 0,
    sessions_completed: 0,
    sessions_finished: 0,
    meditations_finished: 0,
    sessions_skipped: 0,
    day_counter: toNumber(progress.day_counter, 0) + 1,
    last_active_date: dateKey,
  };
}

function advanceProgressDay(progress, qualified, dateKey) {
  const advanced = qualified ? applyQualifiedDay(progress) : applyMissedDay(progress);
  return resetDailyCounters(advanced, dateKey);
}

async function syncUserProgressDay(userId, db, todayDateKey = getTodayDateKey()) {
  const client = typeof db.connect === "function" ? await db.connect() : db;
  const shouldRelease = client !== db;

  try {
    if (shouldRelease) {
      await client.query("BEGIN");
    }

    const progressR = await client.query("SELECT * FROM user_progress WHERE user_id = $1 LIMIT 1 FOR UPDATE", [userId]);
    const current = progressR.rows[0];
    if (!current) {
      if (shouldRelease) {
        await client.query("COMMIT");
      }
      return null;
    }

    const progressDateKey = current.last_active_date || todayDateKey;
    const daysBehind = diffDateKeys(progressDateKey, todayDateKey);
    if (daysBehind <= 0) {
      if (shouldRelease) {
        await client.query("COMMIT");
      }
      return current;
    }

    let updated = { ...current };
    let freezeEarnedCount = 0;

    // First, close out the stale in-progress day using its actual completion state.
    updated = advanceProgressDay(updated, isQualifiedDay(updated), todayDateKey);
    if (updated.freezeEarned) freezeEarnedCount += 1;

    // Then apply any fully missed days between the stale day and today.
    for (let offset = 1; offset < daysBehind; offset += 1) {
      updated = advanceProgressDay(updated, false, todayDateKey);
      if (updated.freezeEarned) freezeEarnedCount += 1;
    }

    await client.query(`
      UPDATE user_progress
      SET
        streak = $1,
        max_streak = $2,
        streak_freezes = $3,
        today_points = 0,
        sessions_completed = 0,
        sessions_finished = 0,
        meditations_finished = 0,
        sessions_skipped = 0,
        day_counter = $4,
        last_active_date = $5,
        updated_at = NOW()
      WHERE user_id = $6
    `, [
      updated.streak,
      updated.max_streak,
      updated.streak_freezes,
      updated.day_counter,
      todayDateKey,
      userId,
    ]);

    if (freezeEarnedCount > 0) {
      await client.query(`
        UPDATE user_stats
        SET total_freezes_earned = total_freezes_earned + $1, updated_at = NOW()
        WHERE user_id = $2
      `, [freezeEarnedCount, userId]);
    }

    const refreshedR = await client.query("SELECT * FROM user_progress WHERE user_id = $1 LIMIT 1", [userId]);
    if (shouldRelease) {
      await client.query("COMMIT");
    }
    return refreshedR.rows[0] || updated;
  } catch (err) {
    if (shouldRelease) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw err;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

module.exports = {
  MIN_DAILY_SESSIONS,
  MAX_FREEZES,
  FREEZE_EARN_INTERVAL,
  getTodayDateKey,
  isQualifiedDay,
  applyQualifiedDay,
  applyMissedDay,
  syncUserProgressDay,
};
