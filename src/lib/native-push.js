import { IS_NATIVE_SHELL, api } from "./app-client.js";

const CHANNELS = [
  { id: "beastmode_default", name: "Beast Mode (System Sound)", description: "Default reset reminders with system notification sound" },
  { id: "beastmode_classic", name: "Beast Mode (Classic)", description: "Reset reminders with classic chirp alarm", sound: "beastmode_classic" },
  { id: "beastmode_bell", name: "Beast Mode (Bell)", description: "Reset reminders with bell chime", sound: "beastmode_bell" },
  { id: "beastmode_siren", name: "Beast Mode (Siren)", description: "Reset reminders with urgent siren", sound: "beastmode_siren" },
];

let initialized = false;
let pluginCache = null;
let currentToken = null;
const tapHandlers = new Set();

function reportStep(step, extra = {}) {
  api("/api/user/push-debug", { method: "POST", body: { step, ...extra } }).catch(() => {});
}

async function loadPlugin() {
  if (!IS_NATIVE_SHELL) return null;
  if (pluginCache) return pluginCache;
  try {
    const mod = await import("@capacitor/push-notifications");
    pluginCache = mod.PushNotifications;
    reportStep("plugin-loaded", { hasMethods: Boolean(pluginCache?.requestPermissions) });
    return pluginCache;
  } catch (err) {
    reportStep("plugin-load-failed", { error: err?.message || String(err) });
    return null;
  }
}

async function createChannels(plugin) {
  for (const channel of CHANNELS) {
    try {
      await plugin.createChannel({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        importance: 4,
        visibility: 1,
        lights: true,
        vibration: true,
        ...(channel.sound ? { sound: channel.sound } : {}),
      });
    } catch (err) {
      reportStep("create-channel-failed", { channel: channel.id, error: err?.message || String(err) });
    }
  }
  reportStep("channels-ready");
}

async function sendTokenToServer(token, platform = "android") {
  try {
    await api("/api/user/fcm-token", { method: "POST", body: { token, platform } });
    currentToken = token;
    reportStep("token-saved", { tokenHead: String(token).slice(0, 16) });
  } catch (err) {
    reportStep("token-save-failed", { error: err?.message || String(err) });
  }
}

export function onNativePushTap(handler) {
  tapHandlers.add(handler);
  return () => tapHandlers.delete(handler);
}

export async function initNativePush({ requestPermission = true } = {}) {
  reportStep("init-called", { requestPermission, nativeShell: IS_NATIVE_SHELL });
  if (!IS_NATIVE_SHELL) return { available: false, reason: "not-native" };
  const plugin = await loadPlugin();
  if (!plugin) return { available: false, reason: "plugin-unavailable" };

  if (!initialized) {
    initialized = true;

    plugin.addListener("registration", async (token) => {
      const value = token?.value || token?.token;
      reportStep("registration-event", { hasValue: Boolean(value) });
      if (value) await sendTokenToServer(value, "android");
    });

    plugin.addListener("registrationError", (err) => {
      reportStep("registration-error", { error: err?.error || String(err) });
    });

    plugin.addListener("pushNotificationActionPerformed", (action) => {
      const data = action?.notification?.data || {};
      for (const handler of tapHandlers) {
        try { handler(data); } catch {}
      }
    });

    await createChannels(plugin);
  }

  if (requestPermission) {
    try {
      reportStep("request-permission");
      const result = await plugin.requestPermissions();
      reportStep("permission-result", { receive: result?.receive });
      if (result?.receive !== "granted") {
        return { available: true, granted: false, reason: `permission-${result?.receive || "unknown"}` };
      }
      reportStep("calling-register");
      await plugin.register();
      reportStep("register-returned");
      return { available: true, granted: true };
    } catch (err) {
      reportStep("request-permission-threw", { error: err?.message || String(err) });
      return { available: true, granted: false, reason: `threw:${err?.message || err}` };
    }
  }

  return { available: true, granted: null };
}

export async function disableNativePush() {
  if (!IS_NATIVE_SHELL) return;
  const plugin = await loadPlugin();
  if (!plugin) return;
  try {
    if (currentToken) {
      await api("/api/user/fcm-token", { method: "DELETE", body: { token: currentToken } }).catch(() => {});
    } else {
      await api("/api/user/fcm-token", { method: "DELETE", body: {} }).catch(() => {});
    }
    currentToken = null;
  } catch {}
  try {
    await plugin.removeAllDeliveredNotifications();
  } catch {}
}

export async function checkNativePushPermission() {
  if (!IS_NATIVE_SHELL) return null;
  const plugin = await loadPlugin();
  if (!plugin) return null;
  try {
    const result = await plugin.checkPermissions();
    return result?.receive || null;
  } catch {
    return null;
  }
}
