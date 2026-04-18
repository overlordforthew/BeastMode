import BeastModeScoring from "../../public/scoring.js";
import { ALERT_INTERVAL_OPTIONS } from "./app-client.js";
import { TRANSLATIONS } from "./i18n.js";

const {
  DURATION_OPTIONS,
  calcWorkoutPointsFromBase,
  estimateAwardedPoints,
  getMeditationQualificationCredit,
  getWorkoutSessionCredit,
  isQualifiedDayState,
  MIN_DAILY_SESSION_CREDITS,
  roundPoints,
} = BeastModeScoring;

export function calcPoints(basePoints, durationMinutes) {
  return calcWorkoutPointsFromBase(basePoints, durationMinutes);
}

export function fmtDuration(durationMinutes) {
  return durationMinutes < 1 ? `${Math.round(durationMinutes * 60)}s` : `${durationMinutes}m`;
}

export function resolveDuration(durationMinutes) {
  return durationMinutes === "random"
    ? DURATION_OPTIONS[Math.floor(Math.random() * DURATION_OPTIONS.length)]
    : durationMinutes;
}

export function fmtSessionCredits(value) {
  const credits = roundPoints(value || 0);
  return Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
}

export function fmtIntervalOption(value) {
  return ALERT_INTERVAL_OPTIONS.find((option) => option.value === value)?.label || `${value}m`;
}

export function getMissionImpactMessage(mission, action) {
  if (!mission || mission.claimed || !action.wasCompleted || !mission.metrics) return null;

  const metrics = mission.metrics;
  let before = mission.progressCurrent || 0;
  let after = before;

  if (mission.id === "streak_builder" && action.kind === "workout") {
    after = Math.min(3, (metrics.sessionsFinished || 0) + 1);
  } else if (mission.id === "mind_body_stack") {
    const workouts = Math.min(2, (metrics.sessionsFinished || 0) + (action.kind === "workout" ? 1 : 0));
    const meditations = Math.min(1, (metrics.meditationsFinished || 0) + (action.kind === "meditation" ? 1 : 0));
    after = workouts + meditations;
  } else if (mission.id === "point_sprint") {
    after = Math.min(60, Math.round((metrics.todayPoints || 0) + (action.awardedPoints || 0)));
  } else if (mission.id === "variety_hunt" && action.kind === "workout") {
    const uniqueSet = new Set(action.todayExerciseIds || []);
    uniqueSet.add(action.exerciseId);
    after = Math.min(2, uniqueSet.size);
  } else if (mission.id === "afterburn") {
    const workouts = Math.min(2, (metrics.sessionsFinished || 0) + (action.kind === "workout" ? 1 : 0));
    const extra = Math.min(1, (metrics.extraSessionsToday || 0) + (action.sessionType === "extra" ? 1 : 0));
    after = workouts + extra;
  }

  if (after <= before) return null;

  const remaining = Math.max(0, mission.progressTarget - after);
  if (remaining === 0) {
    return `${mission.title} ${TRANSLATIONS.en.justUnlocked}. +${mission.bonusPoints} waiting.`;
  }

  return `${mission.title}: ${after}/${mission.progressTarget}. ${remaining} left.`;
}

export function getStreakImpactMessage(context, action) {
  if (!action.wasCompleted) return null;

  const beforeCredits = context?.sessionCredits || 0;
  const beforeQualifyingMeditations = context?.qualifyingMeditations || 0;
  const beforeQualified = isQualifiedDayState({
    sessionCredits: beforeCredits,
    qualifyingMeditations: beforeQualifyingMeditations,
    sessionsFinished: context?.sessionsFinished || 0,
    meditationsFinished: context?.meditationsFinished || 0,
  });

  const afterCredits = beforeCredits + (action.kind === "workout" ? getWorkoutSessionCredit(action.durationMinutes, action.wasCompleted) : 0);
  const afterQualifyingMeditations = beforeQualifyingMeditations + (
    action.kind === "meditation" ? getMeditationQualificationCredit(action.durationMinutes, action.wasCompleted) : 0
  );
  const afterQualified = isQualifiedDayState({
    sessionCredits: afterCredits,
    qualifyingMeditations: afterQualifyingMeditations,
    sessionsFinished: (context?.sessionsFinished || 0) + (action.kind === "workout" ? 1 : 0),
    meditationsFinished: (context?.meditationsFinished || 0) + (action.kind === "meditation" ? 1 : 0),
  });

  if (!beforeQualified && afterQualified) {
    return action.kind === "meditation"
      ? TRANSLATIONS.en.meditationLocksStreak
      : TRANSLATIONS.en.streakLockedNow;
  }

  if (action.kind === "workout" && !afterQualified) {
    const remainingCredits = Math.max(0, MIN_DAILY_SESSION_CREDITS - afterCredits);
    return remainingCredits <= 0.5
      ? "One quick 30s finisher left to lock today in."
      : `${fmtSessionCredits(remainingCredits)} workout credits left to lock today in.`;
  }

  return null;
}

export function getPressureImpactMessage(pressure, action) {
  if (!pressure || !action.wasCompleted || !action.awardedPoints) return null;

  if (pressure.rivalAbove && action.awardedPoints >= pressure.rivalAbove.gap) {
    return `${TRANSLATIONS.en.leaderboardSwing} ${pressure.rivalAbove.username}.`;
  }
  if (pressure.buddy?.ahead && action.awardedPoints >= pressure.buddy.gap) {
    return `You catch ${pressure.buddy.username} with this one.`;
  }
  if (pressure.buddy && !pressure.buddy.ahead) {
    return `${TRANSLATIONS.en.extendsLead} ${pressure.buddy.username}.`;
  }
  if (pressure.rivalAbove) {
    return `${TRANSLATIONS.en.closesGap} ${pressure.rivalAbove.username}.`;
  }
  if (pressure.team?.teamName) {
    return `${pressure.team.teamName}: ${TRANSLATIONS.en.teamBanked} +${Math.round(action.awardedPoints)}.`;
  }

  return null;
}

export function getSessionImpactMessages(context, action) {
  return [
    getMissionImpactMessage(context?.mission, action),
    getStreakImpactMessage(context, action),
    getPressureImpactMessage(context?.pressure, action),
  ].filter(Boolean).slice(0, 3);
}

export function buildAlarmPrompt({ mission, pressure, settings, exercise, duration, streak }) {
  const baseMessage = settings?.alarmMessage?.trim() || "Time to move!";
  const estimatedPoints = exercise
    ? estimateAwardedPoints(calcPoints(exercise.basePoints, duration || 2), streak || 1)
    : null;
  const chips = [];
  let subtitle = TRANSLATIONS.en.paceLine;

  if (mission && !mission.claimed) {
    if (mission.id === "point_sprint") {
      const remaining = Math.max(0, 60 - Math.round(mission.metrics?.todayPoints || 0));
      subtitle = remaining > 0 ? `${remaining} pts to clear ${mission.title}.` : TRANSLATIONS.en.missionReadyNow;
    } else if (mission.id === "streak_builder") {
      const remaining = Math.max(0, 3 - (mission.metrics?.sessionsFinished || 0));
      subtitle = remaining > 0 ? `${remaining} workouts left for ${mission.title}.` : TRANSLATIONS.en.missionReadyNow;
    } else if (mission.id === "mind_body_stack") {
      const workoutsLeft = Math.max(0, 2 - (mission.metrics?.sessionsFinished || 0));
      const meditationLeft = Math.max(0, 1 - (mission.metrics?.meditationsFinished || 0));
      subtitle = workoutsLeft === 0 && meditationLeft === 0
        ? TRANSLATIONS.en.missionReadyNow
        : `${workoutsLeft} workout + ${meditationLeft} meditation left for ${mission.title}.`;
    } else {
      subtitle = mission.progressText;
    }
    chips.push(`${mission.emoji} ${mission.title}`);
  }

  if (pressure?.rivalAbove) {
    chips.push(`${pressure.rivalAbove.gap} pts to pass ${pressure.rivalAbove.username}`);
  } else if (pressure?.buddy) {
    chips.push(`${pressure.buddy.gap} pts vs ${pressure.buddy.username}`);
  }

  if (estimatedPoints) {
    chips.push(`+${estimatedPoints} pts`);
  }

  return {
    title: baseMessage,
    subtitle,
    chips,
  };
}
