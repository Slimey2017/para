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


export function capturePlaybackMime(item = {}) {
  const declared = String(item?.mimeType || item?.blob?.type || "").trim().toLowerCase();
  if (item?.type === "clip" && (!declared || declared.includes("webm"))) return "video/webm";
  return String(item?.mimeType || item?.blob?.type || "").trim();
}

export function capturePlaybackBlob(item = {}) {
  const blob = item?.blob;
  if (!(blob instanceof Blob)) return blob;
  const playbackMime = capturePlaybackMime(item);
  if (!playbackMime || blob.type === playbackMime) return blob;
  // IndexedDB keeps the original MediaRecorder MIME string. Older captures can
  // contain an over-specific codecs parameter that Chromium later rejects when
  // used as the Blob URL response Content-Type even though the WebM bytes are
  // valid (YouTube/ffmpeg can still ingest them). Re-wrap the same bytes with a
  // generic WebM MIME for local playback; uploads keep the untouched original.
  return new Blob([blob], { type: playbackMime });
}

export async function deleteCapture(id) {
  if (!globalThis.indexedDB) return false;
  await transact("readwrite", (store) => store.delete(id));
  return true;
}

async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0, playbackVerified = false, recorderMimeType = "" }) {
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
    captureVersion: 3,
    ...(type === "clip" ? {
      playbackVerified: Boolean(playbackVerified),
      recorderMimeType: recorderMimeType || blob.type || "video/webm",
    } : {}),
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

const CAPTURE_CHUNK_MS = 1000;
const CAPTURE_PROBE_CHUNK_MS = 250;
const CAPTURE_PROBE_MS = 1250;
const CAPTURE_FLUSH_TIMEOUT_MS = 2000;
const CAPTURE_PLAYBACK_TIMEOUT_MS = 7000;

function recorderMimeCandidates(stream) {
  if (!globalThis.MediaRecorder) throw new Error("Gameplay recording is unavailable in this browser.");
  const hasAudio = Boolean(stream?.getAudioTracks?.().some((track) => track.readyState !== "ended"));
  const candidates = hasAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  const supported = candidates.filter((type) => MediaRecorder.isTypeSupported?.(type));
  // Chrome normally supports at least one explicit WebM option. The empty
  // candidate leaves codec choice to MediaRecorder only as a last resort.
  return supported.length ? supported : [""];
}

function recorderOptions(mimeType = "") {
  return mimeType ? { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 } : undefined;
}

function recorderLabel(mimeType = "") {
  return mimeType || "Chrome default WebM";
}

function mediaDecodeMessage(video) {
  const code = Number(video?.error?.code || 0);
  if (code === 1) return "Chrome interrupted capture playback.";
  if (code === 2) return "Chrome could not read this capture's media data.";
  if (code === 3) return "Chrome rejected this capture's video stream.";
  if (code === 4) return "Chrome does not support this capture's encoded video stream.";
  return "Chrome could not decode the recorded video.";
}

function startRecorderSession(stream, mimeType, { timesliceMs = CAPTURE_CHUNK_MS, storeChunks = true, onChunk = null } = {}) {
  const recorder = new MediaRecorder(stream, recorderOptions(mimeType));
  const session = {
    recorder,
    mimeType: recorder.mimeType || mimeType || "video/webm",
    chunks: [],
    dataEvents: 0,
    error: null,
  };
  recorder.addEventListener("dataavailable", (event) => {
    session.dataEvents += 1;
    if (!event.data?.size) return;
    if (storeChunks) session.chunks.push(event.data);
    onChunk?.(event.data);
  });
  recorder.addEventListener("error", () => {
    session.error = recorder.error || new Error("Recording failed.");
  });
  recorder.start(timesliceMs);
  return session;
}

async function flushRecorderData(session) {
  const recorder = session?.recorder;
  if (!recorder || recorder.state === "inactive") return;
  const before = session.dataEvents;
  await new Promise((resolve, reject) => {
    let timer = null;
    const finish = (error = null) => {
      clearTimeout(timer);
      recorder.removeEventListener("dataavailable", onData);
      recorder.removeEventListener("error", onError);
      if (error) reject(error); else resolve();
    };
    const onData = () => {
      if (session.dataEvents > before) finish();
    };
    const onError = () => finish(session.error || recorder.error || new Error("Recording failed while flushing data."));
    recorder.addEventListener("dataavailable", onData);
    recorder.addEventListener("error", onError);
    timer = setTimeout(() => finish(new Error("PARA timed out waiting for the recorder's final data chunk.")), CAPTURE_FLUSH_TIMEOUT_MS);
    try { recorder.requestData(); }
    catch (error) { finish(error); }
  });
}

async function finalizeRecorderSession(session) {
  const recorder = session?.recorder;
  if (!recorder) throw new Error("PARA could not create a recording session.");
  if (recorder.state !== "inactive") {
    await new Promise((resolve, reject) => {
      const onStop = () => { cleanup(); resolve(); };
      const onError = () => { const error = session.error || recorder.error || new Error("Recording failed."); cleanup(); reject(error); };
      const cleanup = () => {
        recorder.removeEventListener("stop", onStop);
        recorder.removeEventListener("error", onError);
      };
      recorder.addEventListener("stop", onStop);
      recorder.addEventListener("error", onError);
      try {
        // Per MediaRecorder ordering, stop's final dataavailable event is queued
        // before the stop event. Resolving on stop guarantees that final chunk
        // has reached the session collector before PARA builds the Blob.
        recorder.requestData();
        recorder.stop();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
  if (session.error) throw session.error;
  const type = recorder.mimeType || session.mimeType || "video/webm";
  return new Blob([...session.chunks], { type });
}

async function assertPlayableVideo(blob, { format = "" } = {}) {
  if (!blob?.size || blob.size < 1024) throw new Error("The recording was empty.");
  const playbackBlob = capturePlaybackBlob({ type: "clip", blob, mimeType: blob.type });
  const url = URL.createObjectURL(playbackBlob);
  const video = document.createElement("video");
  let frameTimer = null;
  try {
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      let timer = null;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onError);
      };
      const onLoaded = () => {
        cleanup();
        if (!video.videoWidth || !video.videoHeight) {
          reject(new Error("The recording contains no visible video frames."));
          return;
        }
        resolve();
      };
      const onError = () => {
        const detail = mediaDecodeMessage(video);
        cleanup();
        reject(new Error(`${detail}${format ? ` Recorder format: ${format}.` : ""}`));
      };
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onError);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("The video file could not be decoded."));
      }, CAPTURE_PLAYBACK_TIMEOUT_MS);
      video.src = url;
      video.load();
    });

    // A thumbnail is not proof of a healthy recording. PARA requires a real
    // decoded video track, a displayed frame, and an advancing media timeline
    // before a clip is allowed into Media Gallery.
    const startTime = Number(video.currentTime || 0);
    let decodedFrame = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
    let framePromise = Promise.resolve();
    if (typeof video.requestVideoFrameCallback === "function") {
      framePromise = new Promise((resolve) => {
        frameTimer = setTimeout(resolve, 1200);
        video.requestVideoFrameCallback(() => {
          decodedFrame = true;
          clearTimeout(frameTimer);
          resolve();
        });
      });
    }

    try { await video.play(); }
    catch (error) {
      clearTimeout(frameTimer);
      throw new Error(`${mediaDecodeMessage(video)}${format ? ` Recorder format: ${format}.` : ""}`);
    }

    const timelinePromise = new Promise((resolve, reject) => {
      const started = performance.now();
      const check = () => {
        if (video.error) {
          reject(new Error(`${mediaDecodeMessage(video)}${format ? ` Recorder format: ${format}.` : ""}`));
          return;
        }
        if (Number(video.currentTime || 0) > startTime + 0.04) {
          resolve();
          return;
        }
        if (video.ended) {
          reject(new Error("The recording ended before playback could advance."));
          return;
        }
        if (performance.now() - started > 3500) {
          reject(new Error("The recording decoded, but playback did not advance."));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
    await Promise.all([framePromise, timelinePromise]);
    const decodedFrames = Number(video.getVideoPlaybackQuality?.().totalVideoFrames || 0);
    if (!decodedFrame && decodedFrames <= 0) throw new Error("Chrome did not decode a video frame from this recording.");
    video.pause();
    return { width: video.videoWidth, height: video.videoHeight, duration: Number(video.duration || 0) };
  } finally {
    clearTimeout(frameTimer);
    video.pause?.();
    video.removeAttribute?.("src");
    video.load?.();
    URL.revokeObjectURL(url);
  }
}

async function probeRecorderMimeType(stream, mimeType) {
  const session = startRecorderSession(stream, mimeType, { timesliceMs: CAPTURE_PROBE_CHUNK_MS });
  try {
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_PROBE_MS));
    const blob = await finalizeRecorderSession(session);
    await assertPlayableVideo(blob, { format: recorderLabel(session.mimeType || mimeType) });
    return session.mimeType || mimeType || "video/webm";
  } catch (error) {
    if (session.recorder.state !== "inactive") {
      try { session.recorder.stop(); } catch { /* best effort */ }
    }
    throw error;
  }
}

async function selectRecorderMimeType(stream) {
  const failures = [];
  for (const candidate of recorderMimeCandidates(stream)) {
    try {
      // This is intentionally an encode -> decode probe, not just
      // MediaRecorder.isTypeSupported(). Chrome previously claimed support for
      // a stream that its own playback stack later rejected.
      return await probeRecorderMimeType(stream, candidate);
    } catch (error) {
      failures.push(`${recorderLabel(candidate)}: ${error?.message || "failed validation"}`);
    }
  }
  const summary = failures.length ? ` ${failures.join(" | ")}` : "";
  throw new Error(`PARA could not find a Chrome-playable recording codec.${summary}`);
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
  try {
    const mimeType = await selectRecorderMimeType(stream);
    const chunks = [];
    const session = startRecorderSession(stream, mimeType, {
      timesliceMs: CAPTURE_CHUNK_MS,
      storeChunks: false,
      onChunk: (blob) => {
        const part = { blob, at: Date.now() };
        chunks.push(part);
        const cutoff = Date.now() - maxDurationMs;
        // Keep the first WebM initialization chunk. Replay clips are still
        // decode-validated before save because rolling cluster boundaries can
        // differ across Chromium builds.
        while (chunks.length > 2 && chunks[1].at < cutoff) chunks.splice(1, 1);
      },
    });
    const startedAt = Date.now();
    stream.getVideoTracks()[0]?.addEventListener("ended", () => stopReplayBuffer(), { once: true });
    replay = { stream, recorder: session.recorder, session, chunks, startedAt, maxDurationMs, mimeType };
    emitCaptureState();
    return replayStatus();
  } catch (error) {
    stopStream(stream);
    throw error;
  }
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
  await flushRecorderData(replay.session);
  const cutoff = Date.now() - durationMs;
  const recent = replay.chunks.filter((part, index) => index === 0 || part.at >= cutoff);
  if (!recent.length) throw new Error("Replay has not buffered enough gameplay yet.");
  const blob = new Blob(recent.map((part) => part.blob), { type: replay.recorder.mimeType || replay.mimeType || "video/webm" });
  await assertPlayableVideo(blob, { format: recorderLabel(replay.mimeType) });
  const actualDuration = Math.min(durationMs, Date.now() - replay.startedAt);
  return saveCapture({
    type: "clip",
    blob,
    durationMs: actualDuration,
    playbackVerified: true,
    recorderMimeType: replay.mimeType,
  });
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
  try {
    const mimeType = await selectRecorderMimeType(stream);
    const session = startRecorderSession(stream, mimeType, { timesliceMs: CAPTURE_CHUNK_MS });
    const startedAt = Date.now();
    manualRecording = { stream, recorder: session.recorder, session, startedAt, mimeType, stopping: false };
    emitCaptureState();
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (manualRecording?.stream === stream) void stopManualRecording().catch(() => {});
    }, { once: true });
    return manualRecordingStatus();
  } catch (error) {
    stopStream(stream);
    throw error;
  }
}

export async function stopManualRecording() {
  if (!manualRecording) throw new Error("No PARA recording is active.");
  if (manualRecording.stopping) throw new Error("PARA is already saving this recording.");
  const current = manualRecording;
  current.stopping = true;
  emitCaptureState();
  try {
    const blob = await finalizeRecorderSession(current.session);
    stopStream(current.stream);
    await assertPlayableVideo(blob, { format: recorderLabel(current.mimeType) });
    return await saveCapture({
      type: "clip",
      blob,
      durationMs: Date.now() - current.startedAt,
      playbackVerified: true,
      recorderMimeType: current.mimeType,
    });
  } finally {
    stopStream(current.stream);
    if (manualRecording === current) manualRecording = null;
    emitCaptureState();
  }
}

export async function recordRecentClip(durationMs = 8000) {
  const stream = await requestScreenStream({ audio: true });
  try {
    const mimeType = await selectRecorderMimeType(stream);
    const session = startRecorderSession(stream, mimeType, { timesliceMs: CAPTURE_CHUNK_MS });
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    const blob = await finalizeRecorderSession(session);
    await assertPlayableVideo(blob, { format: recorderLabel(mimeType) });
    return saveCapture({
      type: "clip",
      blob,
      durationMs,
      playbackVerified: true,
      recorderMimeType: mimeType,
    });
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
