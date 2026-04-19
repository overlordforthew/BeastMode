import { IS_NATIVE_SHELL } from "./app-client.js";

let configured = false;

export async function configureNativeShell() {
  if (!IS_NATIVE_SHELL || configured) return;
  configured = true;
  try {
    const [{ StatusBar, Style }, { App }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/app"),
    ]);
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {}
    try {
      await StatusBar.setStyle({ style: Style.Dark });
    } catch {}
    try {
      await StatusBar.setBackgroundColor({ color: "#0a0a0f" });
    } catch {}
    App.addListener("backButton", handleBackButton);
  } catch (err) {
    console.warn("native shell init skipped:", err?.message || err);
  }
}

const listeners = new Set();

export function onHardwareBack(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

function handleBackButton({ canGoBack } = {}) {
  for (const handler of [...listeners].reverse()) {
    try {
      if (handler() === true) return;
    } catch (err) {
      console.warn("back handler error:", err?.message || err);
    }
  }
  if (!canGoBack) {
    import("@capacitor/app").then(({ App }) => App.exitApp()).catch(() => {});
  } else {
    window.history.back();
  }
}
