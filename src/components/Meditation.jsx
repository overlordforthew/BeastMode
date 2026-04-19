import React, { useEffect, useRef, useState } from "react";
import BeastModeScoring from "../../public/scoring.js";
import { MEDITATION_TYPES } from "../lib/app-data.js";
import { useT } from "../lib/i18n.js";
import { AmbientAudio, playSound } from "../lib/audio.js";
import { getMeditationPrompt } from "../lib/meditation-guides.js";
import { onHardwareBack } from "../lib/native-shell.js";
import { getSessionImpactMessages } from "../lib/session-feedback.js";

function CloseButton({ onClick, accent = "#C4B5FD" }) {
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
        color: accent,
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
  MEDITATION_DURATIONS,
  calcMeditationPoints,
  calcMeditationPartialPoints,
  getMeditationSessionMultiplier,
  getStreakMultiplier,
  estimateAwardedPoints,
} = BeastModeScoring;

//     MEDITATION TIMER
function MeditationTimer({ medType, durationMinutes, sessionNumber, onComplete, onClose, lang, streak = 1, sessionContext = null }) {
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

  const handleDismiss = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (ambientRef.current) { ambientRef.current.stop(1); ambientRef.current = null; }
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
        <CloseButton onClick={handleDismiss} />
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

export { MeditationPanel, MeditationTimer };
