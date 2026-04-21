import React, { useEffect, useRef, useState } from "react";
import BeastModeScoring from "../../public/scoring.js";
import ExerciseAnimation from "./ExerciseAnimation.jsx";
import { EXERCISES } from "../lib/app-data.js";
import { useT } from "../lib/i18n.js";
import { playSound } from "../lib/audio.js";
import { calcPoints, fmtDuration, getSessionImpactMessages } from "../lib/session-feedback.js";
import { onHardwareBack } from "../lib/native-shell.js";

function CloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#ccc",
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      {"\u2715"}
    </button>
  );
}

const {
  DURATION_OPTIONS,
  DURATION_MULTIPLIERS,
  calcWorkoutPartialPointsFromBase,
  getStreakMultiplier,
  estimateAwardedPoints,
} = BeastModeScoring;

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
function WorkoutTimer({ exercise, durationMinutes, onComplete, onClose, lang, streak = 1, sessionType = "alarm", sessionContext = null }) {
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

  const wakeLockRef = useRef(null);

  useEffect(() => {
    let released = false;
    let sentinel = null;
    const acquire = async () => {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => { wakeLockRef.current = null; });
      } catch {
        // Permission denied or not visible — ignore; alarm sounds still wake device.
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current && !released) {
        acquire();
      }
    };
    acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinel) {
        try { sentinel.release(); } catch {}
      }
      wakeLockRef.current = null;
    };
  }, []);


  const handleDismiss = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (started && !completed && !stoppedEarly) {
      handleStopEarly();
    } else {
      onClose?.();
    }
  };

  useEffect(() => {
    return onHardwareBack(() => {
      handleDismiss();
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, completed, stoppedEarly]);

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
      <div style={{ position: "relative", background: "linear-gradient(145deg, #0d0d1a, #1a1a2e)", borderRadius: 24, padding: "36px 28px", maxWidth: 380, width: "100%", textAlign: "center", border: "1px solid rgba(255,77,0,0.15)" }}>
        {countdownNum === null && <CloseButton onClick={handleDismiss} />}
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

export { AlarmPopup, ExtraCreditModal, WorkoutTimer };
