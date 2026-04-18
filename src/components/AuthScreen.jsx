import React, { useEffect, useRef, useState } from "react";
import { IS_NATIVE_SHELL, api, fetchPublicConfig, loadGoogleIdentityScript } from "../lib/app-client.js";
import { useT } from "../lib/i18n.js";

export default function AuthScreen({ onAuth, lang, setLang }) {
  const t = useT(lang);
  const onAuthRef = useRef(onAuth);
  const googleButtonRef = useRef(null);
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [appConfig, setAppConfig] = useState({ googleSignInEnabled: false, googleClientId: null, passwordResetEnabled: true });
  const [googleState, setGoogleState] = useState("idle");
  const [googleError, setGoogleError] = useState("");

  const trimmedIdentifier = identifier.trim();
  const trimmedEmail = email.trim();
  const trimmedResetCode = resetCode.trim();
  const canSubmit = mode === "register"
    ? Boolean(trimmedIdentifier && password.length >= 8)
    : Boolean(trimmedIdentifier && password);
  const canForgotSubmit = Boolean(trimmedEmail);
  const canResetSubmit = Boolean(trimmedEmail && trimmedResetCode.length === 6 && newPassword.length >= 8);
  const googleEnabledForThisDevice = appConfig.googleSignInEnabled && !IS_NATIVE_SHELL;
  const showGoogleSection = (mode === "login" || mode === "register") && googleEnabledForThisDevice;
  const passwordResetEnabled = appConfig.passwordResetEnabled !== false;

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    let active = true;

    fetchPublicConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig(config);
        setGoogleState(config.googleSignInEnabled && !IS_NATIVE_SHELL ? "idle" : "unavailable");
      })
      .catch((err) => {
        if (!active) return;
        setGoogleState("error");
        console.warn("Failed to load app config:", err.message || err);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showGoogleSection || !appConfig.googleClientId || !googleButtonRef.current) {
      return undefined;
    }

    let cancelled = false;
    setGoogleState("loading");
    setGoogleError("");

    loadGoogleIdentityScript()
      .then((google) => {
        if (cancelled || !googleButtonRef.current) return;

        google.accounts.id.initialize({
          client_id: appConfig.googleClientId,
          ux_mode: "popup",
          context: mode === "register" ? "signup" : "signin",
          callback: async (response) => {
            if (!response?.credential) {
              setGoogleState("error");
              setGoogleError("Google sign-in did not return a credential.");
              return;
            }

            setLoading(true);
            setError("");
            setMessage("");
            try {
              const data = await api("/api/auth/google", {
                method: "POST",
                body: JSON.stringify({ credential: response.credential, preferredLanguage: lang }),
              });
              localStorage.setItem("bm_token", data.token);
              await setLang(data.user?.language || lang);
              onAuthRef.current(data);
            } catch (err) {
              setError(err.message);
              setGoogleError(err.message);
            } finally {
              setLoading(false);
            }
          },
        });

        googleButtonRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          shape: "pill",
          size: "large",
          text: mode === "register" ? "signup_with" : "continue_with",
          width: 320,
          logo_alignment: "left",
        });
        setGoogleState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setGoogleState("error");
        setGoogleError(err.message || "Failed to load Google sign-in.");
      });

    return () => {
      cancelled = true;
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
      }
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [appConfig.googleClientId, lang, mode, setLang, showGoogleSection]);

  const inputStyle = {
    width: "100%",
    padding: "15px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    color: "#fff",
    fontSize: 15,
  };
  const labelStyle = { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: "#8E8E98", marginBottom: 8 };
  const helperStyle = { fontSize: 12, color: "#7B7B86", marginTop: 8, lineHeight: 1.45 };
  const chipStyle = {
    flex: "0 1 auto",
    minWidth: 0,
    padding: "7px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#E8E8ED",
    fontSize: 11,
    letterSpacing: 0.4,
  };
  const sectionButtonStyle = (active) => ({
    flex: 1,
    minWidth: 0,
    padding: "11px 14px",
    background: active ? "linear-gradient(135deg, rgba(255,77,0,0.22), rgba(255,179,71,0.14))" : "transparent",
    border: active ? "1px solid rgba(255,140,0,0.38)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    color: active ? "#FFB347" : "#8A8A95",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 1,
    transition: "all 0.25s ease",
  });
  const statusStyle = error
    ? { background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.24)", color: "#FFB3B3" }
    : { background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.18)", color: "#8EF5B4" };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "register"
        ? { username: trimmedIdentifier, password, email: trimmedEmail || undefined, language: lang }
        : { identifier: trimmedIdentifier, password, language: lang };
      const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem("bm_token", data.token);
      await setLang(data.user?.language || lang);
      onAuthRef.current(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (!canForgotSubmit) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail }),
      });
      setMessage(data.message || t("codeSent"));
      if (data.devCode) setResetCode(data.devCode);
      setMode("reset");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async () => {
    if (!canResetSubmit) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail, code: trimmedResetCode, newPassword }),
      });
      setMessage(t("resetSuccess"));
      setMode("login");
      setResetCode("");
      setNewPassword("");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setGoogleError("");
  };

  return (
    <div style={{ width: "100%", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px", overflowX: "hidden", background: "radial-gradient(circle at top, rgba(255,140,0,0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(255,77,0,0.14), transparent 28%), linear-gradient(180deg, #07080d 0%, #0d1018 48%, #1c0e05 100%)" }}>
      <div style={{ width: "100%", maxWidth: 420, minWidth: 0, animation: "fadeIn 0.6s ease forwards" }}>
        <div style={{ position: "relative", overflow: "hidden", marginBottom: 18, padding: "28px clamp(16px, 5vw, 24px) 22px", borderRadius: 28, background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.32)" }}>
          <div style={{ position: "absolute", top: -40, right: -18, width: 128, height: 128, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,179,71,0.25), transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: -54, left: -16, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,77,0,0.2), transparent 70%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>{"🔥"}</span>
              <span style={{ fontSize: 11, letterSpacing: 1.6, color: "#FFD9A0", fontWeight: 800 }}>BUILD THE STREAK</span>
            </div>
            <h1 style={{ fontSize: "clamp(30px, 9vw, 36px)", fontWeight: 900, letterSpacing: "clamp(2px, 1.2vw, 5px)", background: "linear-gradient(135deg, #FF6A00, #FFD700)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 10, whiteSpace: "nowrap" }}>BEAST MODE</h1>
            <p style={{ color: "#F5E8D4", fontSize: 15, lineHeight: 1.5, marginBottom: 8 }}>{t("authTagline")}</p>
            <p style={{ color: "#9A9AA4", fontSize: 13 }}>{t("authSupport")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18, maxWidth: "100%", overflow: "hidden" }}>
              <span style={chipStyle}>{t("authChipWorkouts")}</span>
              <span style={chipStyle}>{t("authChipMeditation")}</span>
              <span style={chipStyle}>{t("authChipRecovery")}</span>
            </div>
          </div>
        </div>

        <div style={{ background: "rgba(9,10,16,0.86)", backdropFilter: "blur(18px)", borderRadius: 28, padding: "24px clamp(16px, 5vw, 24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 70px rgba(0,0,0,0.28)" }}>
          {(mode === "login" || mode === "register") && (
            <form onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
              {showGoogleSection && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ ...labelStyle, marginBottom: 10 }}>{t("continueWithGoogle")}</div>
                  <div style={{ padding: 8, borderRadius: 18, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div ref={googleButtonRef} />
                    {googleState === "loading" && <span style={{ color: "#9A9AA4", fontSize: 13 }}>{t("googleLoading")}</span>}
                  </div>
                </div>
              )}

              {showGoogleSection && (
                <div style={{ position: "relative", textAlign: "center", margin: "18px 0 18px" }}>
                  <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.08)" }} />
                  <span style={{ position: "relative", background: "#090a10", padding: "0 12px", fontSize: 11, color: "#6F6F78", letterSpacing: 1.2 }}>{t("orContinueWithEmail")}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 22, minWidth: 0 }}>
                <button type="button" onClick={() => switchMode("login")} style={sectionButtonStyle(mode === "login")}>{t("login")}</button>
                <button type="button" onClick={() => switchMode("register")} style={sectionButtonStyle(mode === "register")}>{t("register")}</button>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>{mode === "login" ? t("identifier") : t("username")}</div>
                <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={mode === "login" ? t("identifier") : t("username")} autoComplete="username" style={inputStyle} onKeyDown={(event) => event.key === "Enter" && handleSubmit()} />
              </div>

              {mode === "register" && (
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}>{t("email")}</div>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("email")} type="email" autoComplete="email" style={inputStyle} onKeyDown={(event) => event.key === "Enter" && handleSubmit()} />
                  <div style={helperStyle}>{t("emailOptionalHelp")}</div>
                </div>
              )}

              <div style={{ marginBottom: mode === "login" ? 8 : 14 }}>
                <div style={labelStyle}>{t("password")}</div>
                <div style={{ position: "relative" }}>
                  <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("password")} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} style={{ ...inputStyle, paddingRight: 72 }} onKeyDown={(event) => event.key === "Enter" && handleSubmit()} />
                  <button onClick={() => setShowPassword((prev) => !prev)} type="button" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#FFB347", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
                {mode === "register" && <div style={helperStyle}>{t("passwordHint")}</div>}
              </div>

              {mode === "login" && passwordResetEnabled && (
                <div style={{ textAlign: "right", marginBottom: 16 }}>
                  <button type="button" onClick={() => switchMode("forgot")} style={{ background: "none", border: "none", color: "#FFB347", fontSize: 12, padding: 0, textDecoration: "underline", opacity: 0.9 }}>{t("forgotPassword")}</button>
                </div>
              )}

              {error && <div style={{ ...statusStyle, padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{error}</div>}
              {!error && message && <div style={{ ...statusStyle, padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{message}</div>}
              {!error && googleError && <div style={{ background: "rgba(255,179,71,0.1)", border: "1px solid rgba(255,179,71,0.24)", color: "#FFD7A3", padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{googleError}</div>}

              <button type="submit" disabled={loading || !canSubmit} style={{ width: "100%", padding: "16px", background: loading || !canSubmit ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #FF4D00, #FFB347)", color: loading || !canSubmit ? "#7B7B86" : "#fff", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 900, letterSpacing: 1.6, boxShadow: loading || !canSubmit ? "none" : "0 16px 36px rgba(255,106,0,0.28)" }}>
                {loading ? "..." : mode === "login" ? t("login") : t("register")}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={(event) => { event.preventDefault(); handleForgotSubmit(); }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#FFB347", letterSpacing: 1 }}>{t("forgotPassword")}</div>
                <p style={{ fontSize: 13, color: "#7B7B86", marginTop: 8, lineHeight: 1.45 }}>{t("codeSent")}</p>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>{t("emailRequired")}</div>
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailRequired")} type="email" autoComplete="email" style={inputStyle} onKeyDown={(event) => event.key === "Enter" && handleForgotSubmit()} />
              </div>
              {error && <div style={{ ...statusStyle, padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{error}</div>}
              {!error && message && <div style={{ ...statusStyle, padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{message}</div>}
              <button type="submit" disabled={loading || !canForgotSubmit} style={{ width: "100%", padding: "16px", background: loading || !canForgotSubmit ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #FF4D00, #FFB347)", color: loading || !canForgotSubmit ? "#7B7B86" : "#fff", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 900, letterSpacing: 1.6, marginBottom: 12 }}>
                {loading ? "..." : t("sendCode")}
              </button>
              <button type="button" onClick={() => switchMode("login")} style={{ width: "100%", background: "none", border: "none", color: "#FFB347", fontSize: 13, padding: 8 }}>{t("backToLogin")}</button>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={(event) => { event.preventDefault(); handleResetSubmit(); }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#FFB347", letterSpacing: 1 }}>{t("resetPassword")}</div>
                {!error && message && <p style={{ fontSize: 13, color: "#8EF5B4", marginTop: 8, lineHeight: 1.45 }}>{message}</p>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>{t("enterCode")}</div>
                <input value={resetCode} onChange={(event) => setResetCode(event.target.value)} placeholder={t("enterCode")} autoComplete="one-time-code" style={inputStyle} maxLength={6} onKeyDown={(event) => event.key === "Enter" && handleResetSubmit()} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>{t("newPassword")}</div>
                <div style={{ position: "relative" }}>
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={t("newPassword")} type={showNewPassword ? "text" : "password"} autoComplete="new-password" style={{ ...inputStyle, paddingRight: 72 }} onKeyDown={(event) => event.key === "Enter" && handleResetSubmit()} />
                  <button onClick={() => setShowNewPassword((prev) => !prev)} type="button" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#FFB347", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                    {showNewPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
                <div style={helperStyle}>{t("passwordHint")}</div>
              </div>
              {error && <div style={{ ...statusStyle, padding: "12px 14px", borderRadius: 14, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>{error}</div>}
              <button type="submit" disabled={loading || !canResetSubmit} style={{ width: "100%", padding: "16px", background: loading || !canResetSubmit ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #FF4D00, #FFB347)", color: loading || !canResetSubmit ? "#7B7B86" : "#fff", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 900, letterSpacing: 1.6, marginBottom: 12 }}>
                {loading ? "..." : t("resetPassword")}
              </button>
              <button type="button" onClick={() => switchMode("login")} style={{ width: "100%", background: "none", border: "none", color: "#FFB347", fontSize: 13, padding: 8 }}>{t("backToLogin")}</button>
            </form>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          {[{ code: "en", label: "EN" }, { code: "es", label: "ES" }, { code: "ja", label: "JA" }].map((languageOption) => (
            <button key={languageOption.code} onClick={() => setLang(languageOption.code)} style={{ padding: "6px 14px", background: lang === languageOption.code ? "rgba(255,77,0,0.2)" : "rgba(255,255,255,0.04)", border: lang === languageOption.code ? "1px solid rgba(255,77,0,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: lang === languageOption.code ? "#FF8C00" : "#555", fontSize: 12, fontWeight: 600 }}>
              {languageOption.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
