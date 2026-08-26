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

export async function deleteCapture(id) {
  if (!globalThis.indexedDB) return false;
  await transact("readwrite", (store) => store.delete(id));
  return true;
}

async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0 }) {
  const item = {
    id: crypto.randomUUID?.() || `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    blob,
    mimeType: blob.type,
    width,
    height,
    durationMs,
    createdAt: Date.now(),
    source: "PARA",
  };
  await transact("readwrite", (store) => store.put(item));
  return item;
}

async function requestScreenStream({ audio = false } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen capture is unavailable on this device.");
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio });
}

export async function captureScreenshot() {
  const stream = await requestScreenStream();
  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create screenshot.")), "image/webp", 0.94));
    return saveCapture({ type: "screenshot", blob, width: canvas.width, height: canvas.height });
  } finally { stream.getTracks().forEach((track) => track.stop()); }
}

export async function recordRecentClip(durationMs = 8000) {
  const stream = await requestScreenStream({ audio: true });
  try {
    const supported = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
    const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = () => reject(recorder.error || new Error("Recording failed.")); });
    recorder.start(500);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    if (!blob.size) throw new Error("The clip was empty.");
    return saveCapture({ type: "clip", blob, durationMs });
  } finally { stream.getTracks().forEach((track) => track.stop()); }
}
