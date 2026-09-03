import { escapeHtml } from "../services/para-api.js";
import { page } from "../ui/components.js";
import {
  MUSIC_EVENT,
  clearLocalMusic,
  importLocalMusic,
  listLocalMusic,
  localMusicState,
  nextLocalMusic,
  playLocalMusicTrack,
  previousLocalMusic,
  removeLocalMusic,
  seekLocalMusic,
  setLocalMusicVolume,
  setMusicQueue,
  toggleLocalMusic,
} from "../services/local-music.js";

function durationLabel(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function fileSizeLabel(bytes = 0) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function visualSeed(value = "PARA Music") {
  const text = String(value || "PARA Music");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const hue = 248 + (unsigned % 52);
  const hue2 = (hue + 42 + ((unsigned >>> 7) % 36)) % 360;
  const hue3 = (hue + 310) % 360;
  return { hue, hue2, hue3 };
}

function visualStyle(value) {
  const seed = visualSeed(value);
  return `--music-hue:${seed.hue};--music-hue2:${seed.hue2};--music-hue3:${seed.hue3}`;
}

function coverLetter(track = {}) {
  const source = String(track.title || track.fileName || "♫").trim();
  return (source.match(/[A-Za-z0-9]/)?.[0] || "♫").toUpperCase();
}

function equalizerMarkup(className = "music-equalizer") {
  return `<span class="${className}" aria-hidden="true">${Array.from({ length: 9 }, (_, index) => `<i style="--bar:${index}"></i>`).join("")}</span>`;
}

function nowPlayingMarkup(state) {
  const active = Boolean(state.active);
  return `<section class="music-now-playing" data-music-now-playing data-playing="${state.playbackState === "playing" ? "true" : "false"}" style="${visualStyle(state.currentId || state.title)}">
    <div class="music-now-playing__visual" data-music-visual>
      <div class="music-cover-shell">
        <div class="music-cover" data-music-cover>
          <img data-music-art-image alt="" hidden>
          <div class="music-cover__generated" data-music-art-fallback>
            <span class="music-cover__orbit"></span>
            <span class="music-cover__letter" data-music-art-letter>${escapeHtml(active ? (state.title?.[0] || "♫") : "♫")}</span>
            <span class="music-cover__label">PARA</span>
          </div>
        </div>
        <div class="music-vinyl" aria-hidden="true"><i></i></div>
      </div>
      ${equalizerMarkup()}
    </div>
    <div class="music-now-playing__content">
      <div class="music-now-playing__kicker"><span>NOW PLAYING</span><em>LOCAL</em></div>
      <div class="music-now-playing__copy">
        <h2 data-music-title>${escapeHtml(active ? state.title : "Your soundtrack lives here")}</h2>
        <p data-music-artist>${escapeHtml(active ? (state.artist || "Local file") : "Drop in a song and PARA will carry it with you.")}</p>
        <small data-music-album>${escapeHtml(active ? (state.fileName || "Stored on this PARA") : "Offline · private · yours")}</small>
      </div>
      <div class="music-transport">
        <button type="button" data-music-previous aria-label="Previous track"><span>‹</span><span>‹</span></button>
        <button type="button" class="music-transport__primary" data-music-toggle aria-label="Play or pause">${state.playbackState === "playing" ? "Ⅱ" : "▶"}</button>
        <button type="button" data-music-next aria-label="Next track"><span>›</span><span>›</span></button>
      </div>
      <div class="music-timeline">
        <span data-music-time-current>${durationLabel(state.currentTime)}</span>
        <input type="range" min="0" max="${Math.max(1, state.duration || 1)}" step="0.1" value="${Math.min(state.currentTime || 0, state.duration || 1)}" data-music-seek aria-label="Song position" ${active ? "" : "disabled"}>
        <span data-music-time-duration>${durationLabel(state.duration)}</span>
      </div>
      <label class="music-volume"><span>VOLUME</span><input type="range" min="0" max="100" step="2" value="${state.volume}" data-music-volume aria-label="Music volume"><b data-music-volume-output>${state.volume}%</b></label>
      <p class="music-player-error" data-music-error ${state.error ? "" : "hidden"}>${escapeHtml(state.error || "")}</p>
    </div>
  </section>`;
}

function trackThumb(track, artworkUrl) {
  const url = artworkUrl(track);
  if (url) return `<span class="music-track__thumb"><img src="${escapeHtml(url)}" alt=""></span>`;
  return `<span class="music-track__thumb music-track__thumb--generated" style="${visualStyle(track.id || track.title)}"><b>${escapeHtml(coverLetter(track))}</b></span>`;
}

function libraryMarkup(tracks, state, artworkUrl) {
  if (!tracks.length) {
    return `<div class="music-library-empty" data-music-empty><span>♫</span><h2>Your crate is empty</h2><p>Drop audio anywhere on this screen or choose Add Music.</p></div>`;
  }
  return `<div class="music-track-list" data-music-track-list>${tracks.map((track, index) => {
    const selected = state.currentId === track.id;
    const subtitle = [track.artist, track.album || track.fileName].filter(Boolean).join(" · ");
    return `<article class="music-track${selected ? " is-playing" : ""}" data-music-row="${escapeHtml(track.id)}">
      <button type="button" class="music-track__main" data-music-track="${escapeHtml(track.id)}" ${index === 0 ? "data-autofocus='true'" : ""}>
        ${trackThumb(track, artworkUrl)}
        <span class="music-track__copy"><strong>${escapeHtml(track.title || track.fileName || "Local track")}</strong><small>${escapeHtml(subtitle || "Local file")}</small></span>
        <span class="music-track__playing" aria-hidden="true">${equalizerMarkup("music-mini-equalizer")}</span>
        <span class="music-track__size">${fileSizeLabel(track.size)}</span>
      </button>
      <button type="button" class="music-track__remove" data-music-remove="${escapeHtml(track.id)}" aria-label="Remove ${escapeHtml(track.title || track.fileName || "track")}">×</button>
    </article>`;
  }).join("")}</div>`;
}

export function musicScreen() {
  const state = localMusicState();
  return page({
    title: "Music",
    description: "Your local soundtrack, everywhere you go in PARA.",
    eyebrow: "Local player",
    className: "music-page",
    body: `<section class="music-app">
      ${nowPlayingMarkup(state)}
      <div class="music-import-zone" data-music-drop-zone>
        <input type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,.webm" data-music-file-input hidden>
        <div><span class="music-import-zone__icon">＋</span><div><strong>Add to this PARA</strong><small>Drop music here. Files stay on this device.</small></div></div>
        <button type="button" class="action-button" data-music-find-files>Add Music</button>
      </div>
      <section class="music-library-panel">
        <header><div><span>YOUR CRATE</span><h2>Local library</h2><small data-music-library-count>Reading your music…</small></div><button type="button" class="music-clear-button" data-music-clear hidden>Clear Library</button></header>
        <div data-music-library><div class="library-loading"><span></span><strong>Reading local music…</strong></div></div>
      </section>
      <footer class="music-local-note"><span>LOCAL ONLY</span><p>Offline playback · no music uploads · ready for PARA Files + USB on console</p></footer>
    </section>`,
  });
}

export function activateMusic({ focus } = {}) {
  const screen = document.querySelector(".music-page");
  if (!screen) return () => {};
  const input = screen.querySelector("[data-music-file-input]");
  const dropZone = screen.querySelector("[data-music-drop-zone]");
  const library = screen.querySelector("[data-music-library]");
  const clearButton = screen.querySelector("[data-music-clear]");
  const countNode = screen.querySelector("[data-music-library-count]");
  const artworkUrls = new Map();
  let tracks = [];
  let disposed = false;

  const artworkUrl = (track) => {
    if (!(track?.artworkBlob instanceof Blob)) return "";
    if (!artworkUrls.has(track.id)) artworkUrls.set(track.id, URL.createObjectURL(track.artworkBlob));
    return artworkUrls.get(track.id) || "";
  };

  const pruneArtworkUrls = () => {
    const keep = new Set(tracks.map((track) => track.id));
    for (const [id, url] of artworkUrls) {
      if (keep.has(id)) continue;
      URL.revokeObjectURL(url);
      artworkUrls.delete(id);
    }
  };

  const updateNowPlaying = (state = localMusicState()) => {
    const hero = screen.querySelector("[data-music-now-playing]");
    const visual = screen.querySelector("[data-music-visual]");
    const title = screen.querySelector("[data-music-title]");
    const artist = screen.querySelector("[data-music-artist]");
    const album = screen.querySelector("[data-music-album]");
    const artImage = screen.querySelector("[data-music-art-image]");
    const artFallback = screen.querySelector("[data-music-art-fallback]");
    const artLetter = screen.querySelector("[data-music-art-letter]");
    const toggle = screen.querySelector("[data-music-toggle]");
    const seek = screen.querySelector("[data-music-seek]");
    const current = screen.querySelector("[data-music-time-current]");
    const duration = screen.querySelector("[data-music-time-duration]");
    const volume = screen.querySelector("[data-music-volume]");
    const output = screen.querySelector("[data-music-volume-output]");
    const error = screen.querySelector("[data-music-error]");
    const track = tracks.find((item) => item.id === state.currentId) || null;
    const style = visualStyle(state.currentId || state.title || "PARA Music");
    if (hero) {
      hero.dataset.playing = state.playbackState === "playing" ? "true" : "false";
      hero.style.cssText = style;
    }
    if (visual) visual.style.cssText = style;
    if (title) title.textContent = state.active ? state.title : "Your soundtrack lives here";
    if (artist) artist.textContent = state.active ? (state.artist || "Local file") : "Drop in a song and PARA will carry it with you.";
    if (album) album.textContent = state.active ? (track?.album || state.fileName || "Stored on this PARA") : "Offline · private · yours";
    if (artLetter) artLetter.textContent = track ? coverLetter(track) : (state.active ? coverLetter(state) : "♫");
    const art = track ? artworkUrl(track) : "";
    if (artImage) {
      if (art) {
        if (artImage.getAttribute("src") !== art) artImage.setAttribute("src", art);
        artImage.hidden = false;
      } else {
        artImage.hidden = true;
        artImage.removeAttribute("src");
      }
    }
    if (artFallback) artFallback.hidden = Boolean(art);
    if (toggle) toggle.textContent = state.playbackState === "playing" ? "Ⅱ" : "▶";
    if (seek) {
      seek.disabled = !state.active;
      seek.max = String(Math.max(1, state.duration || 1));
      if (!seek.matches(":active")) seek.value = String(Math.min(state.currentTime || 0, state.duration || 1));
    }
    if (current) current.textContent = durationLabel(state.currentTime);
    if (duration) duration.textContent = durationLabel(state.duration);
    if (volume && !volume.matches(":active")) volume.value = String(state.volume);
    if (output) output.textContent = `${state.volume}%`;
    if (error) {
      error.hidden = !state.error;
      error.textContent = state.error || "";
    }
    screen.querySelectorAll("[data-music-row]").forEach((row) => {
      const selected = row.dataset.musicRow === state.currentId;
      row.classList.toggle("is-playing", selected);
      row.dataset.playing = selected && state.playbackState === "playing" ? "true" : "false";
    });
  };

  const renderLibrary = () => {
    if (!library) return;
    pruneArtworkUrls();
    const state = localMusicState();
    library.innerHTML = libraryMarkup(tracks, state, artworkUrl);
    if (clearButton) clearButton.hidden = !tracks.length;
    if (countNode) countNode.textContent = tracks.length ? `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} stored locally` : "No tracks yet";
    updateNowPlaying(state);
  };

  const refresh = async ({ focusFirst = false } = {}) => {
    try {
      tracks = await listLocalMusic();
      setMusicQueue(tracks);
      if (disposed) return;
      renderLibrary();
      if (focusFirst) focus?.focusFirst?.();
    } catch (error) {
      if (disposed || !library) return;
      library.innerHTML = `<div class="music-library-empty"><span>!</span><h2>Local library unavailable</h2><p>${escapeHtml(error?.message || "PARA Music could not open browser storage.")}</p></div>`;
    }
  };

  const importFiles = async (files) => {
    dropZone?.classList.add("is-importing");
    try {
      const result = await importLocalMusic(files);
      tracks = result.tracks;
      if (!disposed) renderLibrary();
    } finally {
      dropZone?.classList.remove("is-importing");
      if (input) input.value = "";
    }
  };

  const onClick = (event) => {
    const find = event.target.closest("[data-music-find-files]");
    if (find) { input?.click(); return; }
    const track = event.target.closest("[data-music-track]");
    if (track) { void playLocalMusicTrack(track.dataset.musicTrack).catch(() => updateNowPlaying()); return; }
    const remove = event.target.closest("[data-music-remove]");
    if (remove) { void removeLocalMusic(remove.dataset.musicRemove).then((next) => { tracks = next; renderLibrary(); }); return; }
    if (event.target.closest("[data-music-toggle]")) { void toggleLocalMusic(); return; }
    if (event.target.closest("[data-music-previous]")) { void previousLocalMusic(); return; }
    if (event.target.closest("[data-music-next]")) { void nextLocalMusic(); return; }
    if (event.target.closest("[data-music-clear]")) { void clearLocalMusic().then((next) => { tracks = next; renderLibrary(); }); }
  };

  const onInput = (event) => {
    if (event.target.matches("[data-music-seek]")) seekLocalMusic(Number(event.target.value || 0));
    if (event.target.matches("[data-music-volume]")) setLocalMusicVolume(Number(event.target.value || 0));
  };

  const onChange = (event) => {
    if (event.target.matches("[data-music-file-input]")) void importFiles(event.target.files || []);
  };

  const dragGuard = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onDragEnter = (event) => { dragGuard(event); dropZone?.classList.add("is-dragging"); };
  const onDragLeave = (event) => { dragGuard(event); if (!dropZone?.contains(event.relatedTarget)) dropZone?.classList.remove("is-dragging"); };
  const onDrop = (event) => {
    dragGuard(event);
    dropZone?.classList.remove("is-dragging");
    void importFiles(event.dataTransfer?.files || []);
  };
  const onMusicChange = (event) => updateNowPlaying(event.detail || localMusicState());

  screen.addEventListener("click", onClick);
  screen.addEventListener("input", onInput);
  screen.addEventListener("change", onChange);
  dropZone?.addEventListener("dragenter", onDragEnter);
  dropZone?.addEventListener("dragover", dragGuard);
  dropZone?.addEventListener("dragleave", onDragLeave);
  dropZone?.addEventListener("drop", onDrop);
  document.addEventListener(MUSIC_EVENT, onMusicChange);
  void refresh({ focusFirst: true });

  return () => {
    disposed = true;
    screen.removeEventListener("click", onClick);
    screen.removeEventListener("input", onInput);
    screen.removeEventListener("change", onChange);
    dropZone?.removeEventListener("dragenter", onDragEnter);
    dropZone?.removeEventListener("dragover", dragGuard);
    dropZone?.removeEventListener("dragleave", onDragLeave);
    dropZone?.removeEventListener("drop", onDrop);
    document.removeEventListener(MUSIC_EVENT, onMusicChange);
    for (const url of artworkUrls.values()) URL.revokeObjectURL(url);
    artworkUrls.clear();
    // Playback is a PARA background service. Leaving this screen does not stop it.
  };
}
