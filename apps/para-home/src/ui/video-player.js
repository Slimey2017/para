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

function mediaErrorMessage(video) {
  const code = Number(video?.error?.code || 0);
  if (code === 1) return "Playback was interrupted.";
  if (code === 2) return "PARA could not read this capture from local storage.";
  if (code === 3) return "Chrome could not decode this capture.";
  if (code === 4) return "This capture uses a video format Chrome cannot play.";
  return "PARA could not play this capture.";
}

export function paraVideoPlayerMarkup({ src, mimeType = "", durationMs = 0, className = "", autoplay = false } = {}) {
  const expectedSeconds = Math.max(0, Number(durationMs || 0) / 1000);
  const sourceType = mimeType ? ` type="${escapeAttr(mimeType)}"` : "";
  return `<div class="para-video-player ${className}" data-para-video-player data-expected-duration="${expectedSeconds}" data-video-mime="${escapeAttr(mimeType)}">
    <video preload="auto" playsinline ${autoplay ? "autoplay" : ""}><source src="${escapeAttr(src)}"${sourceType}>Your browser could not play this PARA recording.</video>
    <button type="button" class="para-video-player__bigplay" data-video-action="toggle" aria-label="Play video">▶</button>
    <div class="para-video-player__status" data-video-status hidden><span></span><strong data-video-status-text>Loading video…</strong></div>
    <div class="para-video-player__chrome">
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

export function activateParaVideoPlayers(root = document, { onError } = {}) {
  const cleanups = [];
  for (const player of root.querySelectorAll?.("[data-para-video-player]") || []) {
    const video = player.querySelector("video");
    if (!video || player.dataset.playerReady === "true") continue;
    player.dataset.playerReady = "true";

    const expected = Math.max(0, Number(player.dataset.expectedDuration || 0));
    const mimeType = String(player.dataset.videoMime || "").trim();
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

    const setStatus = (message = "", kind = "loading") => {
      if (!status) return;
      status.hidden = !message;
      status.classList.toggle("is-error", kind === "error");
      if (statusText) statusText.textContent = message;
    };

    const reportError = (error, message = "") => {
      lastError = error || new Error(message || mediaErrorMessage(video));
      setStatus(message || mediaErrorMessage(video), "error");
      onError?.(lastError);
    };

    const realDuration = () => Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : expected;
    const seekableEnd = () => {
      try {
        const ranges = video.seekable;
        return ranges?.length ? ranges.end(ranges.length - 1) : 0;
      } catch {
        return 0;
      }
    };
    const canSeek = () => Number.isFinite(video.duration) || seekableEnd() > 0;

    const update = () => {
      const length = realDuration();
      if (current) current.textContent = formatTime(video.currentTime || 0);
      if (duration) duration.textContent = formatTime(length);
      if (seek && length > 0 && !seek.matches(":active")) seek.value = String(Math.round(clamp((video.currentTime || 0) / length, 0, 1) * 1000));
      if (seek) seek.disabled = !canSeek();
      for (const icon of playIcons) icon.textContent = video.paused ? "▶" : "❚❚";
      if (bigPlay) {
        bigPlay.textContent = video.paused ? "▶" : "❚❚";
        bigPlay.classList.toggle("is-playing", !video.paused);
      }
      for (const icon of volumeIcons) icon.textContent = video.muted || video.volume === 0 ? "🔇" : video.volume < 0.5 ? "🔉" : "🔊";
      if (volume && !volume.matches(":active")) volume.value = String(video.muted ? 0 : video.volume);
    };

    const setCurrentTime = (seconds) => {
      const length = realDuration();
      const max = seekableEnd() || length || Infinity;
      const target = clamp(seconds, 0, max);
      try {
        if (typeof video.fastSeek === "function") video.fastSeek(target);
        else video.currentTime = target;
      } catch {
        // Some MediaRecorder WebM files are playable before they become seekable.
        // Playback should keep working even when timeline seeking is unavailable.
      }
    };

    const toggle = async () => {
      try {
        if (video.paused) {
          lastError = null;
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) setStatus("Loading video…");
          await video.play();
          setStatus("");
        } else {
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
      else if (action === "skip") setCurrentTime((video.currentTime || 0) + Number(button.dataset.videoSkip || 0));
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
      else if (event.key === "ArrowLeft") { event.preventDefault(); setCurrentTime((video.currentTime || 0) - 5); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setCurrentTime((video.currentTime || 0) + 5); }
      update();
    };
    const onLoaded = () => {
      // Do not seek to an absurd timestamp to "repair" WebM duration metadata.
      // MediaRecorder WebM often reports Infinity/unknown duration but is still
      // perfectly playable. The old repair seek could strand the video at EOF.
      setStatus("");
      update();
    };
    const onWaiting = () => {
      if (!lastError && !video.paused) setStatus("Buffering…");
    };
    const onPlaying = () => {
      lastError = null;
      setStatus("");
      update();
    };
    const onMediaError = () => reportError(video.error || new Error(mediaErrorMessage(video)));

    player.tabIndex = player.tabIndex >= 0 ? player.tabIndex : 0;
    player.addEventListener("click", onClick);
    player.addEventListener("keydown", onKey);
    video.addEventListener("click", onVideoClick);
    video.addEventListener("dblclick", onDoubleClick);
    for (const eventName of ["timeupdate", "play", "pause", "ended", "volumechange", "durationchange", "ratechange", "progress"]) video.addEventListener(eventName, update);
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

    if (mimeType && video.canPlayType?.(mimeType) === "") {
      reportError(new Error(`Unsupported media type: ${mimeType}`), `Chrome cannot play ${mimeType}.`);
    } else {
      setStatus(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? "" : "Loading video…");
      video.load();
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onLoaded();
    }
    update();

    cleanups.push(() => {
      player.removeEventListener("click", onClick);
      player.removeEventListener("keydown", onKey);
      video.removeEventListener("click", onVideoClick);
      video.removeEventListener("dblclick", onDoubleClick);
      seek?.removeEventListener("input", onSeek);
      volume?.removeEventListener("input", onVolume);
      speed?.removeEventListener("change", onSpeed);
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
