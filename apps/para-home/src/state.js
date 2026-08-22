const STORAGE_KEY = "para.home.state.v3";
const LEGACY_STORAGE_KEY = "para.home.state.v2";

export const BACKGROUND_OPTIONS = Object.freeze({
  "para-default": { kind: "image", name: "PARA Default", image: "./assets/para-home-background.png", color: "#030208" },
  "para-aurora": { kind: "gradient", name: "Aurora Current", color: "radial-gradient(circle at 72% 20%, #5d20b2 0, transparent 32%), linear-gradient(145deg, #020107, #160925 58%, #05020b)" },
  "para-horizon": { kind: "gradient", name: "Violet Horizon", color: "radial-gradient(ellipse at 50% 78%, #6f28cf 0, #24094a 26%, transparent 58%), linear-gradient(#030208, #090414 62%, #160827)" },
  "para-midnight": { kind: "gradient", name: "Midnight Flow", color: "radial-gradient(circle at 18% 35%, #251041 0, transparent 42%), radial-gradient(circle at 82% 70%, #42117d 0, transparent 38%), #020105" },
  "solid-black": { kind: "solid", name: "Matte Black", color: "#030207" },
});

const DEFAULT_CONTROL_CENTER_ORDER = ["home", "switcher", "notifications", "network", "audio", "microphone", "controllers", "profile", "settings", "power"];
const DEFAULT_HOME_WIDGET_ORDER = ["network", "storage", "system"];

const defaults = {
  firstBootComplete: false,
  loggedIn: false,
  activeProfile: null,
  setupStep: 0,
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  displayMode: "Living room",
  fileCollection: "downloads",
  profilePreferences: {},
};

export function defaultProfilePreferences() {
  return {
    background: { selection: "para-default", fit: "fill", dim: 42, blur: 18, revision: 0 },
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
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}";
    const parsed = JSON.parse(stored);
    return { ...defaults, ...parsed, profilePreferences: { ...(parsed.profilePreferences || {}) } };
  } catch {
    return { ...defaults, profilePreferences: {} };
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
  state = { ...state, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyPreferences();
  return getState();
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
  state = { ...defaults, profilePreferences: {} };
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  applyPreferences();
}

export function startupDestination() {
  if (!state.firstBootComplete) return "intro";
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
  if (option.kind === "gradient") return { image: option.color, color: "#030208" };
  return { image: option.image ? `url("${option.image}")` : "none", color: option.color };
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
  root.style.setProperty("--profile-wallpaper-image", wallpaper.image);
  root.style.setProperty("--profile-wallpaper-color", wallpaper.color);
  root.style.setProperty("--profile-wallpaper-dim", String(Math.max(0, Math.min(80, Number(preferences.background.dim) || 0)) / 100));
  root.style.setProperty("--surface-blur", `${Math.max(0, Math.min(24, Number(preferences.background.blur) || 0))}px`);
}
