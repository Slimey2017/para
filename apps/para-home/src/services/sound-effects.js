import { getProfilePreferences, setProfilePreferences } from "../state.js";
import { duckMenuMusic } from "./menu-music.js";

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

export const playNavigationSound = () => tone({ frequency: 620, duration: 0.055, gain: 0.16, type: "triangle", slide: 55 });
export const playConfirmSound = () => { duckMenuMusic({ amount: .38, duration: 220 }); tone({ frequency: 210, duration: 0.14, gain: 0.28, type: "triangle", slide: 220 }); };
export const playNotificationSound = () => {
  duckMenuMusic({ amount: .48, duration: 360 });
  tone({ frequency: 680, duration: 0.10, gain: 0.24, type: "triangle", slide: 150 });
  window.setTimeout(() => tone({ frequency: 980, duration: 0.13, gain: 0.20, type: "sine", slide: 80 }), 85);
};

export function playSystemCue(name) {
  if (name === "shutdown" || name === "sleep") return tone({ frequency: 180, duration: .55, gain: .22, type: "sine", slide: -90 });
  if (name === "startup" || name === "formed") return tone({ frequency: 120, duration: .42, gain: .24, type: "sine", slide: 170 });
  return tone({ frequency: 260, duration: .16, gain: .18, type: "triangle", slide: 80 });
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
