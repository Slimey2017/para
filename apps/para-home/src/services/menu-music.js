import { getProfilePreferences, setProfilePreferences } from "../state.js";

const TRACK = "./assets/audio/a-slow-dream.mp3";
let player = null;
let fadeTimer = null;
let unlocked = false;

function prefs() { return getProfilePreferences().sound; }
function targetVolume() { return Math.max(0, Math.min(1, Number(prefs().menuMusicVolume ?? 35) / 100)); }
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
  if (gameRunning || sound.menuMusic === false) { fadeTo(0, 600, true); return; }
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
  if (prefs().menuMusic !== false && unlocked) fadeTo(volume / 100, 100);
  return volume;
}
