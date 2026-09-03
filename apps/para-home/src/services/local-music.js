import {
  clearMediaSession,
  registerMediaSession,
  updateMediaSession,
} from "./media-session.js";

const DB_NAME = "para-music-library-v1";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const MUSIC_EVENT = "para-local-music-change";
const HANDOFF_KEY = "para.music.handoff.v1";
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "webm"]);

let dbPromise = null;
let audio = null;
let objectUrl = "";
let queue = [];
let currentTrack = null;
let lastError = "";
let nativeHandlersInstalled = false;
let restoringSession = null;
let lastHandoffWrite = 0;

function openDb() {
  if (dbPromise) return dbPromise;
  if (!globalThis.indexedDB) return Promise.reject(new Error("This browser does not provide local music storage."));
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        const store = db.createObjectStore(TRACK_STORE, { keyPath: "id" });
        store.createIndex("addedAt", "addedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("PARA Music could not open local storage."));
  });
  return dbPromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("PARA Music storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("PARA Music storage was interrupted."));
  });
}

function supportedAudioFile(file) {
  if (!(file instanceof Blob)) return false;
  const name = String(file.name || "");
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return String(file.type || "").startsWith("audio/") || AUDIO_EXTENSIONS.has(extension);
}

function stableTrackId(file) {
  const source = `${file.name || "track"}\u0000${file.size || 0}\u0000${file.lastModified || 0}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fileNameMetadata(name = "") {
  const clean = String(name || "Local track").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Local track";
  const divider = clean.indexOf(" - ");
  if (divider > 0 && divider < clean.length - 3) {
    return {
      artist: clean.slice(0, divider).trim(),
      title: clean.slice(divider + 3).trim(),
    };
  }
  return { artist: "", title: clean };
}

function recordForFile(file) {
  const metadata = fileNameMetadata(file.name);
  return {
    id: stableTrackId(file),
    title: metadata.title,
    artist: metadata.artist,
    album: "",
    fileName: String(file.name || metadata.title),
    mimeType: String(file.type || ""),
    size: Number(file.size || 0),
    lastModified: Number(file.lastModified || 0),
    addedAt: Date.now(),
    blob: file,
  };
}

export async function listLocalMusic() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRACK_STORE, "readonly");
    const request = transaction.objectStore(TRACK_STORE).getAll();
    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      records.sort((a, b) => Number(a.addedAt || 0) - Number(b.addedAt || 0));
      resolve(records);
    };
    request.onerror = () => reject(request.error || new Error("PARA Music could not read the local library."));
  });
}

export async function importLocalMusic(files = []) {
  const incoming = Array.from(files || []);
  const accepted = incoming.filter(supportedAudioFile);
  if (!accepted.length) return { imported: 0, skipped: incoming.length, tracks: await listLocalMusic() };
  const existingTracks = await listLocalMusic();
  const existingIds = new Set(existingTracks.map((track) => track.id));
  const batchIds = new Set();
  const records = accepted.map(recordForFile).filter((record) => {
    if (existingIds.has(record.id) || batchIds.has(record.id)) return false;
    batchIds.add(record.id);
    return true;
  });
  if (records.length) {
    const db = await openDb();
    const transaction = db.transaction(TRACK_STORE, "readwrite");
    const store = transaction.objectStore(TRACK_STORE);
    records.forEach((record) => store.put(record));
    await transactionDone(transaction);
  }
  const tracks = await listLocalMusic();
  setMusicQueue(tracks);
  return { imported: records.length, skipped: incoming.length - records.length, tracks };
}

export async function removeLocalMusic(id) {
  const db = await openDb();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).delete(String(id || ""));
  await transactionDone(transaction);
  if (currentTrack?.id === id) stopLocalMusic();
  const tracks = await listLocalMusic();
  setMusicQueue(tracks);
  return tracks;
}

export async function clearLocalMusic() {
  const db = await openDb();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).clear();
  await transactionDone(transaction);
  stopLocalMusic();
  queue = [];
  announce();
  return [];
}

function ensureAudio() {
  if (audio) return audio;
  audio = document.createElement("audio");
  audio.id = "para-local-music-audio";
  audio.preload = "metadata";
  audio.volume = 0.7;
  audio.style.display = "none";
  document.body.appendChild(audio);

  audio.addEventListener("play", () => {
    lastError = "";
    updateMediaSession({ playbackState: "playing" });
    syncNativeMediaSession();
    persistMusicHandoff(true);
    announce();
  });
  audio.addEventListener("pause", () => {
    if (currentTrack) updateMediaSession({ playbackState: "paused" });
    syncNativeMediaSession();
    persistMusicHandoff(true);
    announce();
  });
  audio.addEventListener("timeupdate", () => { persistMusicHandoff(false); announce(); });
  audio.addEventListener("durationchange", announce);
  audio.addEventListener("loadedmetadata", announce);
  audio.addEventListener("ended", () => { void nextLocalMusic(); });
  audio.addEventListener("error", () => {
    lastError = "This browser could not decode that local audio file.";
    updateMediaSession({ playbackState: "paused" });
    persistMusicHandoff(true);
    announce();
  });
  installNativeHandlers();
  return audio;
}

function announce() {
  document.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: localMusicState() }));
}

function currentIndex() {
  return currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
}

function revokeTrackUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
}

function mediaActions() {
  return {
    play: async () => { await playLocalMusic(); },
    pause: async () => { pauseLocalMusic(); },
    previous: async () => { await previousLocalMusic(); },
    next: async () => { await nextLocalMusic(); },
    setVolume: (value) => { setLocalMusicVolume(Number(value || 0) * 100); },
    stop: () => { pauseLocalMusic(); },
  };
}

function registerCurrentSession(playbackState = "paused") {
  if (!currentTrack) return;
  registerMediaSession({
    appId: "para:music",
    appName: "Music",
    title: currentTrack.title || currentTrack.fileName || "Local track",
    artist: currentTrack.artist || "Local file",
    album: currentTrack.album || "",
    artwork: "",
    playbackState,
    volume: Math.round((audio?.volume ?? 0.7) * 100),
  }, mediaActions());
}

function syncNativeMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = !currentTrack ? "none" : audio && !audio.paused ? "playing" : "paused";
    if (currentTrack && globalThis.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || currentTrack.fileName || "Local track",
        artist: currentTrack.artist || "Local file",
        album: currentTrack.album || "PARA Music",
      });
    } else if (!currentTrack) {
      navigator.mediaSession.metadata = null;
    }
  } catch { /* Native media integration is best effort. */ }
}

function installNativeHandlers() {
  if (nativeHandlersInstalled || !("mediaSession" in navigator)) return;
  nativeHandlersInstalled = true;
  const assign = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
  };
  assign("play", () => { void playLocalMusic(); });
  assign("pause", () => pauseLocalMusic());
  assign("previoustrack", () => { void previousLocalMusic(); });
  assign("nexttrack", () => { void nextLocalMusic(); });
  assign("seekto", (details) => {
    if (Number.isFinite(details?.seekTime)) seekLocalMusic(details.seekTime);
  });
}


function readMusicHandoff() {
  try {
    const value = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
}

function persistMusicHandoff(force = false) {
  const now = Date.now();
  if (!force && now - lastHandoffWrite < 850) return;
  lastHandoffWrite = now;
  try {
    const state = localMusicState();
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({
      version: 1,
      active: state.active,
      currentId: state.currentId,
      title: state.title,
      artist: state.artist,
      fileName: state.fileName,
      playbackState: state.playbackState,
      currentTime: state.currentTime,
      volume: state.volume,
      updatedAt: now,
    }));
  } catch { /* Local handoff is best effort. */ }
}

function waitForAudioMetadata(player, timeoutMs = 2600) {
  if (player.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); player.removeEventListener("loadedmetadata", finish); resolve(); };
    const timer = setTimeout(finish, timeoutMs);
    player.addEventListener("loadedmetadata", finish, { once: true });
  });
}

export async function restoreLocalMusicSession({ attemptPlayback = true } = {}) {
  if (currentTrack) return localMusicState();
  if (restoringSession) return restoringSession;
  restoringSession = (async () => {
    const saved = readMusicHandoff();
    if (!saved?.active || !saved.currentId) return localMusicState();
    const tracks = await listLocalMusic();
    queue = [...tracks];
    const track = queue.find((item) => item.id === saved.currentId);
    if (!track?.blob) return localMusicState();
    const player = ensureAudio();
    currentTrack = track;
    lastError = "";
    revokeTrackUrl();
    objectUrl = URL.createObjectURL(track.blob);
    player.src = objectUrl;
    player.volume = Math.max(0, Math.min(1, Number(saved.volume ?? 70) / 100));
    player.load();
    registerCurrentSession(saved.playbackState === "playing" ? "paused" : "paused");
    await waitForAudioMetadata(player);
    if (Number.isFinite(Number(saved.currentTime))) {
      try { player.currentTime = Math.max(0, Math.min(Number(player.duration || saved.currentTime), Number(saved.currentTime))); } catch { /* Non-seekable audio. */ }
    }
    syncNativeMediaSession();
    announce();
    if (attemptPlayback && saved.playbackState === "playing") {
      try { await player.play(); }
      catch {
        lastError = "Press Play to continue this local song.";
        announce();
      }
    }
    persistMusicHandoff(true);
    return localMusicState();
  })().finally(() => { restoringSession = null; });
  return restoringSession;
}

export function setMusicQueue(tracks = []) {
  queue = Array.isArray(tracks) ? [...tracks] : [];
  announce();
  return queue.length;
}

export async function playLocalMusicTrack(id) {
  if (!queue.length) setMusicQueue(await listLocalMusic());
  const track = queue.find((item) => item.id === id);
  if (!track || !(track.blob instanceof Blob)) throw new Error("That local music file is no longer available.");
  const player = ensureAudio();
  if (currentTrack?.id !== track.id) {
    revokeTrackUrl();
    currentTrack = track;
    lastError = "";
    objectUrl = URL.createObjectURL(track.blob);
    player.src = objectUrl;
    player.load();
    registerCurrentSession("paused");
    syncNativeMediaSession();
    persistMusicHandoff(true);
    announce();
  }
  await player.play();
  return localMusicState();
}

export async function playLocalMusic() {
  const player = ensureAudio();
  if (!currentTrack) {
    if (!queue.length) setMusicQueue(await listLocalMusic());
    if (!queue.length) return localMusicState();
    return playLocalMusicTrack(queue[0].id);
  }
  await player.play();
  return localMusicState();
}

export function pauseLocalMusic() {
  if (audio) audio.pause();
  return localMusicState();
}

export async function toggleLocalMusic() {
  if (!currentTrack || audio?.paused) return playLocalMusic();
  pauseLocalMusic();
  return localMusicState();
}

export async function nextLocalMusic() {
  if (!queue.length) return localMusicState();
  const index = currentIndex();
  const next = queue[index < 0 ? 0 : (index + 1) % queue.length];
  return playLocalMusicTrack(next.id);
}

export async function previousLocalMusic() {
  if (!queue.length) return localMusicState();
  const player = ensureAudio();
  if (player.currentTime > 4) {
    player.currentTime = 0;
    announce();
    return localMusicState();
  }
  const index = currentIndex();
  const previous = queue[index < 0 ? 0 : (index - 1 + queue.length) % queue.length];
  return playLocalMusicTrack(previous.id);
}

export function seekLocalMusic(seconds) {
  const player = ensureAudio();
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  player.currentTime = Math.max(0, Math.min(duration || Number(seconds || 0), Number(seconds || 0)));
  persistMusicHandoff(true);
  announce();
  return player.currentTime;
}

export function setLocalMusicVolume(percent) {
  const player = ensureAudio();
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  player.volume = value / 100;
  if (currentTrack) updateMediaSession({ volume: value });
  persistMusicHandoff(true);
  announce();
  return value;
}

export function stopLocalMusic() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  revokeTrackUrl();
  currentTrack = null;
  lastError = "";
  clearMediaSession();
  syncNativeMediaSession();
  persistMusicHandoff(true);
  announce();
}

export function localMusicState() {
  const duration = Number.isFinite(audio?.duration) ? audio.duration : 0;
  return {
    active: Boolean(currentTrack),
    currentId: currentTrack?.id || "",
    title: currentTrack?.title || "Nothing playing",
    artist: currentTrack?.artist || "",
    fileName: currentTrack?.fileName || "",
    playbackState: currentTrack ? (audio && !audio.paused ? "playing" : "paused") : "none",
    currentTime: Number.isFinite(audio?.currentTime) ? audio.currentTime : 0,
    duration,
    volume: Math.round((audio?.volume ?? 0.7) * 100),
    queueLength: queue.length,
    error: lastError,
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => persistMusicHandoff(true));
  const restore = () => { void restoreLocalMusicSession().catch(() => {}); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore, { once: true });
  else queueMicrotask(restore);
}

export { MUSIC_EVENT, HANDOFF_KEY };
