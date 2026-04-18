import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import BeastModeScoring from "../public/scoring.js";
import AuthScreen from "./components/AuthScreen.jsx";
import { ActivationCard, MissionCard, PressureCard, QuickStartCard } from "./components/DashboardCards.jsx";
import { EvolutionBadge, EvolutionBar } from "./components/EvolutionStatus.jsx";
import {
  ALERT_INTERVAL_OPTIONS,
  api,
  fetchPublicConfig,
  isStandaloneApp,
  showSystemNotification,
  supportsNotifications,
  supportsWebPush,
  urlBase64ToUint8Array,
} from "./lib/app-client.js";
import { ALL_DAYS, AWARDS, DAYS_OF_WEEK, EXERCISES, MEDITATION_TYPES, getTodayKey } from "./lib/app-data.js";
import { getPreferredLanguage, persistLanguagePreference, useT } from "./lib/i18n.js";
import {
  buildAlarmPrompt,
  calcPoints,
  fmtDuration,
  fmtIntervalOption,
  fmtSessionCredits,
  getSessionImpactMessages,
  resolveDuration,
} from "./lib/session-feedback.js";

const {
  DURATION_OPTIONS,
  DURATION_MULTIPLIERS,
  MEDITATION_DURATIONS,
  EVOLUTION_TIERS,
  calcWorkoutPartialPointsFromBase,
  calcMeditationPoints,
  calcMeditationPartialPoints,
  getMeditationSessionMultiplier,
  getWorkoutSessionCredit,
  getMeditationQualificationCredit,
  isQualifiedDayState,
  MIN_DAILY_SESSION_CREDITS,
  QUALIFYING_MEDITATION_MINUTES,
  getStreakMultiplier,
  estimateAwardedPoints,
  getEvolution,
} = BeastModeScoring;

//     DEMO MODE (add ?demo=true to URL)           
const DEMO_MODE = new URLSearchParams(window.location.search).has('demo');

// Animated SVG stick figures for exercises
const _exStyleInjected = { current: false };
function ExerciseAnimation({ exerciseId, size }) {
  const s = size || 64;
  useEffect(() => {
    if (_exStyleInjected.current) return;
    _exStyleInjected.current = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes exPushup { 0%,100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
      @keyframes exSitup { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-45deg); } }
      @keyframes exSquat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
      @keyframes exSquatLegs { 0%,100% { d: path("M35 55 L30 75"); } 50% { d: path("M35 55 L25 70"); } }
      @keyframes exLunge { 0%,100% { transform: translateY(0) scaleX(1); } 50% { transform: translateY(6px) scaleX(1.1); } }
      @keyframes exBurpee { 0%,20% { transform: translateY(0) rotate(0deg); } 30%,50% { transform: translateY(8px) rotate(90deg); } 60%,80% { transform: translateY(0) rotate(0deg); } 90%,100% { transform: translateY(-8px); } }
      @keyframes exTremor { 0%,100% { transform: translateX(0); } 25% { transform: translateX(0.5px); } 75% { transform: translateX(-0.5px); } }
      @keyframes exJJ { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(45deg); } }
      @keyframes exJJleg { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(15deg); } }
      @keyframes exJJlegR { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-15deg); } }
      @keyframes exJJarmR { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-45deg); } }
      @keyframes exKneeL { 0%,50% { transform: rotate(0deg); } 25% { transform: rotate(-60deg); } }
      @keyframes exKneeR { 0%,50% { transform: rotate(0deg); } 75% { transform: rotate(-60deg); } }
      @keyframes exMCL { 0%,100% { transform: translateX(0); } 50% { transform: translateX(12px); } }
      @keyframes exMCR { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-12px); } }
    `;
    document.head.appendChild(style);
  }, []);

  const stk = { stroke: "#C4B5FD", strokeWidth: 2.5, strokeLinecap: "round", fill: "none" };
  const head = (cx, cy, r) => React.createElement("circle", { cx, cy, r: r || 5, fill: "#C4B5FD" });

  const figures = {
    plank: () => (
      <g style={{ animation: "exTremor 0.3s infinite" }}>
        {head(20, 38)}{/* body horizontal */}
        <line x1="25" y1="40" x2="55" y2="42" {...stk} />
        {/* arms down */}<line x1="28" y1="40" x2="25" y2="55" {...stk} />
        {/* legs back */}<line x1="55" y1="42" x2="62" y2="55" {...stk} />
        <line x1="55" y1="42" x2="60" y2="56" {...stk} />
      </g>
    ),
    pushups: () => (
      <g style={{ animation: "exPushup 1.5s ease-in-out infinite" }}>
        {head(20, 32)}{/* body */}
        <line x1="25" y1="35" x2="55" y2="38" {...stk} />
        {/* arms */}<line x1="28" y1="35" x2="25" y2="50" {...stk} />
        {/* legs */}<line x1="55" y1="38" x2="65" y2="52" {...stk} />
        <line x1="55" y1="38" x2="63" y2="53" {...stk} />
      </g>
    ),
    situps: () => (
      <g>
        {/* legs flat */}<line x1="45" y1="55" x2="62" y2="55" {...stk} />
        <line x1="62" y1="55" x2="65" y2="48" {...stk} />{/* bent knee */}
        <g style={{ transformOrigin: "45px 55px", animation: "exSitup 2s ease-in-out infinite" }}>
          {head(30, 35)}{/* torso */}
          <line x1="33" y1="38" x2="45" y2="55" {...stk} />
          {/* arms reaching */}<line x1="33" y1="38" x2="40" y2="32" {...stk} />
        </g>
      </g>
    ),
    squats: () => (
      <g style={{ animation: "exSquat 2s ease-in-out infinite" }}>
        {head(40, 12)}
        {/* torso */}<line x1="40" y1="17" x2="40" y2="40" {...stk} />
        {/* arms forward */}<line x1="40" y1="25" x2="52" y2="30" {...stk} />
        <line x1="40" y1="25" x2="28" y2="30" {...stk} />
        {/* legs */}<line x1="40" y1="40" x2="32" y2="58" {...stk} />
        <line x1="40" y1="40" x2="48" y2="58" {...stk} />
        {/* feet */}<line x1="32" y1="58" x2="28" y2="58" {...stk} />
        <line x1="48" y1="58" x2="52" y2="58" {...stk} />
      </g>
    ),
    lunges: () => (
      <g style={{ animation: "exLunge 2s ease-in-out infinite" }}>
        {head(38, 10)}
        <line x1="38" y1="15" x2="38" y2="38" {...stk} />
        {/* arms on hips */}<line x1="38" y1="24" x2="32" y2="32" {...stk} />
        <line x1="38" y1="24" x2="44" y2="32" {...stk} />
        {/* front leg bent */}<line x1="38" y1="38" x2="28" y2="52" {...stk} />
        <line x1="28" y1="52" x2="30" y2="60" {...stk} />
        {/* back leg */}<line x1="38" y1="38" x2="52" y2="50" {...stk} />
        <line x1="52" y1="50" x2="56" y2="60" {...stk} />
      </g>
    ),
    burpees: () => (
      <g style={{ transformOrigin: "40px 40px", animation: "exBurpee 3s ease-in-out infinite" }}>
        {head(40, 14)}
        <line x1="40" y1="19" x2="40" y2="40" {...stk} />
        <line x1="40" y1="26" x2="30" y2="34" {...stk} />
        <line x1="40" y1="26" x2="50" y2="34" {...stk} />
        <line x1="40" y1="40" x2="32" y2="58" {...stk} />
        <line x1="40" y1="40" x2="48" y2="58" {...stk} />
      </g>
    ),
    chair_pose: () => (
      <g style={{ animation: "exTremor 0.3s infinite" }}>
        {head(40, 8)}
        <line x1="40" y1="13" x2="40" y2="35" {...stk} />
        {/* arms up */}<line x1="40" y1="20" x2="32" y2="8" {...stk} />
        <line x1="40" y1="20" x2="48" y2="8" {...stk} />
        {/* sitting legs */}<line x1="40" y1="35" x2="32" y2="48" {...stk} />
        <line x1="32" y1="48" x2="30" y2="60" {...stk} />
        <line x1="40" y1="35" x2="48" y2="48" {...stk} />
        <line x1="48" y1="48" x2="50" y2="60" {...stk} />
      </g>
    ),
    jumping_jacks: () => (
      <g>
        {head(40, 12)}
        <line x1="40" y1="17" x2="40" y2="40" {...stk} />
        {/* left arm */}<g style={{ transformOrigin: "40px 22px", animation: "exJJ 1s ease-in-out infinite" }}>
          <line x1="40" y1="22" x2="26" y2="32" {...stk} />
        </g>
        {/* right arm */}<g style={{ transformOrigin: "40px 22px", animation: "exJJarmR 1s ease-in-out infinite" }}>
          <line x1="40" y1="22" x2="54" y2="32" {...stk} />
        </g>
        {/* left leg */}<g style={{ transformOrigin: "40px 40px", animation: "exJJleg 1s ease-in-out infinite" }}>
          <line x1="40" y1="40" x2="30" y2="60" {...stk} />
        </g>
        {/* right leg */}<g style={{ transformOrigin: "40px 40px", animation: "exJJlegR 1s ease-in-out infinite" }}>
          <line x1="40" y1="40" x2="50" y2="60" {...stk} />
        </g>
      </g>
    ),
    high_knees: () => (
      <g>
        {head(40, 10)}
        <line x1="40" y1="15" x2="40" y2="38" {...stk} />
        <line x1="40" y1="22" x2="32" y2="30" {...stk} />
        <line x1="40" y1="22" x2="48" y2="30" {...stk} />
        {/* left leg - high knee */}<g style={{ transformOrigin: "40px 38px", animation: "exKneeL 1.2s ease-in-out infinite" }}>
          <line x1="40" y1="38" x2="34" y2="56" {...stk} />
        </g>
        {/* right leg */}<g style={{ transformOrigin: "40px 38px", animation: "exKneeR 1.2s ease-in-out infinite" }}>
          <line x1="40" y1="38" x2="46" y2="56" {...stk} />
        </g>
      </g>
    ),
    mountain_climbers: () => (
      <g>
        {head(18, 32)}
        <line x1="23" y1="35" x2="50" y2="38" {...stk} />
        <line x1="26" y1="35" x2="22" y2="50" {...stk} />
        {/* alternating knee drives */}
        <g style={{ animation: "exMCL 1s ease-in-out infinite" }}>
          <line x1="50" y1="38" x2="42" y2="52" {...stk} />
        </g>
        <g style={{ animation: "exMCR 1s ease-in-out infinite" }}>
          <line x1="50" y1="38" x2="58" y2="52" {...stk} />
        </g>
      </g>
    ),
  };

  const fig = figures[exerciseId];
  if (!fig) return React.createElement("span", { style: { fontSize: s * 0.6 } }, "\u{1F3CB}");
  return (
    <svg width={s} height={s} viewBox="0 0 80 68" style={{ display: "inline-block" }}>
      <g transform={`scale(${1})`}>{fig()}</g>
    </svg>
  );
}

// Guided meditation scripts — "at" is percentage of total time (0-1)
const MEDITATION_SCRIPTS = {
  breath: [
    { at: 0.00, text: "Close your eyes gently. Let your hands rest in your lap." },
    { at: 0.03, text: "Take a deep breath in through your nose... feel your chest expand." },
    { at: 0.06, text: "Now slowly exhale through your mouth. Let everything go." },
    { at: 0.09, text: "Again — breathe in deeply... filling your lungs completely." },
    { at: 0.12, text: "And release... feel the tension leaving your body." },
    { at: 0.15, text: "Now let your breathing find its natural rhythm. Don't force it." },
    { at: 0.19, text: "Notice where you feel each breath most — your nostrils, chest, or belly." },
    { at: 0.23, text: "Focus all your attention on that one spot. Feel each inhale arrive." },
    { at: 0.27, text: "Feel each exhale depart. Like waves on a shore." },
    { at: 0.31, text: "If your mind wanders — and it will — gently bring it back. No judgment." },
    { at: 0.35, text: "Each breath is an anchor. Inhale... you are here. Exhale... you are now." },
    { at: 0.39, text: "Notice the tiny pause between breaths. That still point of peace." },
    { at: 0.43, text: "Let each breath grow slightly deeper. Slightly slower." },
    { at: 0.47, text: "Your breath is always with you. A constant companion through life." },
    { at: 0.51, text: "Feel the cool air entering... and the warm air leaving." },
    { at: 0.55, text: "With every exhale, release one more worry. Let it float away." },
    { at: 0.59, text: "With every inhale, draw in calm. Draw in stillness." },
    { at: 0.63, text: "You are not your thoughts. You are the awareness behind them." },
    { at: 0.67, text: "Keep returning to the breath. Patient. Gentle. Always welcoming." },
    { at: 0.71, text: "Feel the rhythm of your body. Your own quiet music." },
    { at: 0.75, text: "Let your breath become effortless. It knows what to do." },
    { at: 0.79, text: "Notice how peaceful your body feels. How still your mind has become." },
    { at: 0.83, text: "You've been doing beautifully. Stay with this feeling." },
    { at: 0.87, text: "Begin to deepen your breath again. Slowly returning." },
    { at: 0.91, text: "Feel the surface beneath you. The room around you." },
    { at: 0.95, text: "Take one final deep breath... and gently open your eyes." },
    { at: 0.98, text: "Carry this calm with you. Namaste." },
  ],
  body_scan: [
    { at: 0.00, text: "Lie still or sit comfortably. Close your eyes." },
    { at: 0.03, text: "Take three slow, deep breaths to settle in." },
    { at: 0.06, text: "We'll gently scan through your body, noticing each area." },
    { at: 0.09, text: "Bring your attention to the top of your head. The crown." },
    { at: 0.12, text: "Feel any tingling or warmth there. Just notice. Don't change it." },
    { at: 0.15, text: "Now move to your forehead. Soften any furrows. Let it smooth out." },
    { at: 0.18, text: "Move to your eyes. Let them rest heavy in their sockets." },
    { at: 0.21, text: "Relax your jaw. Let your tongue drop from the roof of your mouth." },
    { at: 0.24, text: "Feel your neck and throat. Release any tightness you find there." },
    { at: 0.27, text: "Move to your shoulders. They carry so much — let them drop now." },
    { at: 0.30, text: "Scan down your right arm. Upper arm... forearm... hand... fingertips." },
    { at: 0.33, text: "Now your left arm. Upper arm... forearm... hand... fingertips." },
    { at: 0.36, text: "Feel your hands. Notice any warmth or pulsing in your palms." },
    { at: 0.39, text: "Bring attention to your chest. Feel it rise and fall." },
    { at: 0.42, text: "Notice your heartbeat. Steady. Faithful. Always working for you." },
    { at: 0.45, text: "Move to your upper back. Between the shoulder blades." },
    { at: 0.48, text: "Now your lower back. Breathe warmth into any stiff areas." },
    { at: 0.51, text: "Scan your belly. Let it be soft. No holding, no tensing." },
    { at: 0.54, text: "Notice your hips. The bowl of your pelvis. Let it be heavy." },
    { at: 0.57, text: "Move to your right thigh... knee... calf... foot... toes." },
    { at: 0.60, text: "Now your left thigh... knee... calf... foot... toes." },
    { at: 0.63, text: "Feel the soles of your feet. Your connection to the earth." },
    { at: 0.66, text: "Now expand your awareness to your whole body at once." },
    { at: 0.70, text: "Feel yourself as one complete, connected being. Whole and alive." },
    { at: 0.74, text: "Notice how different your body feels now compared to when we began." },
    { at: 0.78, text: "If any area still holds tension, breathe into it gently." },
    { at: 0.82, text: "Your body is your home. Thank it for carrying you through each day." },
    { at: 0.86, text: "Let this feeling of full-body awareness settle deep within you." },
    { at: 0.90, text: "Begin to wiggle your fingers and toes. Slowly awakening." },
    { at: 0.94, text: "Take a deep breath. Stretch gently if it feels right." },
    { at: 0.97, text: "Open your eyes when ready. You are refreshed and restored." },
  ],
  loving_kindness: [
    { at: 0.00, text: "Settle into a comfortable position. Close your eyes softly." },
    { at: 0.03, text: "Place your hand over your heart if it feels right." },
    { at: 0.06, text: "We'll cultivate feelings of warmth and love, starting with yourself." },
    { at: 0.09, text: "Picture yourself clearly. As you are right now." },
    { at: 0.12, text: "Silently repeat: May I be happy. May I be healthy." },
    { at: 0.15, text: "May I be safe. May I live with ease." },
    { at: 0.18, text: "Feel those words settle in. You deserve this kindness." },
    { at: 0.21, text: "Again: May I be happy... May I be healthy..." },
    { at: 0.24, text: "May I be safe... May I live with ease..." },
    { at: 0.27, text: "Now think of someone you love deeply. See their face clearly." },
    { at: 0.30, text: "Direct these wishes to them: May you be happy. May you be healthy." },
    { at: 0.33, text: "May you be safe. May you live with ease." },
    { at: 0.36, text: "Feel the warmth radiating from your heart toward them." },
    { at: 0.39, text: "Again: May you be happy... May you be healthy..." },
    { at: 0.42, text: "Now think of someone neutral — an acquaintance, a stranger you've seen." },
    { at: 0.45, text: "Send them the same kindness: May you be happy. May you be healthy." },
    { at: 0.48, text: "May you be safe. May you live with ease." },
    { at: 0.51, text: "Everyone you pass on the street has struggles you'll never see." },
    { at: 0.54, text: "Now — the hardest part. Think of someone difficult in your life." },
    { at: 0.57, text: "This doesn't mean you approve of their actions. Just let go of the weight." },
    { at: 0.60, text: "May you be happy. May you be healthy. May you be safe." },
    { at: 0.63, text: "Forgiveness is a gift you give yourself. Release what you can." },
    { at: 0.66, text: "Now expand outward. All beings everywhere." },
    { at: 0.69, text: "May all beings be happy. May all beings be healthy." },
    { at: 0.72, text: "May all beings be safe. May all beings live with ease." },
    { at: 0.75, text: "Feel yourself connected to every living thing. One web of life." },
    { at: 0.78, text: "Let this love radiate outward in all directions. Without limit." },
    { at: 0.82, text: "Return to yourself. Feel the warmth in your chest." },
    { at: 0.86, text: "You've just made the world a little softer with your intention." },
    { at: 0.90, text: "Take a deep breath. Let gratitude fill the space." },
    { at: 0.94, text: "Gently release the practice. Keep the feeling." },
    { at: 0.97, text: "Open your eyes. Carry this kindness into your day." },
  ],
  visualization: [
    { at: 0.00, text: "Close your eyes. Take a few deep breaths to arrive fully here." },
    { at: 0.03, text: "We're going on a journey. Let your imagination be vivid." },
    { at: 0.06, text: "Imagine you're standing at the edge of a quiet forest." },
    { at: 0.09, text: "The air is cool and fresh. Smell the pine and damp earth." },
    { at: 0.12, text: "A soft path stretches ahead, dappled with golden sunlight." },
    { at: 0.15, text: "Begin walking. Feel the soft ground beneath your feet." },
    { at: 0.18, text: "Hear birds singing high in the canopy. Leaves rustling gently." },
    { at: 0.21, text: "The trees grow taller. Light filters through in shimmering columns." },
    { at: 0.24, text: "You come to a stream. Clear water flowing over smooth stones." },
    { at: 0.27, text: "Kneel down. Cup the cool water in your hands. Drink." },
    { at: 0.30, text: "As you drink, feel it washing away stress and worry." },
    { at: 0.33, text: "Stand and continue. The path leads uphill now, gently." },
    { at: 0.36, text: "With each step, you feel lighter. Burdens falling away." },
    { at: 0.39, text: "The trees open up. You step into a sunlit meadow." },
    { at: 0.42, text: "Wildflowers sway in a warm breeze. Colors everywhere." },
    { at: 0.45, text: "Find a spot in the center. Lie down in the soft grass." },
    { at: 0.48, text: "Look up at the vast sky. Clouds drifting slowly." },
    { at: 0.51, text: "Each cloud carries a thought. Watch them float by without holding on." },
    { at: 0.54, text: "Feel the sun warming your face. The earth supporting your body." },
    { at: 0.57, text: "You are completely safe here. This place is yours." },
    { at: 0.60, text: "A gentle light begins to glow in your chest. Warm and golden." },
    { at: 0.63, text: "It grows brighter with each breath. Filling your whole body." },
    { at: 0.66, text: "This light is your strength. Your peace. Always inside you." },
    { at: 0.69, text: "Let it expand beyond your body. Into the meadow. Into the sky." },
    { at: 0.72, text: "You are connected to everything. Part of something immense and beautiful." },
    { at: 0.75, text: "Rest here for a moment. Feel the completeness of this place." },
    { at: 0.79, text: "Now slowly sit up. The meadow thanks you for visiting." },
    { at: 0.83, text: "Walk back down the path. The forest welcomes your return." },
    { at: 0.87, text: "The stream, the birds, the dappled light — all saying goodbye." },
    { at: 0.91, text: "You reach the forest edge. Take a deep breath of that pine air." },
    { at: 0.95, text: "Feel your body in this room. Fingers, toes. Slowly return." },
    { at: 0.98, text: "Open your eyes. The peace of the forest stays with you." },
  ],
  mindfulness: [
    { at: 0.00, text: "Sit comfortably. Let your eyes close or soften your gaze downward." },
    { at: 0.03, text: "Take three deep breaths. Arriving fully in this moment." },
    { at: 0.06, text: "Mindfulness is simple: notice what is, without wishing it different." },
    { at: 0.09, text: "Start with sounds. What can you hear right now? Near and far." },
    { at: 0.12, text: "Don't label them as good or bad. Just sounds arising and fading." },
    { at: 0.15, text: "Now notice physical sensations. Temperature on your skin. Weight in your seat." },
    { at: 0.18, text: "The feeling of fabric on your body. Air moving across your face." },
    { at: 0.21, text: "Notice without reacting. You are an observer, calm and curious." },
    { at: 0.24, text: "Now turn inward. What emotions are present? Name them gently." },
    { at: 0.27, text: "Anxious? Calm? Restless? Sad? Content? Just notice. All are welcome." },
    { at: 0.30, text: "Emotions are like weather. They pass through. You are the sky." },
    { at: 0.33, text: "Now observe your thoughts. Watch them like cars on a distant highway." },
    { at: 0.36, text: "You don't need to get in any car. Just watch them pass." },
    { at: 0.39, text: "When you catch yourself thinking, smile. You just became aware." },
    { at: 0.42, text: "That moment of noticing IS mindfulness. You're doing it perfectly." },
    { at: 0.45, text: "Return to your breath. The simplest anchor to now." },
    { at: 0.48, text: "This breath. This moment. This is all there ever really is." },
    { at: 0.51, text: "Expand your awareness. Hold everything at once — sounds, body, breath." },
    { at: 0.54, text: "This wide-open awareness. Spacious. Accepting. Peaceful." },
    { at: 0.58, text: "If discomfort arises, don't run from it. Lean in gently." },
    { at: 0.62, text: "Behind every discomfort is something asking to be seen. Be brave." },
    { at: 0.66, text: "Let go of the need to fix anything. Right now, nothing is broken." },
    { at: 0.70, text: "You are exactly where you need to be. Doing exactly enough." },
    { at: 0.74, text: "Feel the aliveness in your body. The miracle of simply being here." },
    { at: 0.78, text: "Every moment is fresh. Every breath is new. Nothing repeats." },
    { at: 0.82, text: "This ordinary moment IS the extraordinary life you've been given." },
    { at: 0.86, text: "Begin to bring your attention back. Gently, like waking from a nap." },
    { at: 0.90, text: "Notice the room. Sounds returning. The world welcoming you back." },
    { at: 0.94, text: "Take a deep, nourishing breath. Feel gratitude for this pause." },
    { at: 0.97, text: "Open your eyes. Bring this presence into whatever comes next." },
  ],
  mantra: [
    { at: 0.00, text: "Find a comfortable seat. Spine tall but not rigid. Eyes closed." },
    { at: 0.03, text: "Take three centering breaths. Arriving in stillness." },
    { at: 0.06, text: "Mantra meditation uses a repeated phrase to focus and calm the mind." },
    { at: 0.09, text: "Choose a mantra that resonates. Or use: \"I am at peace.\"" },
    { at: 0.12, text: "Begin repeating it silently. Slowly. With each exhale." },
    { at: 0.15, text: "I am at peace... I am at peace... I am at peace..." },
    { at: 0.18, text: "Let the words become a gentle rhythm. Like a heartbeat." },
    { at: 0.21, text: "Don't rush. Let each repetition be complete before the next." },
    { at: 0.24, text: "I am at peace... Feel the meaning of each word." },
    { at: 0.27, text: "\"I\" — acknowledging yourself, here, present." },
    { at: 0.30, text: "\"am\" — existing, alive, in this very moment." },
    { at: 0.33, text: "\"at peace\" — choosing calm. Claiming it as yours." },
    { at: 0.36, text: "Continue repeating. Let the mantra carry you deeper." },
    { at: 0.39, text: "I am at peace... I am at peace..." },
    { at: 0.42, text: "If thoughts interrupt, simply return to the words. No frustration." },
    { at: 0.45, text: "The mantra is a thread back to center. Always available." },
    { at: 0.48, text: "Let the repetition become almost automatic. Effortless." },
    { at: 0.51, text: "I am at peace... Feel it resonating in your chest." },
    { at: 0.54, text: "Some traditions say the mantra eventually repeats itself." },
    { at: 0.57, text: "You're not saying it — you're listening to it." },
    { at: 0.60, text: "I am at peace... I am at peace..." },
    { at: 0.63, text: "Let the spaces between repetitions grow. Savor the silence." },
    { at: 0.66, text: "In that silence between words, peace already exists." },
    { at: 0.69, text: "I am at peace... The words become softer now." },
    { at: 0.72, text: "Almost a whisper in your mind. Barely there." },
    { at: 0.75, text: "Let the mantra fade to silence if it wants to. That's okay." },
    { at: 0.78, text: "Sit in whatever remains. The feeling the words left behind." },
    { at: 0.82, text: "This is the fruit of practice — peace that needs no words." },
    { at: 0.86, text: "If the mantra returns, welcome it. If silence stays, welcome that." },
    { at: 0.90, text: "Begin to return. Feel your body. The room around you." },
    { at: 0.94, text: "Take a deep breath. Carry your mantra with you today." },
    { at: 0.97, text: "Open your eyes. I am at peace. And so it is." },
  ],
};

function getMeditationPrompt(medTypeId, elapsed, totalSeconds) {
  const script = MEDITATION_SCRIPTS[medTypeId];
  if (!script) return "";
  const pct = elapsed / totalSeconds;
  let current = "";
  for (let i = 0; i < script.length; i++) {
    if (pct >= script[i].at) current = script[i].text;
    else break;
  }
  return current;
}

//     SOUND PLAYER                                 
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "alarm") { osc.frequency.value = 880; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.3); }
    else if (type === "complete") { osc.frequency.value = 523; gain.gain.value = 0.12; osc.start(); osc.stop(ctx.currentTime + 0.2); }
    else if (type === "levelup") { osc.frequency.value = 660; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.5); }
    else if (type === "bell") { osc.type = "sine"; osc.frequency.value = 396; gain.gain.value = 0.08; gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2); osc.start(); osc.stop(ctx.currentTime + 2); }
    else if (type === "countbeep") { osc.frequency.value = 600; gain.gain.value = 0.18; osc.start(); osc.stop(ctx.currentTime + 0.15); }
    else if (type === "countgo") { osc.frequency.value = 440; gain.gain.value = 0.22; gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.5); }
  } catch(e) {}
}

//     AMBIENT AUDIO ENGINE
function createNoiseBuffer(ctx, type, seconds) {
  const sr = ctx.sampleRate;
  const len = sr * (seconds || 2);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  if (type === "brown") {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.loop = true;
  return source;
}

class AmbientAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.nodes = [];
    this.timers = [];
    this.volume = 0.5;
    this.muted = false;
    this.playing = false;
  }

  start(medTypeId, fadeIn) {
    this.ctx.resume();
    const builder = {
      breath: () => this._breathScape(),
      body_scan: () => this._bodyScanScape(),
      loving_kindness: () => this._lovingKindnessScape(),
      visualization: () => this._visualizationScape(),
      mindfulness: () => this._mindfulnessScape(),
      mantra: () => this._mantraScape(),
    }[medTypeId];
    if (builder) builder();
    this.playing = true;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + (fadeIn || 3));
  }

  stop(fadeOut) {
    if (!this.playing) return;
    this.playing = false;
    const fo = fadeOut || 3;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fo);
    setTimeout(() => this.destroy(), fo * 1000 + 200);
  }

  setVolume(v) {
    this.volume = v;
    if (!this.muted && this.playing) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.1);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.playing) {
      const target = this.muted ? 0 : this.volume;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.2);
    }
    return this.muted;
  }

  destroy() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.nodes.forEach(n => { try { n.stop(); } catch(e) {} try { n.disconnect(); } catch(e) {} });
    this.nodes = [];
    try { this.master.disconnect(); } catch(e) {}
    try { this.ctx.close(); } catch(e) {}
  }

  _osc(type, freq, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(this.master);
    o.start(); this.nodes.push(o, g);
    return { osc: o, gain: g };
  }

  _noise(type, gain, filterType, filterFreq, filterQ) {
    const src = createNoiseBuffer(this.ctx, type, 2);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (filterType) {
      const f = this.ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = filterFreq || 1000; if (filterQ) f.Q.value = filterQ;
      src.connect(f); f.connect(g); this.nodes.push(f);
    } else {
      src.connect(g);
    }
    g.connect(this.master);
    src.start(); this.nodes.push(src, g);
    return { source: src, gain: g };
  }

  // Breath Focus: deep oceanic drone
  _breathScape() {
    this._osc("sine", 60, 0.25);
    this._osc("sine", 120, 0.12);
    this._osc("sine", 180, 0.06);
    this._noise("brown", 0.10, "lowpass", 200);
  }

  // Body Scan: sweeping filtered noise
  _bodyScanScape() {
    const src = createNoiseBuffer(this.ctx, "white", 2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 200; filter.Q.value = 5;
    const g = this.ctx.createGain(); g.gain.value = 0.18;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(); this.nodes.push(src, filter, g);
    this._osc("sine", 174, 0.10);
    // Sweep filter between 200-800Hz
    const sweep = () => {
      const now = this.ctx.currentTime;
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      const target = filter.frequency.value < 500 ? 800 : 200;
      filter.frequency.linearRampToValueAtTime(target, now + 20);
      this.timers.push(setTimeout(sweep, 20000));
    };
    sweep();
  }

  // Loving Kindness: warm major chord
  _lovingKindnessScape() {
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 600;
    filter.connect(this.master); this.nodes.push(filter);
    [[261.6, 3], [329.6, -3], [392.0, 2], [523.2, -2]].forEach(([freq, det], i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = freq; o.detune.value = det;
      g.gain.value = i < 3 ? 0.09 : 0.035;
      o.connect(g); g.connect(filter);
      o.start(); this.nodes.push(o, g);
    });
  }

  // Visualization: binaural beats + depth
  _visualizationScape() {
    // Left ear 200Hz
    const oL = this.ctx.createOscillator();
    const gL = this.ctx.createGain();
    const panL = this.ctx.createStereoPanner();
    oL.type = "sine"; oL.frequency.value = 200; gL.gain.value = 0.12; panL.pan.value = -1;
    oL.connect(gL); gL.connect(panL); panL.connect(this.master);
    oL.start(); this.nodes.push(oL, gL, panL);
    // Right ear 210Hz (10Hz alpha binaural)
    const oR = this.ctx.createOscillator();
    const gR = this.ctx.createGain();
    const panR = this.ctx.createStereoPanner();
    oR.type = "sine"; oR.frequency.value = 210; gR.gain.value = 0.12; panR.pan.value = 1;
    oR.connect(gR); gR.connect(panR); panR.connect(this.master);
    oR.start(); this.nodes.push(oR, gR, panR);
    // Brown noise pad
    this._noise("brown", 0.12, "lowpass", 400);
  }

  // Mindfulness: rain-like texture
  _mindfulnessScape() {
    // High rain hiss
    const n1 = this._noise("white", 0.07, "highpass", 1000);
    // Drizzle texture
    this._noise("white", 0.05, "bandpass", 3000, 1);
    // LFO for gentle ebb and flow on rain
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain); lfoGain.connect(n1.gain.gain);
    lfo.start(); this.nodes.push(lfo, lfoGain);
  }

  // Mantra: singing bowl resonance
  _mantraScape() {
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.08; lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain); lfo.start(); this.nodes.push(lfo, lfoGain);
    [[ 396, 0.10 ], [ 793, 0.05 ], [ 1188, 0.025 ]].forEach(([freq, vol]) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(this.master);
      lfoGain.connect(g.gain);
      o.start(); this.nodes.push(o, g);
    });
  }
}

function MissionPopup({ mission, bonusPoints, onClose }) {
  if (!mission) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, borderRadius: 24, padding: "30px 24px", background: "linear-gradient(145deg, #1a1104, #2d1400)", border: "1px solid rgba(255,179,71,0.28)", textAlign: "center", boxShadow: "0 28px 80px rgba(0,0,0,0.42)" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{mission.emoji}</div>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#FFB347", marginBottom: 8 }}>DAILY MISSION CLEARED</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#FFD700", marginBottom: 10 }}>{mission.title}</div>
        <div style={{ fontSize: 14, color: "#F2E4D3", lineHeight: 1.5, marginBottom: 16 }}>{mission.description}</div>
        <div style={{ display: "inline-block", padding: "12px 28px", borderRadius: 999, background: "linear-gradient(135deg, #FF4D00, #FFD700)", color: "#000", fontSize: 26, fontWeight: 900, marginBottom: 18 }}>
          +{bonusPoints}
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: 1.4 }}>
          CONTINUE
        </button>
      </div>
    </div>
  );
}

//     SETUP SCREEN                                 
function DailySetupScreen({ onComplete, onAccountDeleted, settings, user, lang, setLang }) {
  const t = useT(lang);
  const [interval, setInterval_] = useState(ALERT_INTERVAL_OPTIONS.some((option) => option.value === settings?.intervalMinutes) ? settings.intervalMinutes : 45);
  const [duration, setDuration] = useState(settings?.duration || 2);
  const [exerciseMode, setExerciseMode] = useState(
    settings?.selectedExercises?.length && settings.selectedExercises.length < EXERCISES.length ? "custom" : "all"
  );
  const [selectedExercises, setSelectedExercises] = useState(settings?.selectedExercises || EXERCISES.map(e => e.id));
  const [activeDays, setActiveDays] = useState(settings?.activeDays || ALL_DAYS);
  const [alarmMessage, setAlarmMessage] = useState(settings?.alarmMessage || "Let's Be Our Best!");
  const [startHour, setStartHour] = useState(settings?.startHour || 8);
  const [endHour, setEndHour] = useState(settings?.endHour || 17);
  const [buddyUsername, setBuddyUsername] = useState(settings?.buddyUsername || "");
  const [teamName, setTeamName] = useState(settings?.teamName || "");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const toggleDay = (key) => {
    setActiveDays(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]);
  };
  const toggleExercise = (id) => {
    setSelectedExercises(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleActivate = async () => {
    const s = {
      duration,
      intervalMinutes: interval,
      selectedExercises: exerciseMode === "all" ? EXERCISES.map(e => e.id) : selectedExercises,
      activeDays,
      alarmMessage,
      startHour,
      endHour,
      buddyUsername,
      teamName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || settings?.timezone || "UTC",
    };
    try { await api("/api/user/settings", { method: "PUT", body: s }); } catch(e) { console.error("Failed to save settings:", e); }
    onComplete(s);
  };

  const handleDeleteAccount = async () => {
    const expectedUsername = String(user?.username || "").trim().toLowerCase();
    const typedUsername = deleteConfirmation.trim().toLowerCase();
    if (!expectedUsername || typedUsername !== expectedUsername) {
      window.alert(t("deleteAccountMismatch"));
      return;
    }

    if (!window.confirm(`${t("deleteAccountLabel")}?\n\n${t("dangerZoneHint")}`)) {
      return;
    }

    setDeletingAccount(true);
    try {
      await api("/api/user/account", { method: "DELETE", body: { confirmation: deleteConfirmation.trim() } });
      window.alert(t("deleteAccountSuccess"));
      onAccountDeleted?.();
    } catch (error) {
      window.alert(error.message || "Failed to delete account");
    } finally {
      setDeletingAccount(false);
    }
  };

  const sectionStyle = { marginBottom: 24 };
  const labelStyle = { fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#FF8C00", marginBottom: 6 };
  const hintStyle = { fontSize: 11, color: "#555", marginBottom: 12 };
  const optBtn = (active) => ({ padding: "10px 16px", background: active ? "rgba(255,77,0,0.15)" : "rgba(255,255,255,0.04)", border: active ? "1px solid rgba(255,77,0,0.3)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: active ? "#FF8C00" : "#666", fontWeight: 600, fontSize: 13 });
  const linkStyle = { color: "#FFD700", textDecoration: "none", fontSize: 13, fontWeight: 700, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ minHeight: "100vh", maxWidth: 420, margin: "0 auto", padding: "20px 16px", overflowY: "auto" }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, textAlign: "center", marginBottom: 24, color: "#FFD700" }}>{t("dailySetup")}</h2>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("alertInterval")}</div>
        <div style={hintStyle}>{t("alertIntervalHint")}</div>
        <select value={interval} onChange={e => setInterval_(Number(e.target.value))}
          style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23FF8C00' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center" }}>
          {ALERT_INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("exerciseDuration")}</div>
        <div style={hintStyle}>{t("durationHint")}</div>
        <select value={duration} onChange={e => setDuration(e.target.value === "random" ? "random" : Number(e.target.value))}
          style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23FF8C00' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center" }}>
          <option value="random">{"\ud83c\udfb2"} Random -- surprise me!</option>
          {DURATION_OPTIONS.map(d => (
            <option key={d} value={d}>{fmtDuration(d)} -- {"\u00d7"}{DURATION_MULTIPLIERS[d]} {t("multiplier")}</option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("beastModeHours")}</div>
        <div style={hintStyle}>{t("hoursHint")}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, letterSpacing: 1 }}>{t("start")}</div>
            <select value={startHour} onChange={e => setStartHour(Number(e.target.value))}
              style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23FF8C00' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
              {Array.from({length: 24}, (_, i) => <option key={i} value={i}>{i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i-12}:00 PM`}</option>)}
            </select>
          </div>
          <div style={{ color: "#555", fontSize: 18, marginTop: 18 }}>{"\u2192"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, letterSpacing: 1 }}>{t("end")}</div>
            <select value={endHour} onChange={e => setEndHour(Number(e.target.value))}
              style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23FF8C00' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
              {Array.from({length: 24}, (_, i) => <option key={i} value={i}>{i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i-12}:00 PM`}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("activeDays")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {DAYS_OF_WEEK.map(d => (
            <button key={d.key} onClick={() => toggleDay(d.key)}
              style={{ width: 42, height: 42, borderRadius: 12, background: activeDays.includes(d.key) ? "rgba(255,77,0,0.2)" : "rgba(255,255,255,0.04)", border: activeDays.includes(d.key) ? "1px solid rgba(255,77,0,0.4)" : "1px solid rgba(255,255,255,0.08)", color: activeDays.includes(d.key) ? "#FF8C00" : "#555", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("exercises")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setExerciseMode("all")} style={optBtn(exerciseMode === "all")}>{t("allRandom")}</button>
          <button onClick={() => setExerciseMode("custom")} style={optBtn(exerciseMode === "custom")}>{t("customPick")}</button>
        </div>
        {exerciseMode === "custom" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXERCISES.map(ex => (
              <button key={ex.id} onClick={() => toggleExercise(ex.id)}
                style={{ padding: "8px 14px", background: selectedExercises.includes(ex.id) ? "rgba(255,77,0,0.12)" : "rgba(255,255,255,0.03)", border: selectedExercises.includes(ex.id) ? "1px solid rgba(255,77,0,0.25)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: selectedExercises.includes(ex.id) ? "#FF8C00" : "#555", fontSize: 13, fontWeight: 600 }}>
                {ex.emoji} {ex.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("alarmMessage")}</div>
        <input value={alarmMessage} onChange={e => setAlarmMessage(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14 }} />
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("buddyUsername")}</div>
        <div style={hintStyle}>{t("buddyUsernameHint")}</div>
        <input value={buddyUsername} onChange={e => setBuddyUsername(e.target.value)}
          placeholder="teammate123"
          style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14 }} />
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("teamName")}</div>
        <div style={hintStyle}>{t("teamNameHint")}</div>
        <input value={teamName} onChange={e => setTeamName(e.target.value)}
          placeholder="Desk Ninjas"
          style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14 }} />
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("language")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{code:"en",label:"English"},{code:"es",label:"Espa\u00f1ol"},{code:"ja",label:"\u65E5\u672C\u8A9E"}].map(l => (
            <button key={l.code} onClick={() => setLang(l.code, { syncRemote: true })}
              style={optBtn(lang === l.code)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleActivate}
        style={{ width: "100%", padding: "18px", background: "linear-gradient(135deg, #FF4D00, #FF8C00)", color: "#fff", border: "none", borderRadius: 16, fontSize: 17, fontWeight: 900, letterSpacing: 2, marginBottom: 40 }}>
        {t("activateBeast")}
      </button>

      <div style={sectionStyle}>
        <div style={labelStyle}>{t("support")}</div>
        <div style={hintStyle}>{t("accountLinksHint")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/support" target="_blank" rel="noreferrer" style={linkStyle}>{t("support")}</a>
          <a href="/privacy" target="_blank" rel="noreferrer" style={linkStyle}>{t("privacyPolicy")}</a>
          <a href="/delete-account" target="_blank" rel="noreferrer" style={linkStyle}>{t("deleteAccountPage")}</a>
        </div>
      </div>

      <div style={{ ...sectionStyle, padding: "16px", borderRadius: 18, background: "rgba(255,77,0,0.06)", border: "1px solid rgba(255,77,0,0.16)" }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>{t("dangerZone")}</div>
        <div style={{ ...hintStyle, marginBottom: 12 }}>{t("dangerZoneHint")}</div>
        <div style={{ fontSize: 12, color: "#FFB18A", marginBottom: 8 }}>{t("deleteAccountHint")}</div>
        <input
          value={deleteConfirmation}
          onChange={e => setDeleteConfirmation(e.target.value)}
          placeholder={t("deleteAccountPlaceholder")}
          style={{ width: "100%", padding: "12px 14px", background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff", fontSize: 14, marginBottom: 12 }}
        />
        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
          style={{ width: "100%", padding: "14px", background: deletingAccount ? "rgba(255,107,107,0.35)" : "rgba(255,107,107,0.18)", color: "#FFD5D5", border: "1px solid rgba(255,107,107,0.35)", borderRadius: 14, fontSize: 13, fontWeight: 900, letterSpacing: 1.6, opacity: deletingAccount ? 0.7 : 1 }}
        >
          {deletingAccount ? "..." : t("deleteAccountForever")}
        </button>
      </div>
    </div>
  );
}

//     ALARM POPUP                                  
function AlarmPopup({ prompt, exercise, duration, onStart, onSkip }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 50); }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #1a0a00, #2d1400)", borderRadius: 24, padding: "32px 24px", maxWidth: 380, width: "100%", textAlign: "center", border: "2px solid rgba(255,77,0,0.4)", animation: "glow 2s infinite", opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.9)", transition: "all 0.3s ease" }}>
        <div style={{ fontSize: 14, color: "#888", marginBottom: 8, letterSpacing: 2 }}>  BEAST MODE</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#FFD700", marginBottom: 8 }}>{prompt?.title || "Time to move!"}</div>
        {prompt?.subtitle && <div style={{ fontSize: 13, color: "#F3D8B8", lineHeight: 1.45, marginBottom: 14 }}>{prompt.subtitle}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
          <ExerciseAnimation exerciseId={exercise.id} size={56} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{exercise.name}</div>
            <div style={{ fontSize: 13, color: "#FF8C00" }}>{calcPoints(exercise.basePoints, duration)} pts   {fmtDuration(duration)}</div>
          </div>
        </div>
        {prompt?.chips?.length ? (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {prompt.chips.map((chip, index) => (
              <span key={index} style={{ padding: "6px 10px", background: "rgba(255,255,255,0.08)", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "#F6F1EA" }}>
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={onStart} style={{ flex: 2, padding: "14px 20px", background: "linear-gradient(135deg, #00C853, #00E676)", color: "#000", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>  START</button>
          <button onClick={onSkip} style={{ flex: 1, padding: "14px 16px", background: "rgba(255,255,255,0.08)", color: "#888", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 14, fontWeight: 600 }}>SKIP</button>
        </div>
      </div>
    </div>
  );
}

//     WORKOUT TIMER                                
function WorkoutTimer({ exercise, durationMinutes, onComplete, lang, streak = 1, sessionType = "alarm", sessionContext = null }) {
  const t = useT(lang || "en");
  const totalSeconds = Math.round(durationMinutes * 60);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [timeFraction, setTimeFraction] = useState(1);
  const [countdownNum, setCountdownNum] = useState(null);
  const intervalRef = useRef(null);

  // 3-2-1 countdown before start
  useEffect(() => {
    if (countdownNum === null) return;
    if (countdownNum > 0) {
      playSound("countbeep");
      const t = setTimeout(() => setCountdownNum(countdownNum - 1), 1000);
      return () => clearTimeout(t);
    } else {
      playSound("countgo");
      const t = setTimeout(() => { setCountdownNum(null); setStarted(true); }, 600);
      return () => clearTimeout(t);
    }
  }, [countdownNum]);

  useEffect(() => {
    if (started && !completed && !stoppedEarly) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            const pts = calcPoints(exercise.basePoints, durationMinutes);
            setEarnedPoints(pts);
            setCompleted(true);
            playSound("complete");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [started, completed, stoppedEarly]);

  const handleStopEarly = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const elapsed = totalSeconds - remaining;
    const fraction = elapsed / totalSeconds;
    setTimeFraction(fraction);
    setEarnedPoints(calcWorkoutPartialPointsFromBase(exercise.basePoints, durationMinutes, elapsed));
    setStoppedEarly(true);
  };

  const handleCollect = () => {
    const elapsedSeconds = completed ? totalSeconds : Math.max(0, totalSeconds - remaining);
    onComplete(earnedPoints, !stoppedEarly, { elapsedSeconds });
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = 1 - (remaining / totalSeconds);
  const circumference = 2 * Math.PI * 78;
  const awardedPoints = estimateAwardedPoints(earnedPoints, streak);
  const impactMessages = getSessionImpactMessages(sessionContext, {
    kind: "workout",
    sessionType,
    wasCompleted: completed,
    durationMinutes,
    awardedPoints,
    exerciseId: exercise.id,
    todayExerciseIds: sessionContext?.todayExerciseIds || [],
  });

  if (completed || stoppedEarly) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
        <div style={{ background: "linear-gradient(145deg, #0d0d1a, #1a1a2e)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(255,77,0,0.15)" }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>{completed ? "\ud83c\udfc6" : "\ud83d\udcaa"}</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2, color: "#FFD700", marginBottom: 16 }}>{completed ? t("crushedIt") : t("goodEffort")}</div>
          {awardedPoints > 0 && <div style={{ display: "inline-block", padding: "10px 28px", background: "linear-gradient(135deg, #FF4D00, #FFD700)", borderRadius: 30, fontSize: 24, fontWeight: 900, color: "#000", marginBottom: 12 }}>+{awardedPoints} pts</div>}
          {awardedPoints > 0 && streak > 1 && <div style={{ fontSize: 12, color: "#FFB347", marginBottom: 8 }}>x{getStreakMultiplier(streak).toFixed(2)} {t("streakBonusApplied")}</div>}
          {completed && <div style={{ fontSize: 13, color: "#00E676", marginBottom: 8 }}>{t("fullCompletion")}</div>}
          {stoppedEarly && awardedPoints > 0 && <div style={{ fontSize: 13, color: "#FF8C00", marginBottom: 8 }}>{Math.round(timeFraction * 100)}% completed   partial credit secured</div>}
          {stoppedEarly && earnedPoints === 0 && <div style={{ fontSize: 13, color: "#FF6B6B", marginBottom: 8 }}>{t("tryLonger")}</div>}
          {impactMessages.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 6, padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>
              <div style={{ fontSize: 11, letterSpacing: 1.6, color: "#8F8F97", marginBottom: 8 }}>{t("sessionShift")}</div>
              {impactMessages.map((message, index) => (
                <div key={index} style={{ fontSize: 13, color: "#F5E8D4", lineHeight: 1.45, marginBottom: index === impactMessages.length - 1 ? 0 : 8 }}>
                  {message}
                </div>
              ))}
            </div>
          )}
          <button onClick={handleCollect} style={{ width: "100%", maxWidth: 260, padding: "14px 28px", background: "linear-gradient(135deg, #FF4D00, #FF8C00)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, letterSpacing: 1, marginTop: 12 }}>{t("collectPoints")}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #0d0d1a, #1a1a2e)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(255,77,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          <ExerciseAnimation exerciseId={exercise.id} size={48} />
          <span style={{ fontSize: 20, fontWeight: 700 }}>{exercise.name}</span>
        </div>

        {countdownNum !== null ? (
          <div>
            <div style={{ fontSize: 96, fontWeight: 900, color: countdownNum === 0 ? "#00E676" : "#FFD700", fontFamily: "'Courier New', monospace", animation: "countPulse 1s ease-in-out", key: countdownNum }}>{countdownNum === 0 ? "GO!" : countdownNum}</div>
            <style>{`@keyframes countPulse { 0% { transform: scale(0.5); opacity: 0; } 30% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }`}</style>
          </div>
        ) : !started ? (
          <div>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#FFD700", fontFamily: "'Courier New', monospace", marginBottom: 24 }}>{fmtDuration(durationMinutes)}</div>
            <div style={{ fontSize: 13, color: "#FFB347", marginBottom: streak > 1 ? 6 : 18 }}>+{estimateAwardedPoints(calcPoints(exercise.basePoints, durationMinutes), streak)} pts</div>
            {streak > 1 && <div style={{ fontSize: 11, color: "#FFB347", marginBottom: 18 }}>x{getStreakMultiplier(streak).toFixed(2)} {t("streakBonusApplied")}</div>}
            <button onClick={() => setCountdownNum(3)}
              style={{ padding: "16px 40px", background: "linear-gradient(135deg, #00C853, #00E676)", color: "#000", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>{"\u25B6"} GO!</button>
          </div>
        ) : (
          <div>
            <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="78" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="90" cy="90" r="78" fill="none" stroke="url(#timerGrad)" strokeWidth="8"
                  strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
                  strokeLinecap="round" transform="rotate(-90 90 90)" style={{ transition: "stroke-dashoffset 1s linear" }} />
                <defs><linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FF4D00"/><stop offset="100%" stopColor="#FFD700"/></linearGradient></defs>
              </svg>
              <span style={{ position: "absolute", fontSize: 44, fontWeight: 900, fontFamily: "'Courier New', monospace", color: "#FFD700" }}>{mins}:{secs.toString().padStart(2, "0")}</span>
            </div>
            <button onClick={handleStopEarly}
              style={{ padding: "14px 28px", background: "linear-gradient(135deg, #FF4D00, #FF8C00)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, width: "100%", maxWidth: 260, letterSpacing: 1 }}>{t("finishEarly")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

//     EXTRA CREDIT MODAL                           
function ExtraCreditModal({ exercises, duration, onComplete, onClose, lang, streak = 1, sessionContext = null }) {
  const t = useT(lang || "en");
  const [selectedEx, setSelectedEx] = useState(null);
  const [selectedDur, setSelectedDur] = useState(duration === "random" ? 2 : duration);
  const [running, setRunning] = useState(false);

  if (running && selectedEx) {
    return <WorkoutTimer exercise={selectedEx} durationMinutes={selectedDur} lang={lang} streak={streak} sessionType="extra" sessionContext={sessionContext} onComplete={(pts, wasCompleted, meta) => { onComplete(pts, selectedEx, wasCompleted, selectedDur, meta); }} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #1a1a2e, #0d0d1a)", borderRadius: 24, padding: "28px 24px", maxWidth: 400, width: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid rgba(255,215,0,0.15)" }}>
        <div style={{ fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 4 }}>{t("extraCreditTitle")}</div>
        <div style={{ fontSize: 13, color: "#888", textAlign: "center", marginBottom: 20 }}>{t("pickExAndDur")}</div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#FFD700", letterSpacing: 1, marginBottom: 8 }}>{t("exercises")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXERCISES.map(ex => (
              <button key={ex.id} onClick={() => setSelectedEx(ex)}
                style={{ padding: "8px 12px", background: selectedEx?.id === ex.id ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)", border: selectedEx?.id === ex.id ? "1px solid rgba(255,215,0,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: selectedEx?.id === ex.id ? "#FFD700" : "#888", fontSize: 13, fontWeight: 600 }}>
                {ex.emoji} {ex.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#FFD700", letterSpacing: 1, marginBottom: 8 }}>{t("duration")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DURATION_OPTIONS.map(d => (
              <button key={d} onClick={() => setSelectedDur(d)}
                style={{ padding: "8px 14px", background: selectedDur === d ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)", border: selectedDur === d ? "1px solid rgba(255,215,0,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: selectedDur === d ? "#FFD700" : "#888", fontSize: 13, fontWeight: 600 }}>
                {fmtDuration(d)} <span style={{ fontSize: 10, opacity: 0.5 }}> {DURATION_MULTIPLIERS[d]}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedEx && <div style={{ textAlign: "center", fontSize: 13, color: "#FFD700", marginBottom: 16 }}>{calcPoints(selectedEx.basePoints, selectedDur)} {t("ptsIfCompleted")}</div>}

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#888", fontSize: 14, fontWeight: 600 }}>{t("back")}</button>
          <button onClick={() => selectedEx && setRunning(true)} disabled={!selectedEx}
            style={{ flex: 2, padding: "14px", background: selectedEx ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "#333", border: "none", borderRadius: 12, color: selectedEx ? "#000" : "#666", fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>  START</button>
        </div>
      </div>
    </div>
  );
}

//     MEDITATION TIMER                            
function MeditationTimer({ medType, durationMinutes, sessionNumber, onComplete, lang, streak = 1, sessionContext = null }) {
  const t = useT(lang || "en");
  const totalSeconds = durationMinutes * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const intervalRef = useRef(null);
  const breathRef = useRef(0);
  const [breathPhase, setBreathPhase] = useState("inhale");
  const ambientRef = useRef(null);
  const [ambientVol, setAmbientVol] = useState(() => parseFloat(localStorage.getItem("bm_ambientVol") || "0.8"));
  const [ambientMuted, setAmbientMuted] = useState(false);
  const [guidedText, setGuidedText] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem("bm_voiceGuide") !== "false");
  const lastSpokenRef = useRef("");

  // Cache the best available voice (voices load async in Chrome)
  const cachedVoiceRef = useRef(null);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      // Prefer high-quality neural/enhanced voices, then natural-sounding female voices
      cachedVoiceRef.current = voices.find(v => /microsoft.*(jenny|aria)|samantha.*enhanced|google uk english female/i.test(v.name))
        || voices.find(v => /samantha|karen|moira|tessa|daniel|google.*female|microsoft.*zira/i.test(v.name))
        || voices.find(v => v.lang.startsWith("en") && /female/i.test(v.name))
        || voices.find(v => v.lang.startsWith("en"));
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Speak guided text when it changes
  useEffect(() => {
    if (!voiceEnabled || !guidedText || guidedText === lastSpokenRef.current) return;
    if (!window.speechSynthesis) return;
    lastSpokenRef.current = guidedText;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(guidedText);
    utter.rate = 0.80;
    utter.pitch = 0.85;
    utter.volume = 0.9;
    if (cachedVoiceRef.current) utter.voice = cachedVoiceRef.current;
    // Small delay for more natural pacing between phrases
    setTimeout(() => window.speechSynthesis.speak(utter), 250);
  }, [guidedText, voiceEnabled]);

  // Stop speech on unmount or when meditation ends
  useEffect(() => {
    return () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    if (!ambientRef.current) return;
    if (ambientMuted) ambientRef.current.toggleMute();
    else { if (ambientRef.current.muted) ambientRef.current.toggleMute(); ambientRef.current.setVolume(ambientVol); }
  }, [ambientVol, ambientMuted]);

  useEffect(() => {
    return () => { if (ambientRef.current) { ambientRef.current.destroy(); ambientRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!started || completed || stoppedEarly) return;
    const cycle = setInterval(() => {
      breathRef.current = (breathRef.current + 1) % 14;
      if (breathRef.current < 4) setBreathPhase("inhale");
      else if (breathRef.current < 8) setBreathPhase("hold");
      else setBreathPhase("exhale");
    }, 1000);
    return () => clearInterval(cycle);
  }, [started, completed, stoppedEarly]);

  useEffect(() => {
    if (started && !completed && !stoppedEarly) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            const pts = calcMeditationPoints(durationMinutes, sessionNumber);
            setEarnedPoints(pts);
            setCompleted(true);
            playSound("bell");
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (ambientRef.current) { ambientRef.current.stop(3); ambientRef.current = null; }
            return 0;
          }
          const elapsed = totalSeconds - (prev - 1);
          setGuidedText(getMeditationPrompt(medType.id, elapsed, totalSeconds));
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [started, completed, stoppedEarly]);

  const handleStopEarly = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ambientRef.current) { ambientRef.current.stop(2); ambientRef.current = null; }
    const elapsed = totalSeconds - remaining;
    setEarnedPoints(calcMeditationPartialPoints(durationMinutes, sessionNumber, elapsed));
    setStoppedEarly(true);
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = 1 - (remaining / totalSeconds);
  const breathScale = breathPhase === "inhale" ? 1.3 : breathPhase === "hold" ? 1.3 : 1.0;
  const breathLabel = breathPhase === "inhale" ? t("breatheIn") : breathPhase === "hold" ? t("breatheHold") : t("breatheOut");
  const awardedPoints = estimateAwardedPoints(earnedPoints, streak);
  const impactMessages = getSessionImpactMessages(sessionContext, {
    kind: "meditation",
    sessionType: "meditation",
    wasCompleted: completed,
    durationMinutes,
    awardedPoints,
    exerciseId: medType.id,
    todayExerciseIds: sessionContext?.todayExerciseIds || [],
  });

  if (completed || stoppedEarly) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
        <div style={{ background: "linear-gradient(145deg, #0a0a1a, #0d1025)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(138,92,246,0.2)" }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>{completed ? "\uD83C\uDF38" : "\u262E\uFE0F"}</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2, color: "#C4B5FD", marginBottom: 16 }}>{completed ? t("namaste") : t("wellDone")}</div>
          {awardedPoints > 0 && <div style={{ display: "inline-block", padding: "10px 28px", background: "linear-gradient(135deg, #7C3AED, #A78BFA)", borderRadius: 30, fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 12 }}>+{awardedPoints} pts</div>}
          {awardedPoints > 0 && streak > 1 && <div style={{ fontSize: 12, color: "#C4B5FD", marginBottom: 8 }}>x{getStreakMultiplier(streak).toFixed(2)} {t("streakBonusApplied")}</div>}
          {completed && <div style={{ fontSize: 13, color: "#A78BFA", marginBottom: 8 }}>{t("medFullSession")}</div>}
          {sessionNumber > 1 && completed && <div style={{ fontSize: 12, color: "#8B5CF6", marginBottom: 8 }}>{t("medSession")} #{sessionNumber}    x{getMeditationSessionMultiplier(sessionNumber).toFixed(2)} {t("medSessionBonus")}</div>}
          {stoppedEarly && earnedPoints > 0 && <div style={{ fontSize: 13, color: "#A78BFA", marginBottom: 8 }}>{t("medPartialSession")}</div>}
          {stoppedEarly && earnedPoints === 0 && <div style={{ fontSize: 13, color: "#FF6B6B", marginBottom: 8 }}>{t("medMinPoints")}</div>}
          {impactMessages.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 6, padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>
              <div style={{ fontSize: 11, letterSpacing: 1.6, color: "#8F8F97", marginBottom: 8 }}>{t("sessionShift")}</div>
              {impactMessages.map((message, index) => (
                <div key={index} style={{ fontSize: 13, color: "#EEE9FF", lineHeight: 1.45, marginBottom: index === impactMessages.length - 1 ? 0 : 8 }}>
                  {message}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => {
            const elapsedSeconds = completed ? totalSeconds : Math.max(0, totalSeconds - remaining);
            onComplete(earnedPoints, !stoppedEarly, { elapsedSeconds });
          }} style={{ width: "100%", maxWidth: 260, padding: "14px 28px", background: earnedPoints > 0 ? "linear-gradient(135deg, #7C3AED, #A78BFA)" : "rgba(255,255,255,0.08)", color: earnedPoints > 0 ? "#fff" : "#888", border: earnedPoints > 0 ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 15, fontWeight: 800, letterSpacing: 1, marginTop: 12 }}>{earnedPoints > 0 ? t("collectPoints") : t("back")}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg, #0a0a1a 0%, #10062a 50%, #0d1025 100%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.3 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: "absolute", width: 4 + i * 2, height: 4 + i * 2, borderRadius: "50%", background: `rgba(138,92,246,${0.2 + i * 0.05})`, left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 25}%`, animation: `pulse ${3 + i}s infinite` }} />
        ))}
      </div>
      <div style={{ background: "rgba(13,16,37,0.9)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(138,92,246,0.15)", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>{medType.emoji}</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#C4B5FD" }}>{medType.name}</span>
        </div>
        {!started ? (
          <div>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#A78BFA", fontFamily: "'Courier New', monospace", marginBottom: 8 }}>{durationMinutes}:00</div>
            <div style={{ fontSize: 13, color: "#6D5BA3", marginBottom: 6 }}>{estimateAwardedPoints(calcMeditationPoints(durationMinutes, sessionNumber), streak)} pts   {t("medSession")} #{sessionNumber}</div>
            {streak > 1 && <div style={{ fontSize: 11, color: "#8B5CF6", marginBottom: 18 }}>x{getStreakMultiplier(streak).toFixed(2)} {t("streakBonusApplied")}</div>}
            {medType.id === "visualization" && <div style={{ fontSize: 11, color: "#8B5CF6", marginBottom: 12 }}>{t("useHeadphones")}</div>}
            <button onClick={() => { setStarted(true); setGuidedText(getMeditationPrompt(medType.id, 0, totalSeconds)); playSound("bell"); try { ambientRef.current = new AmbientAudio(); ambientRef.current.setVolume(ambientVol); if (ambientMuted) ambientRef.current.toggleMute(); ambientRef.current.start(medType.id, 3); } catch(e) { console.warn("Ambient audio:", e); } }} style={{ padding: "16px 40px", background: "linear-gradient(135deg, #7C3AED, #A78BFA)", color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>{t("beginMeditation")}</button>
          </div>
        ) : (
          <div>
            <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, rgba(138,92,246,${breathPhase === "hold" ? 0.15 : 0.08}) 0%, transparent 70%)`, transform: `scale(${breathScale})`, transition: breathPhase === "inhale" ? "transform 4s ease-in" : breathPhase === "hold" ? "transform 0.1s" : "transform 6s ease-out" }} />
              <div style={{ width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, rgba(167,139,250,0.2), rgba(124,58,237,0.1))", border: "2px solid rgba(138,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", transform: `scale(${breathScale})`, transition: breathPhase === "inhale" ? "transform 4s ease-in" : breathPhase === "hold" ? "transform 0.1s" : "transform 6s ease-out", boxShadow: `0 0 ${breathPhase === "hold" ? 30 : 15}px rgba(138,92,246,${breathPhase === "hold" ? 0.4 : 0.2})` }}>
                <span style={{ fontSize: 36, fontWeight: 900, fontFamily: "'Courier New', monospace", color: "#C4B5FD" }}>{mins}:{secs.toString().padStart(2, "0")}</span>
              </div>
            </div>
            {guidedText ? (
              <div style={{ fontSize: 15, color: "rgba(196,181,253,0.9)", lineHeight: 1.7, padding: "14px 18px", margin: "8px auto 4px", maxWidth: 320, minHeight: 52, background: "rgba(138,92,246,0.08)", borderRadius: 14, border: "1px solid rgba(138,92,246,0.12)", fontStyle: "italic", letterSpacing: 0.3 }}>{guidedText}</div>
            ) : (
              <div style={{ fontSize: 16, color: "#A78BFA", fontWeight: 600, marginBottom: 4, letterSpacing: 1, minHeight: 24 }}>{breathLabel}</div>
            )}
            <div style={{ width: "80%", height: 4, background: "rgba(138,92,246,0.1)", borderRadius: 2, margin: "12px auto 20px", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, width: `${progress * 100}%`, background: "linear-gradient(90deg, #7C3AED, #A78BFA)", transition: "width 1s linear" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, padding: "8px 12px", background: "rgba(138,92,246,0.06)", borderRadius: 10 }}>
              <button onClick={() => { setAmbientMuted(!ambientMuted); localStorage.setItem("bm_ambientMuted", !ambientMuted); }} style={{ background: "none", border: "none", fontSize: 16, color: ambientMuted ? "#555" : "#A78BFA", padding: 4, cursor: "pointer" }}>{ambientMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}</button>
              <input type="range" min="0" max="100" value={ambientMuted ? 0 : Math.round(ambientVol * 100)} onChange={e => { const v = e.target.value / 100; setAmbientVol(v); localStorage.setItem("bm_ambientVol", v); if (ambientMuted) setAmbientMuted(false); }} style={{ width: 80, accentColor: "#A78BFA", height: 4 }} />
              <span style={{ fontSize: 10, color: "#6D5BA3", minWidth: 26 }}>{ambientMuted ? "OFF" : Math.round(ambientVol * 100) + "%"}</span>
              <div style={{ width: 1, height: 16, background: "rgba(138,92,246,0.2)", margin: "0 2px" }} />
              <button onClick={() => { const next = !voiceEnabled; setVoiceEnabled(next); localStorage.setItem("bm_voiceGuide", next); if (!next && window.speechSynthesis) window.speechSynthesis.cancel(); }} style={{ background: "none", border: "none", fontSize: 16, color: voiceEnabled ? "#A78BFA" : "#555", padding: 4, cursor: "pointer" }}>{voiceEnabled ? "\uD83D\uDDE3\uFE0F" : "\uD83E\uDD10"}</button>
              <span style={{ fontSize: 10, color: "#6D5BA3" }}>{voiceEnabled ? "Voice" : "Mute"}</span>
            </div>
            <button onClick={handleStopEarly} style={{ padding: "12px 24px", background: "rgba(138,92,246,0.15)", color: "#A78BFA", border: "1px solid rgba(138,92,246,0.3)", borderRadius: 12, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{t("endSession")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

//     MEDITATION PANEL                            
function MeditationPanel({ todayMedSessions, qualifyingMeditationsToday = 0, onStartMeditation, totalPoints, lang }) {
  const t = useT(lang || "en");
  const [selectedType, setSelectedType] = useState(null);
  const [selectedDur, setSelectedDur] = useState(10);
  const nextSession = todayMedSessions + 1;
  const pts = calcMeditationPoints(selectedDur, nextSession);

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <div style={{ background: "linear-gradient(135deg, #1a0d2e, #0d1025)", borderRadius: 20, padding: "24px 20px", marginBottom: 16, border: "1px solid rgba(138,92,246,0.15)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(138,92,246,0.15), transparent)" }} />
        <div style={{ fontSize: 12, letterSpacing: 3, color: "#8B5CF6", marginBottom: 8 }}>{"\u262E\uFE0F"} {t("meditation").toUpperCase()}</div>
        <div style={{ fontSize: 14, color: "#6D5BA3", marginBottom: 16 }}>
          {t("medToday")}: {todayMedSessions} {todayMedSessions !== 1 ? t("medSessionsTodayPlural") : t("medSessionsToday")} {t("medCompleted")}
          {qualifyingMeditationsToday > 0 && <span style={{ color: "#A78BFA", marginLeft: 8 }}>{t("medStreakQualified")}</span>}
        </div>
        {nextSession > 1 && (
          <div style={{ display: "inline-block", padding: "4px 12px", background: "rgba(138,92,246,0.15)", borderRadius: 20, fontSize: 12, color: "#A78BFA", marginBottom: 8 }}>
            {t("medNextBonus")}:  x{getMeditationSessionMultiplier(nextSession).toFixed(2)} {t("medSessionBonus")}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#8B5CF6", marginBottom: 10 }}>{t("meditationType")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MEDITATION_TYPES.map(mt => (
            <button key={mt.id} onClick={() => setSelectedType(mt)}
              style={{ padding: "14px 12px", textAlign: "left", background: selectedType?.id === mt.id ? "rgba(138,92,246,0.15)" : "rgba(255,255,255,0.03)", border: selectedType?.id === mt.id ? "1px solid rgba(138,92,246,0.35)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 14, color: selectedType?.id === mt.id ? "#C4B5FD" : "#666", transition: "all 0.2s ease" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{mt.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{mt.name}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{mt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#8B5CF6", marginBottom: 10 }}>{t("medDuration")}</div>
        <select value={selectedDur} onChange={e => setSelectedDur(Number(e.target.value))}
          style={{ width: "100%", padding: "14px 16px", background: "rgba(138,92,246,0.1)", color: "#C4B5FD", border: "1px solid rgba(138,92,246,0.3)", borderRadius: 12, fontSize: 16, fontWeight: 700, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23A78BFA' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center" }}>
          {MEDITATION_DURATIONS.map(d => (
            <option key={d} value={d} style={{ background: "#1a1a2e", color: "#C4B5FD" }}>
              {d} {t("min1").replace("1 ", "")}   {calcMeditationPoints(d, nextSession)} pts
            </option>
          ))}
        </select>
      </div>

      {selectedType && (
        <div style={{ textAlign: "center", padding: "16px", background: "rgba(138,92,246,0.06)", borderRadius: 16, marginBottom: 16, border: "1px solid rgba(138,92,246,0.1)" }}>
          <div style={{ fontSize: 13, color: "#6D5BA3", marginBottom: 4 }}>{selectedType.emoji} {selectedType.name}   {selectedDur}min</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#A78BFA" }}>{pts} pts</div>
          {nextSession > 1 && <div style={{ fontSize: 11, color: "#6D5BA3" }}> x{getMeditationSessionMultiplier(nextSession).toFixed(2)} {t("medSessionBonus")}</div>}
        </div>
      )}

      <button onClick={() => selectedType && onStartMeditation(selectedType, selectedDur, nextSession)} disabled={!selectedType}
        style={{ width: "100%", padding: "18px", background: selectedType ? "linear-gradient(135deg, #7C3AED, #A78BFA)" : "#222", color: selectedType ? "#fff" : "#555", border: "none", borderRadius: 16, fontSize: 17, fontWeight: 900, letterSpacing: 2 }}>
        {t("beginMeditation")}
      </button>
    </div>
  );
}


//     EVOLUTION POPUP                              
function EvolutionPopup({ oldTier, newTier, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 100); playSound("levelup"); }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #1a1a2e, #0d0d1a)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(255,215,0,0.3)", opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.8)", transition: "all 0.5s ease" }}>
        <div style={{ fontSize: 14, letterSpacing: 3, color: "#FFD700", marginBottom: 8 }}>  LEVEL UP!  </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, margin: "16px 0 20px" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 40 }}>{oldTier.emoji}</div><div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{oldTier.name}</div></div>
          <span style={{ fontSize: 24, color: "#FFD700" }}>{"\u27A1\uFE0F"}</span>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 52 }}>{newTier.emoji}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#FFD700", marginTop: 4 }}>{newTier.name}</div></div>
        </div>
        <button onClick={onClose} style={{ padding: "14px 40px", background: "linear-gradient(135deg, #FFD700, #FF8C00)", color: "#000", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 800, letterSpacing: 2 }}>CONTINUE</button>
      </div>
    </div>
  );
}

//     EVOLUTION PROGRESSION SCREEN
function EvolutionScreen({ points, onBack }) {
  const current = getEvolution(points);
  const currentIdx = EVOLUTION_TIERS.indexOf(current);
  const listRef = React.useRef(null);

  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px", minHeight: "100vh", background: "#0a0a0f" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#FF8C00", fontSize: 14, fontWeight: 600, padding: "8px 0" }}>{"\u2190"} Back</button>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#FFD700" }}>EVOLUTION</span>
        <span style={{ fontSize: 12, color: "#888" }}>Lv {currentIdx + 1}/{EVOLUTION_TIERS.length}</span>
      </div>

      <div style={{ textAlign: "center", marginBottom: 20, padding: "16px 12px", background: "linear-gradient(135deg, #1a0a00, #2d1400)", borderRadius: 18, border: "1px solid rgba(255,77,0,0.25)" }}>
        <div style={{ fontSize: 48, marginBottom: 6 }}>{current.emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#FFD700" }}>{current.name}</div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{Math.round(points).toLocaleString()} total points</div>
      </div>

      <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {EVOLUTION_TIERS.map((tier, i) => {
          const isUnlocked = points >= tier.threshold;
          const isCurrent = i === currentIdx;
          const nextTier = EVOLUTION_TIERS[i + 1];
          const ptsNeeded = tier.threshold - points;
          const tierProgress = isCurrent && nextTier ? (points - tier.threshold) / (nextTier.threshold - tier.threshold) : isUnlocked ? 1 : 0;

          return (
            <div key={i} data-active={isCurrent ? "true" : "false"} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: isCurrent ? "linear-gradient(135deg, rgba(255,77,0,0.15), rgba(255,140,0,0.1))" : isUnlocked ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)",
              border: isCurrent ? "1px solid rgba(255,77,0,0.4)" : "1px solid rgba(255,255,255,0.04)",
              borderRadius: 14, opacity: isUnlocked ? 1 : 0.5, transition: "all 0.3s ease",
            }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: isCurrent ? "linear-gradient(135deg, #FF4D00, #FF8C00)" : isUnlocked ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: isCurrent ? "2px solid #FFD700" : "none" }}>
                {tier.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? "#FFD700" : isUnlocked ? "#ddd" : "#666" }}>{tier.name}</span>
                  <span style={{ fontSize: 11, color: "#555" }}>Lv {i + 1}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: isCurrent ? "#FF8C00" : "#555" }}>{tier.threshold.toLocaleString()} pts</span>
                  {isCurrent && nextTier && <span style={{ fontSize: 11, color: "#FF8C00", fontWeight: 700 }}>{Math.round(nextTier.threshold - points).toLocaleString()} pts to next</span>}
                  {!isUnlocked && !isCurrent && <span style={{ fontSize: 11, color: "#444" }}>{Math.round(ptsNeeded).toLocaleString()} pts away</span>}
                  {isUnlocked && !isCurrent && <span style={{ fontSize: 11, color: "#4a4" }}>{"\u2713"}</span>}
                </div>
                {isCurrent && nextTier && (
                  <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${tierProgress * 100}%`, background: "linear-gradient(90deg, #FF4D00, #FFD700)" }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

//     AWARD POPUP
function AwardPopup({ award, onClose, lang }) {
  const t = useT(lang || "en");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1050, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #1a1a2e, #0d0d1a)", borderRadius: 24, padding: "36px 28px", maxWidth: 340, width: "100%", textAlign: "center", border: "1px solid rgba(255,215,0,0.3)" }}>
        <div style={{ fontSize: 12, letterSpacing: 3, color: "#888", marginBottom: 8 }}>{t("awardUnlocked")}</div>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{award.emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#FFD700", marginBottom: 8 }}>{award.name}</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>{award.desc}</div>
        <button onClick={onClose} style={{ padding: "12px 32px", background: "linear-gradient(135deg, #FFD700, #FF8C00)", color: "#000", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800 }}>{t("nice")}</button>
      </div>
    </div>
  );
}

//     AWARDS SCREEN                                
function AwardsScreen({ unlockedAwards, onBack, lang }) {
  const t = useT(lang || "en");
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#FF8C00", fontSize: 14, fontWeight: 600, padding: "8px 0" }}>  {t("back")}</button>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{t("awardsTitle")}</span>
        <span style={{ fontSize: 12, color: "#888" }}>{unlockedAwards.size}/{AWARDS.length}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {AWARDS.map(a => {
          const unlocked = unlockedAwards.has(a.id);
          return (
            <div key={a.id} style={{ padding: "16px 8px", background: unlocked ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.02)", border: unlocked ? "1px solid rgba(255,215,0,0.2)" : "1px solid rgba(255,255,255,0.05)", borderRadius: 14, textAlign: "center", opacity: unlocked ? 1 : 0.4 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{a.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: unlocked ? "#FFD700" : "#555", marginBottom: 2 }}>{a.name}</div>
              <div style={{ fontSize: 9, color: "#555" }}>{a.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

//     LEADERBOARD                                  
function LeaderboardScreen({ user, totalPoints, streak, onBack, lang }) {
  const t = useT(lang || "en");
  const [entries, setEntries] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/stats/leaderboard").then(data => {
      setEntries(data.leaderboard);
      setUserRank(data.userRank);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const medals = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"];
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#FF8C00", fontSize: 14, fontWeight: 600, padding: "8px 0" }}>  {t("back")}</button>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{t("leaderboardTitle")}</span>
        <span style={{ fontSize: 12, color: "#888" }}>#{userRank || "?"}</span>
      </div>
      {loading ? <div style={{ textAlign: "center", color: "#555", padding: 40 }}>Loading...</div> :
        entries.length === 0 ? <div style={{ textAlign: "center", color: "#555", padding: 40 }}>No entries yet   be the first!</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e, i) => {
            const isYou = e.username === user?.username;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderRadius: 14, gap: 12, background: isYou ? "rgba(255,77,0,0.1)" : "rgba(255,255,255,0.03)", border: isYou ? "1px solid rgba(255,77,0,0.2)" : "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 32, textAlign: "center", fontSize: i < 3 ? 20 : 14, fontWeight: 800, color: i < 3 ? "#FFD700" : "#555" }}>{i < 3 ? medals[i] : i + 1}</div>
                <EvolutionBadge points={e.total_points} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{e.username}{isYou && ` (${t("you")})`}</div>
                  <div style={{ fontSize: 11, color: "#999" }}>  {e.streak} {t("streak")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#FFD700" }}>{Math.round(e.total_points).toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: "#888", display: "block", letterSpacing: 1 }}>{t("pts")}</span>
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

//     WEEKLY SUMMARY                               
function WeeklySummary({ weekData, streak, totalPoints, onClose, lang }) {
  const t = useT(lang || "en");
  if (!weekData) return null;
  const maxPts = Math.max(...weekData.days.map(d => d.points), 1);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "linear-gradient(145deg, #1a1a2e, #0d0d1a)", borderRadius: 24, padding: "28px 24px", maxWidth: 400, width: "100%", border: "1px solid rgba(255,215,0,0.2)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, letterSpacing: 3, color: "#FFD700", marginBottom: 4 }}>{t("weekSummary")}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{t("weekReview")}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 20 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 900, color: "#FFD700" }}>{weekData.sessions}</div><div style={{ fontSize: 10, color: "#888" }}>{t("sessionsCap")}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 900, color: "#FF8C00" }}>{weekData.points}</div><div style={{ fontSize: 10, color: "#888" }}>{t("pointsCap")}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 900, color: "#00E676" }}>{weekData.completionRate}%</div><div style={{ fontSize: 10, color: "#888" }}>{t("rateCap")}</div></div>
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "flex-end", height: 80, marginBottom: 16 }}>
          {weekData.days.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
              <div style={{ width: "100%", maxWidth: 30, height: Math.max(4, (d.points / maxPts) * 60), background: d.active ? "linear-gradient(180deg, #FFD700, #FF8C00)" : "rgba(255,255,255,0.06)", borderRadius: 4 }} />
              <span style={{ fontSize: 10, color: d.active ? "#FF8C00" : "#444" }}>{d.label}</span>
            </div>
          ))}
        </div>
        {weekData.topExercise && (
          <div style={{ padding: "10px 14px", background: "rgba(255,215,0,0.06)", borderRadius: 12, marginBottom: 16, textAlign: "center" }}>
            <span style={{ fontSize: 11, color: "#888" }}>{t("topExercise")}: </span>
            <span style={{ color: "#FFD700", fontWeight: 700 }}>{weekData.topExercise.emoji} {weekData.topExercise.name}</span>
            <span style={{ color: "#888", fontSize: 11 }}> ({weekData.topExercise.count}  / {weekData.topExercise.points} pts)</span>
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #FFD700, #FF8C00)", color: "#000", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 800, letterSpacing: 2 }}>CONTINUE</button>
      </div>
    </div>
  );
}

//     MAIN APP                                     
function BeastModeApp() {
  const [screen, setScreen] = useState("loading");
  const [lang, setLangState] = useState(() => persistLanguagePreference(getPreferredLanguage()));
  const t = useT(lang);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [unlockedAwards, setUnlockedAwards] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [mission, setMission] = useState(null);
  const [pressure, setPressure] = useState(null);
  const [missionClaiming, setMissionClaiming] = useState(false);
  const [missionPopup, setMissionPopup] = useState(null);
  const [appConfig, setAppConfig] = useState({ webPushEnabled: false, vapidPublicKey: null });
  const [pushStatus, setPushStatus] = useState({ webPushEnabled: false, subscribed: false, pushEnabled: false, subscriptionCount: 0, lastPushSentAt: null });
  const [activationMessage, setActivationMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() => supportsNotifications() ? Notification.permission : "unsupported");
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installReady, setInstallReady] = useState(() => isStandaloneApp());

  // Alarm state
  const [showAlarm, setShowAlarm] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showExtraCredit, setShowExtraCredit] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [resolvedDuration, setResolvedDuration] = useState(null);
  const [evoPopup, setEvoPopup] = useState(null);
  const [awardPopup, setAwardPopup] = useState(null);
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [weekData, setWeekData] = useState(null);

  // Meditation state
  const [mode, setMode] = useState("workout");
  const [showMedTimer, setShowMedTimer] = useState(false);
  const [currentMedType, setCurrentMedType] = useState(null);
  const [currentMedDur, setCurrentMedDur] = useState(10);
  const [currentMedSession, setCurrentMedSession] = useState(1);
  const [todayMedSessions, setTodayMedSessions] = useState(0);

  // Countdown
  const [nextAlarmTime, setNextAlarmTime] = useState(null);
  const [countdown, setCountdown] = useState("");
  const alarmTimeoutRef = useRef(null);
  const retryRef = useRef(null);
  const workoutActiveRef = useRef(false);

  const setLang = useCallback(async (nextLang, options = {}) => {
    const normalized = persistLanguagePreference(nextLang);
    setLangState(normalized);

    if (options.syncRemote && localStorage.getItem("bm_token")) {
      try {
        await api("/api/user/language", {
          method: "PUT",
          body: JSON.stringify({ language: normalized }),
        });
        setUser((prev) => (prev ? { ...prev, language: normalized } : prev));
      } catch (err) {
        console.warn("Failed to sync language:", err.message || err);
      }
    }

    return normalized;
  }, []);

  // Track active overlays
  useEffect(() => {
    workoutActiveRef.current = showTimer || showExtraCredit || showAlarm || showMedTimer || !!evoPopup || !!awardPopup || showWeeklySummary;
  }, [showTimer, showExtraCredit, showAlarm, showMedTimer, evoPopup, awardPopup, showWeeklySummary]);

  const refreshDashboardSignals = useCallback(async () => {
    const [missionData, pressureData] = await Promise.all([
      api("/api/stats/daily-mission").catch(() => null),
      api("/api/stats/pressure").catch(() => null),
    ]);
    if (missionData?.mission) setMission(missionData.mission);
    if (pressureData) setPressure(pressureData);
  }, []);

  const loadSession = useCallback(async () => {
    const [data, recentHistory, missionData, pressureData] = await Promise.all([
      api("/api/user/profile"),
      api("/api/workout/history?limit=20").catch(() => []),
      api("/api/stats/daily-mission").catch(() => null),
      api("/api/stats/pressure").catch(() => null),
    ]);
    setUser(data.user);
    await setLang(data.user?.language || getPreferredLanguage());
    setSettings(data.settings);
    setProgress(data.progress);
    setUnlockedAwards(new Set(data.awards || []));
    setTodayMedSessions(data.progress?.meditationsFinished || 0);
    setHistory(recentHistory);
    setMission(missionData?.mission || null);
    setPressure(pressureData || null);
    if (!data.settings?.selectedExercises?.length) { setScreen("setup"); }
    else { setScreen("dashboard"); }
  }, []);

  //     INIT: Check token and load profile      
  useEffect(() => {
    const token = localStorage.getItem("bm_token");
    if (!token) { setScreen("auth"); return; }
    loadSession().catch(() => {
      localStorage.removeItem("bm_token");
      setScreen("auth");
    });
  }, [loadSession]);

  useEffect(() => {
    let active = true;
    fetchPublicConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig({
          webPushEnabled: Boolean(config.webPushEnabled),
          vapidPublicKey: config.vapidPublicKey || null,
        });
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to load app config:", err.message || err);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };
    const handleInstalled = () => {
      setInstallReady(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const refreshPushStatus = useCallback(async () => {
    if (!localStorage.getItem("bm_token")) return null;
    const status = await api("/api/user/push-status");
    setPushStatus(status);
    return status;
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (!supportsWebPush() || notificationPermission !== "granted" || !appConfig.webPushEnabled || !appConfig.vapidPublicKey) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(appConfig.vapidPublicKey),
      });
    }

    const payload = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
    const status = await api("/api/user/push-subscription", {
      method: "POST",
      body: JSON.stringify({ subscription: payload }),
    });
    setPushStatus(status);
    return status;
  }, [appConfig.vapidPublicKey, appConfig.webPushEnabled, notificationPermission]);

  useEffect(() => {
    if (!user) return;
    refreshPushStatus().catch((err) => {
      console.warn("Failed to load push status:", err.message || err);
    });
  }, [refreshPushStatus, user?.id]);

  useEffect(() => {
    if (!user || notificationPermission !== "granted") return;
    syncPushSubscription().catch((err) => {
      console.warn("Failed to sync push subscription:", err.message || err);
    });
  }, [notificationPermission, syncPushSubscription, user?.id]);

  const handleEnableNudges = useCallback(async () => {
    if (!supportsNotifications()) return;
    if (Notification.permission === "granted") {
      setNotificationPermission("granted");
      const status = await syncPushSubscription();
      if (status?.subscribed) {
        setActivationMessage(t("nudgesLinked"));
      }
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      const status = await syncPushSubscription();
      await showSystemNotification({
        title: "BeastMode nudges are on",
        body: "Your next reset can now reach you outside the tab.",
        tag: "beastmode-nudges-ready",
      });
      if (status?.subscribed) {
        setActivationMessage(t("nudgesLinked"));
      }
    } else if (permission === "denied") {
      setActivationMessage(t("notificationBlocked"));
    }
  }, [syncPushSubscription, t]);

  const handleSendTestNudge = useCallback(async () => {
    const status = await api("/api/user/push-test", { method: "POST" });
    setPushStatus(status);
    setActivationMessage(t("testNudgeSent"));
  }, [t]);

  const handleInstallApp = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const outcome = await installPromptEvent.userChoice.catch(() => null);
    if (outcome?.outcome === "accepted") {
      setInstallReady(true);
    }
    setInstallPromptEvent(null);
  }, [installPromptEvent]);

  //     ALARM SCHEDULING                           
  const getRandomExercise = useCallback(() => {
    if (!settings?.selectedExercises) return EXERCISES[0];
    const pool = EXERCISES.filter(e => settings.selectedExercises.includes(e.id));
    return pool[Math.floor(Math.random() * pool.length)] || EXERCISES[0];
  }, [settings]);

  const fireAlarm = useCallback(() => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    // Check if today is still an active day and within hours
    const now = new Date();
    const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const activeDays = settings?.activeDays || dayKeys;
    if (!activeDays.includes(dayKeys[now.getDay()])) return;
    const sh = settings?.startHour != null ? settings.startHour : 0;
    const eh = settings?.endHour != null ? settings.endHour : 23;
    if (sh !== eh && (now.getHours() < sh || now.getHours() >= eh)) return;
    const dur = resolveDuration(settings?.duration || 2);
    const chosenExercise = getRandomExercise();
    if (workoutActiveRef.current) {
      retryRef.current = setInterval(() => {
        if (!workoutActiveRef.current) {
          clearInterval(retryRef.current); retryRef.current = null;
          setCurrentExercise(chosenExercise);
          setResolvedDuration(dur);
          setShowAlarm(true);
          playSound("alarm");
        }
      }, 3000);
      return;
    }
    setCurrentExercise(chosenExercise);
    setResolvedDuration(dur);
    setShowAlarm(true);
    playSound("alarm");
    if (document.visibilityState !== "visible") {
      const prompt = buildAlarmPrompt({ mission, pressure, settings, exercise: chosenExercise, duration: dur, streak: progress?.streak || 1 });
      showSystemNotification({
        title: prompt?.title || "BeastMode reset ready",
        body: prompt?.subtitle || `${dur}-minute ${chosenExercise.name} reset waiting.`,
      }).catch(() => {});
    }
  }, [getRandomExercise, mission, pressure, progress?.streak, settings]);

  const scheduleNextAlarm = useCallback(() => {
    if (!settings) return;
    if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    const intervalMin = settings.intervalMinutes || 45;
    const intervalMs = intervalMin * 60 * 1000;
    const actualInterval = DEMO_MODE ? Math.min(intervalMs, 20000) : intervalMs;
    const now = new Date();
    const currentHour = now.getHours();
    const sh = settings.startHour != null ? settings.startHour : 0;
    const eh = settings.endHour != null ? settings.endHour : 23;
    const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const activeDays = settings.activeDays || dayKeys;

    const snapToClockBoundary = (date) => {
      const d = new Date(date);
      const totalMinutes = (d.getHours() * 60) + d.getMinutes();
      const nextBoundary = (Math.floor(totalMinutes / intervalMin) + 1) * intervalMin;
      const nextHour = Math.floor((nextBoundary % (24 * 60)) / 60);
      const nextMinute = nextBoundary % 60;
      if (nextBoundary >= 24 * 60) {
        d.setDate(d.getDate() + 1);
      }
      d.setHours(nextHour, nextMinute, 0, 0);
      return d;
    };

    // Find the next active day's start time (looking up to 7 days ahead)
    const findNextActiveStart = (fromDate) => {
      for (let i = 0; i < 7; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        if (activeDays.includes(dayKeys[d.getDay()])) {
          if (i === 0) {
            if (d.getHours() < eh || sh >= eh) return d;
          } else {
            d.setHours(sh, 0, 0, 0);
            return d;
          }
        }
      }
      return null;
    };

    const todayKey = dayKeys[now.getDay()];
    const todayActive = activeDays.includes(todayKey);

    let delayMs = actualInterval;

    if (DEMO_MODE) {
      delayMs = actualInterval;
    } else if (!todayActive || (sh !== eh && currentHour >= eh) || (sh !== eh && currentHour < sh)) {
      let target;
      if (todayActive && sh !== eh && currentHour < sh) {
        target = new Date(now); target.setHours(sh, 0, 0, 0);
      } else {
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(sh, 0, 0, 0);
        target = findNextActiveStart(tomorrow);
      }
      if (target) {
        delayMs = target - now;
      } else {
        setNextAlarmTime(null);
        return;
      }
    } else {
      // Active today, within hours — snap to next clock boundary
      const snapped = snapToClockBoundary(now);
      delayMs = snapped - now;
      // Clamp to end hour if set
      if (sh !== eh) {
        const endTime = new Date(now); endTime.setHours(eh, 0, 0, 0);
        const msUntilEnd = endTime - now;
        if (delayMs > msUntilEnd) delayMs = msUntilEnd;
      }
    }

    if (delayMs <= 0) delayMs = actualInterval;
    setNextAlarmTime(Date.now() + delayMs);
    alarmTimeoutRef.current = setTimeout(fireAlarm, delayMs);
  }, [settings, fireAlarm]);

  useEffect(() => {
    if (!nextAlarmTime) return;
    const tick = setInterval(() => {
      const diff = Math.max(0, nextAlarmTime - Date.now());
      if (diff === 0) { setCountdown("NOW!"); clearInterval(tick); return; }
      const totalMin = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (totalMin >= 60) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        setCountdown(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      } else {
        setCountdown(`${totalMin}:${s.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [nextAlarmTime]);

  useEffect(() => {
    if (settings && screen === "dashboard") scheduleNextAlarm();
    return () => {
      if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, [settings, screen, scheduleNextAlarm]);

  //     WORKOUT COMPLETE HANDLER                   
  const handleWorkoutComplete = async (pts, exercise, wasCompleted, type = "alarm", durationOverride = null, meta = {}) => {
    setShowTimer(false);
    setShowExtraCredit(false);
    setShowAlarm(false);

    const oldTotal = progress?.totalPoints || 0;
    const durationMinutes = durationOverride ?? resolvedDuration ?? 2;
    try {
      const result = await api("/api/workout/log", {
        method: "POST",
        body: JSON.stringify({
          exerciseId: exercise.id, exerciseName: exercise.name, exerciseEmoji: exercise.emoji,
          points: pts, durationMinutes, wasCompleted, type, elapsedSeconds: meta?.elapsedSeconds ?? null,
        }),
      });

      // Update local state from server response
      setProgress(prev => ({ ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), sessionsFinished: result.sessionsFinished, sessionCredits: result.sessionCredits ?? prev?.sessionCredits }));

      // Check for evolution
      const oldTier = getEvolution(oldTotal);
      const newTier = getEvolution(result.totalPoints);
      if (newTier.name !== oldTier.name) {
        setTimeout(() => setEvoPopup({ oldTier, newTier }), 600);
      }

      // Check for new awards
      if (result.newAwards?.length > 0) {
        const awardObj = AWARDS.find(a => a.id === result.newAwards[0]);
        if (awardObj) setTimeout(() => setAwardPopup(awardObj), evoPopup ? 2000 : 800);
        setUnlockedAwards(prev => { const next = new Set(prev); result.newAwards.forEach(id => next.add(id)); return next; });
      }

      // Add to local history
      setHistory(prev => [{ exercise, points: result.finalPoints, wasCompleted, type, time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    } catch(e) {
      console.error("Failed to log workout:", e);
      // Still update UI optimistically
      const finalPts = estimateAwardedPoints(pts, progress?.streak || 1);
      setProgress(prev => ({ ...prev, totalPoints: (prev?.totalPoints || 0) + finalPts, todayPoints: (prev?.todayPoints || 0) + finalPts, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), sessionsFinished: wasCompleted ? (prev?.sessionsFinished || 0) + 1 : prev?.sessionsFinished || 0, sessionCredits: (prev?.sessionCredits || 0) + getWorkoutSessionCredit(durationMinutes, wasCompleted) }));
      setHistory(prev => [{ exercise, points: finalPts, wasCompleted, type, time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    }

    await refreshDashboardSignals();
    scheduleNextAlarm();
  };

  //     MEDITATION COMPLETE HANDLER                   
  const handleMeditationComplete = async (pts, wasCompleted, meta = {}) => {
    setShowMedTimer(false);
    const oldTotal = progress?.totalPoints || 0;
    if (wasCompleted) setTodayMedSessions(prev => prev + 1);
    try {
      const result = await api("/api/workout/log", {
        method: "POST",
        body: JSON.stringify({
          exerciseId: currentMedType.id, exerciseName: currentMedType.name, exerciseEmoji: currentMedType.emoji,
          points: pts, durationMinutes: currentMedDur, wasCompleted, type: "meditation", elapsedSeconds: meta?.elapsedSeconds ?? null,
        }),
      });
      setProgress(prev => ({ ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), sessionsFinished: wasCompleted ? result.sessionsFinished : prev?.sessionsFinished, sessionCredits: result.sessionCredits ?? (prev?.sessionCredits || 0), meditationsFinished: result.meditationsFinished ?? (prev?.meditationsFinished || 0), qualifyingMeditations: result.qualifyingMeditations ?? (prev?.qualifyingMeditations || 0) }));
      const oldTier = getEvolution(oldTotal);
      const newTier = getEvolution(result.totalPoints);
      if (newTier.name !== oldTier.name) setTimeout(() => setEvoPopup({ oldTier, newTier }), 600);
      if (result.newAwards?.length > 0) {
        const awardObj = AWARDS.find(a => a.id === result.newAwards[0]);
        if (awardObj) setTimeout(() => setAwardPopup(awardObj), evoPopup ? 2000 : 800);
        setUnlockedAwards(prev => { const next = new Set(prev); result.newAwards.forEach(id => next.add(id)); return next; });
      }
      setHistory(prev => [{ exercise: currentMedType, points: result.finalPoints ?? pts, wasCompleted, type: "meditation", time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    } catch(e) {
      console.error("Failed to log meditation:", e);
      const finalPts = estimateAwardedPoints(pts, streak);
      setProgress(prev => ({ ...prev, totalPoints: (prev?.totalPoints || 0) + finalPts, todayPoints: (prev?.todayPoints || 0) + finalPts, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), meditationsFinished: wasCompleted ? (prev?.meditationsFinished || 0) + 1 : prev?.meditationsFinished || 0, qualifyingMeditations: (prev?.qualifyingMeditations || 0) + getMeditationQualificationCredit(currentMedDur, wasCompleted) }));
      setHistory(prev => [{ exercise: currentMedType, points: finalPts, wasCompleted, type: "meditation", time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    }

    await refreshDashboardSignals();
  };

  const startMeditation = (medType, dur, sessionNum) => {
    setCurrentMedType(medType);
    setCurrentMedDur(dur);
    setCurrentMedSession(sessionNum);
    setShowMedTimer(true);
  };

  const startQuickReset = useCallback((kind) => {
    const selectedIds = settings?.selectedExercises?.length ? settings.selectedExercises : EXERCISES.map((exercise) => exercise.id);
    const selectedPool = EXERCISES.filter((exercise) => selectedIds.includes(exercise.id));
    const pickFrom = (ids) => {
      const pool = selectedPool.filter((exercise) => ids.includes(exercise.id));
      const fallbackPool = pool.length > 0 ? pool : selectedPool;
      return fallbackPool[Math.floor(Math.random() * fallbackPool.length)] || EXERCISES[0];
    };

    if (kind === "calm") {
      const breath = MEDITATION_TYPES.find((medType) => medType.id === "breath") || MEDITATION_TYPES[0];
      setShowAlarm(false);
      setShowExtraCredit(false);
      setShowTimer(false);
      setCurrentMedType(breath);
      setCurrentMedDur(3);
      setCurrentMedSession((todayMedSessions || 0) + 1);
      setShowMedTimer(true);
      return;
    }

    const exercise = {
      random: pickFrom(selectedIds),
      focus: pickFrom(["plank", "chair_pose", "situps"]),
      energy: pickFrom(["jumping_jacks", "high_knees", "burpees"]),
      mobility: pickFrom(["squats", "lunges", "mountain_climbers"]),
    }[kind] || pickFrom(selectedIds);

    setShowAlarm(false);
    setShowExtraCredit(false);
    setShowMedTimer(false);
    setCurrentExercise(exercise);
    setResolvedDuration(2);
    setShowTimer(true);
  }, [settings, todayMedSessions]);

  const handleClaimMission = async () => {
    if (!mission || mission.claimed || !mission.complete || missionClaiming) return;
    setMissionClaiming(true);
    try {
      const result = await api("/api/stats/daily-mission/claim", { method: "POST" });
      setMission(result.mission);
      setProgress((prev) => prev ? { ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints } : prev);
      setMissionPopup({ mission: result.mission, bonusPoints: result.bonusAwarded });
      await refreshDashboardSignals();
    } catch (e) {
      console.error("Mission claim failed:", e);
    } finally {
      setMissionClaiming(false);
    }
  };


  //     END DAY / MISSED DAY                      
  const handleEndDay = async () => {
    try {
      const result = await api("/api/workout/end-day", { method: "POST" });
      setProgress(prev => ({ ...prev, streak: result.streak, maxStreak: result.maxStreak, streakFreezes: result.streakFreezes, todayPoints: 0, sessionsCompleted: 0, sessionsFinished: 0, sessionCredits: 0, meditationsFinished: 0, qualifyingMeditations: 0, sessionsSkipped: 0, dayCounter: result.dayCounter }));
      setTodayMedSessions(0);
      if (result.showWeekly && result.weeklyData) { setWeekData(result.weeklyData); setShowWeeklySummary(true); }
      await refreshDashboardSignals();
    } catch(e) { console.error("End day error:", e); }
  };

  const handleMissedDay = async () => {
    try {
      const result = await api("/api/workout/missed-day", { method: "POST" });
      setProgress(prev => ({ ...prev, streak: result.streak, streakFreezes: result.streakFreezes, todayPoints: 0, sessionsCompleted: 0, sessionsFinished: 0, sessionCredits: 0, meditationsFinished: 0, qualifyingMeditations: 0, sessionsSkipped: 0, dayCounter: result.dayCounter }));
      setTodayMedSessions(0);
      if (result.showWeekly && result.weeklyData) { setWeekData(result.weeklyData); setShowWeeklySummary(true); }
      await refreshDashboardSignals();
    } catch(e) { console.error("Missed day error:", e); }
  };

  const handleLogout = () => {
    localStorage.removeItem("bm_token");
    setUser(null); setSettings(null); setProgress(null); setHistory([]); setUnlockedAwards(new Set()); setTodayMedSessions(0); setMission(null); setPressure(null); setMissionPopup(null);
    setPushStatus({ webPushEnabled: Boolean(appConfig.webPushEnabled), subscribed: false, pushEnabled: false, subscriptionCount: 0, lastPushSentAt: null });
    setActivationMessage("");
    setNotificationPermission(supportsNotifications() ? Notification.permission : "unsupported");
    setScreen("auth");
  };

  //     SCREENS                                    
  if (screen === "loading") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 48, animation: "pulse 1.5s infinite" }}>{"\uD83D\uDD25"}</div></div>;
  if (screen === "auth") return <AuthScreen onAuth={() => { setScreen("loading"); loadSession().catch(() => { localStorage.removeItem("bm_token"); setScreen("auth"); }); }} lang={lang} setLang={setLang} />;
  if (screen === "setup") return <DailySetupScreen onComplete={(s) => { setSettings(s); setScreen("dashboard"); scheduleNextAlarm(); refreshDashboardSignals(); }} onAccountDeleted={handleLogout} settings={settings} user={user} lang={lang} setLang={setLang} />;
  if (screen === "leaderboard") return <LeaderboardScreen user={user} totalPoints={progress?.totalPoints || 0} streak={progress?.streak || 1} onBack={() => setScreen("dashboard")} lang={lang} />;
  if (screen === "awards") return <AwardsScreen unlockedAwards={unlockedAwards} onBack={() => setScreen("dashboard")} lang={lang} />;
  if (screen === "evolution") return <EvolutionScreen points={progress?.totalPoints || 0} onBack={() => setScreen("dashboard")} />;

  //     DASHBOARD                                  
  const totalPoints = progress?.totalPoints || 0;
  const todayPoints = progress?.todayPoints || 0;
  const streak = progress?.streak || 1;
  const streakFreezes = progress?.streakFreezes || 0;
  const sessionsCompleted = progress?.sessionsCompleted || 0;
  const sessionsFinished = progress?.sessionsFinished || 0;
  const sessionCredits = progress?.sessionCredits || 0;
  const qualifyingMeditations = progress?.qualifyingMeditations || 0;
  const streakMult = getStreakMultiplier(streak).toFixed(2);
  const isActiveToday = !settings?.activeDays || settings.activeDays.includes(getTodayKey());
  const MAX_FREEZES = 3;
  const FREEZE_EARN_INTERVAL = 5;
  const streakQualified = isQualifiedDayState({ sessionCredits, qualifyingMeditations, sessionsFinished, meditationsFinished: todayMedSessions });
  const pushReady = Boolean(appConfig.webPushEnabled && notificationPermission === "granted" && pushStatus?.subscribed);
  const activationStatusMessage = notificationPermission === "denied" ? t("notificationBlocked") : activationMessage;
  const todayDateKey = new Date().toISOString().split("T")[0];
  const todayExerciseIds = Array.from(new Set(
    history
      .filter((item) => item?.time && String(item.time).startsWith(todayDateKey) && item.wasCompleted !== false && item.type !== "meditation")
      .map((item) => item.exercise?.id)
      .filter(Boolean)
  ));
  const sessionContext = {
    streak,
    mission,
    pressure,
    sessionsFinished,
    sessionCredits,
    meditationsFinished: todayMedSessions,
    qualifyingMeditations,
    todayExerciseIds,
  };
  const alarmPrompt = buildAlarmPrompt({ mission, pressure, settings, exercise: currentExercise, duration: resolvedDuration || 2, streak });

  return (
    <div style={{ minHeight: "100vh", background: mode === "meditation" ? "linear-gradient(180deg, #0a0a1a 0%, #10062a 100%)" : "#0a0a0f", color: "#fff", transition: "background 0.5s ease" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px", overflowY: "auto", maxHeight: "100vh" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div onClick={() => setScreen("evolution")} style={{ cursor: "pointer" }}><EvolutionBadge points={totalPoints} size={44} glow /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{user?.username}</div>
              <div style={{ fontSize: 12, color: "#FF8C00" }}>{"\uD83D\uDD25"} {streak} {t("dayStreak")} {"\u00D7"}{streakMult} {t("bonus")}</div>
              <div style={{ fontSize: 11, color: "#69d2e7", marginTop: 2 }}>
                {Array.from({ length: MAX_FREEZES }).map((_, i) => <span key={i} style={{ marginRight: 3, opacity: i < streakFreezes ? 1 : 0.25 }}>{"\u2744\uFE0F"}</span>)}
                <span style={{ marginLeft: 4 }}>{streakFreezes}/{MAX_FREEZES} {t("freezes")}</span>
                {streak > 0 && streak % FREEZE_EARN_INTERVAL !== 0 && <span style={{ color: "#555", marginLeft: 6 }}>({FREEZE_EARN_INTERVAL - (streak % FREEZE_EARN_INTERVAL)} {t("daysToNext")})</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setScreen("setup")} style={{ width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2699\uFE0F"}</button>
            <button onClick={handleLogout} style={{ width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\uD83D\uDD11"}</button>
          </div>
        </div>

        <div onClick={() => setScreen("evolution")} style={{ cursor: "pointer" }}>
          <EvolutionBar points={totalPoints} />
        </div>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setMode("workout")} style={{ flex: 1, padding: "12px 16px", borderRadius: 11, border: "none", background: mode === "workout" ? "linear-gradient(135deg, rgba(255,77,0,0.2), rgba(255,140,0,0.15))" : "transparent", color: mode === "workout" ? "#FF8C00" : "#555", fontSize: 14, fontWeight: 800, letterSpacing: 1, transition: "all 0.3s ease" }}>{t("workoutMode")}</button>
          <button onClick={() => setMode("meditation")} style={{ flex: 1, padding: "12px 16px", borderRadius: 11, border: "none", background: mode === "meditation" ? "linear-gradient(135deg, rgba(138,92,246,0.2), rgba(167,139,250,0.15))" : "transparent", color: mode === "meditation" ? "#A78BFA" : "#555", fontSize: 14, fontWeight: 800, letterSpacing: 1, transition: "all 0.3s ease" }}>{t("meditationMode")}</button>
        </div>

        {/* Points Card */}
        <div style={{ position: "relative", background: mode === "meditation" ? "linear-gradient(135deg, #1a0d2e, #150d28)" : "linear-gradient(135deg, #1a0a00, #2d1400)", borderRadius: 20, padding: "24px 20px 16px", marginBottom: 16, border: mode === "meditation" ? "1px solid rgba(138,92,246,0.2)" : "1px solid rgba(255,77,0,0.2)", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, " + (mode === "meditation" ? "rgba(138,92,246,0.15)" : "rgba(255,77,0,0.15)") + ", transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 16, position: "relative" }}>
            <div><div style={{ fontSize: 11, letterSpacing: 2, color: "#888", marginBottom: 4 }}>{t("today")}</div><div style={{ fontSize: 36, fontWeight: 900, color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{Math.round(todayPoints).toLocaleString()}</div></div>
            <div style={{ width: 1, height: 50, background: "rgba(255,255,255,0.1)" }} />
            <div><div style={{ fontSize: 11, letterSpacing: 2, color: "#888", marginBottom: 4 }}>{t("total")}</div><div style={{ fontSize: 36, fontWeight: 900, color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{Math.round(totalPoints).toLocaleString()}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 13, color: "#888" }}>
            <span>  {sessionsCompleted} {t("completed")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${streakQualified ? 100 : Math.max((sessionCredits / MIN_DAILY_SESSION_CREDITS) * 100, qualifyingMeditations > 0 ? 100 : 0)}%`, height: "100%", borderRadius: 3, background: streakQualified ? "linear-gradient(90deg, #00E676, #69F0AE)" : "linear-gradient(90deg, #FF8C00, #FFD700)", transition: "width 0.5s ease" }} />
            </div>
            <span style={{ fontSize: 11, color: streakQualified ? "#00E676" : "#FF8C00", fontWeight: 700, whiteSpace: "nowrap" }}>
              {streakQualified ? t("streakSecured") : `${fmtSessionCredits(sessionCredits)}/${MIN_DAILY_SESSION_CREDITS} ${t("workoutsOrMed")}`}
            </span>
          </div>
        </div>

        <MissionCard mission={mission} onClaim={handleClaimMission} loading={missionClaiming} lang={lang} />
        <ActivationCard
          canInstall={Boolean(installPromptEvent)}
          installReady={installReady}
          notificationPermission={notificationPermission}
          webPushEnabled={Boolean(appConfig.webPushEnabled)}
          pushSubscribed={Boolean(pushStatus?.subscribed)}
          pushReady={pushReady}
          lastPushSentAt={pushStatus?.lastPushSentAt || settings?.pushLastSentAt || null}
          statusMessage={activationStatusMessage}
          onInstall={handleInstallApp}
          onEnableNudges={handleEnableNudges}
          onSendTest={handleSendTestNudge}
          lang={lang}
        />
        <QuickStartCard onStartQuick={startQuickReset} lang={lang} />
        <PressureCard pressure={pressure} onOpenLeaderboard={() => setScreen("leaderboard")} lang={lang} />

        {mode === "workout" && (<>
        {/* Next Alarm / Rest Day */}
        {isActiveToday ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div><div style={{ fontSize: 11, letterSpacing: 2, color: "#666", marginBottom: 4 }}>{t("nextAlert")}</div><div style={{ fontSize: 28, fontWeight: 900, color: "#FF4D00", fontFamily: "'Courier New', monospace" }}>{countdown || "\u2014"}</div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>"{settings?.alarmMessage || "Let's go!"}"</span>
              {alarmPrompt?.subtitle && <span style={{ fontSize: 11, color: "#F3D8B8", maxWidth: 190, textAlign: "right", lineHeight: 1.35 }}>{alarmPrompt.subtitle}</span>}
              <span style={{ fontSize: 11, padding: "3px 10px", background: "rgba(255,77,0,0.12)", borderRadius: 20, color: "#FF8C00" }}>{t("every")} {fmtIntervalOption(settings?.intervalMinutes || 45)}</span>
              {settings?.startHour != null && settings?.endHour != null && <span style={{ fontSize: 11, padding: "3px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 20, color: "#888" }}>{settings.startHour === 0 ? "12AM" : settings.startHour <= 12 ? settings.startHour + (settings.startHour < 12 ? "AM" : "PM") : (settings.startHour-12) + "PM"} - {settings.endHour === 0 ? "12AM" : settings.endHour <= 12 ? settings.endHour + (settings.endHour < 12 ? "AM" : "PM") : (settings.endHour-12) + "PM"}</span>}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,230,118,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, border: "1px solid rgba(0,230,118,0.15)" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#00E676" }}>{t("restDay")}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#00E676" }}>{"\uD83C\uDFD6\uFE0F"}</div>
              {countdown && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{t("nextAlert")}: {countdown}</div>}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>{t("extraCreditAvail")}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button onClick={() => setShowExtraCredit(true)} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,215,0,0.05))", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 14, color: "#FFD700", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\u2B50"}</span><span>{t("extraCredit")}</span>
          </button>
          <button onClick={() => setScreen("awards")} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,215,0,0.05))", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 14, color: "#FFD700", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDFC5"}</span><span>{t("awards")}</span>{unlockedAwards.size > 0 && <span style={{ fontSize: 10 }}>{unlockedAwards.size}/{AWARDS.length}</span>}
          </button>
          <button onClick={() => setScreen("leaderboard")} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,77,0,0.05))", border: "1px solid rgba(255,77,0,0.2)", borderRadius: 14, color: "#FF8C00", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDFC6"}</span><span>{t("leaderboard")}</span>
          </button>
        </div>

        {/* Info Pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
               {settings?.duration === "random" ? "\ud83c\udfb2 Random" : `${fmtDuration(settings?.duration || 2)} ${t("sessions")}`}
          </div>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
             {settings?.duration === "random" ? "?" : DURATION_MULTIPLIERS[settings?.duration || 2]} {t("multiplier")}
          </div>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
            {settings?.selectedExercises?.length || 10} {t("exerciseCount")}
          </div>
        </div>
        </>)}

        {/* Meditation Panel */}
        {mode === "meditation" && (
          <MeditationPanel todayMedSessions={todayMedSessions} qualifyingMeditationsToday={qualifyingMeditations} onStartMeditation={startMeditation} totalPoints={totalPoints} lang={lang} />
        )}

        {/* History */}
        {mode === "workout" && history.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, letterSpacing: 2, color: "#666", marginBottom: 12 }}>{t("recentActivity")}</h3>
            {history.slice(0, 8).map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{h.exercise.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {h.exercise.name}
                      {h.type === "extra" && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,215,0,0.2)", borderRadius: 4, color: "#FFD700", fontWeight: 700, letterSpacing: 1 }}>EXTRA</span>}
                      {h.type === "meditation" && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(138,92,246,0.2)", borderRadius: 4, color: "#A78BFA", fontWeight: 700, letterSpacing: 1 }}>MEDITATION</span>}
                      {!h.wasCompleted && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,107,107,0.2)", borderRadius: 4, color: "#FF6B6B", fontWeight: 700 }}>STOPPED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>{new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: h.type === "meditation" ? "#A78BFA" : (h.wasCompleted !== false ? "#00E676" : "#FF6B6B") }}>+{Math.round(h.points * 10) / 10}</span>
              </div>
            ))}
          </div>
        )}

        {/* Demo Controls   only visible with ?demo=true */}
        {DEMO_MODE && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 8, padding: "12px 0" }}>
          <div style={{ textAlign: "center", fontSize: 11, color: "#444", marginBottom: 12 }}>  Demo Mode: Alarms every ~20s</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={handleEndDay} style={{ padding: "10px 20px", background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 10, color: "#00E676", fontSize: 12, fontWeight: 700 }}>{t("endDay")}</button>
            <button onClick={handleMissedDay} style={{ padding: "10px 20px", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 10, color: "#FF6B6B", fontSize: 12, fontWeight: 700 }}>{t("missedDay")}</button>
          </div>
        </div>
        )}
      </div>

      {/* Overlays */}
      {showAlarm && currentExercise && <AlarmPopup prompt={alarmPrompt} exercise={currentExercise} duration={resolvedDuration} onStart={() => { setShowAlarm(false); setShowTimer(true); }} onSkip={() => { setShowAlarm(false); setProgress(prev => ({ ...prev, sessionsSkipped: (prev?.sessionsSkipped || 0) + 1 })); scheduleNextAlarm(); }} />}
      {showTimer && currentExercise && <WorkoutTimer exercise={currentExercise} durationMinutes={resolvedDuration} lang={lang} streak={streak} sessionType="alarm" sessionContext={sessionContext} onComplete={(pts, wasCompleted, meta) => handleWorkoutComplete(pts, currentExercise, wasCompleted, "alarm", resolvedDuration, meta)} />}
      {showExtraCredit && <ExtraCreditModal exercises={EXERCISES} duration={settings?.duration || 2} lang={lang} streak={streak} sessionContext={sessionContext} onComplete={(pts, ex, wasCompleted, selectedDur, meta) => handleWorkoutComplete(pts, ex, wasCompleted, "extra", selectedDur, meta)} onClose={() => setShowExtraCredit(false)} />}
      {showMedTimer && currentMedType && <MeditationTimer medType={currentMedType} durationMinutes={currentMedDur} sessionNumber={currentMedSession} lang={lang} streak={streak} sessionContext={sessionContext} onComplete={handleMeditationComplete} />}
      {evoPopup && <EvolutionPopup oldTier={evoPopup.oldTier} newTier={evoPopup.newTier} onClose={() => setEvoPopup(null)} />}
      {awardPopup && <AwardPopup award={awardPopup} lang={lang} onClose={() => setAwardPopup(null)} />}
      {missionPopup && <MissionPopup mission={missionPopup.mission} bonusPoints={missionPopup.bonusPoints} onClose={() => setMissionPopup(null)} />}
      {showWeeklySummary && <WeeklySummary weekData={weekData} streak={streak} totalPoints={totalPoints} lang={lang} onClose={() => setShowWeeklySummary(false)} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<BeastModeApp />);
