import React from "react";
import BeastModeScoring from "../../public/scoring.js";

const { getEvolution, getNextEvolution, getEvolutionProgress } = BeastModeScoring;

export function EvolutionBadge({ points, size = 48, glow = false }) {
  const evolution = getEvolution(points);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #1a1a2e, #2d1400)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.55, border: "2px solid rgba(255,77,0,0.3)", boxShadow: glow ? "0 0 15px rgba(255,77,0,0.3)" : "none" }}>
      {evolution.emoji}
    </div>
  );
}

export function EvolutionBar({ points }) {
  const current = getEvolution(points);
  const next = getNextEvolution(points);
  const progress = getEvolutionProgress(points);

  return (
    <div style={{ marginBottom: 16, padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{current.emoji} {current.name}</span>
        {next && <span style={{ fontSize: 12, color: "#888" }}>{Math.round(next.threshold - points)} pts to {next.emoji} {next.name}</span>}
      </div>
      <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", borderRadius: 4, width: `${progress * 100}%`, background: "linear-gradient(90deg, #FF4D00, #FFD700)", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
        <span style={{ fontSize: 18 }}>{current.emoji}</span>
        <span style={{ fontSize: 11, color: "#444" }}>Tap to see all levels {"›"}</span>
        {next && <span style={{ fontSize: 18, opacity: 0.4 }}>{next.emoji}</span>}
      </div>
    </div>
  );
}
