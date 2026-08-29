const STORAGE_KEY = "para.input.v2";
const LEGACY_STORAGE_KEY = "para.input.v1";

export const PARA_INPUT_OUTPUTS = Object.freeze([
  { value: "none", label: "Unassigned", type: "none" },
  { value: "KeyW", label: "W", type: "key", key: "w" },
  { value: "KeyA", label: "A", type: "key", key: "a" },
  { value: "KeyS", label: "S", type: "key", key: "s" },
  { value: "KeyD", label: "D", type: "key", key: "d" },
  { value: "Space", label: "Space", type: "key", key: " " },
  { value: "Escape", label: "Esc", type: "key", key: "Escape" },
  { value: "Enter", label: "Enter", type: "key", key: "Enter" },
  { value: "Tab", label: "Tab", type: "key", key: "Tab" },
  { value: "ShiftLeft", label: "Left Shift", type: "key", key: "Shift" },
  { value: "ControlLeft", label: "Left Ctrl", type: "key", key: "Control" },
  { value: "AltLeft", label: "Left Alt", type: "key", key: "Alt" },
  { value: "KeyE", label: "E", type: "key", key: "e" },
  { value: "KeyF", label: "F", type: "key", key: "f" },
  { value: "KeyQ", label: "Q", type: "key", key: "q" },
  { value: "KeyR", label: "R", type: "key", key: "r" },
  { value: "KeyC", label: "C", type: "key", key: "c" },
  { value: "KeyV", label: "V", type: "key", key: "v" },
  { value: "KeyX", label: "X", type: "key", key: "x" },
  { value: "KeyZ", label: "Z", type: "key", key: "z" },
  { value: "KeyM", label: "M", type: "key", key: "m" },
  { value: "KeyI", label: "I", type: "key", key: "i" },
  { value: "Digit1", label: "1", type: "key", key: "1" },
  { value: "Digit2", label: "2", type: "key", key: "2" },
  { value: "Digit3", label: "3", type: "key", key: "3" },
  { value: "Digit4", label: "4", type: "key", key: "4" },
  { value: "Digit5", label: "5", type: "key", key: "5" },
  { value: "ArrowUp", label: "↑", type: "key", key: "ArrowUp" },
  { value: "ArrowDown", label: "↓", type: "key", key: "ArrowDown" },
  { value: "ArrowLeft", label: "←", type: "key", key: "ArrowLeft" },
  { value: "ArrowRight", label: "→", type: "key", key: "ArrowRight" },
  { value: "Mouse0", label: "Left Click", type: "mouse", button: 0 },
  { value: "Mouse1", label: "Middle Click", type: "mouse", button: 1 },
  { value: "Mouse2", label: "Right Click", type: "mouse", button: 2 },
  { value: "WheelUp", label: "Wheel Up", type: "wheel", deltaY: -120 },
  { value: "WheelDown", label: "Wheel Down", type: "wheel", deltaY: 120 },
]);

export const PARA_INPUT_CONTROLS = Object.freeze([
  { id: "left_up", label: "Left Stick Up" },
  { id: "left_down", label: "Left Stick Down" },
  { id: "left_left", label: "Left Stick Left" },
  { id: "left_right", label: "Left Stick Right" },
  { id: "button_0", label: "A / Blue" },
  { id: "button_1", label: "B / Red" },
  { id: "button_2", label: "X / Green" },
  { id: "button_3", label: "Y / Yellow" },
  { id: "button_4", label: "Left Bumper" },
  { id: "button_5", label: "Right Bumper" },
  { id: "button_6", label: "Left Trigger" },
  { id: "button_7", label: "Right Trigger" },
  { id: "button_8", label: "View / Select" },
  { id: "button_9", label: "Menu / Start" },
  { id: "button_10", label: "Left Stick Click" },
  { id: "button_11", label: "Right Stick Click" },
  { id: "button_12", label: "D-pad Up" },
  { id: "button_13", label: "D-pad Down" },
  { id: "button_14", label: "D-pad Left" },
  { id: "button_15", label: "D-pad Right" },
]);

const DEFAULT_BINDINGS = Object.freeze({
  left_up: "KeyW",
  left_down: "KeyS",
  left_left: "KeyA",
  left_right: "KeyD",
  button_0: "Space",
  button_1: "KeyC",
  button_2: "KeyE",
  button_3: "KeyR",
  button_4: "KeyQ",
  button_5: "KeyF",
  button_6: "Mouse2",
  button_7: "Mouse0",
  button_8: "Tab",
  button_9: "Escape",
  button_10: "ShiftLeft",
  button_11: "ControlLeft",
  button_12: "ArrowUp",
  button_13: "ArrowDown",
  button_14: "ArrowLeft",
  button_15: "ArrowRight",
});

export function defaultParaInputSettings() {
  return {
    version: 2,
    enabled: true,
    automaticWebGames: false,
    leftDeadzone: 0.22,
    rightDeadzone: 0.14,
    triggerThreshold: 0.28,
    pointerSpeed: 900,
    pointerCurve: 1.65,
    pointerAcceleration: 0.45,
    rightStickMode: "relative",
    invertY: false,
    bindings: { ...DEFAULT_BINDINGS },
    games: {},
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalize(value = {}) {
  const base = defaultParaInputSettings();
  const bindings = { ...base.bindings };
  for (const control of PARA_INPUT_CONTROLS) {
    const candidate = value.bindings?.[control.id];
    if (PARA_INPUT_OUTPUTS.some((output) => output.value === candidate)) bindings[control.id] = candidate;
  }
  const legacyDeadzone = clamp(value.deadzone, 0.12, 0.65, base.leftDeadzone);
  return {
    version: 2,
    enabled: value.enabled !== false,
    automaticWebGames: Boolean(value.automaticWebGames),
    leftDeadzone: clamp(value.leftDeadzone, 0.10, 0.55, legacyDeadzone),
    rightDeadzone: clamp(value.rightDeadzone, 0.06, 0.45, Math.min(legacyDeadzone, base.rightDeadzone)),
    triggerThreshold: clamp(value.triggerThreshold, 0.08, 0.80, base.triggerThreshold),
    pointerSpeed: clamp(value.version === 2 ? value.pointerSpeed : undefined, 250, 2200, base.pointerSpeed),
    pointerCurve: clamp(value.pointerCurve, 0.75, 2.75, base.pointerCurve),
    pointerAcceleration: clamp(value.pointerAcceleration, 0, 1.5, base.pointerAcceleration),
    rightStickMode: value.rightStickMode === "cursor" ? "cursor" : "relative",
    invertY: Boolean(value.invertY),
    bindings,
    games: value.games && typeof value.games === "object" ? { ...value.games } : {},
  };
}

function readStoredSettings() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return JSON.parse(current) || {};
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacy ? JSON.parse(legacy) || {} : {};
  } catch { return {}; }
}

export function getParaInputSettings() {
  return normalize(readStoredSettings());
}

export function saveParaInputSettings(next) {
  const normalized = normalize(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("para-input-settings-changed", { detail: normalized }));
  return normalized;
}

export function patchParaInputSettings(patch = {}) {
  const current = getParaInputSettings();
  return saveParaInputSettings({
    ...current,
    ...patch,
    bindings: patch.bindings ? { ...current.bindings, ...patch.bindings } : current.bindings,
    games: patch.games ? { ...current.games, ...patch.games } : current.games,
  });
}

export function cycleParaInputBinding(controlId, direction = 1) {
  const settings = getParaInputSettings();
  const current = settings.bindings[controlId] || "none";
  const index = Math.max(0, PARA_INPUT_OUTPUTS.findIndex((output) => output.value === current));
  const nextIndex = (index + (direction < 0 ? -1 : 1) + PARA_INPUT_OUTPUTS.length) % PARA_INPUT_OUTPUTS.length;
  return patchParaInputSettings({ bindings: { [controlId]: PARA_INPUT_OUTPUTS[nextIndex].value } });
}

export function resetParaInputSettings() {
  return saveParaInputSettings(defaultParaInputSettings());
}

export function paraInputOutputLabel(value) {
  return PARA_INPUT_OUTPUTS.find((output) => output.value === value)?.label || "Unassigned";
}

export function paraInputStorageKey() {
  return STORAGE_KEY;
}
