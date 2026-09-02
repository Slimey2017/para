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
const CAPTURE_SYNC_CHANNEL = "para-capture-library-v1";
const CAPTURE_SYNC_STORAGE_KEY = "para.capture.library.pulse.v1";
let captureSyncChannel = null;
let captureStorageListener = null;

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

function captureState(item = {}) {
  // V56 removed the server-side conversion pipeline. Any stored clip blob is
  // the capture itself, including recordings left behind by older processing states.
  if (item?.type === "clip" && item?.blob) return "ready";
  return "ready";
}


function details(item) {
  if (item.type === "clip") {
    return `${durationLabel(item.durationMs)} · Video`;
  }
  return `${item.width || ""}${item.width ? " × " : ""}${item.height || ""}${item.width ? " · " : ""}Screenshot`;
}

function heroMarkup(item) {
  if (!item) return `<div class="capture-gallery-empty"><span>▣</span><h2>No captures here</h2><p>Take a screenshot or save recent gameplay from Control Center.</p></div>`;
  const url = mediaUrl(item);
  const state = captureState(item);
  const isReady = state === "ready";
  const statusMarkup = "";
  const mediaStage = item.type === "clip"
    ? `<div class="capture-hero__media capture-hero__media--video">${paraVideoPlayerMarkup({ src: url, mimeType: capturePlaybackMime(item), durationMs: item.durationMs, className: "para-video-player--hero" })}</div>`
    : `<button class="capture-hero__media" type="button" data-action="open-media-viewer" data-capture-id="${item.id}" data-autofocus="true" aria-label="View screenshot fullscreen"><img src="${url}" alt="Screenshot captured ${fmt.format(item.createdAt)}"></button>`;
  return `<article class="capture-hero capture-hero--${state}" data-selected-capture="${item.id}">
    ${mediaStage}
    <div class="capture-hero__info">
      ${statusMarkup}
      <div><span>${item.type === "clip" ? "GAMEPLAY VIDEO" : "SCREENSHOT"}</span><h2>${item.type === "clip" ? "Gameplay capture" : "Screenshot"}</h2><p>${fmt.format(item.createdAt)} · ${details(item)}</p></div>
      <div class="capture-hero__actions" data-focus-zone="capture-actions">
        <button type="button" class="capture-action capture-action--primary" data-action="open-media-viewer" data-capture-id="${item.id}"><b>▶</b><span>View</span></button>
        ${item.type === "clip" && isReady ? `<button type="button" class="capture-action capture-action--youtube" data-action="share-capture" data-share-target="youtube" data-capture-id="${item.id}"><b>▶</b><span>Upload to YouTube</span></button>` : ""}
        ${isReady ? `<button type="button" class="capture-action" data-action="open-share-center" data-capture-id="${item.id}" data-capture-kind="${item.type}"><b>↗</b><span>Share</span></button>` : ""}
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
    const state = captureState(item);
    return `<button type="button" class="capture-thumb capture-thumb--${state} ${item.id === selectedCaptureId ? "is-selected" : ""}" data-action="select-media-capture" data-capture-id="${item.id}" aria-label="${item.type === "clip" ? "Video" : "Screenshot"} from ${fmt.format(item.createdAt)}"><span class="capture-thumb__media">${media}${item.type === "clip" ? `<em>${durationLabel(item.durationMs)}</em>` : ""}</span><span class="capture-thumb__copy"><strong>${item.type === "clip" ? "Video" : "Screenshot"}</strong><small>${fmt.format(item.createdAt)}</small></span></button>`;
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

async function reloadCaptureLibrary() {
  releaseUrls();
  activeItems = await listCaptures();
  if (!selectedCaptureId || !activeItems.some((item) => item.id === selectedCaptureId)) selectedCaptureId = activeItems[0]?.id || "";
  refreshGalleryMarkup();
}

function stopCaptureLibrarySync() {
  try { captureSyncChannel?.close?.(); } catch {}
  captureSyncChannel = null;
  if (captureStorageListener) window.removeEventListener("storage", captureStorageListener);
  captureStorageListener = null;
}

function startCaptureLibrarySync() {
  stopCaptureLibrarySync();
  const refresh = () => { void reloadCaptureLibrary().catch(() => {}); };
  try {
    captureSyncChannel = new BroadcastChannel(CAPTURE_SYNC_CHANNEL);
    captureSyncChannel.onmessage = (event) => { if (event?.data?.type === "para-capture-library-change") refresh(); };
  } catch { captureSyncChannel = null; }
  captureStorageListener = (event) => { if (event.key === CAPTURE_SYNC_STORAGE_KEY) refresh(); };
  window.addEventListener("storage", captureStorageListener);
}

export async function activateMediaGallery() {
  releaseUrls();
  const host = document.querySelector("[data-media-gallery]");
  if (!host) return () => { stopCaptureLibrarySync(); releaseUrls(); };
  try {
    await reloadCaptureLibrary();
    startCaptureLibrarySync();
  } catch (error) {
    host.innerHTML = `<div class="capture-gallery-empty"><span>!</span><h2>Gallery could not open</h2><p>${String(error?.message || "Capture storage is unavailable.")}</p></div>`;
  }
  return () => { stopCaptureLibrarySync(); releaseUrls(); };
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

let selectedAchievementProject = "";

function achievementAssetUrl(path) {
  return path ? `/api/v1/store/asset?path=${encodeURIComponent(path)}` : "";
}

function sortedAchievements() {
  return [...getProfileRuntime().achievements].sort((a, b) => {
    const aUnlocked = Number(a.unlockedAt || 0);
    const bUnlocked = Number(b.unlockedAt || 0);
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
}

function achievementSummaryMarkup(achievements) {
  const unlocked = achievements.filter((item) => item.unlockedAt);
  const score = unlocked.reduce((total, item) => total + Number(item.points || 0), 0);
  const completion = achievements.length ? Math.round((unlocked.length / achievements.length) * 100) : 0;
  return `<section class="achievements-summary"><div><span class="eyebrow">PARA Score</span><strong>${score}</strong><small>${unlocked.length} unlocked</small></div><div><span class="eyebrow">Completed</span><strong>${completion}%</strong><small>${unlocked.length} of ${achievements.length} tracked</small></div></section>`;
}

function achievementCardMarkup(item, index) {
  const unlockedAt = item.unlockedAt ? new Date(item.unlockedAt).toLocaleDateString() : "";
  const target = Math.max(1, Number(item.target || 1));
  const progress = Math.min(target, Math.max(0, Number(item.progress || 0)));
  const percent = Math.round((progress / target) * 100);
  const hiddenLocked = Boolean(item.hidden && !item.unlockedAt);
  const syncState = item.syncState === "cloud" ? "cloud" : item.syncState === "pending" ? "pending" : "local";
  const syncLabel = syncState === "cloud" ? "CLOUD SYNCED" : syncState === "pending" ? "SYNC PENDING" : "LOCAL ONLY";
  const icon = item.iconUrl && !hiddenLocked ? `<img src="${escapeHtml(item.iconUrl)}" alt="">` : `<span>◇</span>`;
  return `<article class="achievement-card ${item.unlockedAt ? "is-unlocked" : ""}" tabindex="0" ${index === 0 ? "data-autofocus='true'" : ""}>
    <div class="achievement-card__icon">${icon}</div>
    <div class="achievement-card__copy"><div><span>${item.unlockedAt ? "UNLOCKED" : item.kind === "PROGRESS" ? "IN PROGRESS" : "LOCKED"}</span><span class="achievement-sync achievement-sync--${syncState}">${syncLabel}</span><strong>${hiddenLocked ? "Secret achievement" : escapeHtml(item.name || item.key)}</strong></div><p>${hiddenLocked ? "Keep playing to reveal this achievement." : escapeHtml(item.description || "")}</p>${item.kind === "PROGRESS" && !item.unlockedAt ? `<div class="achievement-progress"><i style="width:${percent}%"></i></div><small>${progress} / ${target}</small>` : `<small>${unlockedAt ? `Earned ${escapeHtml(unlockedAt)}` : escapeHtml(item.key || "")}</small>`}</div>
    <b>${Number(item.points || 0)} pts</b>
  </article>`;
}

function savedStoreIdentity(storeId) {
  if (!storeId) return {};
  try {
    const value = JSON.parse(sessionStorage.getItem(`para.store.artwork.${storeId}`) || "{}");
    return {
      title: String(value?.title || "").trim(),
      art: Array.isArray(value?.urls) ? String(value.urls[0] || "") : "",
    };
  } catch { return {}; }
}

function achievementGroups(achievements, catalog = []) {
  const catalogByProject = new Map(catalog.filter((item) => item?.project_id).map((item) => [String(item.project_id), item]));
  const catalogByStore = new Map(catalog.filter((item) => item?.id).map((item) => [String(item.id), item]));
  const recent = getProfileRuntime().recent || [];
  const runtimeByProject = new Map(recent.filter((item) => item?.projectId).map((item) => [String(item.projectId), item]));
  const runtimeByStore = new Map();
  for (const item of recent) {
    const storeId = String(item?.storeId || (String(item?.id || "").startsWith("store:") ? String(item.id).slice(6) : "") || "");
    if (storeId) runtimeByStore.set(storeId, item);
  }
  const groups = new Map();
  for (const item of achievements) {
    const projectId = String(item.projectId || "legacy");
    if (!groups.has(projectId)) groups.set(projectId, []);
    groups.get(projectId).push(item);
  }
  return [...groups.entries()].map(([projectId, items]) => {
    const storeId = String(items.find((item) => item?.storeId)?.storeId || "");
    const catalogItem = catalogByProject.get(projectId) || (storeId ? catalogByStore.get(storeId) : null);
    const runtimeItem = runtimeByProject.get(projectId) || (storeId ? runtimeByStore.get(storeId) : null);
    const remembered = savedStoreIdentity(storeId);
    const assets = catalogItem?.asset_references || {};
    const shots = Array.isArray(assets.screenshots) ? assets.screenshots : [];
    const artPath = assets.cover || assets.icon || assets.hero || shots[0] || "";
    const art = artPath ? achievementAssetUrl(artPath) : String(runtimeItem?.artwork || remembered.art || "");
    const unlocked = items.filter((item) => item.unlockedAt).length;
    const score = items.filter((item) => item.unlockedAt).reduce((total, item) => total + Number(item.points || 0), 0);
    const title = String(catalogItem?.title || runtimeItem?.title || remembered.title || (projectId === "legacy" ? "Other Games" : "Unknown Game"));
    return { projectId, storeId, items, title, art, unlocked, score };
  }).sort((a, b) => (b.unlocked / Math.max(1, b.items.length)) - (a.unlocked / Math.max(1, a.items.length)) || a.title.localeCompare(b.title));
}

function achievementFoldersMarkup(groups) {
  if (!groups.length) return `<div class="library-empty achievements-empty"><span>◇</span><h2>No achievements yet</h2><p>Achievement folders appear here when games report progress through the PARA Achievement API.</p><button class="action-button" data-route="games" data-autofocus="true">Open Games</button></div>`;
  return `<section class="achievement-folders" aria-label="Achievement games">${groups.map((group, index) => {
    const completion = Math.round((group.unlocked / Math.max(1, group.items.length)) * 100);
    const art = group.art ? `<img src="${group.art}" alt="">` : `<span class="achievement-folder__fallback">◇</span>`;
    return `<button type="button" class="achievement-folder" data-achievement-project="${escapeHtml(group.projectId)}" ${index === 0 ? "data-autofocus='true'" : ""}>
      <span class="achievement-folder__art">${art}<i>${completion}%</i></span>
      <span class="achievement-folder__copy"><span>GAME TROPHIES</span><strong>${escapeHtml(group.title)}</strong><small>${group.unlocked} of ${group.items.length} unlocked · ${group.score} pts</small><b><i style="width:${completion}%"></i></b></span>
      <em aria-hidden="true">›</em>
    </button>`;
  }).join("")}</section>`;
}

function achievementGameMarkup(group) {
  if (!group) return "";
  const completion = Math.round((group.unlocked / Math.max(1, group.items.length)) * 100);
  return `<section class="achievement-game-head"><button type="button" data-achievement-back>← All games</button><div class="achievement-game-head__art">${group.art ? `<img src="${group.art}" alt="">` : `<span>◇</span>`}</div><div><span>GAME TROPHIES</span><h2>${escapeHtml(group.title)}</h2><p>${group.unlocked} of ${group.items.length} unlocked · ${completion}% complete · ${group.score} pts</p></div></section><section class="achievement-list">${group.items.map(achievementCardMarkup).join("")}</section>`;
}

export function achievementsScreen() {
  const achievements = sortedAchievements();
  return page({
    title: "Achievements",
    description: "Trophies are organized by game instead of scattered into one endless list.",
    eyebrow: "System app",
    className: "achievements-page achievements-app-page",
    body: `${achievementSummaryMarkup(achievements)}<div data-achievements-app><div class="library-loading"><span></span><strong>Organizing game trophies…</strong></div></div>`,
  });
}

export async function activateAchievements({ focus } = {}) {
  const host = document.querySelector("[data-achievements-app]");
  if (!host) return () => {};
  let alive = true;
  let catalog = [];
  try {
    const payload = await paraApi.storeCatalog();
    catalog = Array.isArray(payload?.items) ? payload.items : [];
  } catch { /* runtime/store identity fallbacks still render */ }

  // Older/local achievement records may have a store id even when their project
  // id cannot be matched against the catalog snapshot. Resolve those entries by
  // store id so a real catalog title never degrades into a generic game label.
  const knownStoreIds = new Set(catalog.map((item) => String(item?.id || "")).filter(Boolean));
  const missingStoreIds = [...new Set(sortedAchievements().map((item) => String(item?.storeId || "")).filter((id) => id && !knownStoreIds.has(id)))];
  if (missingStoreIds.length) {
    // Resolve old trophy metadata gently. V53 used Promise.allSettled here,
    // which could fan out a pile of product requests during one screen render.
    // para-api.js now dedupes/caches globally too, but this path stays sequential
    // so opening Achievements never creates its own request burst.
    for (const id of missingStoreIds) {
      try {
        const product = await paraApi.storeProduct(id);
        if (product?.id) catalog.push(product);
      } catch {
        // Keep rendering the folder with runtime/saved identity fallbacks.
      }
      if (!alive) return () => {};
    }
  }
  if (!alive) return () => {};

  const render = () => {
    const achievements = sortedAchievements();
    const groups = achievementGroups(achievements, catalog);
    const selected = selectedAchievementProject ? groups.find((group) => group.projectId === selectedAchievementProject) : null;
    if (selectedAchievementProject && !selected) selectedAchievementProject = "";
    host.innerHTML = selected ? achievementGameMarkup(selected) : achievementFoldersMarkup(groups);
    requestAnimationFrame(() => focus?.focusFirst?.());
  };
  const onClick = (event) => {
    const folder = event.target.closest("[data-achievement-project]");
    if (folder) { selectedAchievementProject = folder.dataset.achievementProject || ""; render(); return; }
    if (event.target.closest("[data-achievement-back]")) { selectedAchievementProject = ""; render(); }
  };
  host.addEventListener("click", onClick);
  render();
  return () => { alive = false; host.removeEventListener("click", onClick); };
}
