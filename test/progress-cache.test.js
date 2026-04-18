const assert = require("node:assert/strict");
const test = require("node:test");

const { clearProgressSyncCache, ensureUserProgressDaySynced } = require("../lib/progress");

function createPoolStub(dateKey = "2026-04-18", options = {}) {
  let connects = 0;
  let releaseSelect;
  const selectGate = options.blockSelect
    ? new Promise((resolve) => {
      releaseSelect = resolve;
    })
    : null;
  const client = {
    async query(sql) {
      const text = String(sql);
      if (text.includes("SELECT * FROM user_progress")) {
        if (selectGate) await selectGate;
        return {
          rows: [{
            user_id: 123,
            last_active_date: dateKey,
            streak: 1,
            max_streak: 1,
            streak_freezes: 0,
            day_counter: 1,
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };

  return {
    async connect() {
      connects += 1;
      return client;
    },
    get connects() {
      return connects;
    },
    releaseSelect() {
      if (releaseSelect) releaseSelect();
    },
  };
}

test("ensureUserProgressDaySynced coalesces concurrent same-day syncs", async () => {
  clearProgressSyncCache();
  const pool = createPoolStub("2026-04-18", { blockSelect: true });

  const firstSync = ensureUserProgressDaySynced(123, pool, "2026-04-18");
  const secondSync = ensureUserProgressDaySynced(123, pool, "2026-04-18");
  pool.releaseSelect();
  await Promise.all([firstSync, secondSync]);

  assert.equal(pool.connects, 1);
});

test("ensureUserProgressDaySynced keeps date keys separate", async () => {
  clearProgressSyncCache();
  const pool = createPoolStub("2026-04-18");

  await ensureUserProgressDaySynced(123, pool, "2026-04-18");
  await ensureUserProgressDaySynced(123, pool, "2026-04-19");

  assert.equal(pool.connects, 2);
});

test("ensureUserProgressDaySynced checks again after an in-flight sync resolves", async () => {
  clearProgressSyncCache();
  const pool = createPoolStub("2026-04-18");

  await ensureUserProgressDaySynced(123, pool, "2026-04-18");
  await ensureUserProgressDaySynced(123, pool, "2026-04-18");

  assert.equal(pool.connects, 2);
});
