const STORAGE_KEY = "para.home.state.v2";

const defaults = {
  firstBootComplete: false,
  loggedIn: false,
  activeProfile: null,
  setupStep: 0,
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  screenReader: false,
  captions: false,
  controllerAssist: false,
  diagnosticsSharing: true,
  personalization: true,
  locationServices: false,
  soundEnabled: true,
  selectedNetwork: "PulseWave 5G",
  displayMode: "Living room",
};

function load() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return { ...defaults }; }
}

let state = load();
export function getState() { return { ...state }; }
export function setState(patch) {
  state = { ...state, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyPreferences();
  return getState();
}
export function resetState() { state = { ...defaults }; localStorage.removeItem(STORAGE_KEY); applyPreferences(); }
export function startupDestination() {
  if (!state.firstBootComplete) return "intro";
  if (!state.loggedIn) return "profiles";
  return "home";
}
export function applyPreferences() {
  document.documentElement.dataset.reducedMotion = String(state.reducedMotion);
  document.documentElement.dataset.highContrast = String(state.highContrast);
  document.documentElement.dataset.largeText = String(state.largeText);
}
