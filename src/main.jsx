import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import BeastModeScoring from "../public/scoring.js";
import AuthScreen from "./components/AuthScreen.jsx";
import OnboardingScreen from "./components/OnboardingScreen.jsx";
import DailySetupScreen from "./components/SetupScreen.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import { AlarmPopup, ExtraCreditModal, WorkoutTimer } from "./components/WorkoutFlow.jsx";
import { MeditationPanel, MeditationTimer } from "./components/Meditation.jsx";
import {
  AwardPopup,
  AwardsScreen,
  EvolutionPopup,
  EvolutionScreen,
  LeaderboardScreen,
  MissionPopup,
  WeeklySummary,
} from "./components/ProgressScreens.jsx";
import { ActivationCard, MissionCard, PressureCard, QuickStartCard } from "./components/DashboardCards.jsx";
import { EvolutionBadge, EvolutionBar } from "./components/EvolutionStatus.jsx";
import {
  APP_VERSION,
  api,
  fetchPublicConfig,
  isNewerVersion,
  isStandaloneApp,
  showSystemNotification,
  supportsNotifications,
  supportsWebPush,
  urlBase64ToUint8Array,
} from "./lib/app-client.js";
import { configureNativeShell, onHardwareBack } from "./lib/native-shell.js";
import { playSound } from "./lib/audio.js";
import { AWARDS, EXERCISES, MEDITATION_TYPES, getTodayKey } from "./lib/app-data.js";
import { getPreferredLanguage, persistLanguagePreference, useT } from "./lib/i18n.js";
import {
  buildAlarmPrompt,
  fmtDuration,
  fmtIntervalOption,
  fmtSessionCredits,
  resolveDuration,
} from "./lib/session-feedback.js";

const {
  DURATION_MULTIPLIERS,
  getWorkoutSessionCredit,
  getMeditationQualificationCredit,
  isQualifiedDayState,
  MIN_DAILY_SESSION_CREDITS,
  getStreakMultiplier,
  estimateAwardedPoints,
  getEvolution,
} = BeastModeScoring;

//     DEMO MODE (add ?demo=true to URL)           
const DEMO_MODE = new URLSearchParams(window.location.search).has('demo');

//     MAIN APP                                     
function BeastModeApp() {
  const [screen, setScreen] = useState("loading");
  const [lang, setLangState] = useState(() => persistLanguagePreference(getPreferredLanguage()));
  const t = useT(lang);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [unlockedAwards, setUnlockedAwards] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [mission, setMission] = useState(null);
  const [pressure, setPressure] = useState(null);
  const [missionClaiming, setMissionClaiming] = useState(false);
  const [missionPopup, setMissionPopup] = useState(null);
  const [appConfig, setAppConfig] = useState({ webPushEnabled: false, vapidPublicKey: null, latestAppVersion: null, downloadUrl: null });
  const [loadError, setLoadError] = useState(null);
  const [pushStatus, setPushStatus] = useState({ webPushEnabled: false, subscribed: false, pushEnabled: false, subscriptionCount: 0, lastPushSentAt: null });
  const [activationMessage, setActivationMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() => supportsNotifications() ? Notification.permission : "unsupported");
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installReady, setInstallReady] = useState(() => isStandaloneApp());

  // Alarm state
  const [showAlarm, setShowAlarm] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showExtraCredit, setShowExtraCredit] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [resolvedDuration, setResolvedDuration] = useState(null);
  const [evoPopup, setEvoPopup] = useState(null);
  const [awardPopup, setAwardPopup] = useState(null);
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [weekData, setWeekData] = useState(null);

  // Meditation state
  const [mode, setMode] = useState("workout");
  const [showMedTimer, setShowMedTimer] = useState(false);
  const [currentMedType, setCurrentMedType] = useState(null);
  const [currentMedDur, setCurrentMedDur] = useState(10);
  const [currentMedSession, setCurrentMedSession] = useState(1);
  const [todayMedSessions, setTodayMedSessions] = useState(0);

  // Countdown
  const [nextAlarmTime, setNextAlarmTime] = useState(null);
  const [countdown, setCountdown] = useState("");
  const alarmTimeoutRef = useRef(null);
  const retryRef = useRef(null);
  const workoutActiveRef = useRef(false);

  const setLang = useCallback(async (nextLang, options = {}) => {
    const normalized = persistLanguagePreference(nextLang);
    setLangState(normalized);

    if (options.syncRemote && localStorage.getItem("bm_token")) {
      try {
        await api("/api/user/language", {
          method: "PUT",
          body: JSON.stringify({ language: normalized }),
        });
        setUser((prev) => (prev ? { ...prev, language: normalized } : prev));
      } catch (err) {
        console.warn("Failed to sync language:", err.message || err);
      }
    }

    return normalized;
  }, []);

  // Track active overlays
  useEffect(() => {
    workoutActiveRef.current = showTimer || showExtraCredit || showAlarm || showMedTimer || !!evoPopup || !!awardPopup || showWeeklySummary;
  }, [showTimer, showExtraCredit, showAlarm, showMedTimer, evoPopup, awardPopup, showWeeklySummary]);

  const refreshDashboardSignals = useCallback(async () => {
    const [missionData, pressureData] = await Promise.all([
      api("/api/stats/daily-mission").catch(() => null),
      api("/api/stats/pressure").catch(() => null),
    ]);
    if (missionData?.mission) setMission(missionData.mission);
    if (pressureData) setPressure(pressureData);
  }, []);

  const loadSession = useCallback(async () => {
    const [data, recentHistory, missionData, pressureData] = await Promise.all([
      api("/api/user/profile"),
      api("/api/workout/history?limit=20").catch(() => []),
      api("/api/stats/daily-mission").catch(() => null),
      api("/api/stats/pressure").catch(() => null),
    ]);
    setUser(data.user);
    await setLang(data.user?.language || getPreferredLanguage());
    setSettings(data.settings);
    setProgress(data.progress);
    setUnlockedAwards(new Set(data.awards || []));
    setTodayMedSessions(data.progress?.meditationsFinished || 0);
    setHistory(recentHistory);
    setMission(missionData?.mission || null);
    setPressure(pressureData || null);
    if (!data.user?.onboardedAt) { setScreen("onboarding"); }
    else { setScreen("dashboard"); }
  }, []);

  //     INIT: Check token and load profile
  useEffect(() => {
    configureNativeShell();
    const token = localStorage.getItem("bm_token");
    if (!token) { setScreen("auth"); return; }
    setLoadError(null);
    loadSession().catch((err) => {
      if (err?.message === "API error" || /401|403|Unauthorized/.test(err?.message || "")) {
        localStorage.removeItem("bm_token");
        setScreen("auth");
      } else {
        setLoadError(err?.message || "Could not reach BeastMode");
      }
    });
  }, [loadSession]);

  const retryLoadSession = useCallback(() => {
    setLoadError(null);
    setScreen("loading");
    loadSession().catch((err) => {
      if (err?.message === "API error" || /401|403|Unauthorized/.test(err?.message || "")) {
        localStorage.removeItem("bm_token");
        setScreen("auth");
      } else {
        setLoadError(err?.message || "Could not reach BeastMode");
      }
    });
  }, [loadSession]);

  useEffect(() => {
    let active = true;
    fetchPublicConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig({
          webPushEnabled: Boolean(config.webPushEnabled),
          vapidPublicKey: config.vapidPublicKey || null,
          latestAppVersion: config.latestAppVersion || null,
          downloadUrl: config.downloadUrl || null,
        });
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to load app config:", err.message || err);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };
    const handleInstalled = () => {
      setInstallReady(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const refreshPushStatus = useCallback(async () => {
    if (!localStorage.getItem("bm_token")) return null;
    const status = await api("/api/user/push-status");
    setPushStatus(status);
    return status;
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (!supportsWebPush() || notificationPermission !== "granted" || !appConfig.webPushEnabled || !appConfig.vapidPublicKey) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(appConfig.vapidPublicKey),
      });
    }

    const payload = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
    const status = await api("/api/user/push-subscription", {
      method: "POST",
      body: JSON.stringify({ subscription: payload }),
    });
    setPushStatus(status);
    return status;
  }, [appConfig.vapidPublicKey, appConfig.webPushEnabled, notificationPermission]);

  useEffect(() => {
    if (!user) return;
    refreshPushStatus().catch((err) => {
      console.warn("Failed to load push status:", err.message || err);
    });
  }, [refreshPushStatus, user?.id]);

  useEffect(() => {
    if (!user || notificationPermission !== "granted") return;
    syncPushSubscription().catch((err) => {
      console.warn("Failed to sync push subscription:", err.message || err);
    });
  }, [notificationPermission, syncPushSubscription, user?.id]);

  const handleEnableNudges = useCallback(async () => {
    if (!supportsNotifications()) return;
    if (Notification.permission === "granted") {
      setNotificationPermission("granted");
      const status = await syncPushSubscription();
      if (status?.subscribed) {
        setActivationMessage(t("nudgesLinked"));
      }
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      const status = await syncPushSubscription();
      await showSystemNotification({
        title: "BeastMode nudges are on",
        body: "Your next reset can now reach you outside the tab.",
        tag: "beastmode-nudges-ready",
      });
      if (status?.subscribed) {
        setActivationMessage(t("nudgesLinked"));
      }
    } else if (permission === "denied") {
      setActivationMessage(t("notificationBlocked"));
    }
  }, [syncPushSubscription, t]);

  const handleSendTestNudge = useCallback(async () => {
    const status = await api("/api/user/push-test", { method: "POST" });
    setPushStatus(status);
    setActivationMessage(t("testNudgeSent"));
  }, [t]);

  const handleInstallApp = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const outcome = await installPromptEvent.userChoice.catch(() => null);
    if (outcome?.outcome === "accepted") {
      setInstallReady(true);
    }
    setInstallPromptEvent(null);
  }, [installPromptEvent]);

  //     ALARM SCHEDULING                           
  const getRandomExercise = useCallback(() => {
    if (!settings?.selectedExercises) return EXERCISES[0];
    const pool = EXERCISES.filter(e => settings.selectedExercises.includes(e.id));
    return pool[Math.floor(Math.random() * pool.length)] || EXERCISES[0];
  }, [settings]);

  const fireAlarm = useCallback(() => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    // Check if today is still an active day and within hours
    const now = new Date();
    const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const activeDays = settings?.activeDays || dayKeys;
    if (!activeDays.includes(dayKeys[now.getDay()])) return;
    const sh = settings?.startHour != null ? settings.startHour : 0;
    const eh = settings?.endHour != null ? settings.endHour : 23;
    if (sh !== eh && (now.getHours() < sh || now.getHours() >= eh)) return;
    const dur = resolveDuration(settings?.duration || 2);
    const chosenExercise = getRandomExercise();
    if (workoutActiveRef.current) {
      retryRef.current = setInterval(() => {
        if (!workoutActiveRef.current) {
          clearInterval(retryRef.current); retryRef.current = null;
          setCurrentExercise(chosenExercise);
          setResolvedDuration(dur);
          setShowAlarm(true);
          playSound("alarm");
        }
      }, 3000);
      return;
    }
    setCurrentExercise(chosenExercise);
    setResolvedDuration(dur);
    setShowAlarm(true);
    playSound("alarm");
    if (document.visibilityState !== "visible") {
      const prompt = buildAlarmPrompt({ mission, pressure, settings, exercise: chosenExercise, duration: dur, streak: progress?.streak || 1 });
      showSystemNotification({
        title: prompt?.title || "BeastMode reset ready",
        body: prompt?.subtitle || `${dur}-minute ${chosenExercise.name} reset waiting.`,
      }).catch(() => {});
    }
  }, [getRandomExercise, mission, pressure, progress?.streak, settings]);

  const scheduleNextAlarm = useCallback(() => {
    if (!settings) return;
    if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    const intervalMin = settings.intervalMinutes || 45;
    const intervalMs = intervalMin * 60 * 1000;
    const actualInterval = DEMO_MODE ? Math.min(intervalMs, 20000) : intervalMs;
    const now = new Date();
    const currentHour = now.getHours();
    const sh = settings.startHour != null ? settings.startHour : 0;
    const eh = settings.endHour != null ? settings.endHour : 23;
    const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const activeDays = settings.activeDays || dayKeys;

    const snapToClockBoundary = (date) => {
      const d = new Date(date);
      const totalMinutes = (d.getHours() * 60) + d.getMinutes();
      const nextBoundary = (Math.floor(totalMinutes / intervalMin) + 1) * intervalMin;
      const nextHour = Math.floor((nextBoundary % (24 * 60)) / 60);
      const nextMinute = nextBoundary % 60;
      if (nextBoundary >= 24 * 60) {
        d.setDate(d.getDate() + 1);
      }
      d.setHours(nextHour, nextMinute, 0, 0);
      return d;
    };

    // Find the next active day's start time (looking up to 7 days ahead)
    const findNextActiveStart = (fromDate) => {
      for (let i = 0; i < 7; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        if (activeDays.includes(dayKeys[d.getDay()])) {
          if (i === 0) {
            if (d.getHours() < eh || sh >= eh) return d;
          } else {
            d.setHours(sh, 0, 0, 0);
            return d;
          }
        }
      }
      return null;
    };

    const todayKey = dayKeys[now.getDay()];
    const todayActive = activeDays.includes(todayKey);

    let delayMs = actualInterval;

    if (DEMO_MODE) {
      delayMs = actualInterval;
    } else if (!todayActive || (sh !== eh && currentHour >= eh) || (sh !== eh && currentHour < sh)) {
      let target;
      if (todayActive && sh !== eh && currentHour < sh) {
        target = new Date(now); target.setHours(sh, 0, 0, 0);
      } else {
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(sh, 0, 0, 0);
        target = findNextActiveStart(tomorrow);
      }
      if (target) {
        delayMs = target - now;
      } else {
        setNextAlarmTime(null);
        return;
      }
    } else {
      // Active today, within hours — snap to next clock boundary
      const snapped = snapToClockBoundary(now);
      delayMs = snapped - now;
      // Clamp to end hour if set
      if (sh !== eh) {
        const endTime = new Date(now); endTime.setHours(eh, 0, 0, 0);
        const msUntilEnd = endTime - now;
        if (delayMs > msUntilEnd) delayMs = msUntilEnd;
      }
    }

    if (delayMs <= 0) delayMs = actualInterval;
    setNextAlarmTime(Date.now() + delayMs);
    alarmTimeoutRef.current = setTimeout(fireAlarm, delayMs);
  }, [settings, fireAlarm]);

  useEffect(() => {
    if (!nextAlarmTime) return;
    const tick = setInterval(() => {
      const diff = Math.max(0, nextAlarmTime - Date.now());
      if (diff === 0) { setCountdown("NOW!"); clearInterval(tick); return; }
      const totalMin = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (totalMin >= 60) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        setCountdown(`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      } else {
        setCountdown(`${totalMin}:${s.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [nextAlarmTime]);

  useEffect(() => {
    if (settings && screen === "dashboard") scheduleNextAlarm();
    return () => {
      if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, [settings, screen, scheduleNextAlarm]);

  //     WORKOUT COMPLETE HANDLER                   
  const handleWorkoutComplete = async (pts, exercise, wasCompleted, type = "alarm", durationOverride = null, meta = {}) => {
    setShowTimer(false);
    setShowExtraCredit(false);
    setShowAlarm(false);

    const oldTotal = progress?.totalPoints || 0;
    const durationMinutes = durationOverride ?? resolvedDuration ?? 2;
    try {
      const result = await api("/api/workout/log", {
        method: "POST",
        body: JSON.stringify({
          exerciseId: exercise.id, exerciseName: exercise.name, exerciseEmoji: exercise.emoji,
          points: pts, durationMinutes, wasCompleted, type, elapsedSeconds: meta?.elapsedSeconds ?? null,
        }),
      });

      // Update local state from server response
      setProgress(prev => ({ ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), sessionsFinished: result.sessionsFinished, sessionCredits: result.sessionCredits ?? prev?.sessionCredits }));

      // Check for evolution
      const oldTier = getEvolution(oldTotal);
      const newTier = getEvolution(result.totalPoints);
      if (newTier.name !== oldTier.name) {
        setTimeout(() => setEvoPopup({ oldTier, newTier }), 600);
      }

      // Check for new awards
      if (result.newAwards?.length > 0) {
        const awardObj = AWARDS.find(a => a.id === result.newAwards[0]);
        if (awardObj) setTimeout(() => setAwardPopup(awardObj), evoPopup ? 2000 : 800);
        setUnlockedAwards(prev => { const next = new Set(prev); result.newAwards.forEach(id => next.add(id)); return next; });
      }

      // Add to local history
      setHistory(prev => [{ exercise, points: result.finalPoints, wasCompleted, type, time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    } catch(e) {
      console.error("Failed to log workout:", e);
      setActivationMessage(t("workoutLogFailed"));
    }

    await refreshDashboardSignals();
    scheduleNextAlarm();
  };

  //     MEDITATION COMPLETE HANDLER                   
  const handleMeditationComplete = async (pts, wasCompleted, meta = {}) => {
    setShowMedTimer(false);
    const oldTotal = progress?.totalPoints || 0;
    if (wasCompleted) setTodayMedSessions(prev => prev + 1);
    try {
      const result = await api("/api/workout/log", {
        method: "POST",
        body: JSON.stringify({
          exerciseId: currentMedType.id, exerciseName: currentMedType.name, exerciseEmoji: currentMedType.emoji,
          points: pts, durationMinutes: currentMedDur, wasCompleted, type: "meditation", elapsedSeconds: meta?.elapsedSeconds ?? null,
        }),
      });
      setProgress(prev => ({ ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints, sessionsCompleted: (prev?.sessionsCompleted || 0) + (wasCompleted ? 1 : 0), sessionsFinished: wasCompleted ? result.sessionsFinished : prev?.sessionsFinished, sessionCredits: result.sessionCredits ?? (prev?.sessionCredits || 0), meditationsFinished: result.meditationsFinished ?? (prev?.meditationsFinished || 0), qualifyingMeditations: result.qualifyingMeditations ?? (prev?.qualifyingMeditations || 0) }));
      const oldTier = getEvolution(oldTotal);
      const newTier = getEvolution(result.totalPoints);
      if (newTier.name !== oldTier.name) setTimeout(() => setEvoPopup({ oldTier, newTier }), 600);
      if (result.newAwards?.length > 0) {
        const awardObj = AWARDS.find(a => a.id === result.newAwards[0]);
        if (awardObj) setTimeout(() => setAwardPopup(awardObj), evoPopup ? 2000 : 800);
        setUnlockedAwards(prev => { const next = new Set(prev); result.newAwards.forEach(id => next.add(id)); return next; });
      }
      setHistory(prev => [{ exercise: currentMedType, points: result.finalPoints ?? pts, wasCompleted, type: "meditation", time: new Date().toISOString() }, ...prev.slice(0, 19)]);
    } catch(e) {
      console.error("Failed to log meditation:", e);
      setActivationMessage(t("workoutLogFailed"));
    }

    await refreshDashboardSignals();
  };

  const startMeditation = (medType, dur, sessionNum) => {
    setCurrentMedType(medType);
    setCurrentMedDur(dur);
    setCurrentMedSession(sessionNum);
    setShowMedTimer(true);
  };

  const startQuickReset = useCallback((kind) => {
    const selectedIds = settings?.selectedExercises?.length ? settings.selectedExercises : EXERCISES.map((exercise) => exercise.id);
    const selectedPool = EXERCISES.filter((exercise) => selectedIds.includes(exercise.id));
    const pickFrom = (ids) => {
      const pool = selectedPool.filter((exercise) => ids.includes(exercise.id));
      const fallbackPool = pool.length > 0 ? pool : selectedPool;
      return fallbackPool[Math.floor(Math.random() * fallbackPool.length)] || EXERCISES[0];
    };

    if (kind === "calm") {
      const breath = MEDITATION_TYPES.find((medType) => medType.id === "breath") || MEDITATION_TYPES[0];
      setShowAlarm(false);
      setShowExtraCredit(false);
      setShowTimer(false);
      setCurrentMedType(breath);
      setCurrentMedDur(3);
      setCurrentMedSession((todayMedSessions || 0) + 1);
      setShowMedTimer(true);
      return;
    }

    const exercise = {
      random: pickFrom(selectedIds),
      focus: pickFrom(["plank", "chair_pose", "situps"]),
      energy: pickFrom(["jumping_jacks", "high_knees", "burpees"]),
      mobility: pickFrom(["squats", "lunges", "mountain_climbers"]),
    }[kind] || pickFrom(selectedIds);

    setShowAlarm(false);
    setShowExtraCredit(false);
    setShowMedTimer(false);
    setCurrentExercise(exercise);
    setResolvedDuration(2);
    setShowTimer(true);
  }, [settings, todayMedSessions]);

  const handleClaimMission = async () => {
    if (!mission || mission.claimed || !mission.complete || missionClaiming) return;
    setMissionClaiming(true);
    try {
      const result = await api("/api/stats/daily-mission/claim", { method: "POST" });
      setMission(result.mission);
      setProgress((prev) => prev ? { ...prev, totalPoints: result.totalPoints, todayPoints: result.todayPoints } : prev);
      setMissionPopup({ mission: result.mission, bonusPoints: result.bonusAwarded });
      await refreshDashboardSignals();
    } catch (e) {
      console.error("Mission claim failed:", e);
    } finally {
      setMissionClaiming(false);
    }
  };


  //     END DAY / MISSED DAY                      
  const handleEndDay = async () => {
    try {
      const result = await api("/api/workout/end-day", { method: "POST" });
      setProgress(prev => ({ ...prev, streak: result.streak, maxStreak: result.maxStreak, streakFreezes: result.streakFreezes, todayPoints: 0, sessionsCompleted: 0, sessionsFinished: 0, sessionCredits: 0, meditationsFinished: 0, qualifyingMeditations: 0, sessionsSkipped: 0, dayCounter: result.dayCounter }));
      setTodayMedSessions(0);
      if (result.showWeekly && result.weeklyData) { setWeekData(result.weeklyData); setShowWeeklySummary(true); }
      await refreshDashboardSignals();
    } catch(e) { console.error("End day error:", e); }
  };

  const handleMissedDay = async () => {
    try {
      const result = await api("/api/workout/missed-day", { method: "POST" });
      setProgress(prev => ({ ...prev, streak: result.streak, streakFreezes: result.streakFreezes, todayPoints: 0, sessionsCompleted: 0, sessionsFinished: 0, sessionCredits: 0, meditationsFinished: 0, qualifyingMeditations: 0, sessionsSkipped: 0, dayCounter: result.dayCounter }));
      setTodayMedSessions(0);
      if (result.showWeekly && result.weeklyData) { setWeekData(result.weeklyData); setShowWeeklySummary(true); }
      await refreshDashboardSignals();
    } catch(e) { console.error("Missed day error:", e); }
  };

  const handleLogout = () => {
    localStorage.removeItem("bm_token");
    setUser(null); setSettings(null); setProgress(null); setHistory([]); setUnlockedAwards(new Set()); setTodayMedSessions(0); setMission(null); setPressure(null); setMissionPopup(null);
    setPushStatus({ webPushEnabled: Boolean(appConfig.webPushEnabled), subscribed: false, pushEnabled: false, subscriptionCount: 0, lastPushSentAt: null });
    setActivationMessage("");
    setNotificationPermission(supportsNotifications() ? Notification.permission : "unsupported");
    setScreen("auth");
  };

  //     SCREENS
  if (screen === "loading") {
    if (loadError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 14 }}>
          <div style={{ fontSize: 42 }}>{"\u26A1"}</div>
          <div style={{ fontSize: 14, color: "#FFB6B6", lineHeight: 1.5, maxWidth: 300 }}>{t("connectionTrouble")}</div>
          <div style={{ fontSize: 11, color: "#555", maxWidth: 300, wordBreak: "break-word" }}>{loadError}</div>
          <button onClick={retryLoadSession} style={{ marginTop: 4, padding: "12px 24px", background: "linear-gradient(135deg, #FF4D00, #FF8C00)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>{t("retry")}</button>
        </div>
      );
    }
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 48, animation: "pulse 1.5s infinite" }}>{"\uD83D\uDD25"}</div>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#666" }}>BEAST MODE</div>
      </div>
    );
  }
  if (screen === "auth") return <AuthScreen onAuth={() => { setScreen("loading"); loadSession().catch(() => { localStorage.removeItem("bm_token"); setScreen("auth"); }); }} lang={lang} setLang={setLang} />;
  if (screen === "onboarding") return <OnboardingScreen onComplete={() => { setScreen("loading"); loadSession().catch(() => { localStorage.removeItem("bm_token"); setScreen("auth"); }); }} user={user} settings={settings} lang={lang} setLang={setLang} webPushEnabled={Boolean(appConfig.webPushEnabled)} notificationPermission={notificationPermission} onRequestPush={handleEnableNudges} />;
  if (screen === "setup") return <DailySetupScreen onComplete={(s) => { setSettings(s); setScreen("dashboard"); scheduleNextAlarm(); refreshDashboardSignals(); }} onAccountDeleted={handleLogout} settings={settings} user={user} lang={lang} setLang={setLang} />;
  if (screen === "leaderboard") return <LeaderboardScreen user={user} totalPoints={progress?.totalPoints || 0} streak={progress?.streak || 1} onBack={() => setScreen("dashboard")} lang={lang} />;
  if (screen === "awards") return <AwardsScreen unlockedAwards={unlockedAwards} onBack={() => setScreen("dashboard")} lang={lang} />;
  if (screen === "evolution") return <EvolutionScreen points={progress?.totalPoints || 0} onBack={() => setScreen("dashboard")} />;

  //     DASHBOARD                                  
  const totalPoints = progress?.totalPoints || 0;
  const todayPoints = progress?.todayPoints || 0;
  const streak = progress?.streak || 1;
  const streakFreezes = progress?.streakFreezes || 0;
  const sessionsCompleted = progress?.sessionsCompleted || 0;
  const sessionsFinished = progress?.sessionsFinished || 0;
  const sessionCredits = progress?.sessionCredits || 0;
  const qualifyingMeditations = progress?.qualifyingMeditations || 0;
  const streakMult = getStreakMultiplier(streak).toFixed(2);
  const isActiveToday = !settings?.activeDays || settings.activeDays.includes(getTodayKey());
  const MAX_FREEZES = 3;
  const FREEZE_EARN_INTERVAL = 5;
  const streakQualified = isQualifiedDayState({ sessionCredits, qualifyingMeditations, sessionsFinished, meditationsFinished: todayMedSessions });
  const pushReady = Boolean(appConfig.webPushEnabled && notificationPermission === "granted" && pushStatus?.subscribed);
  const activationStatusMessage = notificationPermission === "denied" ? t("notificationBlocked") : activationMessage;
  const todayDateKey = new Date().toISOString().split("T")[0];
  const todayExerciseIds = Array.from(new Set(
    history
      .filter((item) => item?.time && String(item.time).startsWith(todayDateKey) && item.wasCompleted !== false && item.type !== "meditation")
      .map((item) => item.exercise?.id)
      .filter(Boolean)
  ));
  const sessionContext = {
    streak,
    mission,
    pressure,
    sessionsFinished,
    sessionCredits,
    meditationsFinished: todayMedSessions,
    qualifyingMeditations,
    todayExerciseIds,
  };
  const alarmPrompt = buildAlarmPrompt({ mission, pressure, settings, exercise: currentExercise, duration: resolvedDuration || 2, streak });

  return (
    <div style={{ minHeight: "100vh", background: mode === "meditation" ? "linear-gradient(180deg, #0a0a1a 0%, #10062a 100%)" : "#0a0a0f", color: "#fff", transition: "background 0.5s ease" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px", overflowY: "auto", maxHeight: "100vh" }}>
        <UpdateBanner latestVersion={appConfig.latestAppVersion} downloadUrl={appConfig.downloadUrl} lang={lang} />
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div onClick={() => setScreen("evolution")} style={{ cursor: "pointer" }}><EvolutionBadge points={totalPoints} size={44} glow /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{user?.username}</div>
              <div style={{ fontSize: 12, color: "#FF8C00" }}>{"\uD83D\uDD25"} {streak} {t("dayStreak")} {"\u00D7"}{streakMult} {t("bonus")}</div>
              <div style={{ fontSize: 11, color: "#69d2e7", marginTop: 2 }}>
                {Array.from({ length: MAX_FREEZES }).map((_, i) => <span key={i} style={{ marginRight: 3, opacity: i < streakFreezes ? 1 : 0.25 }}>{"\u2744\uFE0F"}</span>)}
                <span style={{ marginLeft: 4 }}>{streakFreezes}/{MAX_FREEZES} {t("freezes")}</span>
                {streak > 0 && streak % FREEZE_EARN_INTERVAL !== 0 && <span style={{ color: "#555", marginLeft: 6 }}>({FREEZE_EARN_INTERVAL - (streak % FREEZE_EARN_INTERVAL)} {t("daysToNext")})</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setScreen("setup")} style={{ width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2699\uFE0F"}</button>
            <button onClick={handleLogout} style={{ width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\uD83D\uDD11"}</button>
          </div>
        </div>

        <div onClick={() => setScreen("evolution")} style={{ cursor: "pointer" }}>
          <EvolutionBar points={totalPoints} />
        </div>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setMode("workout")} style={{ flex: 1, padding: "12px 16px", borderRadius: 11, border: "none", background: mode === "workout" ? "linear-gradient(135deg, rgba(255,77,0,0.2), rgba(255,140,0,0.15))" : "transparent", color: mode === "workout" ? "#FF8C00" : "#555", fontSize: 14, fontWeight: 800, letterSpacing: 1, transition: "all 0.3s ease" }}>{t("workoutMode")}</button>
          <button onClick={() => setMode("meditation")} style={{ flex: 1, padding: "12px 16px", borderRadius: 11, border: "none", background: mode === "meditation" ? "linear-gradient(135deg, rgba(138,92,246,0.2), rgba(167,139,250,0.15))" : "transparent", color: mode === "meditation" ? "#A78BFA" : "#555", fontSize: 14, fontWeight: 800, letterSpacing: 1, transition: "all 0.3s ease" }}>{t("meditationMode")}</button>
        </div>

        {/* Points Card */}
        <div style={{ position: "relative", background: mode === "meditation" ? "linear-gradient(135deg, #1a0d2e, #150d28)" : "linear-gradient(135deg, #1a0a00, #2d1400)", borderRadius: 20, padding: "24px 20px 16px", marginBottom: 16, border: mode === "meditation" ? "1px solid rgba(138,92,246,0.2)" : "1px solid rgba(255,77,0,0.2)", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, " + (mode === "meditation" ? "rgba(138,92,246,0.15)" : "rgba(255,77,0,0.15)") + ", transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 16, position: "relative" }}>
            <div><div style={{ fontSize: 11, letterSpacing: 2, color: "#888", marginBottom: 4 }}>{t("today")}</div><div style={{ fontSize: 36, fontWeight: 900, color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{Math.round(todayPoints).toLocaleString()}</div></div>
            <div style={{ width: 1, height: 50, background: "rgba(255,255,255,0.1)" }} />
            <div><div style={{ fontSize: 11, letterSpacing: 2, color: "#888", marginBottom: 4 }}>{t("total")}</div><div style={{ fontSize: 36, fontWeight: 900, color: "#FFD700", fontFamily: "'Courier New', monospace" }}>{Math.round(totalPoints).toLocaleString()}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 13, color: "#888" }}>
            <span>  {sessionsCompleted} {t("completed")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${streakQualified ? 100 : Math.max((sessionCredits / MIN_DAILY_SESSION_CREDITS) * 100, qualifyingMeditations > 0 ? 100 : 0)}%`, height: "100%", borderRadius: 3, background: streakQualified ? "linear-gradient(90deg, #00E676, #69F0AE)" : "linear-gradient(90deg, #FF8C00, #FFD700)", transition: "width 0.5s ease" }} />
            </div>
            <span style={{ fontSize: 11, color: streakQualified ? "#00E676" : "#FF8C00", fontWeight: 700, whiteSpace: "nowrap" }}>
              {streakQualified ? t("streakSecured") : `${fmtSessionCredits(sessionCredits)}/${MIN_DAILY_SESSION_CREDITS} ${t("workoutsOrMed")}`}
            </span>
          </div>
        </div>

        <MissionCard mission={mission} onClaim={handleClaimMission} loading={missionClaiming} lang={lang} />
        <ActivationCard
          canInstall={Boolean(installPromptEvent)}
          installReady={installReady}
          notificationPermission={notificationPermission}
          webPushEnabled={Boolean(appConfig.webPushEnabled)}
          pushSubscribed={Boolean(pushStatus?.subscribed)}
          pushReady={pushReady}
          lastPushSentAt={pushStatus?.lastPushSentAt || settings?.pushLastSentAt || null}
          statusMessage={activationStatusMessage}
          onInstall={handleInstallApp}
          onEnableNudges={handleEnableNudges}
          onSendTest={handleSendTestNudge}
          lang={lang}
        />
        {mode === "workout" && (
          <QuickStartCard
            onStartQuick={startQuickReset}
            durationMinutes={settings?.duration}
            lang={lang}
          />
        )}
        <PressureCard pressure={pressure} onOpenLeaderboard={() => setScreen("leaderboard")} lang={lang} />

        {mode === "workout" && (<>
        {/* Next Alarm / Rest Day */}
        {isActiveToday ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 3, color: "#888", marginBottom: 6, fontWeight: 700 }}>{t("nextAlert")}</div>
              <div style={{ fontSize: 52, fontWeight: 900, color: "#FF4D00", fontFamily: "'Courier New', monospace", letterSpacing: 2, lineHeight: 1, textShadow: "0 0 24px rgba(255,77,0,0.55), 0 0 8px rgba(255,140,0,0.45)" }}>{countdown || "\u2014"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>"{settings?.alarmMessage || "Let's go!"}"</span>
              {alarmPrompt?.subtitle && <span style={{ fontSize: 11, color: "#F3D8B8", maxWidth: 190, textAlign: "right", lineHeight: 1.35 }}>{alarmPrompt.subtitle}</span>}
              <span style={{ fontSize: 11, padding: "3px 10px", background: "rgba(255,77,0,0.12)", borderRadius: 20, color: "#FF8C00" }}>{t("every")} {fmtIntervalOption(settings?.intervalMinutes || 45)}</span>
              {settings?.startHour != null && settings?.endHour != null && <span style={{ fontSize: 11, padding: "3px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 20, color: "#888" }}>{settings.startHour === 0 ? "12AM" : settings.startHour <= 12 ? settings.startHour + (settings.startHour < 12 ? "AM" : "PM") : (settings.startHour-12) + "PM"} - {settings.endHour === 0 ? "12AM" : settings.endHour <= 12 ? settings.endHour + (settings.endHour < 12 ? "AM" : "PM") : (settings.endHour-12) + "PM"}</span>}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,230,118,0.04)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, border: "1px solid rgba(0,230,118,0.15)" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: "#00E676" }}>{t("restDay")}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#00E676" }}>{"\uD83C\uDFD6\uFE0F"}</div>
              {countdown && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{t("nextAlert")}: {countdown}</div>}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>{t("extraCreditAvail")}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button onClick={() => setShowExtraCredit(true)} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,215,0,0.05))", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 14, color: "#FFD700", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\u2B50"}</span><span>{t("extraCredit")}</span>
          </button>
          <button onClick={() => setScreen("awards")} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,215,0,0.05))", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 14, color: "#FFD700", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDFC5"}</span><span>{t("awards")}</span>{unlockedAwards.size > 0 && <span style={{ fontSize: 10 }}>{unlockedAwards.size}/{AWARDS.length}</span>}
          </button>
          <button onClick={() => setScreen("leaderboard")} style={{ flex: 1, padding: 16, background: "linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,77,0,0.05))", border: "1px solid rgba(255,77,0,0.2)", borderRadius: 14, color: "#FF8C00", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22 }}>{"\uD83C\uDFC6"}</span><span>{t("leaderboard")}</span>
          </button>
        </div>

        {/* Info Pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
               {settings?.duration === "random" ? "\ud83c\udfb2 Random" : `${fmtDuration(settings?.duration || 2)} ${t("sessions")}`}
          </div>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
             {settings?.duration === "random" ? "?" : DURATION_MULTIPLIERS[settings?.duration || 2]} {t("multiplier")}
          </div>
          <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 20, fontSize: 12, color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>
            {settings?.selectedExercises?.length || 10} {t("exerciseCount")}
          </div>
        </div>
        </>)}

        {/* Meditation Panel */}
        {mode === "meditation" && (
          <MeditationPanel todayMedSessions={todayMedSessions} qualifyingMeditationsToday={qualifyingMeditations} onStartMeditation={startMeditation} totalPoints={totalPoints} lang={lang} />
        )}

        {/* History */}
        {mode === "workout" && history.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, letterSpacing: 2, color: "#666", marginBottom: 12 }}>{t("recentActivity")}</h3>
            {history.slice(0, 8).map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{h.exercise.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {h.exercise.name}
                      {h.type === "extra" && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,215,0,0.2)", borderRadius: 4, color: "#FFD700", fontWeight: 700, letterSpacing: 1 }}>EXTRA</span>}
                      {h.type === "meditation" && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(138,92,246,0.2)", borderRadius: 4, color: "#A78BFA", fontWeight: 700, letterSpacing: 1 }}>MEDITATION</span>}
                      {!h.wasCompleted && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,107,107,0.2)", borderRadius: 4, color: "#FF6B6B", fontWeight: 700 }}>STOPPED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>{new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: h.type === "meditation" ? "#A78BFA" : (h.wasCompleted !== false ? "#00E676" : "#FF6B6B") }}>+{Math.round(h.points * 10) / 10}</span>
              </div>
            ))}
          </div>
        )}

        {/* Demo Controls   only visible with ?demo=true */}
        {DEMO_MODE && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 8, padding: "12px 0" }}>
          <div style={{ textAlign: "center", fontSize: 11, color: "#444", marginBottom: 12 }}>  Demo Mode: Alarms every ~20s</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={handleEndDay} style={{ padding: "10px 20px", background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 10, color: "#00E676", fontSize: 12, fontWeight: 700 }}>{t("endDay")}</button>
            <button onClick={handleMissedDay} style={{ padding: "10px 20px", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 10, color: "#FF6B6B", fontSize: 12, fontWeight: 700 }}>{t("missedDay")}</button>
          </div>
        </div>
        )}
      </div>

      {/* Overlays */}
      {showAlarm && currentExercise && <AlarmPopup prompt={alarmPrompt} exercise={currentExercise} duration={resolvedDuration} onStart={() => { setShowAlarm(false); setShowTimer(true); }} onSkip={() => { setShowAlarm(false); setProgress(prev => ({ ...prev, sessionsSkipped: (prev?.sessionsSkipped || 0) + 1 })); scheduleNextAlarm(); }} />}
      {showTimer && currentExercise && <WorkoutTimer exercise={currentExercise} durationMinutes={resolvedDuration} lang={lang} streak={streak} sessionType="alarm" sessionContext={sessionContext} onComplete={(pts, wasCompleted, meta) => handleWorkoutComplete(pts, currentExercise, wasCompleted, "alarm", resolvedDuration, meta)} onClose={() => { setShowTimer(false); setCurrentExercise(null); }} />}
      {showExtraCredit && <ExtraCreditModal exercises={EXERCISES} duration={settings?.duration || 2} lang={lang} streak={streak} sessionContext={sessionContext} onComplete={(pts, ex, wasCompleted, selectedDur, meta) => handleWorkoutComplete(pts, ex, wasCompleted, "extra", selectedDur, meta)} onClose={() => setShowExtraCredit(false)} />}
      {showMedTimer && currentMedType && <MeditationTimer medType={currentMedType} durationMinutes={currentMedDur} sessionNumber={currentMedSession} lang={lang} streak={streak} sessionContext={sessionContext} onComplete={handleMeditationComplete} onClose={() => { setShowMedTimer(false); setCurrentMedType(null); }} />}
      {evoPopup && <EvolutionPopup oldTier={evoPopup.oldTier} newTier={evoPopup.newTier} onClose={() => setEvoPopup(null)} />}
      {awardPopup && <AwardPopup award={awardPopup} lang={lang} onClose={() => setAwardPopup(null)} />}
      {missionPopup && <MissionPopup mission={missionPopup.mission} bonusPoints={missionPopup.bonusPoints} onClose={() => setMissionPopup(null)} />}
      {showWeeklySummary && <WeeklySummary weekData={weekData} streak={streak} totalPoints={totalPoints} lang={lang} onClose={() => setShowWeeklySummary(false)} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<BeastModeApp />);
