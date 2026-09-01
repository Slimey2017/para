import { page } from "../ui/components.js";
import { capturePlaybackBlob, capturePlaybackMime, deleteCapture, listCaptures } from "../services/capture-service.js";
import { getProfileRuntime } from "../state.js";
import { escapeHtml } from "../services/para-api.js";
import { activateParaVideoPlayers, paraVideoPlayerMarkup } from "../ui/video-player.js";

const liveUrls = new Map();
const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
let activeItems = [];
let selectedCaptureId = "";
let galleryFilter = "all";

function releaseUrls() {
  for (const url of liveUrls.values()) URL.revokeObjectURL(url);
  liveUrls.clear();
}

function mediaUrl(item) {
  if (!liveUrls.has(item.id)) liveUrls.set(item.id, URL.createObjectURL(capturePlaybackBlob(item)));
  return liveUrls.get(item.id);
}

function durationLabel(ms = 0) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return minutes ? `${minutes}:${seconds}` : `0:${seconds}`;
}

function details(item) {
  if (item.type === "clip") return `${durationLabel(item.durationMs)} · ${item.mimeType?.includes("webm") ? "WebM" : "Video"}`;
  return `${item.width || ""}${item.width ? " × " : ""}${item.height || ""}${item.width ? " · " : ""}Screenshot`;
}

function heroMarkup(item) {
  if (!item) return `<div class="capture-gallery-empty"><span>▣</span><h2>No captures here</h2><p>Take a screenshot or save recent gameplay from Control Center.</p></div>`;
  const url = mediaUrl(item);
  const mediaStage = item.type === "clip"
    ? `<div class="capture-hero__media capture-hero__media--video">${paraVideoPlayerMarkup({ src: url, mimeType: capturePlaybackMime(item), durationMs: item.durationMs, className: "para-video-player--hero" })}</div>`
    : `<button class="capture-hero__media" type="button" data-action="open-media-viewer" data-capture-id="${item.id}" data-autofocus="true" aria-label="View screenshot fullscreen"><img src="${url}" alt="Screenshot captured ${fmt.format(item.createdAt)}"></button>`;
  return `<article class="capture-hero" data-selected-capture="${item.id}">
    ${mediaStage}
    <div class="capture-hero__info">
      <div><span>${item.type === "clip" ? "GAMEPLAY VIDEO" : "SCREENSHOT"}</span><h2>${item.type === "clip" ? "Gameplay capture" : "Screenshot"}</h2><p>${fmt.format(item.createdAt)} · ${details(item)}</p></div>
      <div class="capture-hero__actions" data-focus-zone="capture-actions">
        <button type="button" class="capture-action capture-action--primary" data-action="open-media-viewer" data-capture-id="${item.id}"><b>▶</b><span>View</span></button>
        ${item.type === "clip" ? `<button type="button" class="capture-action capture-action--youtube" data-action="share-capture" data-share-target="youtube" data-capture-id="${item.id}"><b>▶</b><span>Upload to YouTube</span></button>` : ""}
        <button type="button" class="capture-action" data-action="open-share-center" data-capture-id="${item.id}" data-capture-kind="${item.type}"><b>↗</b><span>Share</span></button>
        <button type="button" class="capture-action" data-action="share-capture" data-share-target="files" data-capture-id="${item.id}"><b>⇩</b><span>Save</span></button>
        <button type="button" class="capture-action capture-action--danger" data-action="delete-capture" data-capture-id="${item.id}"><b>×</b><span>Delete</span></button>
      </div>
    </div>
  </article>`;
}

function railMarkup(items) {
  if (!items.length) return "";
  return `<section class="capture-rail" aria-label="Captures"><header><strong>${items.length} ${items.length === 1 ? "capture" : "captures"}</strong><small>Choose a capture to preview</small></header><div class="capture-rail__track" data-focus-zone="capture-rail">${items.map((item) => {
    const url = mediaUrl(item);
    const media = item.type === "clip" ? `<video src="${url}" preload="metadata" muted playsinline></video>` : `<img src="${url}" alt="">`;
    return `<button type="button" class="capture-thumb ${item.id === selectedCaptureId ? "is-selected" : ""}" data-action="select-media-capture" data-capture-id="${item.id}" aria-label="${item.type === "clip" ? "Video" : "Screenshot"} from ${fmt.format(item.createdAt)}"><span class="capture-thumb__media">${media}${item.type === "clip" ? `<em>${durationLabel(item.durationMs)}</em>` : ""}</span><span class="capture-thumb__copy"><strong>${item.type === "clip" ? "Video" : "Screenshot"}</strong><small>${fmt.format(item.createdAt)}</small></span></button>`;
  }).join("")}</div></section>`;
}

function filteredItems() {
  if (galleryFilter === "videos") return activeItems.filter((item) => item.type === "clip");
  if (galleryFilter === "screenshots") return activeItems.filter((item) => item.type !== "clip");
  return activeItems;
}

function refreshGalleryMarkup({ keepFocus = false } = {}) {
  const host = document.querySelector("[data-media-gallery]");
  if (!host) return;
  const items = filteredItems();
  if (!items.some((item) => item.id === selectedCaptureId)) selectedCaptureId = items[0]?.id || "";
  const selected = items.find((item) => item.id === selectedCaptureId) || items[0] || null;
  const focusId = keepFocus ? document.activeElement?.dataset?.captureId : null;
  host.innerHTML = `${heroMarkup(selected)}${railMarkup(items)}`;
  activateParaVideoPlayers(host);
  document.querySelectorAll("[data-media-filter]").forEach((button) => {
    const selected = button.dataset.mediaFilter === galleryFilter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  if (focusId) document.querySelector(`[data-action="select-media-capture"][data-capture-id="${focusId}"]`)?.focus();
}

export function mediaGalleryScreen() {
  return page({
    title: "Media Gallery",
    description: "Screenshots and gameplay videos captured on PARA.",
    eyebrow: "Capture",
    className: "media-gallery-page capture-gallery-page",
    body: `<section class="capture-gallery-topbar"><div class="capture-filter-tabs" role="tablist" aria-label="Media filter"><button type="button" role="tab" aria-selected="true" class="is-active" data-action="filter-media-gallery" data-media-filter="all">All</button><button type="button" role="tab" aria-selected="false" data-action="filter-media-gallery" data-media-filter="videos">Videos</button><button type="button" role="tab" aria-selected="false" data-action="filter-media-gallery" data-media-filter="screenshots">Screenshots</button></div><button type="button" class="capture-open-controls" data-action="open-control-center">◎ Capture Controls</button></section><div data-media-gallery><div class="library-loading"><span></span><strong>Opening captures…</strong></div></div>`,
  });
}

export async function activateMediaGallery() {
  releaseUrls();
  const host = document.querySelector("[data-media-gallery]");
  if (!host) return () => releaseUrls();
  try {
    activeItems = await listCaptures();
    if (!selectedCaptureId || !activeItems.some((item) => item.id === selectedCaptureId)) selectedCaptureId = activeItems[0]?.id || "";
    refreshGalleryMarkup();
  } catch (error) {
    host.innerHTML = `<div class="capture-gallery-empty"><span>!</span><h2>Gallery could not open</h2><p>${String(error?.message || "Capture storage is unavailable.")}</p></div>`;
  }
  return () => releaseUrls();
}

export function selectMediaCapture(id) {
  if (!activeItems.some((item) => item.id === id)) return false;
  selectedCaptureId = id;
  refreshGalleryMarkup({ keepFocus: true });
  return true;
}

export function filterMediaGallery(filter = "all") {
  galleryFilter = ["videos", "screenshots"].includes(filter) ? filter : "all";
  selectedCaptureId = filteredItems()[0]?.id || "";
  refreshGalleryMarkup();
  return true;
}

export async function removeCapture(id) {
  await deleteCapture(id);
  if (selectedCaptureId === id) selectedCaptureId = "";
  return activateMediaGallery();
}

export function achievementsScreen() {
  const achievements = [...getProfileRuntime().achievements].sort((a, b) => {
    const aUnlocked = Number(a.unlockedAt || 0);
    const bUnlocked = Number(b.unlockedAt || 0);
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
  const unlocked = achievements.filter((item) => item.unlockedAt);
  const score = unlocked.reduce((total, item) => total + Number(item.points || 0), 0);
  const completion = achievements.length ? Math.round((unlocked.length / achievements.length) * 100) : 0;
  const body = achievements.length
    ? `<section class="achievements-summary"><div><span class="eyebrow">PARA Score</span><strong>${score}</strong><small>${unlocked.length} unlocked</small></div><div><span class="eyebrow">Completed</span><strong>${completion}%</strong><small>${unlocked.length} of ${achievements.length} tracked</small></div></section>
       <section class="achievement-list">${achievements.map((item, index) => {
         const unlockedAt = item.unlockedAt ? new Date(item.unlockedAt).toLocaleDateString() : '';
         const target = Math.max(1, Number(item.target || 1));
         const progress = Math.min(target, Math.max(0, Number(item.progress || 0)));
         const percent = Math.round((progress / target) * 100);
         const hiddenLocked = Boolean(item.hidden && !item.unlockedAt);
         const icon = item.iconUrl && !hiddenLocked ? `<img src="${escapeHtml(item.iconUrl)}" alt="">` : `<span>◇</span>`;
         return `<article class="achievement-card ${item.unlockedAt ? 'is-unlocked' : ''}" tabindex="0" ${index === 0 ? 'data-autofocus="true"' : ''}>
           <div class="achievement-card__icon">${icon}</div>
           <div class="achievement-card__copy"><div><span>${item.unlockedAt ? 'UNLOCKED' : item.kind === 'PROGRESS' ? 'IN PROGRESS' : 'LOCKED'}</span><strong>${hiddenLocked ? 'Secret achievement' : escapeHtml(item.name || item.key)}</strong></div><p>${hiddenLocked ? 'Keep playing to reveal this achievement.' : escapeHtml(item.description || '')}</p>${item.kind === 'PROGRESS' && !item.unlockedAt ? `<div class="achievement-progress"><i style="width:${percent}%"></i></div><small>${progress} / ${target}</small>` : `<small>${unlockedAt ? `Earned ${escapeHtml(unlockedAt)}` : escapeHtml(item.key || '')}</small>`}</div>
           <b>${Number(item.points || 0)} pts</b>
         </article>`;
       }).join('')}</section>`
    : `<section class="achievements-summary"><div><span class="eyebrow">PARA Score</span><strong>0</strong><small>No unlocks yet</small></div><div><span class="eyebrow">Completed</span><strong>0%</strong><small>Across supported games</small></div></section><div class="library-empty achievements-empty"><span>◇</span><h2>No achievements yet</h2><p>Achievement lists appear here when a game reports progress through the PARA Achievement API.</p><button class="action-button" data-route="games" data-autofocus="true">Open Games</button></div>`;
  return page({
    title: "Achievements",
    description: "Progress, unlocks, points, and completion history.",
    eyebrow: "Games",
    className: "achievements-page",
    body,
  });
}
