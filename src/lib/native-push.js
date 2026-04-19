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

async function loadPlugin() {
  if (!IS_NATIVE_SHELL) return null;
  if (pluginCache) return pluginCache;
  try {
    const mod = await import("@capacitor/push-notifications");
    pluginCache = mod.PushNotifications;
    return pluginCache;
  } catch (err) {
    console.warn("PushNotifications plugin unavailable:", err?.message || err);
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
      console.warn(`createChannel ${channel.id} failed:`, err?.message || err);
    }
  }
}

async function sendTokenToServer(token, platform = "android") {
  try {
    await api("/api/user/fcm-token", { method: "POST", body: { token, platform } });
    currentToken = token;
  } catch (err) {
    console.warn("Failed to register FCM token with server:", err?.message || err);
  }
}

export function onNativePushTap(handler) {
  tapHandlers.add(handler);
  return () => tapHandlers.delete(handler);
}

export async function initNativePush({ requestPermission = true } = {}) {
  if (!IS_NATIVE_SHELL) return { available: false };
  const plugin = await loadPlugin();
  if (!plugin) return { available: false };

  if (!initialized) {
    initialized = true;

    plugin.addListener("registration", async (token) => {
      const value = token?.value || token?.token;
      if (value) await sendTokenToServer(value, "android");
    });

    plugin.addListener("registrationError", (err) => {
      console.warn("Push registration error:", err?.error || err);
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
      const result = await plugin.requestPermissions();
      if (result?.receive !== "granted") {
        return { available: true, granted: false };
      }
      await plugin.register();
      return { available: true, granted: true };
    } catch (err) {
      console.warn("Push permission request failed:", err?.message || err);
      return { available: true, granted: false };
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
