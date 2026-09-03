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

function nowPlayingMarkup(state) {
  const active = Boolean(state.active);
  return `<section class="music-now-playing" data-music-now-playing>
    <div class="music-now-playing__art" aria-hidden="true"><span>♫</span></div>
    <div class="music-now-playing__copy">
      <span>NOW PLAYING</span>
      <h2 data-music-title>${escapeHtml(active ? state.title : "Nothing playing")}</h2>
      <p data-music-artist>${escapeHtml(active ? (state.artist || state.fileName || "Local file") : "Choose a song from your local library")}</p>
    </div>
    <div class="music-transport">
      <button type="button" data-music-previous aria-label="Previous track">◀◀</button>
      <button type="button" class="music-transport__primary" data-music-toggle aria-label="Play or pause">${state.playbackState === "playing" ? "Ⅱ" : "▶"}</button>
      <button type="button" data-music-next aria-label="Next track">▶▶</button>
    </div>
    <div class="music-timeline">
      <span data-music-time-current>${durationLabel(state.currentTime)}</span>
      <input type="range" min="0" max="${Math.max(1, state.duration || 1)}" step="0.1" value="${Math.min(state.currentTime || 0, state.duration || 1)}" data-music-seek aria-label="Song position" ${active ? "" : "disabled"}>
      <span data-music-time-duration>${durationLabel(state.duration)}</span>
    </div>
    <label class="music-volume"><span>VOLUME</span><input type="range" min="0" max="100" step="2" value="${state.volume}" data-music-volume aria-label="Music volume"><b data-music-volume-output>${state.volume}%</b></label>
    <p class="music-player-error" data-music-error ${state.error ? "" : "hidden"}>${escapeHtml(state.error || "")}</p>
  </section>`;
}

function libraryMarkup(tracks, state) {
  if (!tracks.length) {
    return `<div class="music-library-empty" data-music-empty><span>♫</span><h2>No music yet</h2><p>Drag local audio files here or choose Find Files.</p></div>`;
  }
  return `<div class="music-track-list" data-music-track-list>${tracks.map((track, index) => {
    const selected = state.currentId === track.id;
    const subtitle = [track.artist, track.fileName].filter(Boolean).join(" · ");
    return `<article class="music-track${selected ? " is-playing" : ""}" data-music-row="${escapeHtml(track.id)}">
      <button type="button" class="music-track__main" data-music-track="${escapeHtml(track.id)}" ${index === 0 ? "data-autofocus='true'" : ""}>
        <span class="music-track__number">${selected && state.playbackState === "playing" ? "♫" : index + 1}</span>
        <span class="music-track__copy"><strong>${escapeHtml(track.title || track.fileName || "Local track")}</strong><small>${escapeHtml(subtitle || "Local file")}</small></span>
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
    description: "Play local music files on PARA. Nothing is uploaded.",
    eyebrow: "Local player",
    className: "music-page",
    body: `<section class="music-app">
      <div class="music-import-zone" data-music-drop-zone>
        <input type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,.webm" data-music-file-input hidden>
        <div><span class="music-import-zone__icon">＋</span><div><strong>Drop music files here</strong><small>Local files stay on this browser build of PARA.</small></div></div>
        <button type="button" class="action-button" data-music-find-files>Find Files</button>
      </div>
      <div class="music-layout">
        <section class="music-library-panel">
          <header><div><span>LOCAL LIBRARY</span><h2>Your music</h2></div><button type="button" class="music-clear-button" data-music-clear hidden>Clear Library</button></header>
          <div data-music-library><div class="library-loading"><span></span><strong>Reading local music…</strong></div></div>
        </section>
        ${nowPlayingMarkup(state)}
      </div>
      <footer class="music-local-note"><span>LOCAL ONLY</span><p>Browser build: drag & drop or Find Files. Future PARA console: PARA Files and USB drives use this same player.</p></footer>
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
  let tracks = [];
  let disposed = false;

  const updateNowPlaying = (state = localMusicState()) => {
    const title = screen.querySelector("[data-music-title]");
    const artist = screen.querySelector("[data-music-artist]");
    const toggle = screen.querySelector("[data-music-toggle]");
    const seek = screen.querySelector("[data-music-seek]");
    const current = screen.querySelector("[data-music-time-current]");
    const duration = screen.querySelector("[data-music-time-duration]");
    const volume = screen.querySelector("[data-music-volume]");
    const output = screen.querySelector("[data-music-volume-output]");
    const error = screen.querySelector("[data-music-error]");
    if (title) title.textContent = state.active ? state.title : "Nothing playing";
    if (artist) artist.textContent = state.active ? (state.artist || state.fileName || "Local file") : "Choose a song from your local library";
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
      const number = row.querySelector(".music-track__number");
      if (number && selected) number.textContent = state.playbackState === "playing" ? "♫" : "▶";
      else if (number) number.textContent = String(tracks.findIndex((track) => track.id === row.dataset.musicRow) + 1);
    });
  };

  const renderLibrary = () => {
    if (!library) return;
    const state = localMusicState();
    library.innerHTML = libraryMarkup(tracks, state);
    if (clearButton) clearButton.hidden = !tracks.length;
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
    // Intentionally do not stop playback. PARA Music is a background system service.
  };
}
