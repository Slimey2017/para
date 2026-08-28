import {
  applyPreferences, BACKGROUND_OPTIONS, BUILT_IN_BACKGROUND_IDS, DEFAULT_BACKGROUND_ID,
  getProfilePreferences, getState, previewBackground, setProfilePreferences,
} from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { applyBrowserBackground, saveBrowserBackground } from "../services/profile-assets.js";
import { page, tile } from "../ui/components.js";
import { controlCenterDefinitions } from "../ui/control-center.js";

let pendingBackground = null;
let pendingPreviewUrl = null;
let activeBackgroundSession = null;

export function personalizationScreen() {
  return page({
    title: "Personalization",
    description: "Make PARA feel like yours.",
    eyebrow: "Settings",
    body: `<div class="settings-grid personalization-grid">${tile({ title: "Background", meta: "Wallpaper, preview, fitting, and dimming", route: "background", icon: "◩", autofocus: true })}${tile({ title: "Control Center", meta: "Arrange quick system controls", route: "control-center-settings", icon: "◎" })}</div>`,
  });
}

function normalizedSelection(selection) {
  return selection === "para-default" ? DEFAULT_BACKGROUND_ID : selection;
}

function backgroundName(selection) {
  if (selection === "custom") return "Custom Background";
  return BACKGROUND_OPTIONS[normalizedSelection(selection)]?.name || BACKGROUND_OPTIONS[DEFAULT_BACKGROUND_ID].name;
}

function backgroundChoice(id, option, selected, autofocus) {
  const visual = `style="--choice-image:url('${option.image}');--choice-color:${option.color}"`;
  return `<button type="button" class="background-choice ${selected ? "is-selected" : ""}" data-action="preview-background" data-background-id="${id}" aria-label="Preview ${escapeHtml(option.name)}" aria-pressed="${selected}" ${visual} ${autofocus ? "data-autofocus='true'" : ""}><span class="background-choice__visual" aria-hidden="true"></span><strong>${escapeHtml(option.name)}</strong><small>${selected ? "Current" : "Preview"}</small></button>`;
}

export function backgroundScreen() {
  const preferences = getProfilePreferences();
  const selected = normalizedSelection(preferences.background.selection);
  const included = BUILT_IN_BACKGROUND_IDS.map((id, index) => backgroundChoice(id, BACKGROUND_OPTIONS[id], id === selected, index === 0)).join("");
  return page({
    title: "Background",
    description: "Personal to this profile.",
    eyebrow: "Personalization",
    className: "background-page",
    body: `<div class="background-live-wallpaper profile-wallpaper" aria-hidden="true"><span></span></div><section class="background-preview-status" aria-live="polite"><span>Preview</span><strong data-background-preview-name>${escapeHtml(backgroundName(selected))}</strong></section><section class="background-section"><div class="section-heading"><h2>PARA backgrounds</h2><div class="background-apply-bar"><button class="action-button action-button--ghost" data-action="cancel-background-selection">Cancel</button><button class="action-button" data-action="apply-background">Apply</button></div></div><div class="background-grid">${included}</div></section><section class="custom-background-section"><button class="add-custom-background" data-action="open-background-picker" data-custom-background hidden><span aria-hidden="true">＋</span><strong>Add Custom Background</strong><small>PNG, JPEG, or WebP</small></button><input type="file" accept="image/png,image/jpeg,image/webp" data-background-input hidden /></section><section class="background-controls panel"><div class="background-control"><div><strong>Fitting</strong><small>Choose how the image fills the screen</small></div><div class="segmented">${["fill", "fit", "center", "stretch"].map((fit) => `<button data-action="set-background-fit" data-background-fit="${fit}" class="${preferences.background.fit === fit ? "is-selected" : ""}">${fit[0].toUpperCase()}${fit.slice(1)}</button>`).join("")}</div></div><label class="background-control"><div><strong>Background dimming</strong><small><output data-dim-value>${preferences.background.dim}%</output></small></div><input type="range" min="0" max="80" step="2" value="${preferences.background.dim}" data-background-dim /></label><button class="list-row reset-background" data-action="restore-background-default"><span class="list-row__icon">↺</span><span class="list-row__body"><span class="list-row__title">Restore PARA Default</span><span class="list-row__meta">Use Aurora Current with the standard fitting and dimming</span></span></button></section><div class="background-confirm" data-background-confirm hidden><div class="background-confirm__card" role="dialog" aria-modal="true" aria-label="Preview custom background"><img data-background-preview alt="Custom background preview" /><h2>Use this background?</h2><div><button class="action-button action-button--ghost" data-action="cancel-background-preview">Cancel</button><button class="action-button" data-action="apply-custom-background">Apply</button></div></div></div>`,
  });
}

function updateBackgroundChoiceState(session) {
  document.querySelectorAll("[data-background-id]").forEach((choice) => {
    const id = choice.dataset.backgroundId;
    choice.classList.toggle("is-selected", id === normalizedSelection(session.committed));
    choice.classList.toggle("is-previewing", id === normalizedSelection(session.staged));
    choice.setAttribute("aria-pressed", String(id === normalizedSelection(session.staged)));
    const note = choice.querySelector("small");
    if (note) note.textContent = id === normalizedSelection(session.committed) ? "Current" : id === normalizedSelection(session.staged) ? "Previewing" : "Preview";
  });
  const name = document.querySelector("[data-background-preview-name]");
  if (name) name.textContent = backgroundName(session.staged);
  const apply = document.querySelector("[data-action='apply-background']");
  if (apply) apply.disabled = session.staged === "custom";
}

function showSessionPreview(session) {
  if (session.staged === "custom" && pendingPreviewUrl) previewBackground("custom", pendingPreviewUrl);
  else previewBackground(session.staged);
  updateBackgroundChoiceState(session);
}

function stageBuiltInBackground(id) {
  if (!activeBackgroundSession || !BUILT_IN_BACKGROUND_IDS.includes(id)) return;
  activeBackgroundSession.staged = id;
  showSessionPreview(activeBackgroundSession);
}

export function selectBackgroundPreview(id, focus) {
  if (!BUILT_IN_BACKGROUND_IDS.includes(id)) return false;
  stageBuiltInBackground(id);
  const apply = document.querySelector("[data-action='apply-background']");
  if (apply) requestAnimationFrame(() => focus.setCurrent(apply, true));
  return true;
}

function closeCustomConfirmation({ restore = true } = {}) {
  document.querySelector("[data-background-confirm]")?.setAttribute("hidden", "");
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = null;
  pendingBackground = null;
  if (activeBackgroundSession && restore) {
    activeBackgroundSession.staged = activeBackgroundSession.customReturn || activeBackgroundSession.committed;
    activeBackgroundSession.customReturn = null;
    showSessionPreview(activeBackgroundSession);
  }
}

export function activateBackgroundScreen({ focus, changed }) {
  const pageElement = document.querySelector(".background-page");
  const custom = document.querySelector("[data-custom-background]");
  const input = document.querySelector("[data-background-input]");
  const savedSelection = normalizedSelection(getProfilePreferences().background.selection);
  const session = { committed: savedSelection, staged: savedSelection, customReturn: null, changed };
  activeBackgroundSession = session;

  const onChoiceFocus = (event) => {
    const choice = event.target.closest?.("[data-background-id]");
    if (choice) stageBuiltInBackground(choice.dataset.backgroundId);
  };
  const onChoicePointer = (event) => {
    const choice = event.target.closest?.("[data-background-id]");
    if (choice) stageBuiltInBackground(choice.dataset.backgroundId);
  };
  const onFileChange = () => {
    const file = input.files?.[0];
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return;
    pendingBackground = file;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(file);
    session.customReturn = session.staged;
    session.staged = "custom";
    showSessionPreview(session);
    const confirmation = document.querySelector("[data-background-confirm]");
    const preview = document.querySelector("[data-background-preview]");
    if (preview) preview.src = pendingPreviewUrl;
    if (confirmation) confirmation.hidden = false;
    requestAnimationFrame(() => focus.setCurrent(confirmation?.querySelector("[data-action='apply-custom-background']"), true));
  };
  const onDimming = (event) => {
    setProfilePreferences({ background: { dim: Number(event.target.value) } });
    const output = document.querySelector("[data-dim-value]");
    if (output) output.textContent = `${event.target.value}%`;
    showSessionPreview(session);
    changed();
  };

  pageElement?.addEventListener("focusin", onChoiceFocus);
  pageElement?.addEventListener("pointerover", onChoicePointer);
  input?.addEventListener("change", onFileChange);
  document.querySelector("[data-background-dim]")?.addEventListener("input", onDimming);
  updateBackgroundChoiceState(session);

  if (custom) custom.hidden = !(globalThis.File && globalThis.indexedDB);

  return () => {
    pageElement?.removeEventListener("focusin", onChoiceFocus);
    pageElement?.removeEventListener("pointerover", onChoicePointer);
    input?.removeEventListener("change", onFileChange);
    document.querySelector("[data-background-dim]")?.removeEventListener("input", onDimming);
    closeCustomConfirmation({ restore: false });
    if (activeBackgroundSession === session) activeBackgroundSession = null;
    applyPreferences();
  };
}

export function openBackgroundPicker() {
  document.querySelector("[data-background-input]")?.click();
}

export function cancelBackgroundPreview(focus) {
  closeCustomConfirmation();
  focus.setCurrent(document.querySelector("[data-custom-background]"), true);
}

export async function applyCustomBackground(focus) {
  if (!pendingBackground) return false;
  const profile = getState().activeProfile || "P1";
  try {
    let source = "browser";
    let revision = Date.now();
    try {
      const capabilities = await paraApi.capabilities();
      if (capabilities.custom_backgrounds) {
        const result = await paraApi.uploadBackground(profile, pendingBackground);
        source = "host";
        revision = result.revision;
      } else {
        revision = await saveBrowserBackground(profile, pendingBackground);
      }
    } catch {
      revision = await saveBrowserBackground(profile, pendingBackground);
    }
    setProfilePreferences({ background: { selection: "custom", source, revision } }, profile);
    if (source === "browser") await applyBrowserBackground(profile);
    if (activeBackgroundSession) {
      activeBackgroundSession.committed = "custom";
      activeBackgroundSession.staged = "custom";
      activeBackgroundSession.customReturn = null;
    }
    closeCustomConfirmation({ restore: false });
    return true;
  } catch {
    return false;
  }
}

export function applyBackgroundSelection() {
  if (!activeBackgroundSession || !BUILT_IN_BACKGROUND_IDS.includes(activeBackgroundSession.staged)) return false;
  const selection = activeBackgroundSession.staged;
  setProfilePreferences({ background: { selection } });
  activeBackgroundSession.committed = selection;
  showSessionPreview(activeBackgroundSession);
  return true;
}

export function cancelBackgroundSelection(focus) {
  if (!activeBackgroundSession) return;
  activeBackgroundSession.staged = activeBackgroundSession.committed;
  applyPreferences();
  updateBackgroundChoiceState(activeBackgroundSession);
  const custom = document.querySelector("[data-custom-background]");
  const target = document.querySelector(`[data-background-id='${normalizedSelection(activeBackgroundSession.committed)}']`) || (!custom?.hidden ? custom : document.querySelector("[data-action='cancel-background-selection']"));
  focus.setCurrent(target, true);
}

export function setBackgroundFit(fit) {
  if (!activeBackgroundSession || !["fill", "fit", "center", "stretch"].includes(fit)) return false;
  setProfilePreferences({ background: { fit } });
  document.querySelectorAll("[data-background-fit]").forEach((button) => button.classList.toggle("is-selected", button.dataset.backgroundFit === fit));
  showSessionPreview(activeBackgroundSession);
  return true;
}

export function restoreDefaultBackground() {
  if (!activeBackgroundSession) return false;
  setProfilePreferences({ background: { selection: DEFAULT_BACKGROUND_ID, fit: "fill", dim: 42, blur: 18, revision: 0 } });
  activeBackgroundSession.committed = DEFAULT_BACKGROUND_ID;
  activeBackgroundSession.staged = DEFAULT_BACKGROUND_ID;
  document.documentElement.dataset.backgroundFit = "fill";
  document.querySelectorAll("[data-background-fit]").forEach((button) => button.classList.toggle("is-selected", button.dataset.backgroundFit === "fill"));
  const dimming = document.querySelector("[data-background-dim]");
  const output = document.querySelector("[data-dim-value]");
  if (dimming) dimming.value = "42";
  if (output) output.textContent = "42%";
  showSessionPreview(activeBackgroundSession);
  return true;
}

function arrangementRows(ids, labels, preferences, namespace) {
  const hidden = new Set(preferences.hidden);
  const core = new Set(["home", "power"]);
  return ids.map((id, index) => `<div class="arrangement-row" data-arrangement-id="${id}"><div><strong>${escapeHtml(labels[id])}</strong><small>${core.has(id) ? "Always shown" : hidden.has(id) ? "Hidden" : "Shown"}</small></div><div><button data-action="move-${namespace}-item" data-item-id="${id}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(labels[id])} earlier">↑</button><button data-action="move-${namespace}-item" data-item-id="${id}" data-direction="1" ${index === ids.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(labels[id])} later">↓</button>${core.has(id) ? "" : `<button data-action="toggle-${namespace}-item" data-item-id="${id}">${hidden.has(id) ? "Show" : "Hide"}</button>`}</div></div>`).join("");
}

export function controlCenterSettingsScreen() {
  return page({ title: "Control Center", description: "Arrange the controls available on this PARA system.", eyebrow: "Personalization", body: `<div class="arrangement-list" data-control-center-arrangement><div class="library-loading library-empty--small"><span></span><strong>Reading controls…</strong></div></div><button class="list-row reset-control-center" data-action="restore-control-center-order"><span class="list-row__icon">↺</span><span class="list-row__body"><span class="list-row__title">Restore default order</span><span class="list-row__meta">Show available controls in PARA’s standard order</span></span></button>` });
}

export async function activateControlCenterSettings({ focus, controller }) {
  const container = document.querySelector("[data-control-center-arrangement]");
  if (!container) return;
  let capabilities = {};
  try { capabilities = await paraApi.capabilities(); } catch { capabilities = {}; }
  const allowed = ["home", "switcher", "downloads", "captures", "music", "audio"];
  if (capabilities.notifications) allowed.push("notifications");
  if (capabilities.network) allowed.push("network");
  if (capabilities.microphone || navigator.mediaDevices?.getUserMedia) allowed.push("microphone");
  if (controller.connected) allowed.push("controllers");
  allowed.push("profile", "power");
  const preferences = getProfilePreferences().controlCenter;
  const ids = [...preferences.order.filter((id) => allowed.includes(id)), ...allowed.filter((id) => !preferences.order.includes(id))];
  const labels = Object.fromEntries(Object.entries(controlCenterDefinitions).map(([id, item]) => [id, item.title]));
  container.innerHTML = arrangementRows(ids, labels, preferences, "control-center");
  focus.focusFirst();
}
