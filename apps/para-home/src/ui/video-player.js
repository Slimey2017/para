function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

function escapeAttr(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseArray(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mediaErrorMessage(video, error = null) {
  const code = Number(video?.error?.code || 0);
  if (code === 1 || error?.name === "AbortError") return "Playback was interrupted. Press Play again.";
  if (code === 2) return "PARA could not read this capture from local storage.";
  if (code === 3) return "PARA could not decode this capture.";
  if (code === 4 || error?.name === "NotSupportedError") return "This capture format could not be played.";
  if (error?.name === "NotAllowedError") return "Playback was blocked. Press Play again.";
  return error?.message ? `Playback failed: ${error.message}` : "PARA could not play this capture.";
}

export function paraVideoPlayerMarkup({
  src,
  mimeType = "",
  durationMs = 0,
  className = "",
  autoplay = false,
  segmentUrls = [],
  segmentDurationsMs = [],
} = {}) {
  const expectedSeconds = Math.max(0, Number(durationMs || 0) / 1000);
  const playlist = Array.isArray(segmentUrls) ? segmentUrls.filter(Boolean) : [];
  const durations = Array.isArray(segmentDurationsMs) ? segmentDurationsMs.map((value) => Math.max(0, Number(value || 0))) : [];
  const playlistAttrs = playlist.length > 1
    ? ` data-video-segments="${escapeAttr(JSON.stringify(playlist))}" data-video-segment-durations="${escapeAttr(JSON.stringify(durations))}"`
    : "";
  return `<div class="para-video-player ${className}" data-para-video-player data-expected-duration="${expectedSeconds}" data-video-mime="${escapeAttr(mimeType)}"${playlistAttrs}>
    <video src="${escapeAttr(src)}" preload="auto" playsinline ${autoplay ? "autoplay" : ""}>PARA could not play this recording.</video>
    <button type="button" class="para-video-player__bigplay" data-video-action="toggle" aria-label="Play video">▶</button>
    <div class="para-video-player__status" data-video-status hidden><span></span><strong data-video-status-text>Loading video…</strong></div>
    <div class="para-video-player__controls-shell">
      <input class="para-video-player__seek" type="range" min="0" max="1000" step="1" value="0" data-video-seek aria-label="Video position">
      <div class="para-video-player__controls">
        <button type="button" data-video-action="toggle" aria-label="Play or pause"><span data-video-play-icon>▶</span></button>
        <button type="button" data-video-action="skip" data-video-skip="-10" aria-label="Back 10 seconds">↺10</button>
        <button type="button" data-video-action="skip" data-video-skip="10" aria-label="Forward 10 seconds">10↻</button>
        <span class="para-video-player__time"><b data-video-current>0:00</b><i>/</i><b data-video-duration>${formatTime(expectedSeconds)}</b></span>
        <span class="para-video-player__spacer"></span>
        <button type="button" data-video-action="mute" aria-label="Mute or unmute"><span data-video-volume-icon>🔊</span></button>
        <input class="para-video-player__volume" type="range" min="0" max="1" step="0.05" value="1" data-video-volume aria-label="Volume">
        <select class="para-video-player__speed" data-video-speed aria-label="Playback speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
        <button type="button" data-video-action="fullscreen" aria-label="Fullscreen" title="Fullscreen">⛶</button>
      </div>
    </div>
  </div>`;
}

// TEMP DIAGNOSTIC — remove once the Media Gallery playback bug is confirmed
// fixed. Toggle on to trace exactly what URL/segments a player was activated
// with and what the <video> element reports as it loads.
const PARA_PLAYER_DEBUG = true;
function playerLog(...args) {
  if (PARA_PLAYER_DEBUG) console.log("[para-player]", ...args);
}

export function activateParaVideoPlayers(root = document, { onError } = {}) {
  const cleanups = [];
  for (const player of root.querySelectorAll?.("[data-para-video-player]") || []) {
    const video = player.querySelector("video");
    if (!video || player.dataset.playerReady === "true") continue;
    player.dataset.playerReady = "true";

    const expected = Math.max(0, Number(player.dataset.expectedDuration || 0));
    const mimeType = String(player.dataset.videoMime || "").trim();
    const playlist = parseArray(player.dataset.videoSegments).map(String).filter(Boolean);
    const segmentDurations = parseArray(player.dataset.videoSegmentDurations).map((value) => Math.max(0, Number(value || 0) / 1000));
    const segments = playlist.length > 1 ? playlist : [video.getAttribute("src") || video.src].filter(Boolean);
    const isPlaylist = segments.length > 1;

    playerLog("activate", {
      elementSrcAttr: video.getAttribute("src"),
      elementSrcProp: video.src,
      mimeType,
      rawVideoSegmentsAttr: player.dataset.videoSegments,
      parsedPlaylist: playlist,
      resolvedSegments: segments,
      isPlaylist,
      expectedDurationSec: expected,
    });
    for (const segUrl of segments) {
      fetch(segUrl).then((r) => playerLog("segment URL fetch check", segUrl, "status:", r.status, "ok:", r.ok))
        .catch((e) => playerLog("segment URL fetch FAILED (likely revoked or invalid blob URL)", segUrl, e.message));
    }
    let segmentIndex = 0;
    let pendingLocalTime = null;
    let resumeAfterSwitch = false;

    const seek = player.querySelector("[data-video-seek]");
    const volume = player.querySelector("[data-video-volume]");
    const speed = player.querySelector("[data-video-speed]");
    const current = player.querySelector("[data-video-current]");
    const duration = player.querySelector("[data-video-duration]");
    const playIcons = player.querySelectorAll("[data-video-play-icon]");
    const volumeIcons = player.querySelectorAll("[data-video-volume-icon]");
    const bigPlay = player.querySelector(".para-video-player__bigplay");
    const status = player.querySelector("[data-video-status]");
    const statusText = player.querySelector("[data-video-status-text]");
    let lastError = null;

    const segmentDurationAt = (index) => {
      const declared = Number(segmentDurations[index] || 0);
      if (declared > 0) return declared;
      if (isPlaylist && expected > 0) return expected / segments.length;
      if (index === segmentIndex && Number.isFinite(video.duration) && video.duration > 0.05) return video.duration;
      return 0;
    };
    const segmentOffset = (index) => {
      let total = 0;
      for (let i = 0; i < Math.max(0, index); i += 1) total += segmentDurationAt(i);
      return total;
    };
    const playlistDuration = () => {
      if (!isPlaylist) return 0;
      const declared = segments.reduce((total, _, index) => total + segmentDurationAt(index), 0);
      return expected > 0 ? expected : declared;
    };
    const globalCurrentTime = () => isPlaylist ? segmentOffset(segmentIndex) + Number(video.currentTime || 0) : Number(video.currentTime || 0);

    const setStatus = (message = "", kind = "loading") => {
      if (!status) return;
      status.hidden = !message;
      status.classList.toggle("is-error", kind === "error");
      if (statusText) statusText.textContent = message;
    };

    const reportError = (error, message = "") => {
      lastError = error || new Error(message || mediaErrorMessage(video, error));
      const prefix = isPlaylist ? `Replay segment ${segmentIndex + 1} of ${segments.length}: ` : "";
      setStatus(prefix + (message || mediaErrorMessage(video, error)), "error");
      onError?.(lastError);
    };

    const realDuration = () => {
      if (isPlaylist) return playlistDuration();
      return Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : expected;
    };
    const seekableEnd = () => {
      try {
        const ranges = video.seekable;
        return ranges?.length ? ranges.end(ranges.length - 1) : 0;
      } catch {
        return 0;
      }
    };
    const canSeek = () => isPlaylist ? realDuration() > 0 : Number.isFinite(video.duration) || seekableEnd() > 0;

    const update = () => {
      const length = realDuration();
      const position = globalCurrentTime();
      if (current) current.textContent = formatTime(position);
      if (duration) duration.textContent = formatTime(length);
      if (seek && length > 0 && !seek.matches(":active")) seek.value = String(Math.round(clamp(position / length, 0, 1) * 1000));
      if (seek) seek.disabled = !canSeek();
      const effectivelyPlaying = !video.paused || resumeAfterSwitch;
      for (const icon of playIcons) icon.textContent = effectivelyPlaying ? "❚❚" : "▶";
      if (bigPlay) {
        bigPlay.textContent = effectivelyPlaying ? "❚❚" : "▶";
        bigPlay.classList.toggle("is-playing", effectivelyPlaying);
      }
      for (const icon of volumeIcons) icon.textContent = video.muted || video.volume === 0 ? "🔇" : video.volume < 0.5 ? "🔉" : "🔊";
      if (volume && !volume.matches(":active")) volume.value = String(video.muted ? 0 : video.volume);
    };

    const switchSegment = (index, localTime = 0, { autoplay = false } = {}) => {
      const nextIndex = clamp(Math.floor(index), 0, segments.length - 1);
      segmentIndex = nextIndex;
      pendingLocalTime = Math.max(0, Number(localTime || 0));
      resumeAfterSwitch = Boolean(autoplay);
      setStatus(isPlaylist ? `Loading replay segment ${segmentIndex + 1} of ${segments.length}…` : "Loading video…");
      video.src = segments[segmentIndex];
      video.load();
      update();
    };

    const locateGlobalTime = (seconds) => {
      const target = clamp(seconds, 0, realDuration() || Infinity);
      if (!isPlaylist) return { index: 0, local: target };
      let offset = 0;
      for (let index = 0; index < segments.length; index += 1) {
        const length = segmentDurationAt(index);
        const end = offset + length;
        if (index === segments.length - 1 || target < end) return { index, local: Math.max(0, target - offset) };
        offset = end;
      }
      return { index: segments.length - 1, local: 0 };
    };

    const setCurrentTime = (seconds, { autoplay = !video.paused } = {}) => {
      if (isPlaylist) {
        const target = locateGlobalTime(seconds);
        if (target.index !== segmentIndex) {
          switchSegment(target.index, target.local, { autoplay });
          return;
        }
        try { video.currentTime = target.local; } catch {}
        update();
        return;
      }
      const length = realDuration();
      const max = seekableEnd() || length || Infinity;
      const target = clamp(seconds, 0, max);
      try {
        if (typeof video.fastSeek === "function") video.fastSeek(target);
        else video.currentTime = target;
      } catch {
        // Some legacy MediaRecorder captures are playable before they become seekable.
      }
    };

    const toggle = async () => {
      try {
        if (video.paused) {
          lastError = null;
          if (isPlaylist && segmentIndex === segments.length - 1 && video.ended) {
            switchSegment(0, 0, { autoplay: true });
            return;
          }
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) setStatus("Loading video…");
          await video.play();
          setStatus("");
        } else {
          resumeAfterSwitch = false;
          video.pause();
        }
      } catch (error) {
        reportError(error);
      }
      update();
    };

    const onClick = async (event) => {
      const button = event.target.closest?.("[data-video-action]");
      if (!button || !player.contains(button)) return;
      const action = button.dataset.videoAction;
      if (action === "toggle") await toggle();
      else if (action === "skip") setCurrentTime(globalCurrentTime() + Number(button.dataset.videoSkip || 0));
      else if (action === "mute") video.muted = !video.muted;
      else if (action === "fullscreen") {
        try {
          if (!document.fullscreenElement) await player.requestFullscreen?.();
          else await document.exitFullscreen?.();
        } catch (error) {
          reportError(error, "Fullscreen is unavailable here.");
        }
      }
      update();
    };

    const onSeek = () => {
      const length = realDuration();
      if (!length || !canSeek()) return;
      setCurrentTime(clamp(Number(seek?.value || 0) / 1000, 0, 1) * length);
      update();
    };
    const onVolume = () => {
      video.muted = false;
      video.volume = clamp(volume?.value || 0, 0, 1);
      update();
    };
    const onSpeed = () => { video.playbackRate = clamp(speed?.value || 1, 0.25, 4); };
    const onVideoClick = (event) => { if (event.target === video) void toggle(); };
    const onDoubleClick = async () => {
      try {
        if (!document.fullscreenElement) await player.requestFullscreen?.();
        else await document.exitFullscreen?.();
      } catch (error) {
        reportError(error, "Fullscreen is unavailable here.");
      }
    };
    const onKey = (event) => {
      if (event.target.matches?.("input,select,button")) return;
      if (event.code === "Space" || event.key === "k") { event.preventDefault(); void toggle(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setCurrentTime(globalCurrentTime() - 5); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setCurrentTime(globalCurrentTime() + 5); }
      update();
    };
    const onLoaded = async () => {
      if (pendingLocalTime !== null && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        try { video.currentTime = pendingLocalTime; } catch {}
        pendingLocalTime = null;
      }
      if (resumeAfterSwitch && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resumeAfterSwitch = false;
        try { await video.play(); } catch (error) { reportError(error); }
      }
      setStatus("");
      update();
    };
    const onWaiting = () => {
      if (!lastError && (!video.paused || resumeAfterSwitch)) setStatus("Buffering…");
    };
    const onPlaying = () => {
      lastError = null;
      resumeAfterSwitch = false;
      setStatus("");
      update();
    };
    const onEnded = () => {
      if (isPlaylist && segmentIndex < segments.length - 1) {
        switchSegment(segmentIndex + 1, 0, { autoplay: true });
        return;
      }
      update();
    };
    const onMediaError = () => {
      playerLog("video error event", {
        code: video.error?.code,
        message: video.error?.message,
        currentSrc: video.currentSrc,
        srcAttr: video.getAttribute("src"),
        segmentIndex,
        networkState: video.networkState,
        readyState: video.readyState,
      });
      reportError(video.error || new Error(mediaErrorMessage(video)));
    };

    player.tabIndex = player.tabIndex >= 0 ? player.tabIndex : 0;
    player.addEventListener("click", onClick);
    player.addEventListener("keydown", onKey);
    video.addEventListener("click", onVideoClick);
    video.addEventListener("dblclick", onDoubleClick);
    for (const eventName of ["timeupdate", "play", "pause", "volumechange", "durationchange", "ratechange", "progress"]) video.addEventListener(eventName, update);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("canplay", onLoaded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onMediaError);
    seek?.addEventListener("input", onSeek);
    volume?.addEventListener("input", onVolume);
    speed?.addEventListener("change", onSpeed);

    // Loading the actual blob is the authority. A codec hint alone is not enough
    // to prove a MediaRecorder result can decode, so the capture runtime performs
    // a real playback probe before new videos are accepted into Media Gallery.
    player.dataset.mimeHint = mimeType && video.canPlayType?.(mimeType) === "" ? "unknown" : "supported";
    setStatus(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? "" : "Loading video…");
    video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) void onLoaded();
    update();

    cleanups.push(() => {
      player.removeEventListener("click", onClick);
      player.removeEventListener("keydown", onKey);
      video.removeEventListener("click", onVideoClick);
      video.removeEventListener("dblclick", onDoubleClick);
      seek?.removeEventListener("input", onSeek);
      volume?.removeEventListener("input", onVolume);
      speed?.removeEventListener("change", onSpeed);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("canplay", onLoaded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onMediaError);
    });
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}