const STORAGE_KEY = "para.home.state.v4";
const LEGACY_STORAGE_KEYS = ["para.home.state.v3", "para.home.state.v2"];

export const DEFAULT_BACKGROUND_ID = "para-aurora";
export const BUILT_IN_BACKGROUND_IDS = Object.freeze(["para-aurora", "para-horizon", "para-midnight", "solid-black"]);

export const BACKGROUND_OPTIONS = Object.freeze({
  // Keep the former id as a migration alias so saved profiles load the official default artwork.
  "para-default": { kind: "image", name: "Aurora Current", image: "./assets/background-aurora-current.png", color: "#030208" },
  "para-aurora": { kind: "image", name: "Aurora Current", image: "./assets/background-aurora-current.png", color: "#030208" },
  "para-horizon": { kind: "image", name: "Violet Horizon", image: "./assets/background-violet-horizon.png", color: "#05020c" },
  "para-midnight": { kind: "image", name: "Midnight Flow", image: "./assets/background-midnight-flow.png", color: "#020105" },
  "solid-black": { kind: "image", name: "Matte Black", image: "./assets/background-matte-black.png", color: "#020203" },
});

export const DEFAULT_CONTROL_CENTER_ORDER = Object.freeze(["home", "switcher", "notifications", "friends", "downloads", "music", "network", "audio", "microphone", "controllers", "profile", "power"]);
const DEFAULT_HOME_WIDGET_ORDER = ["network", "storage", "system"];

function detectedSetupChoices() {
  const locale = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  const [language = "en", region = "US"] = locale.split("-");
  let timeZone = "UTC";
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* UTC remains active */ }
  return {
    inputMode: "keyboard",
    language,
    region,
    timeZone,
    keyboardLayout: "system",
    safeArea: 0,
    networkChoice: "current",
    accountMode: "offline",
    profileName: "Player One",
    gamingAccounts: {},
    otherAccounts: {},
    sleepMinutes: 30,
  };
}

const defaults = {
  firstBootComplete: false,
  loggedIn: false,
  activeProfile: null,
  setupStep: 0,
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  displayMode: "Living room",
  setupChoices: detectedSetupChoices(),
  profilePreferences: {},
};

export function defaultProfilePreferences() {
  return {
    background: { selection: DEFAULT_BACKGROUND_ID, fit: "fill", dim: 42, blur: 18, revision: 0 },
    home: { order: [...DEFAULT_HOME_WIDGET_ORDER], hidden: [] },
    controlCenter: { order: [...DEFAULT_CONTROL_CENTER_ORDER], hidden: [] },
  };
}

function mergeProfilePreferences(value = {}) {
  const base = defaultProfilePreferences();
  return {
    background: { ...base.background, ...(value.background || {}) },
    home: { ...base.home, ...(value.home || {}), order: [...(value.home?.order || base.home.order)], hidden: [...(value.home?.hidden || [])] },
    controlCenter: {
      ...base.controlCenter,
      ...(value.controlCenter || {}),
      order: [...(value.controlCenter?.order || base.controlCenter.order)],
      hidden: [...(value.controlCenter?.hidden || [])],
    },
  };
}

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || "{}";
    const parsed = JSON.parse(stored);
    return {
      ...defaults,
      ...parsed,
      setupChoices: { ...detectedSetupChoices(), ...(parsed.setupChoices || {}) },
      profilePreferences: { ...(parsed.profilePreferences || {}) },
    };
  } catch {
    return { ...defaults, setupChoices: detectedSetupChoices(), profilePreferences: {} };
  }
}

let state = load();

export function getState() {
  return { ...state, profilePreferences: { ...state.profilePreferences } };
}

export function getProfilePreferences(profile = state.activeProfile || "Player One") {
  return mergeProfilePreferences(state.profilePreferences[profile]);
}

export function setState(patch) {
  state = { ...state, ...patch, ...(patch.setupChoices ? { setupChoices: { ...state.setupChoices, ...patch.setupChoices } } : {}) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyPreferences();
  return getState();
}

export function setSetupChoice(key, value) {
  return setState({ setupChoices: { [key]: value } });
}

export function setSetupAccountChoice(group, provider, value) {
  const choices = state.setupChoices[group] || {};
  return setState({ setupChoices: { [group]: { ...choices, [provider]: value } } });
}

export function setProfilePreferences(patch, profile = state.activeProfile || "Player One") {
  const current = getProfilePreferences(profile);
  const next = mergeProfilePreferences({
    ...current,
    ...patch,
    background: { ...current.background, ...(patch.background || {}) },
    home: { ...current.home, ...(patch.home || {}) },
    controlCenter: { ...current.controlCenter, ...(patch.controlCenter || {}) },
  });
  state = { ...state, profilePreferences: { ...state.profilePreferences, [profile]: next } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyPreferences();
  return next;
}

export function replaceProfilePreferences(preferences, profile = state.activeProfile || "Player One") {
  const next = mergeProfilePreferences(preferences);
  state = { ...state, profilePreferences: { ...state.profilePreferences, [profile]: next } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyPreferences();
  return next;
}

export function resetState() {
  state = { ...defaults, setupChoices: detectedSetupChoices(), profilePreferences: {} };
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  applyPreferences();
}

export function startupDestination() {
  return "intro";
}

export function postStartupDestination() {
  if (!state.firstBootComplete) return "setup";
  if (!state.loggedIn) return "profiles";
  return "home";
}

function wallpaperValues(profile, preferences) {
  const background = preferences.background;
  if (background.selection === "custom") {
    const url = `/api/v1/backgrounds/custom?profile=${encodeURIComponent(profile)}&v=${Number(background.revision) || 0}`;
    return { image: `url("${url}")`, color: "#030208" };
  }
  const option = BACKGROUND_OPTIONS[background.selection] || BACKGROUND_OPTIONS["para-default"];
  return { image: option.image ? `url("${option.image}")` : "none", color: option.color };
}

function applyWallpaper(wallpaper) {
  const root = document.documentElement;
  root.style.setProperty("--profile-wallpaper-image", wallpaper.image);
  root.style.setProperty("--profile-wallpaper-color", wallpaper.color);
}

export function previewBackground(selection, customUrl = "") {
  const profile = state.activeProfile || "Player One";
  const preferences = getProfilePreferences(profile);
  if (customUrl) {
    applyWallpaper({ image: `url("${customUrl}")`, color: "#030208" });
    return;
  }
  applyWallpaper(wallpaperValues(profile, { ...preferences, background: { ...preferences.background, selection } }));
}

export function applyPreferences() {
  const root = document.documentElement;
  const profile = state.activeProfile || "Player One";
  const preferences = getProfilePreferences(profile);
  const wallpaper = wallpaperValues(profile, preferences);
  root.dataset.reducedMotion = String(state.reducedMotion);
  root.dataset.highContrast = String(state.highContrast);
  root.dataset.largeText = String(state.largeText);
  root.dataset.displayMode = state.displayMode;
  root.dataset.backgroundFit = preferences.background.fit;
  root.dataset.setupLanguage = state.setupChoices.language;
  root.style.setProperty("--para-safe-area", `${Math.max(0, Math.min(8, Number(state.setupChoices.safeArea) || 0))}vmin`);
  root.lang = state.setupChoices.language || "en";
  applyWallpaper(wallpaper);
  root.style.setProperty("--profile-wallpaper-dim", String(Math.max(0, Math.min(80, Number(preferences.background.dim) || 0)) / 100));
  root.style.setProperty("--surface-blur", `${Math.max(0, Math.min(24, Number(preferences.background.blur) || 0))}px`);
}
