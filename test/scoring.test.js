const test = require("node:test");
const assert = require("assert");

const {
  calcMeditationPoints,
  calcWorkoutPoints,
  estimateAwardedPoints,
  getEvolution,
  getEvolutionProgress,
  getMeditationQualificationCredit,
  getNextEvolution,
  getStreakMultiplier,
  getWorkoutExercise,
  getWorkoutSessionCredit,
  isQualifiedDayState,
  MIN_DAILY_SESSION_CREDITS,
  QUALIFYING_MEDITATION_MINUTES,
} = require("../public/scoring");

test("streak multiplier stays sane and capped", () => {
  assert.strictEqual(getStreakMultiplier(1), 1);
  assert.strictEqual(getStreakMultiplier(30), 1.87);
  assert.strictEqual(getStreakMultiplier(100), 2);
});

test("qualification rules reflect the rebalanced streak logic", () => {
  assert.strictEqual(MIN_DAILY_SESSION_CREDITS, 3);
  assert.strictEqual(QUALIFYING_MEDITATION_MINUTES, 5);
  assert.strictEqual(getWorkoutSessionCredit(0.5, true), 0.5);
  assert.strictEqual(getWorkoutSessionCredit(1, true), 1);
  assert.strictEqual(getMeditationQualificationCredit(3, true), 0);
  assert.strictEqual(getMeditationQualificationCredit(5, true), 1);

  assert.strictEqual(isQualifiedDayState({ session_credits: 2.5, qualifying_meditations: 0 }), false);
  assert.strictEqual(isQualifiedDayState({ session_credits: 3, qualifying_meditations: 0 }), true);
  assert.strictEqual(isQualifiedDayState({ session_credits: 0, qualifying_meditations: 1 }), true);
});

test("core scoring tables keep the intended exercise and meditation balance", () => {
  assert.strictEqual(getWorkoutExercise("chair_pose").basePoints, 11.5);
  assert.strictEqual(getWorkoutExercise("plank").basePoints, 13.5);
  assert.strictEqual(calcWorkoutPoints("burpees", 2), 28);
  assert.strictEqual(calcWorkoutPoints("pushups", 2), 20.8);
  assert.strictEqual(calcMeditationPoints(10, 1), 55);
  assert.strictEqual(calcMeditationPoints(10, 2), 44);
  assert.strictEqual(calcMeditationPoints(10, 3), 33);
  assert.strictEqual(estimateAwardedPoints(28, 30), 52.4);
});

test("evolution ladder starts at zero and exposes the next tier cleanly", () => {
  assert.strictEqual(getEvolution(0).threshold, 0);
  assert.strictEqual(getEvolutionProgress(0), 0);
  assert.ok(getNextEvolution(0).threshold > 0);
  assert.ok(getEvolutionProgress(1000) <= 100);
});
