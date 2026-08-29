const STORAGE_KEY = "para.input.v1";

export const PARA_INPUT_OUTPUTS = Object.freeze([
  { value: "none", label: "Unassigned", type: "none" },
  { value: "KeyW", label: "W", type: "key", key: "w" },
  { value: "KeyA", label: "A", type: "key", key: "a" },
  { value: "KeyS", label: "S", type: "key", key: "s" },
  { value: "KeyD", label: "D", type: "key", key: "d" },
  { value: "Space", label: "Space", type: "key", key: " " },
  { value: "Escape", label: "Esc", type: "key", key: "Escape" },
  { value: "KeyE", label: "E", type: "key", key: "e" },
  { value: "KeyF", label: "F", type: "key", key: "f" },
  { value: "KeyQ", label: "Q", type: "key", key: "q" },
  { value: "KeyR", label: "R", type: "key", key: "r" },
  { value: "ShiftLeft", label: "Left Shift", type: "key", key: "Shift" },
  { value: "ControlLeft", label: "Left Ctrl", type: "key", key: "Control" },
  { value: "ArrowUp", label: "↑", type: "key", key: "ArrowUp" },
  { value: "ArrowDown", label: "↓", type: "key", key: "ArrowDown" },
  { value: "ArrowLeft", label: "←", type: "key", key: "ArrowLeft" },
  { value: "ArrowRight", label: "→", type: "key", key: "ArrowRight" },
  { value: "Mouse0", label: "Left Click", type: "mouse", button: 0 },
  { value: "Mouse2", label: "Right Click", type: "mouse", button: 2 },
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
  button_1: "Escape",
  button_2: "KeyE",
  button_3: "KeyR",
  button_4: "KeyQ",
  button_5: "KeyF",
  button_6: "Mouse2",
  button_7: "Mouse0",
  button_10: "ShiftLeft",
  button_11: "ControlLeft",
  button_12: "ArrowUp",
  button_13: "ArrowDown",
  button_14: "ArrowLeft",
  button_15: "ArrowRight",
});

export function defaultParaInputSettings() {
  return {
    enabled: true,
    automaticWebGames: false,
    deadzone: 0.28,
    pointerSpeed: 18,
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
  return {
    enabled: value.enabled !== false,
    automaticWebGames: Boolean(value.automaticWebGames),
    deadzone: clamp(value.deadzone, 0.12, 0.65, base.deadzone),
    pointerSpeed: clamp(value.pointerSpeed, 4, 42, base.pointerSpeed),
    invertY: Boolean(value.invertY),
    bindings,
    games: value.games && typeof value.games === "object" ? { ...value.games } : {},
  };
}

export function getParaInputSettings() {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); }
  catch { return defaultParaInputSettings(); }
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
