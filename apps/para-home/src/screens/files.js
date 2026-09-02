import { paraApi, escapeHtml, formatBytes } from "../services/para-api.js";
import { brand, hints } from "../ui/components.js";
import { getProfileRuntime } from "../state.js";
import { listCaptures } from "../services/capture-service.js";

const VIEW_MODES = ["details", "list", "large", "small"];
const SORT_MODES = ["name", "modified", "type", "size"];
let activeBackHandler = null;

function readChoice(key, choices, fallback) {
  try {
    const value = localStorage.getItem(key);
    return choices.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeChoice(key, value) {
  try { localStorage.setItem(key, value); } catch { /* the current session keeps the choice */ }
}

function fileGlyph(item) {
  const type = String(item.type || "").toLowerCase();
  const kind = item.kind === "folder" ? "folder" : type.includes("image") ? "image" : type.includes("video") ? "video" : type.includes("audio") ? "audio" : type.includes("text") ? "text" : "file";
  return `<span class="files-glyph files-glyph--${kind}" aria-hidden="true"><i></i></span>`;
}

function modifiedLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function filesShell() {
  return `<section class="para-files" aria-label="PARA Files">
    <header class="files-titlebar">
      <div class="files-brand">${brand()}<span>Files</span></div>
      <button class="files-home-button" type="button" data-route="home" aria-label="Return to PARA Home">⌂</button>
    </header>
    <div class="files-toolbar" role="toolbar" aria-label="File navigation">
      <div class="files-toolbar__nav">
        <button type="button" data-files-command="back" aria-label="Back" disabled>‹</button>
        <button type="button" data-files-command="forward" aria-label="Forward" disabled>›</button>
        <button type="button" data-files-command="up" aria-label="Up one folder" disabled>↑</button>
        <button type="button" data-files-command="refresh" aria-label="Refresh">↻</button>
      </div>
      <form class="files-address" data-files-address><span aria-hidden="true">⌂</span><input type="text" aria-label="Current path" autocomplete="off" spellcheck="false" /></form>
      <label class="files-search"><span aria-hidden="true">⌕</span><input type="search" data-files-search placeholder="Search" aria-label="Search files" autocomplete="off" /></label>
      <button class="files-toolbar__new" type="button" data-files-command="new-folder" hidden><span>＋</span>New Folder</button>
      <button type="button" data-files-command="view" aria-label="Change view"><span data-files-view-label>Details</span></button>
      <button type="button" data-files-command="sort" aria-label="Change sort"><span data-files-sort-label>Name</span></button>
    </div>
    <div class="files-workspace">
      <aside class="files-sidebar" aria-label="Locations"><div data-files-places></div></aside>
      <main class="files-main">
        <header class="files-location-heading"><div><h1 data-files-location-name>Files</h1><span data-files-location-count></span></div><button type="button" data-files-command="options" aria-label="File options">•••</button></header>
        <div class="files-column-head" data-files-columns hidden><span>Name</span><span>Type</span><span>Size</span><span>Modified</span><span>Location</span></div>
        <div class="files-content" data-files-content aria-live="polite"><div class="files-loading"><i></i><span>Opening Files…</span></div></div>
      </main>
    </div>
    <footer class="files-status"><span data-files-status>Opening Files…</span>${hints({ context: true, options: true }).replace("<footer", "<div").replace('class="bottom-nav control-legend"', 'class="files-control-legend control-legend"').replace("</footer>", "</div>")}</footer>
    <div class="files-context" data-files-context hidden role="menu"></div>
    <div class="files-dialog" data-files-dialog hidden><section role="dialog" aria-modal="true"><div data-files-dialog-body></div></section></div>
  </section>`;
}

export function filesScreen() {
  return filesShell();
}

export function downloadsScreen() {
  return filesShell();
}

export function filesBack() {
  return activeBackHandler ? activeBackHandler() : false;
}

export function activateFiles({ focus, initialLocation = "home" }) {
  const root = document.querySelector(".para-files");
  if (!root) return () => {};
  const placesNode = root.querySelector("[data-files-places]");
  const contentNode = root.querySelector("[data-files-content]");
  const columnsNode = root.querySelector("[data-files-columns]");
  const contextNode = root.querySelector("[data-files-context]");
  const dialogNode = root.querySelector("[data-files-dialog]");
  const addressInput = root.querySelector("[data-files-address] input");
  const searchInput = root.querySelector("[data-files-search]");
  const model = {
    location: null,
    items: [],
    places: [],
    capabilities: {},
    selected: new Set(),
    anchor: -1,
    history: [],
    forward: [],
    clipboard: null,
    view: readChoice("para.files.view", VIEW_MODES, "details"),
    sort: readChoice("para.files.sort", SORT_MODES, "name"),
    showHidden: false,
    searchResults: null,
    contextItem: null,
    contextPlace: null,
  };
  let searchTimer = null;
  let alive = true;

  const normalLocation = () => model.location && model.location.kind === "folder";
  const visibleItems = () => {
    const source = model.searchResults || model.items;
    const rows = source.filter((item) => model.showHidden || !item.hidden);
    const factor = model.sort === "modified" ? (item) => item.modified || "" : model.sort === "type" ? (item) => item.type || "" : model.sort === "size" ? (item) => item.size ?? -1 : (item) => item.name || "";
    return [...rows].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
      const a = factor(left);
      const b = factor(right);
      return typeof a === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    });
  };

  function setStatus(text) {
    const status = root.querySelector("[data-files-status]");
    if (status) status.textContent = text;
  }

  function closeContext() {
    contextNode.hidden = true;
    contextNode.innerHTML = "";
    model.contextItem = null;
    model.contextPlace = null;
  }

  function closeDialog(restore = true) {
    if (dialogNode.hidden) return false;
    dialogNode.hidden = true;
    dialogNode.querySelector("[data-files-dialog-body]").innerHTML = "";
    if (restore) focus.focusFirst();
    return true;
  }

  function selectedItems() {
    return (model.searchResults || model.items).filter((item) => model.selected.has(item.path));
  }

  function renderPlaces() {
    const groups = { locations: [], devices: [], remote: [] };
    for (const place of model.places) {
      if (place.kind === "network" || place.kind === "cloud") groups.remote.push(place);
      else (place.kind === "storage" || place.kind === "drive" || place.kind === "disc" ? groups.devices : groups.locations).push(place);
    }
    const row = (place, index) => {
      const selected = place.path === model.location?.path || place.id === model.location?.id;
      const disabled = place.available === false && !model.capabilities.volumes;
      const icon = place.kind === "home" ? "⌂" : place.kind === "recent" ? "↺" : place.kind === "trash" ? "♲" : place.kind === "disc" ? "◉" : place.kind === "network" || place.kind === "cloud" ? "⌁" : place.kind === "drive" || place.kind === "storage" ? "▯" : "▱";
      return `<button type="button" class="files-place ${selected ? "is-current" : ""}" data-files-place="${escapeHtml(place.id)}" ${disabled ? "disabled aria-disabled='true'" : ""} ${index === 0 ? "data-autofocus='true'" : ""}><span class="files-place__icon" aria-hidden="true">${icon}</span><strong>${escapeHtml(place.name)}</strong>${place.mounted === false ? `<small>Not mounted</small>` : ""}</button>`;
    };
    placesNode.innerHTML = `${groups.locations.length ? `<section><h2>Locations</h2>${groups.locations.map(row).join("")}</section>` : ""}${groups.devices.length ? `<section><h2>Devices</h2>${groups.devices.map(row).join("")}</section>` : ""}${groups.remote.length ? `<section><h2>Network & Cloud</h2>${groups.remote.map(row).join("")}</section>` : ""}`;
  }

  function entryMarkup(item, index) {
    const selected = model.selected.has(item.path);
    const size = item.kind === "folder" ? "—" : formatBytes(item.size);
    const location = item.location || "";
    return `<button type="button" class="files-entry files-entry--${model.view} ${selected ? "is-selected" : ""}" data-files-entry="${index}" data-files-path="${escapeHtml(item.path)}" aria-pressed="${selected}" ${model.capabilities.write ? "draggable='true'" : ""}>
      <span class="files-entry__name">${fileGlyph(item)}<span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type || "")}</small></span></span>
      <span class="files-entry__type">${escapeHtml(item.type || "")}</span>
      <span class="files-entry__size">${escapeHtml(size)}</span>
      <span class="files-entry__modified">${escapeHtml(modifiedLabel(item.modified))}</span>
      <span class="files-entry__location">${escapeHtml(location)}</span>
    </button>`;
  }

  function renderEntries({ keepFocus = false } = {}) {
    const rows = visibleItems();
    const previous = keepFocus ? focus.current?.dataset.filesPath : null;
    contentNode.className = `files-content files-content--${model.view}`;
    columnsNode.hidden = model.view !== "details";
    root.querySelector("[data-files-view-label]").textContent = model.view[0].toUpperCase() + model.view.slice(1);
    root.querySelector("[data-files-sort-label]").textContent = model.sort[0].toUpperCase() + model.sort.slice(1);
    if (!rows.length) {
      contentNode.innerHTML = `<div class="files-empty"><span>▱</span><h2>${model.searchResults ? "No matching files" : "This location is empty"}</h2></div>`;
    } else {
      contentNode.innerHTML = rows.map(entryMarkup).join("");
    }
    root.querySelector("[data-files-location-count]").textContent = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;
    const selectedCount = model.selected.size;
    setStatus(selectedCount ? `${selectedCount} selected` : `${rows.length} ${rows.length === 1 ? "item" : "items"}`);
    if (previous) {
      const match = [...root.querySelectorAll("[data-files-path]")].find((node) => node.dataset.filesPath === previous);
      if (match) focus.setCurrent(match, true);
    }
  }

  function updateToolbar() {
    root.querySelector("[data-files-command='back']").disabled = model.history.length === 0;
    root.querySelector("[data-files-command='forward']").disabled = model.forward.length === 0;
    root.querySelector("[data-files-command='up']").disabled = !model.location?.parent;
    const create = root.querySelector("[data-files-command='new-folder']");
    create.hidden = !(model.capabilities.write && normalLocation() && model.location.writable);
    addressInput.value = model.location?.kind === "folder" ? model.location.path : model.location?.display_path || "";
  }

  async function renderWebEditionHome() {
    const runtime = getProfileRuntime();
    let captures = [];
    try { captures = await listCaptures(); } catch { captures = []; }
    const downloads = Array.isArray(runtime.downloads) ? runtime.downloads : [];
    const saveData = Array.isArray(runtime.saveData) ? runtime.saveData : [];
    model.location = { id: "para-web", path: "para:", display_path: "PARA Files", name: "PARA Files", parent: null, kind: "virtual", writable: false };
    model.items = [];
    model.places = [];
    model.capabilities = { open: true, write: false, trash: false, volumes: false };
    root.querySelector("[data-files-location-name]").textContent = "PARA Files";
    root.querySelector("[data-files-location-count]").textContent = "Web Edition collections";
    placesNode.innerHTML = `<button type="button" class="files-place is-active" data-route="files"><span class="files-place__icon">⌂</span><span>PARA Files</span></button><button type="button" class="files-place" data-route="media-gallery"><span class="files-place__icon">▣</span><span>Media Gallery</span></button><button type="button" class="files-place" data-route="downloads"><span class="files-place__icon">↓</span><span>Downloads</span></button><button type="button" class="files-place" data-route="saved-data"><span class="files-place__icon">◇</span><span>Saved Data</span></button>`;
    columnsNode.hidden = true;
    contentNode.innerHTML = `<section class="files-web-home"><header><span>WEB EDITION</span><h2>Your PARA collections are here.</h2><p>The browser build cannot silently browse the whole PC, so Files surfaces PARA-managed content instead of showing an empty server folder.</p></header><div class="files-web-grid"><button type="button" data-route="media-gallery" data-autofocus="true"><span>▣</span><strong>Media Gallery</strong><small>${captures.length} ${captures.length === 1 ? "capture" : "captures"}</small></button><button type="button" data-route="downloads"><span>↓</span><strong>Downloads</strong><small>${downloads.length} ${downloads.length === 1 ? "item" : "items"}</small></button><button type="button" data-route="saved-data"><span>◇</span><strong>Saved Data</strong><small>${saveData.length} ${saveData.length === 1 ? "record" : "records"}</small></button><button type="button" data-route="parastore"><span>P</span><strong>ParaStore</strong><small>Games and app content</small></button></div></section>`;
    setStatus(`${captures.length + downloads.length + saveData.length} PARA-managed items`);
    updateToolbar();
    focus.focusFirst();
  }

  async function load(location, { record = true, focusContent = false } = {}) {
    closeContext();
    closeDialog(false);
    contentNode.innerHTML = `<div class="files-loading"><i></i><span>Opening Files…</span></div>`;
    setStatus("Opening Files…");
    try {
      const payload = await paraApi.browseFiles(location);
      if (!alive) return;
      if (record && model.location?.path && model.location.path !== payload.location.path) {
        model.history.push(model.location.path);
        model.forward = [];
      }
      model.location = payload.location;
      model.items = payload.items || [];
      model.places = payload.places || [];
      model.capabilities = payload.capabilities || {};
      model.selected.clear();
      model.searchResults = null;
      searchInput.value = "";
      root.querySelector("[data-files-location-name]").textContent = payload.location.name || "Files";
      renderPlaces();
      renderEntries();
      updateToolbar();
      if (focusContent) {
        const first = contentNode.querySelector("[data-files-entry]");
        if (first) focus.setCurrent(first, true);
      }
    } catch {
      if (!alive) return;
      await renderWebEditionHome();
    }
  }

  async function refresh({ keepFocus = false } = {}) {
    if (!model.location) return;
    const previousPath = keepFocus ? focus.current?.dataset.filesPath : null;
    await load(model.location.path, { record: false });
    if (previousPath) {
      const target = [...root.querySelectorAll("[data-files-path]")].find((node) => node.dataset.filesPath === previousPath);
      if (target) focus.setCurrent(target, true);
    }
  }

  function selectEntry(item, index, event = {}) {
    const rows = visibleItems();
    if (event.shiftKey && model.anchor >= 0) {
      const [start, end] = [model.anchor, index].sort((a, b) => a - b);
      if (!event.ctrlKey && !event.metaKey) model.selected.clear();
      rows.slice(start, end + 1).forEach((row) => model.selected.add(row.path));
    } else if (event.ctrlKey || event.metaKey) {
      model.selected.has(item.path) ? model.selected.delete(item.path) : model.selected.add(item.path);
      model.anchor = index;
    } else {
      model.selected.clear();
      model.selected.add(item.path);
      model.anchor = index;
    }
    renderEntries({ keepFocus: true });
  }

  async function openEntry(item) {
    if (item.kind === "folder") {
      await load(item.path, { focusContent: true });
      return;
    }
    if (!model.capabilities.open) {
      setStatus(item.name);
      return;
    }
    try {
      await paraApi.fileAction("open", { paths: [item.path] });
      setStatus(`Opening ${item.name}`);
    } catch {
      setStatus(`${item.name} couldn’t be opened`);
    }
  }

  function dialogFrame(title, copy, controls) {
    dialogNode.hidden = false;
    dialogNode.querySelector("[data-files-dialog-body]").innerHTML = `<header><h2>${escapeHtml(title)}</h2><button type="button" data-files-dialog-close aria-label="Close">×</button></header>${copy ? `<p>${escapeHtml(copy)}</p>` : ""}<div class="files-dialog__content">${controls}</div>`;
    requestAnimationFrame(() => focus.setCurrent(dialogNode.querySelector("[data-autofocus='true']") || dialogNode.querySelector("button,input"), true));
  }

  function textDialog(kind, item = null) {
    const creating = kind === "create-folder" || kind === "create-file";
    const title = kind === "rename" ? "Rename" : kind === "create-file" ? "New text document" : "New folder";
    const value = kind === "rename" ? item?.name || "" : kind === "create-file" ? "New Text Document.txt" : "New Folder";
    dialogFrame(title, "", `<label class="files-dialog__field"><span>Name</span><input type="text" data-files-name value="${escapeHtml(value)}" data-autofocus="true" /></label><div class="files-dialog__actions"><button type="button" data-files-dialog-close>Cancel</button><button type="button" class="is-primary" data-files-dialog-confirm="${kind}">${creating ? "Create" : "Rename"}</button></div>`);
    const input = dialogNode.querySelector("[data-files-name]");
    input.select();
  }

  function propertiesDialog(item) {
    const rows = [
      ["Type", item.type || "File"],
      ["Size", item.kind === "folder" ? "—" : formatBytes(item.size)],
      ["Modified", modifiedLabel(item.modified) || "—"],
      ["Location", item.location || item.path],
      ["Readable", item.readable ? "Yes" : "No"],
      ["Writable", item.writable ? "Yes" : "No"],
    ];
    dialogFrame(item.name, "Properties", `<dl class="files-properties">${rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl><div class="files-dialog__actions"><button type="button" class="is-primary" data-files-dialog-close data-autofocus="true">Close</button></div>`);
  }

  function trashDialog(items, permanent = false) {
    const count = items.length;
    const title = permanent ? "Delete permanently?" : "Move to Trash?";
    const copy = permanent ? "This can’t be undone." : count === 1 ? items[0].name : `${count} selected items`;
    const action = permanent ? "delete" : "trash";
    const label = permanent ? "Delete" : "Move to Trash";
    dialogFrame(title, copy, `<div class="files-dialog__actions"><button type="button" data-files-dialog-close data-autofocus="true">Cancel</button><button type="button" class="is-primary" data-files-dialog-confirm="${action}">${label}</button></div>`);
  }

  async function perform(action, payload, success) {
    closeContext();
    setStatus("Working…");
    try {
      await paraApi.fileAction(action, payload);
      setStatus(success);
      await refresh();
    } catch {
      setStatus("That action couldn’t be completed");
    }
  }

  function copySelection(kind) {
    const items = selectedItems();
    if (!model.capabilities.write || !items.length) return;
    model.clipboard = { kind, paths: items.map((item) => item.path) };
    setStatus(`${items.length} ${kind === "move" ? "cut" : "copied"}`);
    closeContext();
  }

  async function pasteSelection(destination = model.location?.path) {
    if (!model.capabilities.write || !model.clipboard?.paths.length || !destination || !normalLocation()) return;
    const { kind, paths } = model.clipboard;
    await perform(kind, { paths, destination }, kind === "move" ? "Moved" : "Copied");
    if (kind === "move") model.clipboard = null;
  }

  function contextButtons(item, place) {
    const items = selectedItems();
    const one = item || (items.length === 1 ? items[0] : null);
    const inTrash = model.location?.kind === "trash";
    const buttons = [];
    if (place?.device) {
      if (place.mounted) buttons.push(["Open", "place-open"], ["Unmount", "volume-unmount"], ["Eject", "volume-eject"]);
      else if (model.capabilities.volumes) buttons.push(["Mount", "volume-mount"]);
      return buttons;
    }
    if (one && one.readable && (one.kind === "folder" || model.capabilities.open)) buttons.push(["Open", "open"]);
    if (inTrash && one?.trash_uri && model.capabilities.trash) buttons.push(["Restore", "restore"]);
    if (inTrash && model.capabilities.write && items.length) buttons.push(["Delete permanently", "delete"]);
    if (!inTrash && model.capabilities.write && items.length && items.every((row) => row.readable)) buttons.push(["Copy", "copy"]);
    if (!inTrash && model.capabilities.write && items.length && items.every((row) => row.parent_writable)) buttons.push(["Cut", "cut"]);
    if (!inTrash && model.clipboard?.paths.length && normalLocation() && model.location.writable) buttons.push(["Paste", "paste"]);
    if (!inTrash && model.capabilities.write && items.length === 1 && one.parent_writable) buttons.push(["Rename", "rename"]);
    if (!inTrash && model.capabilities.trash && items.length && items.every((row) => row.parent_writable)) buttons.push(["Move to Trash", "trash"]);
    if (normalLocation() && model.capabilities.write && !items.length) buttons.push(["New Folder", "new-folder"], ["New Text Document", "new-file"]);
    if (one) buttons.push(["Properties", "properties"]);
    return buttons;
  }

  function openContext(target, item = null, place = null, point = null) {
    let anchor = target;
    if (item && !model.selected.has(item.path)) {
      model.selected.clear();
      model.selected.add(item.path);
      renderEntries({ keepFocus: true });
      anchor = [...root.querySelectorAll("[data-files-path]")].find((node) => node.dataset.filesPath === item.path) || target;
    }
    const buttons = contextButtons(item, place);
    if (!buttons.length) return;
    model.contextItem = item;
    model.contextPlace = place;
    contextNode.innerHTML = buttons.map(([label, command], index) => `<button type="button" role="menuitem" data-files-context-command="${command}" ${index === 0 ? "data-autofocus='true'" : ""}>${escapeHtml(label)}</button>`).join("");
    contextNode.hidden = false;
    const rect = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, bottom: innerHeight / 2 };
    const left = point?.x ?? rect.left;
    const top = point?.y ?? rect.bottom;
    contextNode.style.left = `${Math.min(left, innerWidth - 240)}px`;
    contextNode.style.top = `${Math.min(top, innerHeight - 330)}px`;
    requestAnimationFrame(() => focus.setCurrent(contextNode.querySelector("[data-autofocus='true']"), true));
  }

  async function runContext(command) {
    const item = model.contextItem || (selectedItems().length === 1 ? selectedItems()[0] : null);
    const place = model.contextPlace;
    closeContext();
    if (command === "open" && item) return openEntry(item);
    if (command === "place-open" && place?.path) return load(place.path, { focusContent: true });
    if (command === "copy") return copySelection("copy");
    if (command === "cut") return copySelection("move");
    if (command === "paste") return pasteSelection();
    if (command === "rename" && item) return textDialog("rename", item);
    if (command === "trash") return trashDialog(selectedItems());
    if (command === "delete") return trashDialog(selectedItems(), true);
    if (command === "restore" && item?.trash_uri) return perform("restore", { trash_uri: item.trash_uri }, "Restored");
    if (command === "properties" && item) return propertiesDialog(item);
    if (command === "new-folder") return textDialog("create-folder");
    if (command === "new-file") return textDialog("create-file");
    if (command.startsWith("volume-") && place?.device) {
      const action = command.replace("volume-", "");
      closeContext();
      setStatus("Working…");
      try {
        await paraApi.volumeAction(action, place.device);
        setStatus(action === "mount" ? "Mounted" : action === "unmount" ? "Unmounted" : "Ejected");
        await refresh();
      } catch { setStatus("That device action couldn’t be completed"); }
    }
  }

  async function command(name) {
    if (name === "back" && model.history.length) {
      const destination = model.history.pop();
      if (model.location?.path) model.forward.push(model.location.path);
      return load(destination, { record: false, focusContent: true });
    }
    if (name === "forward" && model.forward.length) {
      const destination = model.forward.pop();
      if (model.location?.path) model.history.push(model.location.path);
      return load(destination, { record: false, focusContent: true });
    }
    if (name === "up" && model.location?.parent) return load(model.location.parent, { focusContent: true });
    if (name === "refresh") return refresh({ keepFocus: true });
    if (name === "new-folder" && model.capabilities.write) return textDialog("create-folder");
    if (name === "view") {
      model.view = VIEW_MODES[(VIEW_MODES.indexOf(model.view) + 1) % VIEW_MODES.length];
      writeChoice("para.files.view", model.view);
      return renderEntries({ keepFocus: true });
    }
    if (name === "sort") {
      model.sort = SORT_MODES[(SORT_MODES.indexOf(model.sort) + 1) % SORT_MODES.length];
      writeChoice("para.files.sort", model.sort);
      return renderEntries({ keepFocus: true });
    }
    if (name === "options") return openContext(root.querySelector("[data-files-command='options']"));
  }

  async function onClick(event) {
    const toolbar = event.target.closest("[data-files-command]");
    if (toolbar) return command(toolbar.dataset.filesCommand);
    const placeNode = event.target.closest("[data-files-place]");
    if (placeNode) {
      const place = model.places.find((row) => row.id === placeNode.dataset.filesPlace);
      if (!place) return;
      if (place.mounted === false && model.capabilities.volumes) {
        model.contextPlace = place;
        return runContext("volume-mount");
      }
      if (place.path) return load(place.path, { focusContent: true });
    }
    const entryNode = event.target.closest("[data-files-entry]");
    if (entryNode) {
      const item = visibleItems()[Number(entryNode.dataset.filesEntry)];
      if (!item) return;
      if (event.detail === 0) return openEntry(item);
      selectEntry(item, Number(entryNode.dataset.filesEntry), event);
    }
    const contextCommand = event.target.closest("[data-files-context-command]");
    if (contextCommand) return runContext(contextCommand.dataset.filesContextCommand);
    if (event.target.closest("[data-files-dialog-close]")) return closeDialog();
    const dialogConfirm = event.target.closest("[data-files-dialog-confirm]");
    if (dialogConfirm) {
      const action = dialogConfirm.dataset.filesDialogConfirm;
      const name = dialogNode.querySelector("[data-files-name]")?.value.trim();
      closeDialog(false);
      if (action === "trash") return perform("trash", { paths: selectedItems().map((item) => item.path) }, "Moved to Trash");
      if (action === "delete") return perform("delete", { paths: selectedItems().map((item) => item.path) }, "Deleted");
      if (action === "rename") return perform("rename", { paths: selectedItems().map((item) => item.path), name }, "Renamed");
      if (action === "create-folder" || action === "create-file") return perform(action, { destination: model.location.path, name }, "Created");
    }
  }

  function onDoubleClick(event) {
    const entryNode = event.target.closest("[data-files-entry]");
    if (!entryNode) return;
    const item = visibleItems()[Number(entryNode.dataset.filesEntry)];
    if (item) openEntry(item);
  }

  function onContextMenu(event) {
    const entryNode = event.target.closest("[data-files-entry]");
    const placeNode = event.target.closest("[data-files-place]");
    if (!entryNode && !placeNode) return;
    event.preventDefault();
    if (entryNode) {
      const item = visibleItems()[Number(entryNode.dataset.filesEntry)];
      if (item) openContext(entryNode, item, null, { x: event.clientX, y: event.clientY });
    } else {
      const place = model.places.find((row) => row.id === placeNode.dataset.filesPlace);
      if (place) openContext(placeNode, null, place, { x: event.clientX, y: event.clientY });
    }
  }

  function onPointerDown(event) {
    if (!contextNode.hidden && !event.target.closest("[data-files-context]")) closeContext();
  }

  function onDragStart(event) {
    const entryNode = event.target.closest("[data-files-entry]");
    if (!entryNode || !model.capabilities.write) return;
    const item = visibleItems()[Number(entryNode.dataset.filesEntry)];
    if (!item) return;
    if (!model.selected.has(item.path)) {
      model.selected.clear();
      model.selected.add(item.path);
      renderEntries({ keepFocus: true });
    }
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-para-files", JSON.stringify(selectedItems().map((row) => row.path)));
  }

  function onDragOver(event) {
    if (!model.capabilities.write) return;
    if (event.target.closest("[data-files-entry], [data-files-content]")) event.preventDefault();
  }

  function onDrop(event) {
    if (!model.capabilities.write) return;
    const data = event.dataTransfer.getData("application/x-para-files");
    if (!data) return;
    event.preventDefault();
    let paths;
    try { paths = JSON.parse(data); } catch { return; }
    const entryNode = event.target.closest("[data-files-entry]");
    const targetItem = entryNode ? visibleItems()[Number(entryNode.dataset.filesEntry)] : null;
    const destination = targetItem?.kind === "folder" ? targetItem.path : model.location.path;
    const action = event.ctrlKey || !selectedItems().every((row) => row.parent_writable) ? "copy" : "move";
    perform(action, { paths, destination }, action === "copy" ? "Copied" : "Moved");
  }

  async function onSearch() {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (!query) {
      model.searchResults = null;
      renderEntries();
      return;
    }
    searchTimer = setTimeout(async () => {
      if (!alive) return;
      if (!normalLocation()) {
        model.searchResults = model.items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
        renderEntries();
        return;
      }
      setStatus(`Searching for ${query}…`);
      try {
        const payload = await paraApi.searchFiles(model.location.path, query);
        if (!alive || searchInput.value.trim() !== query) return;
        model.searchResults = payload.items || [];
        renderEntries();
      } catch { setStatus("Search couldn’t be completed"); }
    }, 280);
  }

  function onAddress(event) {
    event.preventDefault();
    const value = addressInput.value.trim();
    if (value) load(value, { focusContent: true });
  }

  function onKeyDown(event) {
    if (!root.isConnected) return;
    if (!dialogNode.hidden && event.key === "Enter" && event.target.matches?.("input")) {
      event.preventDefault();
      dialogNode.querySelector("[data-files-dialog-confirm]")?.click();
      return;
    }
    const typing = event.target.matches?.("input,textarea");
    if (typing && event.key !== "Escape") return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      visibleItems().forEach((item) => model.selected.add(item.path));
      renderEntries({ keepFocus: true });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault(); copySelection("copy");
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
      event.preventDefault(); copySelection("move");
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault(); pasteSelection();
    } else if (event.key === "Delete" && selectedItems().length && (model.location?.kind === "trash" ? model.capabilities.write : model.capabilities.trash)) {
      event.preventDefault(); trashDialog(selectedItems(), model.location?.kind === "trash");
    } else if (event.key === "F2" && model.capabilities.write && selectedItems().length === 1) {
      event.preventDefault(); textDialog("rename", selectedItems()[0]);
    } else if (event.key === "Backspace") {
      event.preventDefault(); activeBackHandler?.();
    }
  }

  function onSecondary(event) {
    const target = event.detail?.target || focus.current;
    const entryNode = target?.closest?.("[data-files-entry]");
    const placeNode = target?.closest?.("[data-files-place]");
    if (entryNode) {
      const item = visibleItems()[Number(entryNode.dataset.filesEntry)];
      if (item) openContext(entryNode, item);
    } else if (placeNode) {
      const place = model.places.find((row) => row.id === placeNode.dataset.filesPlace);
      if (place) openContext(placeNode, null, place);
    } else openContext(root.querySelector("[data-files-command='options']"));
  }

  function onOptions(event) {
    onSecondary(event);
  }

  activeBackHandler = () => {
    if (closeDialog()) return true;
    if (!contextNode.hidden) { closeContext(); focus.focusFirst(); return true; }
    if (model.history.length) { command("back"); return true; }
    return false;
  };

  root.addEventListener("click", onClick);
  root.addEventListener("dblclick", onDoubleClick);
  root.addEventListener("contextmenu", onContextMenu);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("dragstart", onDragStart);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("drop", onDrop);
  root.querySelector("[data-files-address]").addEventListener("submit", onAddress);
  searchInput.addEventListener("input", onSearch);
  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("para-secondary", onSecondary);
  document.addEventListener("para-options", onOptions);
  load(initialLocation, { record: false });

  return () => {
    alive = false;
    clearTimeout(searchTimer);
    if (activeBackHandler) activeBackHandler = null;
    root.removeEventListener("click", onClick);
    root.removeEventListener("dblclick", onDoubleClick);
    root.removeEventListener("contextmenu", onContextMenu);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("dragstart", onDragStart);
    root.removeEventListener("dragover", onDragOver);
    root.removeEventListener("drop", onDrop);
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("para-secondary", onSecondary);
    document.removeEventListener("para-options", onOptions);
  };
}

export function downloadManagerScreen() {
  return `<section class="screen page downloads-manager-page"><header class="page-header"><span class="eyebrow">System</span><h1>Downloads & Updates</h1><p>Install queue, updates, and completed downloads.</p></header><div data-download-manager><div class="library-loading"><span></span><strong>Reading queue…</strong></div></div></section>`;
}
export async function activateDownloadManager({ focus } = {}) {
  const host = document.querySelector("[data-download-manager]");
  if (!host) return () => {};
  const { profileRuntime } = await import("../services/experience-runtime.js");
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const actions = (item) => {
    if (item.status === "downloading") return `<button data-action="pause-download" data-download-id="${escapeHtml(item.id)}">Pause</button><button data-action="cancel-download" data-download-id="${escapeHtml(item.id)}">Cancel</button>`;
    if (item.status === "paused") return `<button data-action="resume-download" data-download-id="${escapeHtml(item.id)}">Resume</button><button data-action="cancel-download" data-download-id="${escapeHtml(item.id)}">Cancel</button>`;
    if (item.status === "complete" && item.storeId) return `<button data-action="play-store-game" data-store-id="${escapeHtml(item.storeId)}">Play</button><button data-route="games">View in Library</button>`;
    if (item.status === "complete" && item.route) return `<button data-route="${escapeHtml(item.route)}">Open</button>`;
    if (item.status === "complete") return `<button data-route="games">View in Library</button>`;
    return "";
  };

  const row = (item, index) => {
    const status = item.status === "complete"
      ? `Installed${item.completedAt ? ` · ${date.format(item.completedAt)}` : ""}`
      : item.status === "paused"
        ? `Paused · ${item.progress || 0}%`
        : `Downloading · ${item.progress || 0}%`;
    return `<article class="notification-row" ${index === 0 ? 'data-autofocus="true"' : ""}><span>↓</span><div><strong>${escapeHtml(item.title || item.id)}</strong><small>${escapeHtml(status)}</small></div><div class="download-actions">${actions(item)}</div></article>`;
  };

  const render = () => {
    const items = profileRuntime().downloads || [];
    const active = items.filter((item) => ["downloading", "paused"].includes(item.status));
    const completed = items.filter((item) => item.status === "complete").sort((a, b) => Number(b.completedAt || b.startedAt || 0) - Number(a.completedAt || a.startedAt || 0));
    if (!active.length && !completed.length) {
      host.innerHTML = `<div class="library-empty"><span>↓</span><h2>No downloads yet</h2><p>Games, updates, and completed installs will appear here.</p></div>`;
    } else {
      host.innerHTML = `<div class="saved-data-list">${active.length ? `<div class="download-section-heading"><strong>Active</strong><small>${active.length} ${active.length === 1 ? "download" : "downloads"}</small></div>${active.map(row).join("")}` : ""}${completed.length ? `<div class="download-section-heading"><strong>Completed</strong><small>Recent installs</small></div>${completed.map((item, index) => row(item, active.length ? index + active.length : index)).join("")}` : ""}</div>`;
    }
    focus?.focusFirst?.();
  };
  render();
  const timer = setInterval(render, 1000);
  document.addEventListener("para-runtimechange", render);
  return () => { clearInterval(timer); document.removeEventListener("para-runtimechange", render); };
}
