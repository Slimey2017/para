import {
  clearMediaSession,
  mediaSessionState,
  registerMediaSession,
  updateMediaSession,
} from "./media-session.js";

const DB_NAME = "para-music-library-v1";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const MUSIC_EVENT = "para-local-music-change";
const HANDOFF_KEY = "para.music.handoff.v1";
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "webm"]);
const SHELL_PARAMS = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const IS_SUSPENDED_HOME = SHELL_PARAMS.get("para_suspended_shell") === "1";

let dbPromise = null;
let audio = null;
let objectUrl = "";
let queue = [];
let currentTrack = null;
let lastError = "";
let nativeHandlersInstalled = false;
let restoringSession = null;
let lastHandoffWrite = 0;
let bridgeTimer = null;
let bridgeSignature = "";

function parentMusicHost() {
  if (!IS_SUSPENDED_HOME || typeof window === "undefined" || window.parent === window) return null;
  try {
    const host = window.parent?.PARA?.localMusicHost;
    return host && typeof host.state === "function" ? host : null;
  } catch {
    return null;
  }
}

function normalizedBridgeState(value = {}) {
  return {
    active: Boolean(value.active),
    currentId: String(value.currentId || ""),
    title: String(value.title || "Nothing playing"),
    artist: String(value.artist || ""),
    fileName: String(value.fileName || ""),
    playbackState: value.active ? (value.playbackState === "playing" ? "playing" : "paused") : "none",
    currentTime: Number.isFinite(Number(value.currentTime)) ? Number(value.currentTime) : 0,
    duration: Number.isFinite(Number(value.duration)) ? Number(value.duration) : 0,
    volume: Math.max(0, Math.min(100, Number(value.volume ?? 70) || 0)),
    queueLength: queue.length,
    error: String(value.error || ""),
  };
}

function bridgeActions(host) {
  return {
    play: async () => { await host.play?.(); },
    pause: async () => { await host.pause?.(); },
    previous: async () => { await host.previous?.(); },
    next: async () => { await host.next?.(); },
    setVolume: (value) => { host.setVolume?.(Math.round(Number(value || 0) * 100)); },
    stop: () => { host.pause?.(); },
  };
}

function syncBridgeMediaSession() {
  const host = parentMusicHost();
  if (!host) return null;
  const state = normalizedBridgeState(host.state());
  const existing = mediaSessionState();
  if (state.active) {
    const signature = [state.currentId, state.title, state.artist, state.playbackState, state.volume].join("\u0000");
    if (!existing.active || existing.appId !== "para:music" || bridgeSignature !== signature) {
      if (!existing.active || existing.appId !== "para:music" || existing.title !== state.title || existing.artist !== state.artist) {
        registerMediaSession({
          appId: "para:music",
          appName: "Music",
          title: state.title,
          artist: state.artist || state.fileName || "Local file",
          album: "PARA Music",
          artwork: "",
          playbackState: state.playbackState,
          volume: state.volume,
        }, bridgeActions(host));
      } else {
        updateMediaSession({ playbackState: state.playbackState, volume: state.volume });
      }
      bridgeSignature = signature;
    }
  } else if (existing.active && existing.appId === "para:music") {
    bridgeSignature = "";
    clearMediaSession();
  }
  return state;
}

function startBridgeSync() {
  if (bridgeTimer || !parentMusicHost()) return;
  const tick = () => {
    if (!parentMusicHost()) return;
    syncBridgeMediaSession();
    announce();
  };
  tick();
  bridgeTimer = window.setInterval(tick, 300);
}

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

function synchsafe32(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function uint32be(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function decodeUtf16Be(bytes) {
  const swapped = new Uint8Array(bytes.length);
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1];
    swapped[index + 1] = bytes[index];
  }
  try { return new TextDecoder("utf-16le").decode(swapped); }
  catch { return ""; }
}

function decodeId3Text(bytes, encoding = 3) {
  if (!bytes?.length) return "";
  let value = "";
  try {
    if (encoding === 0) value = new TextDecoder("iso-8859-1").decode(bytes);
    else if (encoding === 3) value = new TextDecoder("utf-8").decode(bytes);
    else if (encoding === 2) value = decodeUtf16Be(bytes);
    else {
      if (bytes[0] === 0xfe && bytes[1] === 0xff) value = decodeUtf16Be(bytes.subarray(2));
      else value = new TextDecoder("utf-16le").decode(bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2) : bytes);
    }
  } catch { value = ""; }
  return value.replace(/\u0000/g, "").trim();
}

function terminatorEnd(bytes, start, encoding) {
  if (encoding === 0 || encoding === 3) {
    const index = bytes.indexOf(0, start);
    return index < 0 ? bytes.length : index;
  }
  for (let index = start; index + 1 < bytes.length; index += 2) {
    if (bytes[index] === 0 && bytes[index + 1] === 0) return index;
  }
  return bytes.length;
}

function parseApicFrame(frame) {
  if (!frame?.length) return null;
  const encoding = frame[0];
  let cursor = 1;
  const mimeEnd = frame.indexOf(0, cursor);
  if (mimeEnd < 0) return null;
  const mime = new TextDecoder("iso-8859-1").decode(frame.subarray(cursor, mimeEnd)).trim().toLowerCase();
  cursor = mimeEnd + 1;
  if (cursor >= frame.length) return null;
  cursor += 1; // picture type
  const descriptionEnd = terminatorEnd(frame, cursor, encoding);
  cursor = Math.min(frame.length, descriptionEnd + (encoding === 0 || encoding === 3 ? 1 : 2));
  if (!mime.startsWith("image/") || cursor >= frame.length) return null;
  const image = new Uint8Array(frame.length - cursor);
  image.set(frame.subarray(cursor));
  return image.length ? new Blob([image], { type: mime }) : null;
}

async function id3Metadata(file, nameOverride = "") {
  const extension = String(nameOverride || file.name || "").split(".").pop()?.toLowerCase();
  if (extension !== "mp3" && !String(file.type || "").includes("mpeg")) return {};
  try {
    const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (header.length < 10 || String.fromCharCode(...header.subarray(0, 3)) !== "ID3") return {};
    const version = header[3];
    if (version < 3 || version > 4) return {};
    const tagSize = synchsafe32(header, 6);
    const total = Math.min(file.size, 10 + tagSize, 8 * 1024 * 1024);
    const bytes = new Uint8Array(await file.slice(0, total).arrayBuffer());
    const result = { title: "", artist: "", album: "", artworkBlob: null };
    let cursor = 10;
    while (cursor + 10 <= bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(cursor, cursor + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? synchsafe32(bytes, cursor + 4) : uint32be(bytes, cursor + 4);
      if (!size || cursor + 10 + size > bytes.length) break;
      const frame = bytes.subarray(cursor + 10, cursor + 10 + size);
      if ((id === "TIT2" || id === "TPE1" || id === "TALB") && frame.length > 1) {
        const text = decodeId3Text(frame.subarray(1), frame[0]);
        if (id === "TIT2") result.title = text;
        if (id === "TPE1") result.artist = text;
        if (id === "TALB") result.album = text;
      } else if (id === "APIC" && !result.artworkBlob) {
        result.artworkBlob = parseApicFrame(frame);
      }
      cursor += 10 + size;
    }
    return result;
  } catch {
    return {};
  }
}

async function recordForFile(file) {
  const fallback = fileNameMetadata(file.name);
  const embedded = await id3Metadata(file, file.name);
  return {
    id: stableTrackId(file),
    title: embedded.title || fallback.title,
    artist: embedded.artist || fallback.artist,
    album: embedded.album || "",
    fileName: String(file.name || embedded.title || fallback.title),
    mimeType: String(file.type || ""),
    size: Number(file.size || 0),
    lastModified: Number(file.lastModified || 0),
    addedAt: Date.now(),
    artworkBlob: embedded.artworkBlob instanceof Blob ? embedded.artworkBlob : null,
    metadataVersion: 1,
    blob: file,
  };
}

export async function listLocalMusic() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRACK_STORE, "readonly");
    const request = transaction.objectStore(TRACK_STORE).getAll();
    request.onsuccess = async () => {
      let records = Array.isArray(request.result) ? request.result : [];
      const stale = records.filter((record) => record?.blob instanceof Blob && Number(record.metadataVersion || 0) < 1);
      if (stale.length) {
        const upgraded = await Promise.all(stale.map(async (record) => {
          const fallback = fileNameMetadata(record.fileName || record.title || "Local track");
          const embedded = await id3Metadata(record.blob, record.fileName || "");
          return {
            ...record,
            title: embedded.title || record.title || fallback.title,
            artist: embedded.artist || record.artist || fallback.artist,
            album: embedded.album || record.album || "",
            artworkBlob: embedded.artworkBlob instanceof Blob ? embedded.artworkBlob : (record.artworkBlob || null),
            metadataVersion: 1,
          };
        }));
        try {
          const write = db.transaction(TRACK_STORE, "readwrite");
          const store = write.objectStore(TRACK_STORE);
          upgraded.forEach((record) => store.put(record));
          await transactionDone(write);
          const byId = new Map(upgraded.map((record) => [record.id, record]));
          records = records.map((record) => byId.get(record.id) || record);
        } catch { /* Metadata enrichment is optional; playback still works. */ }
      }
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
  const candidates = (await Promise.all(accepted.map(recordForFile))).filter((record) => {
    if (existingIds.has(record.id) || batchIds.has(record.id)) return false;
    batchIds.add(record.id);
    return true;
  });
  if (candidates.length) {
    const db = await openDb();
    const transaction = db.transaction(TRACK_STORE, "readwrite");
    const store = transaction.objectStore(TRACK_STORE);
    candidates.forEach((record) => store.put(record));
    await transactionDone(transaction);
  }
  const tracks = await listLocalMusic();
  setMusicQueue(tracks);
  try { await parentMusicHost()?.refreshLibrary?.(); } catch { /* Parent queue refresh is best effort. */ }
  return { imported: candidates.length, skipped: incoming.length - candidates.length, tracks };
}

export async function removeLocalMusic(id) {
  if (localMusicState().currentId === id) stopLocalMusic();
  const db = await openDb();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).delete(String(id || ""));
  await transactionDone(transaction);
  const tracks = await listLocalMusic();
  setMusicQueue(tracks);
  try { await parentMusicHost()?.refreshLibrary?.(); } catch { /* Parent queue refresh is best effort. */ }
  return tracks;
}

export async function clearLocalMusic() {
  stopLocalMusic();
  const db = await openDb();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).clear();
  await transactionDone(transaction);
  queue = [];
  try { await parentMusicHost()?.refreshLibrary?.(); } catch { /* Parent queue refresh is best effort. */ }
  announce();
  return [];
}

function ensureAudio() {
  if (audio) return audio;
  audio = document.createElement("audio");
  audio.id = "para-local-music-audio";
  audio.preload = "auto";
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
  if (typeof document === "undefined") return;
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
    const state = localMusicState();
    navigator.mediaSession.playbackState = !state.active ? "none" : state.playbackState;
    const track = currentTrack;
    if (state.active && globalThis.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.title,
        artist: state.artist || "Local file",
        album: track?.album || "PARA Music",
      });
    } else if (!state.active) {
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

function compensatedHandoffTime(saved = {}) {
  let value = Math.max(0, Number(saved.currentTime || 0));
  if (saved.playbackState === "playing" && Number(saved.updatedAt) > 0) {
    const elapsed = Math.max(0, Math.min(4, (Date.now() - Number(saved.updatedAt)) / 1000));
    value += elapsed;
  }
  return value;
}

function persistMusicHandoff(force = false) {
  const host = parentMusicHost();
  if (host) {
    try { host.flush?.(); } catch { /* Parent runtime owns the state. */ }
    return;
  }
  const now = Date.now();
  if (!force && now - lastHandoffWrite < 500) return;
  lastHandoffWrite = now;
  try {
    const state = localMusicState();
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({
      version: 2,
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

export function prepareLocalMusicHandoff() {
  persistMusicHandoff(true);
  return localMusicState();
}

function waitForAudioMetadata(player, timeoutMs = 2200) {
  if (player.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); player.removeEventListener("loadedmetadata", finish); resolve(); };
    const timer = setTimeout(finish, timeoutMs);
    player.addEventListener("loadedmetadata", finish, { once: true });
  });
}

export async function restoreLocalMusicSession({ attemptPlayback = true } = {}) {
  const host = parentMusicHost();
  if (host) {
    startBridgeSync();
    return syncBridgeMediaSession() || normalizedBridgeState(host.state());
  }
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
    registerCurrentSession("paused");
    await waitForAudioMetadata(player);
    const targetTime = compensatedHandoffTime(saved);
    if (Number.isFinite(targetTime)) {
      try { player.currentTime = Math.max(0, Math.min(Number(player.duration || targetTime), targetTime)); } catch { /* Non-seekable audio. */ }
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
  const host = parentMusicHost();
  if (host) {
    const state = await host.playTrack?.(String(id || ""));
    syncBridgeMediaSession();
    announce();
    return normalizedBridgeState(state || host.state());
  }
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
  const host = parentMusicHost();
  if (host) {
    const current = normalizedBridgeState(host.state());
    if (current.active) await host.play?.();
    else {
      if (!queue.length) queue = await listLocalMusic();
      if (queue[0]) await host.playTrack?.(queue[0].id);
    }
    syncBridgeMediaSession();
    announce();
    return localMusicState();
  }
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
  const host = parentMusicHost();
  if (host) {
    void host.pause?.();
    syncBridgeMediaSession();
    announce();
    return localMusicState();
  }
  if (audio) audio.pause();
  return localMusicState();
}

export async function toggleLocalMusic() {
  const host = parentMusicHost();
  if (host) {
    const state = await host.toggle?.();
    syncBridgeMediaSession();
    announce();
    return normalizedBridgeState(state || host.state());
  }
  if (!currentTrack || audio?.paused) return playLocalMusic();
  pauseLocalMusic();
  return localMusicState();
}

export async function nextLocalMusic() {
  const host = parentMusicHost();
  if (host) {
    const state = await host.next?.();
    syncBridgeMediaSession();
    announce();
    return normalizedBridgeState(state || host.state());
  }
  if (!queue.length) return localMusicState();
  const index = currentIndex();
  const next = queue[index < 0 ? 0 : (index + 1) % queue.length];
  return playLocalMusicTrack(next.id);
}

export async function previousLocalMusic() {
  const host = parentMusicHost();
  if (host) {
    const state = await host.previous?.();
    syncBridgeMediaSession();
    announce();
    return normalizedBridgeState(state || host.state());
  }
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
  const host = parentMusicHost();
  if (host) {
    host.seek?.(Number(seconds || 0));
    syncBridgeMediaSession();
    announce();
    return Number(seconds || 0);
  }
  const player = ensureAudio();
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  player.currentTime = Math.max(0, Math.min(duration || Number(seconds || 0), Number(seconds || 0)));
  persistMusicHandoff(true);
  announce();
  return player.currentTime;
}

export function setLocalMusicVolume(percent) {
  const host = parentMusicHost();
  if (host) {
    host.setVolume?.(Number(percent || 0));
    syncBridgeMediaSession();
    announce();
    return normalizedBridgeState(host.state()).volume;
  }
  const player = ensureAudio();
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  player.volume = value / 100;
  if (currentTrack) updateMediaSession({ volume: value });
  persistMusicHandoff(true);
  announce();
  return value;
}

export function stopLocalMusic() {
  const host = parentMusicHost();
  if (host) {
    host.stop?.();
    bridgeSignature = "";
    syncBridgeMediaSession();
    announce();
    return;
  }
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
  const host = parentMusicHost();
  if (host) {
    try { return normalizedBridgeState(host.state()); }
    catch { /* Fall through to the local audio state. */ }
  }
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
  window.addEventListener("pagehide", () => prepareLocalMusicHandoff());
  const restore = () => {
    if (parentMusicHost()) startBridgeSync();
    void restoreLocalMusicSession().catch(() => {});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore, { once: true });
  else queueMicrotask(restore);
}

export { MUSIC_EVENT, HANDOFF_KEY };
