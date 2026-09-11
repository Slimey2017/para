import { page } from "../ui/components.js";
import { escapeHtml } from "../services/para-api.js";
import {
  activePmenuManifest, clearActivePmenu, installPmenuFolder, listPmenuPacks,
  removePmenuPack, resolvePmenuAsset, setActivePmenu,
} from "../services/pmenu.js";

function packCard(pack, active) {
  const manifest = pack.manifest;
  return `<article class="pmenu-pack-card ${active ? "is-active" : ""}" data-pmenu-pack="${escapeHtml(manifest.id)}"><div class="pmenu-pack-card__preview" ${manifest.preview ? `data-pmenu-preview="${escapeHtml(manifest.preview)}"` : ""}><span>${escapeHtml(manifest.name.slice(0, 1).toUpperCase())}</span></div><div class="pmenu-pack-card__copy"><small>${active ? "ACTIVE HOME STYLE" : `PMENU ${escapeHtml(manifest.version)}`}</small><h2>${escapeHtml(manifest.name)}</h2><p>${escapeHtml(manifest.description || `By ${manifest.author}`)}</p><div><button class="action-button" type="button" data-pmenu-apply="${escapeHtml(manifest.id)}">${active ? "Applied" : "Apply"}</button><button class="action-button action-button--ghost" type="button" data-pmenu-remove="${escapeHtml(manifest.id)}">Remove</button></div></div></article>`;
}

export function homeStylesScreen() {
  return page({
    title: "Home Styles",
    description: "Change the entire PARA Home layout with PMENU folders.",
    eyebrow: "Personalization",
    className: "pmenu-page",
    body: `<section class="pmenu-import panel"><div><strong>Install a Home Style</strong><p>Select a normal folder containing one .pmenu definition plus its images and sounds. PMENU is not an archive.</p></div><button class="action-button" type="button" data-pmenu-browse data-autofocus="true">Choose Folder</button><input type="file" data-pmenu-folder webkitdirectory multiple hidden /></section><section class="pmenu-format-note"><strong>PMENU v1</strong><span>Folder-based • local assets • no JavaScript execution</span></section><div class="pmenu-pack-list" data-pmenu-list><div class="library-loading"><span></span><strong>Reading Home Styles…</strong></div></div><button class="list-row pmenu-default" type="button" data-pmenu-default><span class="list-row__icon">↺</span><span class="list-row__body"><span class="list-row__title">Use PARA Default</span><span class="list-row__meta">Return Home to the standard PARA layout</span></span></button><p class="pmenu-status" data-pmenu-status aria-live="polite"></p>`,
  });
}

export function activateHomeStyles({ focus, notify } = {}) {
  const pageRoot = document.querySelector(".pmenu-page");
  const picker = pageRoot?.querySelector("[data-pmenu-folder]");
  const list = pageRoot?.querySelector("[data-pmenu-list]");
  const status = pageRoot?.querySelector("[data-pmenu-status]");
  if (!pageRoot || !picker || !list) return () => {};
  let alive = true;
  let previewUrls = [];
  let packs = [];

  const clearPreviews = () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
  };
  const setStatus = (message, error = false) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };
  const render = async () => {
    clearPreviews();
    packs = await listPmenuPacks();
    if (!alive) return;
    const activeId = activePmenuManifest()?.id || "";
    list.innerHTML = packs.length
      ? packs.map((pack) => packCard(pack, pack.id === activeId)).join("")
      : `<div class="library-empty"><span>▦</span><strong>No custom Home Styles yet</strong><p>Choose a folder to install your first .pmenu style.</p></div>`;
    for (const card of list.querySelectorAll("[data-pmenu-pack]")) {
      const pack = packs.find((candidate) => candidate.id === card.dataset.pmenuPack);
      const preview = card.querySelector("[data-pmenu-preview]");
      if (!pack || !preview) continue;
      const url = await resolvePmenuAsset(pack.id, preview.dataset.pmenuPreview);
      if (!alive || !url) continue;
      previewUrls.push(url);
      preview.style.backgroundImage = `url("${url}")`;
    }
    focus?.focusFirst?.();
  };

  const onChange = async () => {
    if (!picker.files?.length) return;
    try {
      setStatus("Checking PMENU folder…");
      const manifest = await installPmenuFolder(picker.files);
      if (!alive) return;
      setActivePmenu(manifest);
      setStatus(`${manifest.name} installed and applied.`);
      notify?.("Home Style installed", manifest.name);
      await render();
    } catch (error) {
      setStatus(error?.message || "Could not install that Home Style", true);
      notify?.("Home Style not installed", error?.message || "Invalid PMENU folder");
    } finally {
      picker.value = "";
    }
  };

  const onClick = async (event) => {
    const browse = event.target.closest?.("[data-pmenu-browse]");
    if (browse) { picker.click(); return; }
    const apply = event.target.closest?.("[data-pmenu-apply]");
    if (apply) {
      const pack = packs.find((candidate) => candidate.id === apply.dataset.pmenuApply);
      if (pack) {
        setActivePmenu(pack.manifest);
        setStatus(`${pack.manifest.name} is now your Home Style.`);
        notify?.("Home Style applied", pack.manifest.name);
        await render();
      }
      return;
    }
    const remove = event.target.closest?.("[data-pmenu-remove]");
    if (remove) {
      const pack = packs.find((candidate) => candidate.id === remove.dataset.pmenuRemove);
      if (!pack) return;
      await removePmenuPack(pack.id);
      setStatus(`${pack.manifest.name} removed.`);
      notify?.("Home Style removed", pack.manifest.name);
      await render();
      return;
    }
    if (event.target.closest?.("[data-pmenu-default]")) {
      clearActivePmenu();
      setStatus("PARA Default will be used on Home.");
      notify?.("PARA Default applied");
      await render();
    }
  };

  picker.addEventListener("change", onChange);
  pageRoot.addEventListener("click", onClick);
  void render();
  return () => {
    alive = false;
    picker.removeEventListener("change", onChange);
    pageRoot.removeEventListener("click", onClick);
    clearPreviews();
  };
}
