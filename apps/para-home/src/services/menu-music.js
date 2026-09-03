import { getProfilePreferences, setProfilePreferences } from "../state.js";

const TRACK = "./assets/audio/sleep-music-no-1.mp3";
let player = null;
let fadeTimer = null;
let unlocked = false;
let suspended = false;

function prefs() { return getProfilePreferences().sound; }
function targetVolume() { return Math.max(0, Math.min(1, Number(prefs().menuMusicVolume ?? 22) / 100)); }
function ensurePlayer() {
  if (player) return player;
  player = new Audio(TRACK);
  player.loop = true;
  player.preload = "auto";
  player.volume = targetVolume();
  player.setAttribute("aria-hidden", "true");
  return player;
}
function fadeTo(value, ms = 650, pauseAfter = false) {
  const audio = ensurePlayer();
  clearInterval(fadeTimer);
  const start = audio.volume;
  const end = Math.max(0, Math.min(1, value));
  const steps = Math.max(1, Math.round(ms / 40));
  let step = 0;
  fadeTimer = setInterval(() => {
    step += 1;
    audio.volume = start + (end - start) * (step / steps);
    if (step >= steps) {
      clearInterval(fadeTimer); fadeTimer = null; audio.volume = end;
      if (pauseAfter && end === 0) audio.pause();
    }
  }, ms / steps);
}
export function syncMenuMusic({ gameRunning = false } = {}) {
  const audio = ensurePlayer();
  const sound = prefs();
  if (suspended || gameRunning || sound.menuMusic === false) { fadeTo(0, 120, true); return; }
  if (!unlocked) return;
  audio.play().then(() => fadeTo(targetVolume(), 700)).catch(() => {});
}
export function unlockMenuMusic() {
  unlocked = true;
  syncMenuMusic();
}
export function toggleMenuMusic() {
  const sound = prefs();
  const enabled = sound.menuMusic === false;
  setProfilePreferences({ sound: { menuMusic: enabled } });
  syncMenuMusic();
  return enabled;
}
export function setMenuMusicVolume(value) {
  const volume = Math.max(0, Math.min(100, Number(value) || 0));
  setProfilePreferences({ sound: { menuMusicVolume: volume } });
  if (!suspended && prefs().menuMusic !== false && unlocked) fadeTo(volume / 100, 100);
  return volume;
}

export function suspendMenuMusic({ duration = 120 } = {}) {
  suspended = true;
  clearTimeout(duckTimer);
  fadeTo(0, duration, true);
}

export function resumeMenuMusic({ duration = 650 } = {}) {
  suspended = false;
  if (!unlocked || prefs().menuMusic === false) return;
  const audio = ensurePlayer();
  audio.play().then(() => fadeTo(targetVolume(), duration)).catch(() => {});
}

let duckTimer = null;
export function duckMenuMusic({ amount = 0.32, duration = 240 } = {}) {
  if (suspended || !unlocked || prefs().menuMusic === false) return;
  const normal = targetVolume();
  const ducked = Math.max(0, normal * (1 - Math.max(0, Math.min(.8, amount))));
  clearTimeout(duckTimer);
  fadeTo(ducked, 45);
  duckTimer = setTimeout(() => fadeTo(targetVolume(), 120), Math.max(80, duration));
}
