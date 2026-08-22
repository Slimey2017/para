import { BACKGROUND_OPTIONS, getProfilePreferences, getState, setProfilePreferences } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { page, tile } from "../ui/components.js";
import { controlCenterDefinitions } from "../ui/control-center.js";

let pendingBackground = null;
let pendingPreviewUrl = null;

export function personalizationScreen() {
  return page({
    title: "Personalization",
    description: "Make PARA feel like yours.",
    eyebrow: "Settings",
    body: `<div class="settings-grid personalization-grid">${tile({ title: "Background", meta: "Wallpaper, fit, dimming, and surface blur", route: "background", icon: "◩", autofocus: true })}${tile({ title: "Control Center", meta: "Arrange quick system controls", route: "control-center-settings", icon: "◎" })}</div>`,
  });
}

function backgroundChoice(id, option, selected, autofocus) {
  const visual = option.image ? `style="--choice-image:url('${option.image}');--choice-color:${option.color}"` : `style="--choice-image:none;--choice-color:${option.color}"`;
  return `<button class="background-choice ${selected ? "is-selected" : ""}" data-action="select-background" data-background-id="${id}" ${visual} ${autofocus ? "data-autofocus='true'" : ""}><span class="background-choice__visual"></span><strong>${escapeHtml(option.name)}</strong>${selected ? "<small>Selected</small>" : ""}</button>`;
}

export function backgroundScreen() {
  const preferences = getProfilePreferences();
  const selected = preferences.background.selection;
  const included = Object.entries(BACKGROUND_OPTIONS).map(([id, option], index) => backgroundChoice(id, option, id === selected, index === 0)).join("");
  const custom = selected === "custom"
    ? backgroundChoice("custom", { name: "Custom Image", image: `/api/v1/backgrounds/custom?profile=${encodeURIComponent(getState().activeProfile || "Player One")}&v=${preferences.background.revision}`, color: "#030208" }, true, false)
    : "";
  const choices = `${included}${custom}`;
  return page({
    title: "Background",
    description: "Personal to this profile.",
    eyebrow: "Personalization",
    className: "background-page",
    body: `<section class="background-preview profile-wallpaper"><span>PARA</span><i></i></section><section class="background-section"><div class="section-heading"><h2>Choose a background</h2><button class="action-button action-button--ghost" data-action="open-background-picker" data-custom-background hidden>Custom Image</button></div><div class="background-grid">${choices}</div><input type="file" accept="image/png,image/jpeg,image/webp" data-background-input hidden /></section><section class="background-controls panel"><div class="background-control"><div><strong>Fitting</strong><small>Choose how the image fills the screen</small></div><div class="segmented">${["fill", "fit", "center", "stretch"].map((fit) => `<button data-action="set-background-fit" data-background-fit="${fit}" class="${preferences.background.fit === fit ? "is-selected" : ""}">${fit[0].toUpperCase()}${fit.slice(1)}</button>`).join("")}</div></div><label class="background-control"><div><strong>Background dimming</strong><small><output data-dim-value>${preferences.background.dim}%</output></small></div><input type="range" min="0" max="80" step="2" value="${preferences.background.dim}" data-background-dim /></label><label class="background-control"><div><strong>Surface blur</strong><small><output data-blur-value>${preferences.background.blur}px</output></small></div><input type="range" min="0" max="24" step="1" value="${preferences.background.blur}" data-background-blur /></label><button class="list-row reset-background" data-action="reset-background"><span class="list-row__icon">↺</span><span class="list-row__body"><span class="list-row__title">Reset to PARA Default</span><span class="list-row__meta">Restore the official PARA background for this profile</span></span></button></section><div class="background-confirm" data-background-confirm hidden><div class="background-confirm__card" role="dialog" aria-modal="true" aria-label="Preview custom background"><img data-background-preview alt="Custom background preview" /><h2>Use this background?</h2><div><button class="action-button action-button--ghost" data-action="cancel-background-preview">Cancel</button><button class="action-button" data-action="apply-custom-background">Apply</button></div></div></div>`,
  });
}

export async function activateBackgroundScreen({ focus, changed }) {
  const custom = document.querySelector("[data-custom-background]");
  const input = document.querySelector("[data-background-input]");
  try {
    const capabilities = await paraApi.capabilities();
    if (custom) custom.hidden = !capabilities.custom_backgrounds;
  } catch {
    if (custom) custom.hidden = true;
  }
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return;
    pendingBackground = file;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(file);
    const confirmation = document.querySelector("[data-background-confirm]");
    const preview = document.querySelector("[data-background-preview]");
    if (preview) preview.src = pendingPreviewUrl;
    if (confirmation) confirmation.hidden = false;
    requestAnimationFrame(() => focus.setCurrent(confirmation?.querySelector("[data-action='apply-custom-background']"), true));
  });
  document.querySelector("[data-background-dim]")?.addEventListener("input", (event) => {
    setProfilePreferences({ background: { dim: Number(event.target.value) } });
    const output = document.querySelector("[data-dim-value]");
    if (output) output.textContent = `${event.target.value}%`;
    changed();
  });
  document.querySelector("[data-background-blur]")?.addEventListener("input", (event) => {
    setProfilePreferences({ background: { blur: Number(event.target.value) } });
    const output = document.querySelector("[data-blur-value]");
    if (output) output.textContent = `${event.target.value}px`;
    changed();
  });
}

export function openBackgroundPicker() {
  document.querySelector("[data-background-input]")?.click();
}

export function cancelBackgroundPreview(focus) {
  document.querySelector("[data-background-confirm]")?.setAttribute("hidden", "");
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = null;
  pendingBackground = null;
  focus.setCurrent(document.querySelector("[data-custom-background]"), true);
}

export async function applyCustomBackground(focus) {
  if (!pendingBackground) return false;
  const profile = getState().activeProfile || "Player One";
  try {
    const result = await paraApi.uploadBackground(profile, pendingBackground);
    setProfilePreferences({ background: { selection: "custom", revision: result.revision } }, profile);
    cancelBackgroundPreview(focus);
    return true;
  } catch {
    return false;
  }
}

function arrangementRows(ids, labels, preferences, namespace) {
  const hidden = new Set(preferences.hidden);
  return ids.map((id, index) => `<div class="arrangement-row" data-arrangement-id="${id}"><div><strong>${escapeHtml(labels[id])}</strong><small>${hidden.has(id) ? "Hidden" : "Shown"}</small></div><div><button data-action="move-${namespace}-item" data-item-id="${id}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(labels[id])} earlier">↑</button><button data-action="move-${namespace}-item" data-item-id="${id}" data-direction="1" ${index === ids.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(labels[id])} later">↓</button><button data-action="toggle-${namespace}-item" data-item-id="${id}">${hidden.has(id) ? "Show" : "Hide"}</button></div></div>`).join("");
}

export function controlCenterSettingsScreen() {
  return page({ title: "Control Center", description: "Arrange the controls available on this PARA system.", eyebrow: "Personalization", body: `<div class="arrangement-list" data-control-center-arrangement><div class="library-loading library-empty--small"><span></span><strong>Reading controls…</strong></div></div>` });
}

export async function activateControlCenterSettings({ focus, controller }) {
  const container = document.querySelector("[data-control-center-arrangement]");
  if (!container) return;
  let capabilities = {};
  try { capabilities = await paraApi.capabilities(); } catch { capabilities = {}; }
  const allowed = ["home"];
  if (capabilities.network) allowed.push("network");
  if (capabilities.audio) allowed.push("audio");
  if (capabilities.microphone) allowed.push("microphone");
  if (controller.connected) allowed.push("controllers");
  allowed.push("profile", "settings", "power");
  const preferences = getProfilePreferences().controlCenter;
  const ids = [...preferences.order.filter((id) => allowed.includes(id)), ...allowed.filter((id) => !preferences.order.includes(id))];
  const labels = Object.fromEntries(Object.entries(controlCenterDefinitions).map(([id, item]) => [id, item.title]));
  container.innerHTML = arrangementRows(ids, labels, preferences, "control-center");
  focus.focusFirst();
}
