import { suspendMenuMusic, resumeMenuMusic } from "./menu-music.js";

const EVENT = "para-media-session-change";
const EMPTY = Object.freeze({
  active: false,
  appId: "",
  appName: "",
  title: "Nothing playing",
  artist: "",
  album: "",
  artwork: "",
  playbackState: "none",
  canPrevious: false,
  canNext: false,
  volume: 70,
  gameVolume: 100,
});

let session = { ...EMPTY };
let handlers = {};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function announce() {
  document.dispatchEvent(new CustomEvent(EVENT, { detail: mediaSessionState() }));
}

function syncHomeMusic() {
  if (session.active && session.playbackState === "playing") suspendMenuMusic({ duration: 420 });
  else resumeMenuMusic({ duration: 520 });
}

export function mediaSessionState() {
  return { ...session };
}

export function registerMediaSession(metadata = {}, actions = {}) {
  session = {
    ...EMPTY,
    active: true,
    appId: String(metadata.appId || ""),
    appName: String(metadata.appName || metadata.source || "Media app"),
    title: String(metadata.title || "Untitled"),
    artist: String(metadata.artist || ""),
    album: String(metadata.album || ""),
    artwork: String(metadata.artwork || ""),
    playbackState: metadata.playbackState === "paused" ? "paused" : "playing",
    canPrevious: typeof actions.previous === "function",
    canNext: typeof actions.next === "function",
    volume: clamp(metadata.volume ?? 70),
    gameVolume: clamp(metadata.gameVolume ?? 100),
  };
  handlers = { ...actions };
  syncHomeMusic();
  announce();
  return mediaSessionState();
}

export function updateMediaSession(patch = {}) {
  if (!session.active) return mediaSessionState();
  session = {
    ...session,
    ...patch,
    volume: patch.volume == null ? session.volume : clamp(patch.volume),
    gameVolume: patch.gameVolume == null ? session.gameVolume : clamp(patch.gameVolume),
  };
  syncHomeMusic();
  announce();
  return mediaSessionState();
}

export function clearMediaSession() {
  try { handlers.stop?.(); } catch { /* app cleanup is best effort */ }
  session = { ...EMPTY };
  handlers = {};
  syncHomeMusic();
  announce();
}

export async function mediaSessionAction(action) {
  if (!session.active) return mediaSessionState();
  const fn = handlers[action];
  if (typeof fn === "function") await fn();
  if (action === "play") session.playbackState = "playing";
  if (action === "pause") session.playbackState = "paused";
  if (action === "toggle") {
    const next = session.playbackState === "playing" ? "paused" : "playing";
    const toggleHandler = next === "playing" ? handlers.play : handlers.pause;
    if (typeof toggleHandler === "function") await toggleHandler();
    session.playbackState = next;
  }
  syncHomeMusic();
  announce();
  return mediaSessionState();
}

export function setMediaVolume(value) {
  session.volume = clamp(value);
  try { handlers.setVolume?.(session.volume / 100); } catch { /* UI still keeps desired level */ }
  announce();
  return session.volume;
}

export function setGameMediaBalance(value) {
  session.gameVolume = clamp(value);
  announce();
  return session.gameVolume;
}

// Generic bridge for ParaStore web apps. A trusted PARA runtime can expose
// window.PARA.mediaSession to an app container rather than special-casing Spotify.
export const mediaSessionApi = Object.freeze({
  register: registerMediaSession,
  update: updateMediaSession,
  clear: clearMediaSession,
  action: mediaSessionAction,
  state: mediaSessionState,
});

if (typeof window !== "undefined") {
  window.PARA = window.PARA || {};
  window.PARA.mediaSession = mediaSessionApi;
}

export const MEDIA_SESSION_EVENT = EVENT;
