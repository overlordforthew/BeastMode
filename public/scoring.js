(function initBeastModeScoring(root, factory) {
  const scoring = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = scoring;
  }
  if (root) {
    root.BeastModeScoring = scoring;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildScoringModule() {
  const WORKOUT_EXERCISES = [
    { id: "jumping_jacks", name: "Jumping Jacks", emoji: "⭐", basePoints: 10 },
    { id: "situps", name: "Sit-ups", emoji: "🔄", basePoints: 10.5 },
    { id: "squats", name: "Squats", emoji: "🦵", basePoints: 11.5 },
    { id: "lunges", name: "Lunges", emoji: "🚶", basePoints: 12 },
    { id: "chair_pose", name: "Chair Pose", emoji: "🪑", basePoints: 12 },
    { id: "pushups", name: "Push-ups", emoji: "💪", basePoints: 13 },
    { id: "high_knees", name: "High Knees", emoji: "🏃", basePoints: 13.5 },
    { id: "plank", name: "Plank", emoji: "🧱", basePoints: 14 },
    { id: "mountain_climbers", name: "Mt. Climbers", emoji: "🏔️", basePoints: 15.5 },
    { id: "burpees", name: "Burpees", emoji: "⚡", basePoints: 17.5 },
  ];

  const WORKOUT_EXERCISE_MAP = Object.fromEntries(
    WORKOUT_EXERCISES.map((exercise) => [exercise.id, exercise])
  );

  const DURATION_MULTIPLIERS = {
    "0.5": 0.7,
    "1": 1,
    "2": 1.6,
    "3": 2.2,
    "4": 2.7,
    "5": 3.1,
    "6": 3.5,
    "7": 4,
  };
  const DURATION_OPTIONS = [0.5, 1, 2, 3, 4, 5, 6, 7];

  const MEDITATION_TYPES = [
    { id: "breath", name: "Breath Focus", emoji: "💨", desc: "Focus on your breathing" },
    { id: "body_scan", name: "Body Scan", emoji: "✨", desc: "Scan through body sensations" },
    { id: "loving_kindness", name: "Loving Kindness", emoji: "💜", desc: "Cultivate compassion" },
    { id: "visualization", name: "Visualization", emoji: "🌄", desc: "Guided imagery journey" },
    { id: "mindfulness", name: "Mindfulness", emoji: "🌸", desc: "Present moment awareness" },
    { id: "mantra", name: "Mantra", emoji: "🔔", desc: "Repeat a calming phrase" },
  ];

  const MEDITATION_TYPE_MAP = Object.fromEntries(
    MEDITATION_TYPES.map((meditation) => [meditation.id, meditation])
  );

  const MEDITATION_DURATIONS = [3, 5, 10, 30, 60];
  const MEDITATION_BASE_POINTS = {
    "3": 18,
    "5": 30,
    "10": 55,
    "30": 140,
    "60": 260,
  };

  const WORKOUT_MIN_PARTIAL_SECONDS = 30;
  const MEDITATION_MIN_PARTIAL_SECONDS = 180;
  const STREAK_STEP = 0.03;
  const STREAK_MAX_MULTIPLIER = 2;
  const EVOLUTION_TOP_THRESHOLD = 180000;
  const EVOLUTION_SECOND_THRESHOLD = 20;

  const EVOLUTION_LEVELS = [
    { name: "Amoeba", emoji: "🦠" },
    { name: "Plankton", emoji: "🪧" },
    { name: "Jellyfish", emoji: "🪼" },
    { name: "Shrimp", emoji: "🦐" },
    { name: "Snail", emoji: "🐌" },
    { name: "Crab", emoji: "🦀" },
    { name: "Fish", emoji: "🐟" },
    { name: "Frog", emoji: "🐸" },
    { name: "Lizard", emoji: "🦎" },
    { name: "Rabbit", emoji: "🐰" },
    { name: "Cat", emoji: "🐈" },
    { name: "Raccoon", emoji: "🦝" },
    { name: "Fox", emoji: "🦊" },
    { name: "Dog", emoji: "🐕" },
    { name: "Snake", emoji: "🐍" },
    { name: "Turtle", emoji: "🐢" },
    { name: "Deer", emoji: "🦌" },
    { name: "Wolf", emoji: "🐺" },
    { name: "Octopus", emoji: "🐙" },
    { name: "Dolphin", emoji: "🐬" },
    { name: "Eagle", emoji: "🦅" },
    { name: "Owl", emoji: "🦉" },
    { name: "Panther", emoji: "🐆" },
    { name: "Lion", emoji: "🦁" },
    { name: "Tiger", emoji: "🐯" },
    { name: "Gorilla", emoji: "🦍" },
    { name: "Bear", emoji: "🐻" },
    { name: "Horse", emoji: "🐴" },
    { name: "Shark", emoji: "🦈" },
    { name: "Rhino", emoji: "🦏" },
    { name: "Hippo", emoji: "🦛" },
    { name: "Elephant", emoji: "🐘" },
    { name: "Whale", emoji: "🐋" },
    { name: "T-Rex", emoji: "🦖" },
    { name: "Mammoth", emoji: "🦣" },
    { name: "Saber-tooth", emoji: "🐅" },
    { name: "Phoenix", emoji: "🔥" },
    { name: "Unicorn", emoji: "🦄" },
    { name: "Griffin", emoji: "🦅" },
    { name: "Kraken", emoji: "🦑" },
    { name: "Hydra", emoji: "🐉" },
    { name: "Cerberus", emoji: "🐕‍🦺" },
    { name: "Thunderbird", emoji: "⚡" },
    { name: "Leviathan", emoji: "🌊" },
    { name: "Titan", emoji: "🗿" },
    { name: "Behemoth", emoji: "💀" },
    { name: "Colossus", emoji: "🏛️" },
    { name: "Wyvern", emoji: "🪽" },
    { name: "Bahamut", emoji: "👑" },
    { name: "Dragon", emoji: "🐲" },
  ];

  function toNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function roundPoints(value) {
    return Math.round(toNumber(value, 0) * 10) / 10;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeDurationKey(value) {
    const numeric = toNumber(value, NaN);
    if (Number.isNaN(numeric)) return String(value);
    return String(numeric);
  }

  function getWorkoutExercise(exerciseId) {
    return WORKOUT_EXERCISE_MAP[exerciseId] || null;
  }

  function getMeditationType(typeId) {
    return MEDITATION_TYPE_MAP[typeId] || null;
  }

  function isSupportedWorkoutDuration(durationMinutes) {
    return Object.prototype.hasOwnProperty.call(DURATION_MULTIPLIERS, normalizeDurationKey(durationMinutes));
  }

  function isSupportedMeditationDuration(durationMinutes) {
    return Object.prototype.hasOwnProperty.call(MEDITATION_BASE_POINTS, normalizeDurationKey(durationMinutes));
  }

  function calcWorkoutPointsFromBase(basePoints, durationMinutes) {
    const multiplier = DURATION_MULTIPLIERS[normalizeDurationKey(durationMinutes)];
    if (!multiplier) return 0;
    return roundPoints(toNumber(basePoints, 0) * multiplier);
  }

  function calcWorkoutPoints(exerciseId, durationMinutes) {
    const exercise = getWorkoutExercise(exerciseId);
    return exercise ? calcWorkoutPointsFromBase(exercise.basePoints, durationMinutes) : 0;
  }

  function getMeditationSessionMultiplier(sessionNumber) {
    const session = Math.max(1, Math.floor(toNumber(sessionNumber, 1)));
    if (session <= 1) return 1;
    if (session === 2) return 0.8;
    return 0.6;
  }

  function calcMeditationPoints(durationMinutes, sessionNumber) {
    const basePoints = MEDITATION_BASE_POINTS[normalizeDurationKey(durationMinutes)];
    if (!basePoints) return 0;
    return roundPoints(basePoints * getMeditationSessionMultiplier(sessionNumber));
  }

  function calcPartialPoints(fullPoints, elapsedSeconds, totalSeconds, minSeconds) {
    const elapsed = clamp(toNumber(elapsedSeconds, 0), 0, Math.max(0, toNumber(totalSeconds, 0)));
    if (elapsed < minSeconds || totalSeconds <= 0) return 0;
    return roundPoints(toNumber(fullPoints, 0) * (elapsed / totalSeconds));
  }

  function calcWorkoutPartialPointsFromBase(basePoints, durationMinutes, elapsedSeconds) {
    const duration = toNumber(durationMinutes, 0);
    const fullPoints = calcWorkoutPointsFromBase(basePoints, duration);
    return calcPartialPoints(fullPoints, elapsedSeconds, duration * 60, WORKOUT_MIN_PARTIAL_SECONDS);
  }

  function calcWorkoutPartialPoints(exerciseId, durationMinutes, elapsedSeconds) {
    const exercise = getWorkoutExercise(exerciseId);
    return exercise
      ? calcWorkoutPartialPointsFromBase(exercise.basePoints, durationMinutes, elapsedSeconds)
      : 0;
  }

  function calcMeditationPartialPoints(durationMinutes, sessionNumber, elapsedSeconds) {
    const duration = toNumber(durationMinutes, 0);
    const fullPoints = calcMeditationPoints(duration, sessionNumber);
    return calcPartialPoints(fullPoints, elapsedSeconds, duration * 60, MEDITATION_MIN_PARTIAL_SECONDS);
  }

  function getStreakMultiplier(streak) {
    const streakValue = Math.max(1, Math.floor(toNumber(streak, 1)));
    const uncapped = 1 + ((streakValue - 1) * STREAK_STEP);
    return Math.round(Math.min(STREAK_MAX_MULTIPLIER, uncapped) * 100) / 100;
  }

  function estimateAwardedPoints(rawPoints, streak) {
    return roundPoints(toNumber(rawPoints, 0) * getStreakMultiplier(streak));
  }

  function buildEvolutionThresholds() {
    const thresholds = [0];
    const ratio = Math.pow(
      EVOLUTION_TOP_THRESHOLD / EVOLUTION_SECOND_THRESHOLD,
      1 / (EVOLUTION_LEVELS.length - 2)
    );

    for (let index = 0; index < EVOLUTION_LEVELS.length - 1; index += 1) {
      const rawThreshold = EVOLUTION_SECOND_THRESHOLD * Math.pow(ratio, index);
      const previousThreshold = thresholds[thresholds.length - 1];
      thresholds.push(Math.max(previousThreshold + 1, Math.round(rawThreshold)));
    }

    thresholds[thresholds.length - 1] = EVOLUTION_TOP_THRESHOLD;
    return thresholds;
  }

  const EVOLUTION_THRESHOLDS = buildEvolutionThresholds();
  const EVOLUTION_TIERS = EVOLUTION_LEVELS.map((level, index) => ({
    ...level,
    threshold: EVOLUTION_THRESHOLDS[index],
  }));

  function getEvolution(points) {
    const safePoints = Math.max(0, toNumber(points, 0));
    let tier = EVOLUTION_TIERS[0];
    for (const currentTier of EVOLUTION_TIERS) {
      if (safePoints >= currentTier.threshold) {
        tier = currentTier;
      } else {
        break;
      }
    }
    return tier;
  }

  function getNextEvolution(points) {
    const safePoints = Math.max(0, toNumber(points, 0));
    for (const currentTier of EVOLUTION_TIERS) {
      if (safePoints < currentTier.threshold) {
        return currentTier;
      }
    }
    return null;
  }

  function getEvolutionProgress(points) {
    const safePoints = Math.max(0, toNumber(points, 0));
    const current = getEvolution(safePoints);
    const next = getNextEvolution(safePoints);
    if (!next) return 1;
    const span = next.threshold - current.threshold;
    if (span <= 0) return 1;
    return clamp((safePoints - current.threshold) / span, 0, 1);
  }

  return {
    WORKOUT_EXERCISES,
    DURATION_MULTIPLIERS,
    DURATION_OPTIONS,
    MEDITATION_TYPES,
    MEDITATION_DURATIONS,
    MEDITATION_BASE_POINTS,
    WORKOUT_MIN_PARTIAL_SECONDS,
    MEDITATION_MIN_PARTIAL_SECONDS,
    STREAK_STEP,
    STREAK_MAX_MULTIPLIER,
    EVOLUTION_TOP_THRESHOLD,
    EVOLUTION_SECOND_THRESHOLD,
    EVOLUTION_TIERS,
    roundPoints,
    getWorkoutExercise,
    getMeditationType,
    isSupportedWorkoutDuration,
    isSupportedMeditationDuration,
    calcWorkoutPointsFromBase,
    calcWorkoutPoints,
    calcWorkoutPartialPointsFromBase,
    calcWorkoutPartialPoints,
    getMeditationSessionMultiplier,
    calcMeditationPoints,
    calcMeditationPartialPoints,
    getStreakMultiplier,
    estimateAwardedPoints,
    getEvolution,
    getNextEvolution,
    getEvolutionProgress,
  };
});
