(function () {
  const STORAGE_KEY = "bm_lang";
  const SUPPORTED = new Set(["en", "es", "ja"]);

  function normalizeLanguageCode(value, fallback = "en") {
    const cleaned = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!cleaned) return fallback;
    if (cleaned === "es" || cleaned.startsWith("es-")) return "es";
    if (cleaned === "ja" || cleaned.startsWith("ja-")) return "ja";
    if (cleaned === "en" || cleaned.startsWith("en-")) return "en";
    return fallback;
  }

  function readQueryLanguage() {
    const langParam = new URLSearchParams(window.location.search).get("lang");
    return langParam ? normalizeLanguageCode(langParam, null) : null;
  }

  function readStoredLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeLanguageCode(stored, null) : null;
    } catch {
      return null;
    }
  }

  function detectBrowserLanguage() {
    return normalizeLanguageCode((navigator.languages && navigator.languages[0]) || navigator.language || "en");
  }

  function getPreferredLanguage() {
    return readQueryLanguage() || readStoredLanguage() || detectBrowserLanguage() || "en";
  }

  function persistLanguagePreference(nextLang) {
    const normalized = normalizeLanguageCode(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {}
    document.documentElement.lang = normalized;
    return normalized;
  }

  function updateUrlLanguage(lang) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState({}, "", url.toString());
  }

  function applyLanguage(lang) {
    const translations = window.LEGAL_TRANSLATIONS || {};
    const strings = translations[lang] || translations.en || {};

    document.title = strings.metaTitle || document.title;
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(strings, key)) {
        node.textContent = strings[key];
      }
    });

    document.querySelectorAll("[data-i18n-html]").forEach((node) => {
      const key = node.getAttribute("data-i18n-html");
      if (Object.prototype.hasOwnProperty.call(strings, key)) {
        node.innerHTML = strings[key];
      }
    });

    document.querySelectorAll("[data-lang-option]").forEach((button) => {
      const option = button.getAttribute("data-lang-option");
      const active = option === lang;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("active", active);
    });
  }

  function boot() {
    const preferred = persistLanguagePreference(getPreferredLanguage());
    updateUrlLanguage(preferred);
    applyLanguage(preferred);

    document.querySelectorAll("[data-lang-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextLang = normalizeLanguageCode(button.getAttribute("data-lang-option"));
        if (!SUPPORTED.has(nextLang)) return;
        persistLanguagePreference(nextLang);
        updateUrlLanguage(nextLang);
        applyLanguage(nextLang);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
