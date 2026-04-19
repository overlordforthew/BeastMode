import React, { useEffect, useState } from "react";
import { APP_VERSION, IS_NATIVE_SHELL, isNewerVersion } from "../lib/app-client.js";
import { useT } from "../lib/i18n.js";

const DISMISS_KEY = "bm_update_dismissed_version";

function UpdateBanner({ latestVersion, downloadUrl, lang }) {
  const t = useT(lang || "en");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored && !isNewerVersion(latestVersion, stored)) {
        setDismissed(true);
      }
    } catch {}
  }, [latestVersion]);

  if (!latestVersion || !isNewerVersion(latestVersion) || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, latestVersion);
    } catch {}
    setDismissed(true);
  };

  const handleOpen = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      style={{
        padding: "12px 14px",
        marginBottom: 12,
        background: "linear-gradient(135deg, rgba(255,77,0,0.18), rgba(255,215,0,0.12))",
        border: "1px solid rgba(255,140,0,0.35)",
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#FFB347", fontWeight: 800, marginBottom: 2 }}>
          {t("updateAvailable")}
        </div>
        <div style={{ fontSize: 12, color: "#F3D8B8", lineHeight: 1.4 }}>
          {IS_NATIVE_SHELL ? t("updateHintNative") : t("updateHintWeb")}
          <span style={{ marginLeft: 6, color: "#aaa" }}>
            {APP_VERSION} {"\u2192"} {latestVersion}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {downloadUrl && (
          <button
            onClick={handleOpen}
            style={{
              padding: "8px 12px",
              background: "linear-gradient(135deg, #FF4D00, #FF8C00)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.8,
            }}
          >
            {t("updateOpen")}
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            padding: "8px 10px",
            background: "rgba(255,255,255,0.05)",
            color: "#aaa",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {t("updateDismiss")}
        </button>
      </div>
    </div>
  );
}

export default UpdateBanner;
