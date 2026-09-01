const DB_NAME = "para-media-gallery";
const STORE = "captures";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = work(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Capture transaction aborted"));
    });
  } finally { db.close(); }
}

export async function listCaptures() {
  if (!globalThis.indexedDB) return [];
  const items = await transact("readonly", (store) => store.getAll());
  return [...(items || [])].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export function capturePlaybackMime(item = {}) {
  const declared = String(item?.mimeType || item?.blob?.type || "").trim().toLowerCase();
  if (item?.type === "clip" && declared.includes("mp4")) return "video/mp4";
  if (item?.type === "clip" && (!declared || declared.includes("webm"))) return "video/webm";
  return String(item?.mimeType || item?.blob?.type || "").trim();
}

export function capturePlaybackBlob(item = {}) {
  const blob = item?.blob;
  if (!(blob instanceof Blob)) return blob;
  const playbackMime = capturePlaybackMime(item);
  if (!playbackMime || blob.type === playbackMime) return blob;
  return new Blob([blob], { type: playbackMime });
}

export async function deleteCapture(id) {
  if (!globalThis.indexedDB) return false;
  await transact("readwrite", (store) => store.delete(id));
  return true;
}

function runtimeOnlyError(action = "capture gameplay") {
  return new Error(`Open a game to ${action}. PARA no longer records the browser tab; gameplay capture runs inside the game and is normalized to MP4.`);
}

function emitCaptureState() {
  if (!globalThis.document) return;
  document.dispatchEvent(new CustomEvent("para-capture-state", {
    detail: { recording: manualRecordingStatus(), replay: replayStatus() },
  }));
}

// V50 deliberately removes browser-tab capture from PARA Home. Game screenshots
// are captured from the game renderer by the injected runtime, without a tab picker.
export async function captureScreenshot() {
  throw runtimeOnlyError("take a gameplay screenshot");
}

let replay = null;

export function replayStatus() {
  return {
    active: Boolean(replay),
    startedAt: replay?.startedAt || 0,
    maxDurationMs: replay?.maxDurationMs || 0,
  };
}

export async function startReplayBuffer() {
  throw runtimeOnlyError("start PARA Replay");
}

export function stopReplayBuffer() {
  replay = null;
  emitCaptureState();
}

export async function saveReplayClip() {
  throw runtimeOnlyError("save PARA Replay");
}

let manualRecording = null;

export function manualRecordingStatus() {
  return {
    active: Boolean(manualRecording),
    stopping: Boolean(manualRecording?.stopping),
    startedAt: manualRecording?.startedAt || 0,
    elapsedMs: manualRecording ? Date.now() - manualRecording.startedAt : 0,
  };
}

export async function startManualRecording() {
  throw runtimeOnlyError("record gameplay");
}

export async function stopManualRecording() {
  throw runtimeOnlyError("save gameplay recording");
}

export async function recordRecentClip() {
  throw runtimeOnlyError("record a gameplay clip");
}

export async function getCapture(id) {
  if (!globalThis.indexedDB) return null;
  return transact("readonly", (store) => store.get(id));
}

export async function shareCapture(id, target = "system") {
  const item = await getCapture(id);
  if (!item) throw new Error("Capture not found.");
  const extension = item.type === "clip" ? ((item.mimeType || item.blob.type || "").includes("mp4") ? "mp4" : "webm") : "webp";
  const file = new File([item.blob], `PARA-${item.id}.${extension}`, { type: item.mimeType || item.blob.type });
  if (target === "system" && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: "Shared from PARA", text: "Captured on PARA", files: [file] });
    return "Shared";
  }
  const url = URL.createObjectURL(item.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (target === "phone") return "Capture exported for phone transfer";
  if (target === "files") return "Capture exported to your Downloads folder";
  return "Capture exported";
}
