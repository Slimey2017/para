import { page } from "../ui/components.js";
import { deleteCapture, listCaptures } from "../services/capture-service.js";

const liveUrls = new Set();
const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function releaseUrls() { for (const url of liveUrls) URL.revokeObjectURL(url); liveUrls.clear(); }

export function mediaGalleryScreen() {
  return page({
    title: "Media Gallery",
    description: "Screenshots and gameplay clips captured on PARA.",
    eyebrow: "Captures",
    className: "media-gallery-page",
    body: `<section class="media-gallery-toolbar"><div><span class="eyebrow">Your captures</span><h2>Gallery</h2></div><div><button class="action-button" data-action="capture-screenshot" data-autofocus="true">Take Screenshot</button><button class="action-button action-button--ghost" data-action="capture-clip">Record 8s Clip</button></div></section><div data-media-gallery><div class="library-loading"><span></span><strong>Opening captures…</strong></div></div>`,
  });
}

export async function activateMediaGallery() {
  releaseUrls();
  const host = document.querySelector("[data-media-gallery]");
  if (!host) return () => releaseUrls();
  try {
    const items = await listCaptures();
    if (!items.length) {
      host.innerHTML = `<div class="library-empty media-gallery-empty"><span>▣</span><h2>No captures yet</h2><p>Take a screenshot or record a short clip. PARA asks before sharing your screen.</p></div>`;
      return () => releaseUrls();
    }
    host.innerHTML = `<div class="media-gallery-grid">${items.map((item) => {
      const url = URL.createObjectURL(item.blob); liveUrls.add(url);
      const label = item.type === "clip" ? `${Math.round((item.durationMs || 0) / 1000)}s clip` : `${item.width || ""}${item.width ? " × " : ""}${item.height || ""}`;
      const preview = item.type === "clip" ? `<video src="${url}" controls preload="metadata" playsinline></video>` : `<img src="${url}" alt="Screenshot captured ${fmt.format(item.createdAt)}">`;
      return `<article class="media-gallery-card" data-capture-id="${item.id}"><div class="media-gallery-preview">${preview}</div><div class="media-gallery-card__copy"><span>${item.type === "clip" ? "GAMEPLAY CLIP" : "SCREENSHOT"}</span><strong>${fmt.format(item.createdAt)}</strong><small>${label}</small><button type="button" data-action="delete-capture" data-capture-id="${item.id}">Delete</button></div></article>`;
    }).join("")}</div>`;
  } catch (error) {
    host.innerHTML = `<div class="library-empty"><span>!</span><h2>Gallery could not open</h2><p>${String(error?.message || "Capture storage is unavailable.")}</p></div>`;
  }
  return () => releaseUrls();
}

export async function removeCapture(id) {
  await deleteCapture(id);
  return activateMediaGallery();
}

export function achievementsScreen() {
  return page({
    title: "Achievements",
    description: "Progress, unlocks, rarity, and completion history.",
    eyebrow: "Games",
    className: "achievements-page",
    body: `<section class="achievements-summary"><div><span class="eyebrow">PARA Score</span><strong>0</strong><small>No unlocks yet</small></div><div><span class="eyebrow">Completed</span><strong>0%</strong><small>Across supported games</small></div></section><div class="library-empty achievements-empty"><span>◇</span><h2>No achievements yet</h2><p>Achievement lists appear here when an installed game provides PARA achievement definitions.</p><button class="action-button" data-route="games" data-autofocus="true">Open Games</button></div>`,
  });
}
