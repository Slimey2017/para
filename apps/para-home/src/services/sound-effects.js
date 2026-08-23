import { getProfilePreferences, setProfilePreferences } from "../state.js";

let context = null;

function audioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context ||= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function tone({ frequency, duration, gain, type = "sine", slide = 0 }) {
  const preferences = getProfilePreferences().sound;
  if (!preferences.interfaceSounds) return;
  const audio = audioContext();
  if (!audio) return;
  const started = audio.currentTime;
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, started);
  if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), started + duration);
  const level = gain * (Math.max(0, Math.min(100, preferences.volume)) / 100);
  volume.gain.setValueAtTime(0.0001, started);
  volume.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), started + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, started + duration);
  oscillator.connect(volume).connect(audio.destination);
  oscillator.start(started);
  oscillator.stop(started + duration + 0.02);
}

export const playNavigationSound = () => tone({ frequency: 520, duration: 0.045, gain: 0.045, type: "triangle", slide: 35 });
export const playConfirmSound = () => tone({ frequency: 190, duration: 0.13, gain: 0.075, type: "sine", slide: 180 });
export const playNotificationSound = () => {
  tone({ frequency: 620, duration: 0.09, gain: 0.05, type: "sine", slide: 120 });
  window.setTimeout(() => tone({ frequency: 880, duration: 0.11, gain: 0.04, type: "sine", slide: 60 }), 85);
};

export function playSystemCue(name) {
  if (name === "shutdown" || name === "sleep") return tone({ frequency: 180, duration: .55, gain: .06, type: "sine", slide: -90 });
  if (name === "startup" || name === "formed") return tone({ frequency: 120, duration: .42, gain: .075, type: "sine", slide: 170 });
  return tone({ frequency: 260, duration: .16, gain: .045, type: "triangle", slide: 80 });
}

export function setInterfaceSoundVolume(volume) {
  setProfilePreferences({ sound: { volume: Math.max(0, Math.min(100, Number(volume) || 0)) } });
}

export function toggleInterfaceSounds() {
  const current = getProfilePreferences().sound.interfaceSounds;
  setProfilePreferences({ sound: { interfaceSounds: !current } });
  if (!current) playConfirmSound();
  return !current;
}
