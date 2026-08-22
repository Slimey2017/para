export const STARTUP_DURATION_MS = 8000;

export const STARTUP_TIMELINE_MS = Object.freeze({
  BLACK_END: 1000,
  POINT_END: 1250,
  RING_END: 1850,
  ORBIT_START: 2350,
  CHARGE_END: 3000,
  MARK_END: 5000,
  BRAND_END: 7000,
  COMPLETE: STARTUP_DURATION_MS,
});

export const STARTUP_EVENTS = Object.freeze({
  light: "para-startup-light",
  sound: "para-startup-sound",
});

function announce(type, detail = {}) {
  document.dispatchEvent(new CustomEvent(STARTUP_EVENTS[type], { detail }));
}

export function beginStartupSignals() {
  announce("sound", { cue: "low-frequency-bed", active: true });
  announce("light", { color: "violet", intensity: 0 });
}

export function updateStartupSignals(previous, phase) {
  if (previous === phase) return;
  const light = {
    point: { intensity: 0.15 },
    ring: { intensity: 0.4 },
    orbit: { intensity: 0.55 },
    charged: { intensity: 0.65 },
    forming: { intensity: 0.72 },
    brand: { intensity: 0.72, pulse: "soft" },
    transition: { intensity: 0.18 },
    complete: { intensity: 0 },
  }[phase];
  if (light) announce("light", { color: "violet", ...light });
  if (phase === "forming") announce("sound", { cue: "formation-hit", active: true });
  if (phase === "transition") announce("sound", { cue: "low-frequency-bed", active: false });
}

export function finishStartupSignals() {
  announce("light", { color: "violet", intensity: 0 });
  announce("sound", { cue: "all", active: false });
}
