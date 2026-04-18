import React, { useEffect } from "react";

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

export default ExerciseAnimation;
