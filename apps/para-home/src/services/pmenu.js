import { escapeHtml } from "./para-api.js";

const DB_NAME = "para-home-styles-v1";
const DB_VERSION = 1;
const PACK_STORE = "packs";
const ASSET_STORE = "assets";
const ACTIVE_KEY = "para.pmenu.active.v1";
const MANIFEST_KEY = "para.pmenu.active-manifest.v1";
const MAX_FILES = 160;
const MAX_ASSET_BYTES = 24 * 1024 * 1024;
const ALLOWED_ASSET_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/webm",
]);

const DEFAULT_ITEMS = Object.freeze([
  { id: "games", label: "Games", route: "games", position: [1, 1] },
  { id: "apps", label: "Apps", route: "apps", position: [2, 1] },
  { id: "store", label: "ParaStore", route: "parastore", position: [3, 1] },
  { id: "music", label: "Music", route: "music", position: [4, 1] },
  { id: "files", label: "Files", route: "files", position: [1, 2] },
  { id: "media", label: "Media", route: "media-gallery", position: [2, 2] },
  { id: "friends", label: "Friends", route: "friends", position: [3, 2] },
  { id: "settings", label: "Settings", route: "settings", position: [4, 2] },
]);

let activeManifestCache = readActiveManifest();
let activeObjectUrls = [];

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB is unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACK_STORE)) db.createObjectStore(PACK_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open Home Style storage"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Home Style storage failed"));
    tx.onabort = () => reject(tx.error || new Error("Home Style storage aborted"));
  });
}

function readActiveManifest() {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && value.id ? value : null;
  } catch {
    return null;
  }
}

function clearObjectUrls() {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];
}

function cleanPath(value) {
  const path = String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.includes("../") || path === ".." || /^[a-z]+:/i.test(path)) return "";
  return path.split("/").filter((part) => part && part !== ".").join("/");
}

function unquote(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\([\\"'])/g, "$1");
  }
  return trimmed;
}

function stripComment(line) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") quote = quote === char ? "" : quote || char;
    if (!quote && char === "#") return line.slice(0, index);
  }
  return line;
}

function parseProperty(line) {
  const match = line.match(/^([a-zA-Z][\w-]*)\s*(?:=\s*|\s+)(.+)$/);
  if (!match) return null;
  return [match[1].toLowerCase(), unquote(match[2])];
}

function parseBool(value, fallback = false) {
  if (/^(true|yes|on|1)$/i.test(value)) return true;
  if (/^(false|no|off|0)$/i.test(value)) return false;
  return fallback;
}

function asInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function routeIsSafe(route) {
  return /^[a-z0-9][a-z0-9-]*$/i.test(route || "");
}

export function parsePmenu(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/).map((line) => stripComment(line).trim()).filter(Boolean);
  if (!lines.length || !/^@pmenu\s+1$/i.test(lines[0])) throw new Error("This is not a PMENU v1 file");

  const manifest = {
    format: "pmenu",
    formatVersion: 1,
    id: "",
    name: "Untitled Home Style",
    author: "Unknown",
    version: "1.0.0",
    description: "",
    layout: { type: "channel-grid", columns: 4, rows: 3, gap: 18 },
    background: "",
    preview: "",
    accent: "#9b5cff",
    showClock: true,
    showProfile: true,
    sounds: {},
    items: [],
  };

  let block = "root";
  let currentItem = null;
  for (const raw of lines.slice(1)) {
    const open = raw.match(/^(menu|layout|item|sounds)\b(?:\s+([^\{]+?))?\s*\{$/i);
    if (open) {
      const type = open[1].toLowerCase();
      const arg = unquote(open[2] || "");
      if (type === "menu") {
        block = "menu";
        if (arg) manifest.name = arg;
      } else if (type === "layout") {
        block = "layout";
        if (arg) manifest.layout.type = arg.toLowerCase();
      } else if (type === "sounds") {
        block = "sounds";
      } else {
        if (!/^[a-z0-9][\w-]*$/i.test(arg)) throw new Error(`Invalid item id: ${arg || "(missing)"}`);
        currentItem = { id: arg, label: arg, route: "", icon: "", position: [1, 1], size: [1, 1] };
        manifest.items.push(currentItem);
        block = "item";
      }
      continue;
    }
    if (raw === "}") {
      block = "root";
      currentItem = null;
      continue;
    }
    const property = parseProperty(raw);
    if (!property) continue;
    const [key, value] = property;
    if (block === "item" && currentItem) {
      if (key === "label") currentItem.label = value.slice(0, 64);
      else if (key === "route" && routeIsSafe(value)) currentItem.route = value;
      else if (key === "icon") currentItem.icon = cleanPath(value);
      else if (key === "position") {
        const [x, y] = value.split(/[\s,]+/).map(Number);
        currentItem.position = [Math.max(1, x || 1), Math.max(1, y || 1)];
      } else if (key === "size") {
        const [w, h] = value.split(/[\s,]+/).map(Number);
        currentItem.size = [Math.max(1, Math.min(4, w || 1)), Math.max(1, Math.min(3, h || 1))];
      }
      continue;
    }
    if (block === "layout") {
      if (key === "type") manifest.layout.type = value.toLowerCase();
      else if (key === "columns") manifest.layout.columns = asInt(value, 4, 1, 8);
      else if (key === "rows") manifest.layout.rows = asInt(value, 3, 1, 6);
      else if (key === "gap") manifest.layout.gap = asInt(value, 18, 0, 64);
      continue;
    }
    if (block === "sounds") {
      if (["move", "select", "back", "music"].includes(key)) manifest.sounds[key] = cleanPath(value);
      continue;
    }
    if (key === "id") manifest.id = value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 80);
    else if (key === "name") manifest.name = value.slice(0, 80);
    else if (key === "author") manifest.author = value.slice(0, 80);
    else if (key === "version") manifest.version = value.slice(0, 32);
    else if (key === "description") manifest.description = value.slice(0, 180);
    else if (key === "background") manifest.background = cleanPath(value);
    else if (key === "preview") manifest.preview = cleanPath(value);
    else if (key === "accent" && /^#[0-9a-f]{6}$/i.test(value)) manifest.accent = value;
    else if (key === "show-clock") manifest.showClock = parseBool(value, true);
    else if (key === "show-profile") manifest.showProfile = parseBool(value, true);
  }

  if (!manifest.id) throw new Error("PMENU is missing an id");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.id)) throw new Error("PMENU id contains unsupported characters");
  if (!new Set(["channel-grid", "grid"]).has(manifest.layout.type)) throw new Error(`Unsupported layout: ${manifest.layout.type}`);
  if (!manifest.items.length) manifest.items = DEFAULT_ITEMS.map((item) => ({ ...item, size: [1, 1], icon: "" }));
  manifest.items = manifest.items.filter((item) => item.route && routeIsSafe(item.route)).slice(0, 48);
  if (!manifest.items.length) throw new Error("PMENU needs at least one item with a valid route");
  return manifest;
}

function commonRoot(files) {
  const paths = files.map((file) => String(file.webkitRelativePath || file.name).replaceAll("\\", "/"));
  const first = paths[0]?.split("/")[0] || "";
  return first && paths.every((path) => path.startsWith(`${first}/`)) ? `${first}/` : "";
}

function relativeFileMap(files) {
  const root = commonRoot(files);
  return new Map(files.map((file) => {
    const raw = String(file.webkitRelativePath || file.name).replaceAll("\\", "/");
    return [cleanPath(root && raw.startsWith(root) ? raw.slice(root.length) : raw), file];
  }).filter(([path]) => path));
}

function referencedAssets(manifest) {
  const refs = new Set([manifest.background, manifest.preview, ...Object.values(manifest.sounds || {})].filter(Boolean));
  manifest.items.forEach((item) => { if (item.icon) refs.add(item.icon); });
  return refs;
}

export async function installPmenuFolder(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) throw new Error("Choose a Home Style folder");
  if (files.length > MAX_FILES) throw new Error(`Home Style contains too many files (${files.length}/${MAX_FILES})`);
  const map = relativeFileMap(files);
  const definitions = [...map.entries()].filter(([path]) => path.toLowerCase().endsWith(".pmenu"));
  if (definitions.length !== 1) throw new Error("The folder must contain exactly one .pmenu file");
  const [definitionPath, definitionFile] = definitions[0];
  if (definitionPath.includes("/")) throw new Error("Put the .pmenu file at the top of the Home Style folder");
  const manifest = parsePmenu(await definitionFile.text());
  const refs = referencedAssets(manifest);
  let totalBytes = 0;
  for (const path of refs) {
    const file = map.get(path);
    if (!file) throw new Error(`Missing asset: ${path}`);
    if (!ALLOWED_ASSET_TYPES.has(file.type)) throw new Error(`Unsupported asset type: ${path}`);
    totalBytes += file.size;
  }
  if (totalBytes > MAX_ASSET_BYTES) throw new Error("Home Style assets exceed 24 MB");

  const db = await openDb();
  const tx = db.transaction([PACK_STORE, ASSET_STORE], "readwrite");
  const packs = tx.objectStore(PACK_STORE);
  const assets = tx.objectStore(ASSET_STORE);
  const old = await new Promise((resolve) => {
    const request = packs.get(manifest.id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  for (const path of old?.assets || []) assets.delete(`${manifest.id}:${path}`);
  for (const path of refs) {
    const file = map.get(path);
    assets.put({ key: `${manifest.id}:${path}`, packId: manifest.id, path, blob: file, type: file.type, size: file.size });
  }
  packs.put({ id: manifest.id, manifest, assets: [...refs], installedAt: Date.now() });
  await txDone(tx);
  db.close();
  return manifest;
}

export async function listPmenuPacks() {
  if (!globalThis.indexedDB) return [];
  const db = await openDb();
  const tx = db.transaction(PACK_STORE, "readonly");
  const values = await new Promise((resolve, reject) => {
    const request = tx.objectStore(PACK_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return values.sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0));
}

export async function removePmenuPack(id) {
  const db = await openDb();
  const tx = db.transaction([PACK_STORE, ASSET_STORE], "readwrite");
  const packs = tx.objectStore(PACK_STORE);
  const assets = tx.objectStore(ASSET_STORE);
  const pack = await new Promise((resolve) => {
    const request = packs.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  for (const path of pack?.assets || []) assets.delete(`${id}:${path}`);
  packs.delete(id);
  await txDone(tx);
  db.close();
  if (activeManifestCache?.id === id) clearActivePmenu();
}

export function activePmenuManifest() {
  return activeManifestCache;
}

export function setActivePmenu(manifest) {
  activeManifestCache = manifest ? JSON.parse(JSON.stringify(manifest)) : null;
  if (activeManifestCache) {
    localStorage.setItem(ACTIVE_KEY, activeManifestCache.id);
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(activeManifestCache));
  } else {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(MANIFEST_KEY);
  }
  document.documentElement.dataset.pmenu = activeManifestCache?.id || "default";
  return activeManifestCache;
}

export function clearActivePmenu() {
  clearObjectUrls();
  setActivePmenu(null);
}

async function assetBlob(packId, path) {
  const db = await openDb();
  const tx = db.transaction(ASSET_STORE, "readonly");
  const value = await new Promise((resolve, reject) => {
    const request = tx.objectStore(ASSET_STORE).get(`${packId}:${path}`);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return value?.blob || null;
}

export async function resolvePmenuAsset(packId, path) {
  if (!packId || !path) return "";
  const blob = await assetBlob(packId, path);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  activeObjectUrls.push(url);
  return url;
}

function homeItem(item, columns) {
  const [x, y] = item.position || [1, 1];
  const [w, h] = item.size || [1, 1];
  const icon = item.icon
    ? `<img data-pmenu-asset="${escapeHtml(item.icon)}" alt="" />`
    : `<span class="pmenu-channel__fallback" aria-hidden="true">${escapeHtml(item.label.slice(0, 1).toUpperCase())}</span>`;
  return `<button type="button" class="pmenu-channel" data-route="${escapeHtml(item.route)}" data-focus-id="pmenu:${escapeHtml(item.id)}" style="--pmenu-x:${Math.min(columns, Math.max(1, x))};--pmenu-y:${Math.max(1, y)};--pmenu-w:${w};--pmenu-h:${h}"><span class="pmenu-channel__art">${icon}</span><strong>${escapeHtml(item.label)}</strong></button>`;
}

export function customHomeScreen(manifest, profile = "P1") {
  if (!manifest) return "";
  const columns = manifest.layout?.columns || 4;
  const rows = manifest.layout?.rows || 3;
  const gap = manifest.layout?.gap ?? 18;
  const backgroundStyle = manifest.background ? "" : `background:radial-gradient(circle at 50% 10%,${manifest.accent}33,transparent 45%),#08070c;`;
  return `<section class="pmenu-home" data-pmenu-id="${escapeHtml(manifest.id)}" aria-label="${escapeHtml(manifest.name)}" style="--pmenu-accent:${escapeHtml(manifest.accent)};--pmenu-columns:${columns};--pmenu-rows:${rows};--pmenu-gap:${gap}px;${backgroundStyle}"><div class="pmenu-home__background" ${manifest.background ? `data-pmenu-background="${escapeHtml(manifest.background)}"` : ""}></div><header class="pmenu-home__header"><button type="button" class="pmenu-home__brand" data-action="open-control-center" data-focus-id="pmenu:para"><span>◉</span><strong>PARA</strong></button><div class="pmenu-home__title"><small>Home Style</small><strong>${escapeHtml(manifest.name)}</strong></div><div class="pmenu-home__status">${manifest.showClock ? '<time data-clock>--:--</time>' : ""}${manifest.showProfile ? `<button type="button" data-route="account" data-focus-id="pmenu:profile">${escapeHtml(profile)}</button>` : ""}</div></header><main class="pmenu-channel-grid" data-focus-zone="pmenu-grid">${manifest.items.map((item) => homeItem(item, columns)).join("")}</main><footer class="pmenu-home__footer"><span>${escapeHtml(manifest.author)}</span><button type="button" data-route="home-styles" data-focus-id="pmenu:customize">Customize Home</button></footer></section>`;
}

export function activateCustomHome({ focus } = {}) {
  const root = document.querySelector(".pmenu-home");
  const manifest = activeManifestCache;
  if (!root || !manifest) return () => {};
  let alive = true;
  clearObjectUrls();
  const applyAssets = async () => {
    const background = root.querySelector("[data-pmenu-background]");
    if (background) {
      const url = await resolvePmenuAsset(manifest.id, background.dataset.pmenuBackground);
      if (alive && url) background.style.backgroundImage = `url("${url}")`;
    }
    for (const image of root.querySelectorAll("[data-pmenu-asset]")) {
      const url = await resolvePmenuAsset(manifest.id, image.dataset.pmenuAsset);
      if (alive && url) image.src = url;
    }
  };
  void applyAssets().then(() => focus?.focusFirst?.());
  return () => { alive = false; clearObjectUrls(); };
}
