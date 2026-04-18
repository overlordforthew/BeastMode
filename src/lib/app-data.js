import BeastModeScoring from "../../public/scoring.js";

const { WORKOUT_EXERCISES, MEDITATION_TYPES: SHARED_MEDITATION_TYPES } = BeastModeScoring;

export const EXERCISES = WORKOUT_EXERCISES.map((exercise) => ({ ...exercise }));
export const MEDITATION_TYPES = SHARED_MEDITATION_TYPES.map((meditation) => ({ ...meditation }));

export const AWARDS = [
  { id: "first_workout", emoji: "🎯", name: "First Blood", desc: "Complete your first workout" },
  { id: "sessions_10", emoji: "🔟", name: "Getting Started", desc: "Complete 10 sessions" },
  { id: "sessions_50", emoji: "5️⃣0️⃣", name: "Halfway Hero", desc: "Complete 50 sessions" },
  { id: "sessions_100", emoji: "💯", name: "Centurion", desc: "Complete 100 sessions" },
  { id: "sessions_500", emoji: "🏛️", name: "Legend", desc: "Complete 500 sessions" },
  { id: "streak_3", emoji: "🔥", name: "On Fire", desc: "3-day streak" },
  { id: "streak_7", emoji: "📅", name: "Full Week", desc: "7-day streak" },
  { id: "streak_14", emoji: "🌙", name: "Fortnight", desc: "14-day streak" },
  { id: "streak_30", emoji: "📆", name: "Monthly", desc: "30-day streak" },
  { id: "streak_100", emoji: "⭐", name: "Unstoppable", desc: "100-day streak" },
  { id: "pts_100", emoji: "🥉", name: "Bronze", desc: "Earn 100 points" },
  { id: "pts_1000", emoji: "🥈", name: "Silver", desc: "Earn 1,000 points" },
  { id: "pts_5000", emoji: "🥇", name: "Gold", desc: "Earn 5,000 points" },
  { id: "pts_10000", emoji: "💎", name: "Diamond", desc: "Earn 10,000 points" },
  { id: "try_all", emoji: "🎨", name: "Well Rounded", desc: "Try all 10 exercises" },
  { id: "dur_5", emoji: "⏱️", name: "Endurance", desc: "Complete 5min workout" },
  { id: "dur_7", emoji: "🦾", name: "Iron Will", desc: "Complete 7min workout" },
  { id: "freeze_earn", emoji: "🧊", name: "Ice Bank", desc: "Earn a streak freeze" },
  { id: "extra_1", emoji: "⭐", name: "Extra Mile", desc: "Do 1 extra credit session" },
  { id: "extra_10", emoji: "🌟", name: "Overachiever", desc: "Do 10 extra sessions" },
  { id: "perfect_day", emoji: "👑", name: "Perfect Day", desc: "5+ sessions in one day" },
  { id: "first_meditation", emoji: "☮️", name: "Inner Peace", desc: "Complete your first meditation" },
  { id: "med_sessions_10", emoji: "🌸", name: "Zen Beginner", desc: "Complete 10 meditations" },
  { id: "med_sessions_50", emoji: "☯️", name: "Enlightened", desc: "Complete 50 meditations" },
  { id: "med_60", emoji: "⏳", name: "Deep Dive", desc: "Complete a 60min meditation" },
  { id: "med_3_in_day", emoji: "🌟", name: "Triple Zen", desc: "3 meditations in one day" },
  { id: "try_all_med", emoji: "🎭", name: "Mindful Explorer", desc: "Try all 6 meditation types" },
];

export const DAYS_OF_WEEK = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

export const ALL_DAYS = DAYS_OF_WEEK.map((day) => day.key);

export function getTodayKey() {
  const day = new Date().getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day];
}
