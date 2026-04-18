const DEFAULT_REMOTE_API_BASE = "https://beastmode.namibarden.com";

export const IS_NATIVE_SHELL = Boolean(window.Capacitor)
  || window.location.protocol === "capacitor:"
  || window.location.protocol === "ionic:";

const API_BASE = IS_NATIVE_SHELL ? DEFAULT_REMOTE_API_BASE : "";

export const ALERT_INTERVAL_OPTIONS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" },
];

let googleScriptPromise = null;

export async function api(path, opts = {}) {
  const token = localStorage.getItem("bm_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const body = opts.body === undefined
    ? undefined
    : typeof opts.body === "string"
      ? opts.body
      : JSON.stringify(opts.body);
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    body,
    headers: { ...headers, ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

export async function fetchPublicConfig() {
  const res = await fetch(`${API_BASE}/api/config`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load app config");
  return data;
}

export function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-identity="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google), { once: true });
        existing.addEventListener("error", () => {
          googleScriptPromise = null;
          existing.remove();
          reject(new Error("Failed to load Google sign-in"));
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        googleScriptPromise = null;
        script.remove();
        reject(new Error("Failed to load Google sign-in"));
      };
      document.head.appendChild(script);
    });
  }

  return googleScriptPromise;
}

export function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function supportsWebPush() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function isStandaloneApp() {
  return IS_NATIVE_SHELL
    || window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator.standalone === true;
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function showSystemNotification({ title, body, tag = "beastmode-alarm" }) {
  if (!supportsNotifications() || Notification.permission !== "granted") return;

  const options = {
    body,
    tag,
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: `${window.location.origin}/` },
  };

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {}

  new Notification(title, options);
}
