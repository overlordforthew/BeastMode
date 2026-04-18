import React from "react";
import { supportsNotifications } from "../lib/app-client.js";
import { useT } from "../lib/i18n.js";

export function MissionCard({ mission, onClaim, loading, lang }) {
  const t = useT(lang || "en");
  if (!mission) return null;

  const accents = {
    fire: { border: "1px solid rgba(255,106,0,0.28)", glow: "rgba(255,106,0,0.18)", button: "linear-gradient(135deg, #FF4D00, #FFB347)" },
    zen: { border: "1px solid rgba(138,92,246,0.28)", glow: "rgba(138,92,246,0.18)", button: "linear-gradient(135deg, #7C3AED, #A78BFA)" },
    gold: { border: "1px solid rgba(255,215,0,0.28)", glow: "rgba(255,215,0,0.16)", button: "linear-gradient(135deg, #FFB800, #FFD700)" },
    ember: { border: "1px solid rgba(255,115,0,0.28)", glow: "rgba(255,115,0,0.18)", button: "linear-gradient(135deg, #F97316, #FDBA74)" },
    boost: { border: "1px solid rgba(0,230,118,0.24)", glow: "rgba(0,230,118,0.18)", button: "linear-gradient(135deg, #00C853, #69F0AE)" },
  };
  const accent = accents[mission.accent] || accents.fire;

  return (
    <div style={{ position: "relative", overflow: "hidden", padding: "18px 18px 16px", borderRadius: 20, marginBottom: 16, background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", border: accent.border, boxShadow: `0 20px 40px ${accent.glow}` }}>
      <div style={{ position: "absolute", top: -24, right: -12, width: 110, height: 110, borderRadius: "50%", background: `radial-gradient(circle, ${accent.glow}, transparent 70%)` }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#8F8F97", marginBottom: 6 }}>{t("dailyMission")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{mission.emoji}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{mission.title}</div>
                <div style={{ fontSize: 13, color: "#C8C8CF", lineHeight: 1.4 }}>{mission.description}</div>
              </div>
            </div>
          </div>
          <div style={{ padding: "8px 10px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center", minWidth: 74 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#FFD700" }}>+{mission.bonusPoints}</div>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#8F8F97" }}>{t("bonusPointsLabel")}</div>
          </div>
        </div>
        <div style={{ width: "100%", height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)", marginBottom: 10 }}>
          <div style={{ width: `${mission.progressRatio * 100}%`, height: "100%", borderRadius: 999, background: accent.button, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: mission.complete ? "#FDE68A" : "#F4F4F5" }}>{mission.progressText}</div>
            <div style={{ fontSize: 11, color: mission.claimed ? "#69F0AE" : mission.complete ? "#FFD7A3" : "#8F8F97", marginTop: 4 }}>
              {mission.claimed ? t("missionClaimed") : mission.complete ? t("missionReady") : t("keepRolling")}
            </div>
          </div>
          {mission.complete && !mission.claimed ? (
            <button onClick={onClaim} disabled={loading} style={{ padding: "12px 16px", background: accent.button, color: mission.accent === "gold" ? "#000" : "#fff", border: "none", borderRadius: 14, fontSize: 12, fontWeight: 900, letterSpacing: 1.2, minWidth: 132, boxShadow: "0 12px 28px rgba(0,0,0,0.18)" }}>
              {loading ? "..." : `${t("claimReward")} +${mission.bonusPoints}`}
            </button>
          ) : (
            <div style={{ padding: "10px 12px", borderRadius: 14, background: mission.claimed ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.05)", border: mission.claimed ? "1px solid rgba(0,230,118,0.22)" : "1px solid rgba(255,255,255,0.08)", color: mission.claimed ? "#69F0AE" : "#C8C8CF", fontSize: 12, fontWeight: 800 }}>
              {mission.claimed ? t("lockedInToday") : `${mission.progressCurrent}/${mission.progressTarget}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickStartCard({ onStartQuick, lang }) {
  const t = useT(lang || "en");
  const quickOptions = [
    { id: "random", label: t("quickRandom"), emoji: "🎲" },
    { id: "focus", label: t("quickFocus"), emoji: "🧱" },
    { id: "energy", label: t("quickEnergy"), emoji: "⚡" },
    { id: "mobility", label: t("quickMobility"), emoji: "🦵" },
    { id: "calm", label: t("quickCalm"), emoji: "🫁" },
  ];

  return (
    <div style={{ padding: "18px", borderRadius: 20, marginBottom: 16, background: "linear-gradient(135deg, rgba(255,77,0,0.12), rgba(255,179,71,0.08))", border: "1px solid rgba(255,140,0,0.22)", boxShadow: "0 20px 44px rgba(255,106,0,0.12)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#8F8F97", marginBottom: 6 }}>{t("quickReset")}</div>
          <div style={{ fontSize: 14, color: "#F4E2CF" }}>{t("quickResetHint")}</div>
        </div>
        <div style={{ fontSize: 28 }}>⚔️</div>
      </div>
      <button onClick={() => onStartQuick("random")} style={{ width: "100%", padding: "16px 18px", background: "linear-gradient(135deg, #FF4D00, #FFB347)", color: "#fff", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 900, letterSpacing: 1.4, marginBottom: 12, boxShadow: "0 16px 32px rgba(255,77,0,0.22)" }}>
        {t("startReset")}
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
        {quickOptions.map((option) => (
          <button key={option.id} onClick={() => onStartQuick(option.id)} style={{ padding: "10px 6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, color: "#F7F7F8", fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 20 }}>{option.emoji}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActivationCard({
  canInstall,
  installReady,
  notificationPermission,
  webPushEnabled,
  pushSubscribed,
  pushReady,
  lastPushSentAt,
  statusMessage,
  onInstall,
  onEnableNudges,
  onSendTest,
  lang,
}) {
  const t = useT(lang || "en");
  const notificationsReady = notificationPermission === "granted";
  const notificationsBlocked = notificationPermission === "denied";
  const notificationsSupported = supportsNotifications();
  const secondaryButtonStyle = {
    flex: 1,
    minWidth: 140,
    padding: "14px 16px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "#F4F4F5",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 1,
  };
  const lastNudgeText = lastPushSentAt
    ? new Date(lastPushSentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  const statusBadges = [];

  if (webPushEnabled && notificationsSupported) {
    if (pushReady) {
      statusBadges.push({
        id: "push-ready",
        label: t("nudgesReady"),
        background: "rgba(0,230,118,0.12)",
        border: "1px solid rgba(0,230,118,0.22)",
        color: "#8EF5B4",
      });
    } else if (pushSubscribed) {
      statusBadges.push({
        id: "push-linked",
        label: t("nudgesLinked"),
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#C8C8CF",
      });
    } else if (notificationsBlocked) {
      statusBadges.push({
        id: "push-blocked",
        label: t("notificationBlocked"),
        background: "rgba(255,107,107,0.12)",
        border: "1px solid rgba(255,107,107,0.22)",
        color: "#FFB3B3",
      });
    }
  }

  if (installReady) {
    statusBadges.push({
      id: "install-ready",
      label: t("installReady"),
      background: "rgba(0,230,118,0.12)",
      border: "1px solid rgba(0,230,118,0.22)",
      color: "#8EF5B4",
    });
  }

  if (lastNudgeText) {
    statusBadges.push({
      id: "last-nudge",
      label: `${t("lastNudge")}: ${lastNudgeText}`,
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      color: "#C8C8CF",
    });
  }

  if ((!notificationsSupported || !webPushEnabled || pushReady) && (installReady || !canInstall)) {
    return null;
  }

  return (
    <div style={{ padding: "18px", borderRadius: 20, marginBottom: 16, background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#8F8F97", marginBottom: 6 }}>{t("activationTitle")}</div>
          <div style={{ fontSize: 14, color: "#F3F4F6", lineHeight: 1.45 }}>{t("activationHint")}</div>
        </div>
        <div style={{ fontSize: 28 }}>📲</div>
      </div>
      {statusBadges.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {statusBadges.map((badge) => (
            <span key={badge.id} style={{ padding: "7px 12px", borderRadius: 999, background: badge.background, border: badge.border, color: badge.color, fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {webPushEnabled && notificationsSupported ? (
          <button
            onClick={onEnableNudges}
            disabled={pushReady || notificationsBlocked}
            style={{
              flex: 1,
              minWidth: 160,
              padding: "14px 16px",
              background: pushReady
                ? "rgba(0,230,118,0.12)"
                : notificationsBlocked
                  ? "rgba(255,107,107,0.12)"
                  : "linear-gradient(135deg, rgba(255,77,0,0.18), rgba(255,179,71,0.14))",
              border: pushReady
                ? "1px solid rgba(0,230,118,0.22)"
                : notificationsBlocked
                  ? "1px solid rgba(255,107,107,0.22)"
                  : "1px solid rgba(255,140,0,0.22)",
              borderRadius: 14,
              color: pushReady ? "#8EF5B4" : notificationsBlocked ? "#FFB3B3" : "#FFB347",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            {pushReady
              ? t("nudgesReady")
              : notificationsBlocked
                ? t("notificationBlocked")
                : notificationsReady
                  ? t("linkThisDevice")
                  : t("enableNudges")}
          </button>
        ) : null}
        {pushSubscribed ? (
          <button onClick={onSendTest} style={secondaryButtonStyle}>
            {t("sendTestNudge")}
          </button>
        ) : null}
        {(canInstall || installReady) ? (
          <button onClick={onInstall} disabled={!canInstall || installReady} style={secondaryButtonStyle}>
            {installReady ? t("installReady") : t("installApp")}
          </button>
        ) : null}
      </div>
      {statusMessage ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#F3D8B8", lineHeight: 1.45 }}>
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}

export function PressureCard({ pressure, onOpenLeaderboard, lang }) {
  const t = useT(lang || "en");
  if (!pressure) return null;

  return (
    <div style={{ padding: "18px", borderRadius: 20, marginBottom: 16, background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#8F8F97", marginBottom: 6 }}>{t("socialPressure")}</div>
          <div style={{ fontSize: 15, color: "#F3F4F6" }}>
            {pressure.rivalAbove ? `${pressure.rivalAbove.gap} pts to pass ${pressure.rivalAbove.username}` : "You're setting the pace today."}
          </div>
        </div>
        <button onClick={onOpenLeaderboard} style={{ padding: "10px 12px", background: "rgba(255,77,0,0.12)", border: "1px solid rgba(255,77,0,0.2)", borderRadius: 12, color: "#FFB347", fontSize: 12, fontWeight: 800 }}>
          #{pressure.userRank || "?"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pressure.rivalAbove && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: "rgba(255,140,0,0.08)", border: "1px solid rgba(255,140,0,0.14)" }}>
            <div>
              <div style={{ fontSize: 12, color: "#8F8F97", marginBottom: 3 }}>{t("rivalTarget")}</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{pressure.rivalAbove.username}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#FFD700" }}>+{pressure.rivalAbove.gap}</div>
              <div style={{ fontSize: 11, color: "#8F8F97" }}>pts to catch</div>
            </div>
          </div>
        )}

        {pressure.buddy && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <div style={{ fontSize: 12, color: "#8F8F97", marginBottom: 3 }}>{t("buddyLane")}</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{pressure.buddy.username}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: pressure.buddy.ahead ? "#FFB347" : "#69F0AE" }}>
                {pressure.buddy.ahead ? `${pressure.buddy.gap} behind` : `${pressure.buddy.gap} ahead`}
              </div>
              <div style={{ fontSize: 11, color: "#8F8F97" }}>{pressure.buddy.todayPoints} pts today</div>
            </div>
          </div>
        )}

        {pressure.team ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.14)" }}>
            <div>
              <div style={{ fontSize: 12, color: "#8F8F97", marginBottom: 3 }}>{t("teamLane")}</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{pressure.team.teamName}</div>
              <div style={{ fontSize: 11, color: "#8F8F97", marginTop: 3 }}>
                {pressure.team.securedToday}/{pressure.team.memberCount} streaks secured today
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#69F0AE" }}>{Math.round(pressure.team.todayPoints)} pts</div>
              <div style={{ fontSize: 11, color: "#8F8F97" }}>
                {pressure.team.leader ? `${pressure.team.leader.username} leads` : `${pressure.team.memberCount} members`}
              </div>
            </div>
          </div>
        ) : !pressure.buddy && !pressure.rivalAbove ? (
          <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#A1A1AA", fontSize: 13 }}>
            {t("noPressureYet")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
