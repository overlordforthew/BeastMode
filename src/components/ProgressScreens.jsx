import React, { useEffect, useState } from "react";
import BeastModeScoring from "../../public/scoring.js";
import { api } from "../lib/app-client.js";
import { AWARDS } from "../lib/app-data.js";
import { playSound } from "../lib/audio.js";
import { useT } from "../lib/i18n.js";
import { EvolutionBadge } from "./EvolutionStatus.jsx";

const { EVOLUTION_TIERS, getEvolution } = BeastModeScoring;

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

export {
  AwardPopup,
  AwardsScreen,
  EvolutionPopup,
  EvolutionScreen,
  LeaderboardScreen,
  MissionPopup,
  WeeklySummary,
};
