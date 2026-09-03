const DB_NAME = "para-media-gallery";
const STORE = "captures";
const DB_VERSION = 1;
const PARA_CAPTURE_HANDLE = `para-self-capture:${globalThis.location?.origin || "local"}`;

// Toggle this on temporarily to trace a capture end-to-end (chunk sizes,
// blob magic bytes, decode probe results) without changing behavior.
const CAPTURE_DEBUG = false;
function captureLog(...args) {
  if (CAPTURE_DEBUG) console.log("[capture]", ...args);
}
async function logBlobHeader(label, blob) {
  if (!CAPTURE_DEBUG || !(blob instanceof Blob)) return;
  try {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const magic = [...head].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    captureLog(label, { size: blob.size, type: blob.type, magic, validEbml: magic === "1a 45 df a3" });
  } catch (error) {
    captureLog(label, "could not read header", error);
  }
}

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

function normalizePlaybackBlob(blob, mimeType = "") {
  if (!(blob instanceof Blob)) return blob;
  const playbackMime = String(mimeType || blob.type || "").trim();
  if (!playbackMime || blob.type === playbackMime) return blob;
  // IndexedDB keeps the original MediaRecorder MIME string. Older captures can
  // contain an over-specific codecs parameter that Chromium later rejects when
  // used as the Blob URL response Content-Type even though the WebM bytes are
  // valid. Re-wrap the same bytes with a generic MIME for local playback;
  // uploads/exports keep the untouched original via capturePlaybackSegments().
  return new Blob([blob], { type: playbackMime });
}

export function capturePlaybackBlob(item = {}) {
  return normalizePlaybackBlob(item?.blob, capturePlaybackMime(item));
}

export function capturePlaybackSegments(item = {}) {
  const stored = Array.isArray(item?.replaySegments) ? item.replaySegments : [];
  const segments = stored
    .filter((segment) => segment?.blob instanceof Blob && segment.blob.size)
    .map((segment) => ({
      blob: normalizePlaybackBlob(segment.blob, segment.mimeType || capturePlaybackMime(item)),
      durationMs: Math.max(0, Number(segment.durationMs || 0)),
      mimeType: String(segment.mimeType || segment.blob.type || capturePlaybackMime(item)),
    }));
  if (segments.length) return segments;
  const blob = capturePlaybackBlob(item);
  return blob instanceof Blob ? [{ blob, durationMs: Math.max(0, Number(item?.durationMs || 0)), mimeType: capturePlaybackMime(item) }] : [];
}

export function isSegmentedCapture(item = {}) {
  return capturePlaybackSegments(item).length > 1;
}

export async function deleteCapture(id) {
  if (!globalThis.indexedDB) return false;
  await transact("readwrite", (store) => store.delete(id));
  return true;
}

async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0, playbackVerified = false, recorderMimeType = "", replaySegments = null }) {
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
    captureVersion: 8,
    ...(type === "clip" ? {
      playbackVerified: Boolean(playbackVerified),
      recorderMimeType: recorderMimeType || blob.type || "video/webm",
      ...(Array.isArray(replaySegments) && replaySegments.length > 1 ? { replaySegments } : {}),
    } : {}),
  };
  await transact("readwrite", (store) => store.put(item));
  captureLog("saved capture", { id: item.id, type: item.type, size: item.blob.size, mimeType: item.mimeType, segments: item.replaySegments?.length || 1 });
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
const REPLAY_SEGMENT_MS = 15_000;
const REPLAY_MAX_SEGMENTS = 120; // ~30 min at 15s/segment

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
    captureLog("dataavailable", { size: event.data?.size || 0, type: event.data?.type, event: session.dataEvents });
    if (!event.data?.size) return;
    if (storeChunks) session.chunks.push(event.data);
    onChunk?.(event.data);
  });
  recorder.addEventListener("error", () => {
    session.error = recorder.error || new Error("Recording failed.");
    captureLog("recorder error", session.error);
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
  const blob = new Blob([...session.chunks], { type });
  await logBlobHeader("finalized session blob", blob);
  return blob;
}

async function assertPlayableVideo(blob, { format = "" } = {}) {
  if (!blob?.size || blob.size < 1024) throw new Error("The recording was empty.");
  await logBlobHeader("probing blob", blob);
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
        captureLog("probe loadeddata", { videoWidth: video.videoWidth, videoHeight: video.videoHeight, duration: video.duration, readyState: video.readyState });
        if (!video.videoWidth || !video.videoHeight) {
          reject(new Error("The recording contains no visible video frames."));
          return;
        }
        resolve();
      };
      const onError = () => {
        const detail = mediaDecodeMessage(video);
        captureLog("probe error", { code: video.error?.code, message: video.error?.message, detail });
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
    captureLog("probe passed", { width: video.videoWidth, height: video.videoHeight, duration: video.duration, decodedFrames });
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

// Replay keeps a rolling buffer of independently finalized, playback-verified
// MediaRecorder sessions (~REPLAY_SEGMENT_MS each) instead of one long-running
// session sliced by timeslice chunk. Splicing arbitrary chunks out of the
// middle of a single MediaRecorder stream drops the file's init segment on
// every cut and produces a Blob with no valid header (this was the root
// cause tracked in PARA_PLAYBACK_VERIFIED_CAPTURE_V57.md). Restarting the
// recorder every segment means each stored piece is self-contained and
// independently decodable, matching what the segmented player expects from
// capturePlaybackSegments().
async function recordReplaySegment(stream, mimeType) {
  const session = startRecorderSession(stream, mimeType, { timesliceMs: REPLAY_SEGMENT_MS });
  await new Promise((resolve) => setTimeout(resolve, REPLAY_SEGMENT_MS));
  const blob = await finalizeRecorderSession(session);
  const probe = await assertPlayableVideo(blob, { format: recorderLabel(session.mimeType || mimeType) });
  return { blob, mimeType: session.mimeType || mimeType || "video/webm", durationMs: Math.round(probe.duration * 1000) || REPLAY_SEGMENT_MS, at: Date.now() };
}

export async function startReplayBuffer(maxDurationMs = 30 * 60 * 1000) {
  if (replay) return replayStatus();
  const stream = await requestScreenStream({ audio: true });
  try {
    const mimeType = await selectRecorderMimeType(stream);
    const startedAt = Date.now();
    const state = { stream, mimeType, segments: [], startedAt, maxDurationMs, stopped: false, loop: null };
    const runLoop = async () => {
      while (!state.stopped) {
        try {
          const segment = await recordReplaySegment(stream, mimeType);
          if (state.stopped) break;
          state.segments.push(segment);
          const maxSegments = Math.max(2, Math.min(REPLAY_MAX_SEGMENTS, Math.ceil(maxDurationMs / REPLAY_SEGMENT_MS)));
          while (state.segments.length > maxSegments) state.segments.shift();
        } catch (error) {
          captureLog("replay segment failed, stopping replay", error);
          stopReplayBuffer();
          break;
        }
      }
    };
    state.loop = runLoop();
    stream.getVideoTracks()[0]?.addEventListener("ended", () => stopReplayBuffer(), { once: true });
    replay = state;
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
  current.stopped = true;
  stopStream(current.stream);
  emitCaptureState();
}

export async function saveReplayClip(durationMs = 60_000) {
  if (!replay) throw new Error("PARA Replay is not running. Start Replay first.");
  const cutoff = Date.now() - durationMs;
  const recent = replay.segments.filter((segment) => segment.at >= cutoff);
  const selected = recent.length ? recent : replay.segments.slice(-1);
  if (!selected.length) throw new Error("Replay has not buffered enough gameplay yet.");
  const replaySegments = selected.map((segment) => ({ blob: segment.blob, durationMs: segment.durationMs, mimeType: segment.mimeType }));
  const actualDuration = replaySegments.reduce((total, segment) => total + segment.durationMs, 0);
  const primary = replaySegments[0];
  return saveCapture({
    type: "clip",
    blob: primary.blob,
    durationMs: actualDuration,
    playbackVerified: true,
    recorderMimeType: primary.mimeType,
    replaySegments,
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
  const segments = item.type === "clip" ? capturePlaybackSegments(item) : [];
  if (segments.length > 1) {
    const files = segments.map((segment, index) => {
      const mime = segment.mimeType || segment.blob.type || "video/webm";
      const extension = mime.includes("mp4") ? "mp4" : "webm";
      return new File([segment.blob], `PARA-${item.id}-part-${String(index + 1).padStart(2, "0")}.${extension}`, { type: mime });
    });
    if (target === "system" && navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({ title: "Shared from PARA", text: "Captured on PARA", files });
      return `Shared ${files.length} replay parts`;
    }
    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, index * 140);
    });
    if (target === "phone") return `Replay exported as ${files.length} playable video parts for phone transfer`;
    if (target === "files") return `Replay exported as ${files.length} playable video parts`;
    return `Replay exported as ${files.length} playable video parts`;
  }

  const blob = item.type === "clip" ? (segments[0]?.blob || capturePlaybackBlob(item)) : item.blob;
  if (!(blob instanceof Blob)) throw new Error("Capture data is unavailable.");
  const mime = item.type === "clip" ? (segments[0]?.mimeType || item.mimeType || blob.type || "video/webm") : (item.mimeType || blob.type || "image/webp");
  const extension = item.type === "clip" ? (mime.includes("mp4") ? "mp4" : "webm") : "webp";
  const file = new File([blob], `PARA-${item.id}.${extension}`, { type: mime });
  if (target === "system" && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: "Shared from PARA", text: "Captured on PARA", files: [file] });
    return "Shared";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (target === "phone") return "Capture exported for phone transfer";
  if (target === "files") return "Capture exported to your Downloads folder";
  return "Capture exported";
}