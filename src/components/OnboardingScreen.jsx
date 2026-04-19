import React, { useState } from "react";
import { api } from "../lib/app-client.js";
import { DAYS_OF_WEEK } from "../lib/app-data.js";
import { useT } from "../lib/i18n.js";

const DEFAULT_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];

function formatHour(i) {
  if (i === 0) return "12:00 AM";
  if (i < 12) return `${i}:00 AM`;
  if (i === 12) return "12:00 PM";
  return `${i - 12}:00 PM`;
}

function OnboardingScreen({
  onComplete,
  user,
  settings,
  lang,
  setLang,
  webPushEnabled,
  notificationPermission,
  onRequestPush,
}) {
  const t = useT(lang);
  const [step, setStep] = useState(1);
  const [startHour, setStartHour] = useState(
    Number.isInteger(settings?.startHour) ? settings.startHour : 8
  );
  const [endHour, setEndHour] = useState(
    Number.isInteger(settings?.endHour) ? settings.endHour : 17
  );
  const [activeDays, setActiveDays] = useState(
    settings?.activeDays?.length ? settings.activeDays : DEFAULT_WEEKDAYS
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pushSupported = Boolean(
    webPushEnabled && notificationPermission && notificationPermission !== "unsupported"
  );
  const pushAlreadyGranted = notificationPermission === "granted";
  const pushBlocked = notificationPermission === "denied";

  const toggleDay = (key) => {
    setActiveDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
  };

  async function markOnboarded() {
    await api("/api/user/onboarding/complete", { method: "POST" });
  }

  async function handleUseDefaults() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await markOnboarded();
      onComplete();
    } catch (e) {
      setError(e.message || "Could not finish setup. Try again.");
      setBusy(false);
    }
  }

  async function handleFinish(requestPush) {
    if (busy) return;
    if (!activeDays.length) {
      setError(t("onbPickAtLeastOneDay"));
      return;
    }
    if (startHour === endHour) {
      setError(t("onbHoursMustDiffer"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/user/settings", {
        method: "PUT",
        body: {
          startHour,
          endHour,
          activeDays,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || settings?.timezone || "UTC",
        },
      });
      if (requestPush && pushSupported && !pushAlreadyGranted && onRequestPush) {
        try {
          await onRequestPush();
        } catch {
          // user declined or OS-level denial — still finish onboarding
        }
      }
      await markOnboarded();
      onComplete();
    } catch (e) {
      setError(e.message || "Could not save. Try again.");
      setBusy(false);
    }
  }

  const primaryBtn = {
    width: "100%",
    padding: "18px",
    background: "linear-gradient(135deg, #FF4D00, #FF8C00)",
    color: "#fff",
    border: "none",
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: 2,
    marginBottom: 12,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
  const secondaryBtn = {
    width: "100%",
    padding: "14px",
    background: "rgba(255,255,255,0.04)",
    color: "#aaa",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  };

  const container = {
    minHeight: "100vh",
    maxWidth: 420,
    margin: "0 auto",
    padding: "32px 20px",
    display: "flex",
    flexDirection: "column",
  };

  if (step === 1) {
    return (
      <div style={container}>
        <div style={{ fontSize: 12, letterSpacing: 3, color: "#FF8C00", marginBottom: 8 }}>
          {t("onbStep1Label")}
        </div>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: 2,
            color: "#FFD700",
            marginBottom: 8,
          }}
        >
          {t("onbWelcomeTitle")}
        </h1>
        <p style={{ fontSize: 15, color: "#aaa", lineHeight: 1.5, marginBottom: 28 }}>
          {t("onbWelcomeSub")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
          {[
            { icon: "\uD83D\uDD14", title: t("onbBullet1Title"), body: t("onbBullet1Body") },
            { icon: "\uD83D\uDCAA", title: t("onbBullet2Title"), body: t("onbBullet2Body") },
            { icon: "\uD83D\uDD25", title: t("onbBullet3Title"), body: t("onbBullet3Body") },
          ].map((b, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 24, lineHeight: 1 }}>{b.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#FF8C00", letterSpacing: 1, marginBottom: 4 }}>
                  {b.title}
                </div>
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>{b.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button style={primaryBtn} onClick={() => setStep(2)} disabled={busy}>
          {t("onbSetSchedule")}
        </button>
        <button style={secondaryBtn} onClick={handleUseDefaults} disabled={busy}>
          {busy ? "..." : t("onbUseDefaults")}
        </button>
        {error && (
          <div style={{ color: "#FF6B6B", fontSize: 12, marginTop: 10, textAlign: "center" }}>{error}</div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 8 }}>
          {[{ code: "en", label: "EN" }, { code: "es", label: "ES" }, { code: "ja", label: "\u65E5" }].map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code, { syncRemote: true })}
              style={{
                padding: "6px 12px",
                background: lang === l.code ? "rgba(255,77,0,0.15)" : "rgba(255,255,255,0.04)",
                border: lang === l.code ? "1px solid rgba(255,77,0,0.3)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                color: lang === l.code ? "#FF8C00" : "#555",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // step 2: schedule + nudges
  const selectStyle = {
    width: "100%",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23FF8C00' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
  };
  const labelStyle = { fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#FF8C00", marginBottom: 8 };
  const hintStyle = { fontSize: 12, color: "#666", marginBottom: 12 };
  const hours = Array.from({ length: 24 }, (_, i) => (
    <option key={i} value={i}>
      {formatHour(i)}
    </option>
  ));

  return (
    <div style={container}>
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#FF8C00", marginBottom: 8 }}>
        {t("onbStep2Label")}
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1.5, color: "#FFD700", marginBottom: 8 }}>
        {t("onbScheduleTitle")}
      </h1>
      <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.5, marginBottom: 22 }}>
        {t("onbScheduleSub")}
      </p>

      <div style={{ marginBottom: 18 }}>
        <div style={labelStyle}>{t("beastModeHours")}</div>
        <div style={hintStyle}>{t("onbHoursHint")}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, letterSpacing: 1 }}>{t("start")}</div>
            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} style={selectStyle}>
              {hours}
            </select>
          </div>
          <div style={{ color: "#555", fontSize: 16, marginTop: 14 }}>{"\u2192"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, letterSpacing: 1 }}>{t("end")}</div>
            <select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} style={selectStyle}>
              {hours}
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={labelStyle}>{t("activeDays")}</div>
        <div style={hintStyle}>{t("onbDaysHint")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {DAYS_OF_WEEK.map((d) => {
            const on = activeDays.includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => toggleDay(d.key)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  background: on ? "rgba(255,77,0,0.2)" : "rgba(255,255,255,0.04)",
                  border: on ? "1px solid rgba(255,77,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  color: on ? "#FF8C00" : "#555",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {pushSupported && !pushBlocked && (
        <div
          style={{
            padding: 14,
            background: "rgba(255,140,0,0.06)",
            border: "1px solid rgba(255,140,0,0.2)",
            borderRadius: 14,
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "#FFD700", letterSpacing: 1, marginBottom: 6 }}>
            {"\uD83D\uDD14"} {t("onbNudgeTitle")}
          </div>
          <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.5 }}>
            {pushAlreadyGranted ? t("onbNudgeAlreadyOn") : t("onbNudgeBody")}
          </div>
        </div>
      )}

      {pushBlocked && (
        <div
          style={{
            padding: 12,
            background: "rgba(255,107,107,0.08)",
            border: "1px solid rgba(255,107,107,0.2)",
            borderRadius: 12,
            marginBottom: 22,
            fontSize: 12,
            color: "#FFB6B6",
            lineHeight: 1.4,
          }}
        >
          {t("onbNudgeBlocked")}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {error && (
        <div style={{ color: "#FF6B6B", fontSize: 13, marginBottom: 10, textAlign: "center" }}>{error}</div>
      )}

      {pushSupported && !pushAlreadyGranted && !pushBlocked ? (
        <>
          <button style={primaryBtn} onClick={() => handleFinish(true)} disabled={busy}>
            {busy ? "..." : t("onbEnableNudges")}
          </button>
          <button style={secondaryBtn} onClick={() => handleFinish(false)} disabled={busy}>
            {t("onbNotNow")}
          </button>
        </>
      ) : (
        <button style={primaryBtn} onClick={() => handleFinish(false)} disabled={busy}>
          {busy ? "..." : t("onbLetsGo")}
        </button>
      )}

      <button
        style={{ ...secondaryBtn, marginTop: 8, background: "transparent", border: "none" }}
        onClick={() => setStep(1)}
        disabled={busy}
      >
        {"\u2190"} {t("back")}
      </button>
    </div>
  );
}

export default OnboardingScreen;
