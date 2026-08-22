import { getState } from "../state.js";
import { paraApi, escapeHtml, formatBytes } from "../services/para-api.js";
import { page } from "../ui/components.js";

function applicationCard(application, index) {
  const name = escapeHtml(application.name);
  const route = application.launch?.kind === "route" ? `data-route="${escapeHtml(application.launch.route)}"` : `data-action="launch-linux-app" data-app-id="${escapeHtml(application.id)}" data-app-name="${name}"`;
  const icon = application.icon
    ? `<img src="${application.icon}" alt="" />`
    : application.id === "para:bear-home"
      ? `<span class="app-icon app-icon--bear-home" aria-hidden="true"><i></i></span>`
      : `<span class="app-icon app-icon--letter" aria-hidden="true">${name.slice(0, 1)}</span>`;
  return `<button class="installed-app" ${route} data-app-category="${escapeHtml(application.category)}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="installed-app__icon">${icon}</span><span class="installed-app__name">${name}</span></button>`;
}

export function appsScreen() {
  return page({
    title: "Apps",
    description: "Applications available on this PARA system.",
    eyebrow: "Library",
    className: "apps-page",
    body: `<div class="app-library-toolbar" data-app-categories hidden></div><div class="installed-app-grid" data-app-library><div class="library-loading"><span></span><strong>Finding applications…</strong></div></div>`,
  });
}

export async function activateApps({ focus }) {
  const container = document.querySelector("[data-app-library]");
  const categories = document.querySelector("[data-app-categories]");
  if (!container || !categories) return;
  try {
    const payload = await paraApi.applications();
    const applications = payload.applications || [];
    if (!applications.length) {
      container.innerHTML = `<div class="library-empty"><span>▦</span><h2>No applications available</h2></div>`;
      return;
    }
    categories.hidden = false;
    categories.innerHTML = payload.categories.map((category, index) => `<button data-action="filter-apps" data-app-filter="${escapeHtml(category)}" class="${index === 0 ? "is-active" : ""}">${escapeHtml(category)}</button>`).join("");
    container.innerHTML = applications.map(applicationCard).join("");
    focus.focusFirst();
  } catch {
    container.innerHTML = `<div class="library-empty"><span>▦</span><h2>Apps couldn’t be loaded</h2><button class="action-button" data-action="reload-apps" data-autofocus="true">Try again</button></div>`;
    focus.focusFirst();
  }
}

export function filterApps(category) {
  document.querySelectorAll("[data-app-category]").forEach((card) => { card.hidden = category !== "All Apps" && card.dataset.appCategory !== category; });
  document.querySelectorAll("[data-app-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.appFilter === category));
}

export function bearHomeScreen() {
  return `<section class="bear-home-room" aria-label="Bear Home file explorer"><div class="console-art-frame bear-home-room__frame"><img class="console-art-frame__image bear-home-room__art" src="./assets/bear-home-room.png" alt="A cozy wooden room with a television, shelves, record player, desk, door, storage nook, and the PARA bear" /><div data-bear-hotspots></div><div class="bear-controller-prompts"><span><b data-prompt="confirm">Enter</b> Open</span><span><b data-prompt="back">Esc</b> Back</span></div><aside class="bear-menu" data-bear-menu hidden><div class="bear-menu__head"><h2>Bear Home</h2><button data-action="bear-menu-close" aria-label="Close">×</button></div><button data-route="apps" data-autofocus="true">Apps</button><button data-route="storage">Storage</button><button data-route="settings">Settings</button><button data-route="home">PARA Home</button></aside></div></section>`;
}

function bearHotspot({ label, collection, x, y, w, h, action = "open-collection", autofocus = false, className = "" }) {
  return `<button class="bear-hotspot ${className}" style="--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%" data-action="${action}" ${collection ? `data-collection="${collection}"` : ""} data-focus-label="${label}" aria-label="${label}" ${autofocus ? "data-autofocus='true'" : ""}></button>`;
}

export async function activateBearHome({ focus }) {
  const container = document.querySelector("[data-bear-hotspots]");
  if (!container) return;
  const available = [];
  try {
    const [directories, storage] = await Promise.all([paraApi.directories(), paraApi.storage()]);
    const readable = new Set((directories.directories || []).filter((item) => item.available && item.readable).map((item) => item.id));
    if (readable.has("videos")) available.push({ label: "Videos", collection: "videos", x: .5, y: 22.5, w: 18.2, h: 34 });
    if ((storage.mounts || []).some((item) => item.optical)) available.push({ label: "Discs", collection: "discs", x: 27.7, y: 14.5, w: 9.4, h: 40 });
    if (readable.has("music")) available.push({ label: "Music", collection: "music", x: 60.2, y: 19.5, w: 15.1, h: 33 });
    if (readable.has("documents")) available.push({ label: "Documents", collection: "documents", x: 74.4, y: 32.5, w: 14.5, h: 31 });
    if ((storage.mounts || []).some((item) => item.external && !item.optical)) available.push({ label: "External Drives", collection: "external", x: 88.5, y: 19, w: 10.5, h: 47 });
    if (readable.has("downloads")) available.push({ label: "Downloads", collection: "downloads", x: 66.7, y: 70.2, w: 17.2, h: 27 });
  } catch {
    // Bear Home remains a clean room when the filesystem cannot be read.
  }
  available.push({ label: "Bear Home menu", x: 39.5, y: 45.5, w: 10, h: 27, action: "bear-menu", className: "bear-hotspot--bear" });
  container.innerHTML = available.map((item, index) => bearHotspot({ ...item, autofocus: index === 0 })).join("");
  focus.focusFirst();
}

export function filesScreen() {
  const collection = getState().fileCollection || "downloads";
  const names = { videos: "Videos", discs: "Discs", music: "Music", documents: "Documents", external: "External Drives", downloads: "Downloads" };
  return page({ title: names[collection] || "Files", description: "Bear Home", eyebrow: "Files", className: "files-page", body: `<div class="file-browser" data-file-browser data-collection="${escapeHtml(collection)}"><div class="library-loading"><span></span><strong>Opening ${escapeHtml(names[collection] || "Files")}…</strong></div></div>` });
}

export function downloadsScreen() {
  return page({ title: "Downloads", description: "Files in your Downloads folder.", eyebrow: "Files", className: "files-page", body: `<div class="file-browser" data-file-browser data-collection="downloads"><div class="library-loading"><span></span><strong>Opening Downloads…</strong></div></div>` });
}

export async function activateFiles() {
  const container = document.querySelector("[data-file-browser]");
  if (!container) return;
  const identifier = container.dataset.collection;
  try {
    const payload = await paraApi.collection(identifier);
    if (!payload.items?.length) {
      container.innerHTML = `<div class="library-empty"><span>▱</span><h2>${payload.available ? "This location is empty" : "Nothing is connected"}</h2></div>`;
      return;
    }
    container.innerHTML = `<div class="file-list" role="list">${payload.items.map((item) => `<div class="file-item" role="listitem"><span class="file-item__icon">${item.kind === "folder" ? "▱" : item.kind === "drive" ? "▯" : "▤"}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.kind === "drive" && Number.isFinite(item.free_gb) ? `${item.free_gb} GB free` : formatBytes(item.size)}</small></span></div>`).join("")}</div>`;
  } catch {
    container.innerHTML = `<div class="library-empty"><span>▱</span><h2>This location couldn’t be opened</h2></div>`;
  }
}

export async function launchLinuxApplication(id) {
  return paraApi.launchApplication(id);
}
