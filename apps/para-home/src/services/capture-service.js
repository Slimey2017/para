const DB_NAME = "para-media-gallery";
const STORE = "captures";
const DB_VERSION = 1;
const PARA_CAPTURE_HANDLE = `para-self-capture:${globalThis.location?.origin || "local"}`;

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
    captureVersion: 2,
  };
  await transact("readwrite", (store) => store.put(item));
  return item;
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function emitCaptureState() {
  if (!globalThis.document) return;
  document.dispatchEvent(new CustomEvent("para-capture-state", {
    detail: { recording: manualRecordingStatus(), replay: replayStatus() },
  }));
}

function configureCaptureHandle() {
  const devices = navigator.mediaDevices;
  if (!devices?.setCaptureHandleConfig) return;
  try {
    devices.setCaptureHandleConfig({
      handle: PARA_CAPTURE_HANDLE,
      exposeOrigin: false,
      permittedOrigins: ["*"],
    });
  } catch {
    // Capture Handle is an enhancement. getDisplayMedia still works without it.
  }
}

configureCaptureHandle();

async function restrictToPara(track, stream) {
  const displaySurface = track.getSettings?.().displaySurface;
  if (displaySurface && displaySurface !== "browser") {
    stopStream(stream);
    throw new Error("Choose This Tab (PARA). PARA will not record another window or your whole screen.");
  }

  const captureHandle = typeof track.getCaptureHandle === "function" ? track.getCaptureHandle() : null;
  if (captureHandle && captureHandle.handle !== PARA_CAPTURE_HANDLE) {
    stopStream(stream);
    throw new Error("That is another Chrome tab. Choose This Tab (PARA) when Chrome asks what to share.");
  }

  const target = document.querySelector("#para-app");
  if (target && globalThis.RestrictionTarget?.fromElement && typeof track.restrictTo === "function") {
    try {
      const restrictionTarget = await globalThis.RestrictionTarget.fromElement(target);
      await track.restrictTo(restrictionTarget);
      track.contentHint = "detail";
      return true;
    } catch {
      stopStream(stream);
      throw new Error("PARA could not lock capture to this tab. Choose This Tab (PARA), not another Chrome tab.");
    }
  }

  // On modern Chromium Capture Handle can still prove self-capture even if
  // Element Capture is unavailable. Older browsers cannot verify which tab
  // the user selected, so the browser picker remains the final authority.
  if (captureHandle?.handle === PARA_CAPTURE_HANDLE) {
    track.contentHint = "detail";
    return true;
  }
  return false;
}

async function requestScreenStream({ audio = false } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen capture is unavailable on this device.");
  configureCaptureHandle();
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 60 }, displaySurface: "browser" },
    audio: audio ? { suppressLocalAudioPlayback: false } : false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "exclude",
    systemAudio: "exclude",
  });
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stopStream(stream);
    throw new Error("PARA did not receive a video track.");
  }
  await restrictToPara(track, stream);
  return stream;
}

export async function captureScreenshot() {
  const stream = await requestScreenStream();
  try {
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
  } finally { stopStream(stream); }
}

let replay = null;

function recorderMimeType() {
  const probe = document.createElement("video");
  return ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported?.(type) && probe.canPlayType(type) !== "") || "";
}

async function assertPlayableVideo(blob) {
  if (!blob?.size || blob.size < 1024) throw new Error("The recording was empty.");
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  try {
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    if (blob.type && video.canPlayType?.(blob.type) === "") {
      throw new Error(`Chrome cannot play the recorded format (${blob.type}).`);
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The video file could not be decoded.")), 7000);
      video.onloadeddata = () => {
        clearTimeout(timer);
        if (!video.videoWidth || !video.videoHeight) {
          reject(new Error("The recording contains no visible video frames."));
          return;
        }
        resolve();
      };
      video.onerror = () => { clearTimeout(timer); reject(new Error("Chrome could not decode the recorded video.")); };
      video.src = url;
      video.load();
    });

    // Loading one frame is not enough. A malformed MediaRecorder WebM can show
    // a thumbnail but still fail when the user presses Play. Verify that the
    // timeline actually advances before PARA commits the capture to IndexedDB.
    const start = Number(video.currentTime || 0);
    await video.play();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The recording decoded, but playback did not advance.")), 3000);
      const advanced = () => {
        if (Number(video.currentTime || 0) <= start + 0.03 && !video.ended) return;
        clearTimeout(timer);
        video.removeEventListener("timeupdate", advanced);
        resolve();
      };
      video.addEventListener("timeupdate", advanced);
      advanced();
    });
    video.pause();
  } finally {
    video.pause?.();
    video.removeAttribute?.("src");
    URL.revokeObjectURL(url);
  }
}

export function replayStatus() {
  return {
    active: Boolean(replay),
    startedAt: replay?.startedAt || 0,
    maxDurationMs: replay?.maxDurationMs || 0,
  };
}

export async function startReplayBuffer(maxDurationMs = 30 * 60 * 1000) {
  if (replay) return replayStatus();
  const stream = await requestScreenStream({ audio: true });
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const startedAt = Date.now();
  let firstChunk = null;

  recorder.ondataavailable = (event) => {
    if (!event.data?.size) return;
    const part = { blob: event.data, at: Date.now() };
    if (!firstChunk) firstChunk = part;
    chunks.push(part);
    const cutoff = Date.now() - maxDurationMs;
    // Keep the first WebM chunk because it contains the file initialization
    // data needed for playback. Roll only later media clusters.
    while (chunks.length > 2 && chunks[1].at < cutoff) chunks.splice(1, 1);
  };
  recorder.start(1000);
  stream.getVideoTracks()[0]?.addEventListener("ended", () => stopReplayBuffer(), { once: true });
  replay = { stream, recorder, chunks, firstChunk, startedAt, maxDurationMs };
  emitCaptureState();
  return replayStatus();
}

export function stopReplayBuffer() {
  if (!replay) return;
  const current = replay;
  replay = null;
  if (current.recorder.state !== "inactive") current.recorder.stop();
  stopStream(current.stream);
  emitCaptureState();
}

export async function saveReplayClip(durationMs = 60_000) {
  if (!replay) throw new Error("PARA Replay is not running. Start Replay first.");
  replay.recorder.requestData();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const cutoff = Date.now() - durationMs;
  const recent = replay.chunks.filter((part, index) => index === 0 || part.at >= cutoff);
  if (!recent.length) throw new Error("Replay has not buffered enough gameplay yet.");
  const blob = new Blob(recent.map((part) => part.blob), { type: replay.recorder.mimeType || "video/webm" });
  await assertPlayableVideo(blob);
  const actualDuration = Math.min(durationMs, Date.now() - replay.startedAt);
  return saveCapture({ type: "clip", blob, durationMs: actualDuration });
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
  if (manualRecording) return manualRecordingStatus();
  const stream = await requestScreenStream({ audio: true });
  const mimeType = recorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  recorder.start(500);
  manualRecording = { stream, recorder, chunks, startedAt, stopping: false };
  emitCaptureState();
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (manualRecording?.stream === stream) void stopManualRecording().catch(() => {});
  }, { once: true });
  return manualRecordingStatus();
}

export async function stopManualRecording() {
  if (!manualRecording) throw new Error("No PARA recording is active.");
  if (manualRecording.stopping) throw new Error("PARA is already saving this recording.");
  const current = manualRecording;
  current.stopping = true;
  emitCaptureState();
  try {
    const stopped = new Promise((resolve, reject) => {
      current.recorder.addEventListener("stop", resolve, { once: true });
      current.recorder.addEventListener("error", () => reject(current.recorder.error || new Error("Recording failed.")), { once: true });
    });
    if (current.recorder.state !== "inactive") {
      current.recorder.requestData();
      current.recorder.stop();
      await stopped;
    }
    // MediaRecorder dispatches its final dataavailable before stop, but an extra
    // task turn keeps Chromium implementations from racing IndexedDB storage.
    await new Promise((resolve) => setTimeout(resolve, 0));
    stopStream(current.stream);
    const blob = new Blob([...current.chunks], { type: current.recorder.mimeType || "video/webm" });
    await assertPlayableVideo(blob);
    return await saveCapture({ type: "clip", blob, durationMs: Date.now() - current.startedAt });
  } finally {
    stopStream(current.stream);
    if (manualRecording === current) manualRecording = null;
    emitCaptureState();
  }
}

export async function recordRecentClip(durationMs = 8000) {
  const stream = await requestScreenStream({ audio: true });
  try {
    const supported = recorderMimeType();
    const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(recorder.error || new Error("Recording failed."));
    });
    recorder.start(500);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    if (recorder.state !== "inactive") {
      recorder.requestData();
      recorder.stop();
    }
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    await assertPlayableVideo(blob);
    return saveCapture({ type: "clip", blob, durationMs });
  } finally { stopStream(stream); }
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
