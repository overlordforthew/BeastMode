import React, { useState } from "react";
import BeastModeScoring from "../../public/scoring.js";
import { ALERT_INTERVAL_OPTIONS, api } from "../lib/app-client.js";
import { ALL_DAYS, DAYS_OF_WEEK, EXERCISES } from "../lib/app-data.js";
import { useT } from "../lib/i18n.js";
import { fmtDuration } from "../lib/session-feedback.js";

const { DURATION_OPTIONS, DURATION_MULTIPLIERS } = BeastModeScoring;

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

export default DailySetupScreen;
