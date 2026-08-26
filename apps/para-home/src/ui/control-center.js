import { getProfilePreferences, getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { activeDownloads, profileRuntime, runningExperiences } from "../services/experience-runtime.js";
import { microphoneState } from "../services/microphone.js";

const definitions = {
  home: { title: "Home", icon: "home" },
  switcher: { title: "Switcher", icon: "switcher" },
  notifications: { title: "Notifications", icon: "notifications" },
  friends: { title: "Friends", icon: "friends" },
  downloads: { title: "Downloads", icon: "downloads" },
  captures: { title: "Captures", icon: "captures" },
  music: { title: "Music", icon: "music" },
  network: { title: "Network", icon: "network" },
  audio: { title: "Sound", icon: "sound" },
  microphone: { title: "Microphone", icon: "microphone" },
  controllers: { title: "Controller", icon: "controller" },
  profile: { title: "Profile", icon: "profile" },
  settings: { title: "Quick Settings", icon: "settings" },
  power: { title: "Power", icon: "power" },
};

let currentData = null;
let lastSelectedId = "home";

function icon(name) {
  const shapes = {
    home: `<path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/>`,
    switcher: `<rect x="3" y="5" width="14" height="11" rx="2"/><path d="M7 19h12a2 2 0 0 0 2-2V9"/>`,
    notifications: `<path d="M6 9a6 6 0 0 1 12 0c0 7 3 6 3 8H3c0-2 3-1 3-8Z"/><path d="M10 21h4"/>`,
    friends: `<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-5 3-7 6-7s5.5 2 6 7M14 14c3.5 0 6 2 6.5 6"/>`,
    downloads: `<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>`,
    captures: `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1.5-2h5L16 5"/>`,
    music: `<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>`,
    network: `<path d="M4 10a12 12 0 0 1 16 0M7 14a8 8 0 0 1 10 0M10 18a3 3 0 0 1 4 0"/><circle cx="12" cy="21" r=".5" class="icon-fill"/>`,
    sound: `<path d="M4 10h4l5-4v12l-5-4H4zM16 9a5 5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>`,
    microphone: `<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 12a6.5 6.5 0 0 0 13 0M12 18.5V22M8.5 22h7"/>`,
    controller: `<path d="M6.5 8h11c3 0 5.5 7.5 4 10-1 1.8-3.4-.3-5.2-2.5H7.7C5.9 17.7 3.5 19.8 2.5 18c-1.5-2.5 1-10 4-10Z"/><path d="M7 10v5M4.5 12.5h5M16.5 11.5h.01M19 14h.01"/>`,
    profile: `<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-5 3.2-7 7.5-7s6.8 2 7.5 7"/>`,
    settings: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>`,
    power: `<path d="M12 2v10"/><path d="M6.3 5.4a9 9 0 1 0 11.4 0"/>`,
  };
  return `<svg class="control-center-icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.settings}</svg>`;
}

function stripButton(id, autofocus = false) {
  const definition = definitions[id];
  const route = id === "home" ? `data-route="home"` : "";
  return `<button type="button" class="control-center-control" ${route} data-action="${id === "home" ? "" : "control-center-open-context"}" data-control-center-id="${id}" aria-label="${definition.title}" ${autofocus ? "data-autofocus='true'" : ""}><span>${icon(definition.icon)}</span><strong>${definition.title}</strong></button>`;
}

function actionButton(label, attributes, autofocus = false) {
  return `<button type="button" class="control-center-context-action" ${attributes} ${autofocus ? "data-context-autofocus='true'" : ""}>${label}</button>`;
}

function contextMarkup(id) {
  if (!currentData) return "";
  if (id === "network") {
    const active = currentData.network?.interfaces?.find((item) => item.connected);
    const available = active || currentData.network?.interfaces?.[0];
    return `<div class="control-center-context__copy"><span>Network</span><strong>${active ? "Connected" : "Available connections"}</strong>${available ? `<small>${escapeHtml(available.name)}</small>` : ""}</div>${actionButton("Network Settings", `data-route="network"`, true)}`;
  }
  if (id === "audio") {
    const output = currentData.audio?.output;
    const volume = output?.volume ?? currentData.preferences.sound.volume;
    return `<div class="control-center-context__copy"><span>Sound</span><strong><output data-audio-output>${volume}%</output></strong><small>${output ? (output.muted ? "Muted" : "System output") : "PARA interface"}</small></div><label class="control-center-volume"><span>Volume</span><input type="range" min="0" max="100" step="2" value="${volume}" aria-label="Audio volume" ${output ? "data-audio-volume" : "data-interface-volume"} data-context-autofocus="true" /></label>`;
  }
  if (id === "microphone") {
    const systemMicrophone = currentData.audio?.microphone;
    if (systemMicrophone) return `<div class="control-center-context__copy"><span>Microphone</span><strong>${systemMicrophone.muted ? "Muted" : "Active"}</strong><small>${systemMicrophone.volume}% input level</small></div>${actionButton(systemMicrophone.muted ? "Unmute" : "Mute", `data-action="toggle-microphone" data-microphone-muted="${systemMicrophone.muted}"`, true)}`;
    const microphone = currentData.microphone;
    const title = microphone.state === "active" ? "Active" : microphone.state === "blocked" ? "Permission blocked" : "Off";
    return `<div class="control-center-context__copy"><span>Microphone</span><strong>${title}</strong><small>${microphone.state === "blocked" ? "Allow microphone access in browser settings" : "Browser microphone"}</small></div>${microphone.state !== "blocked" ? actionButton(microphone.active ? "Turn Off" : "Turn On", `data-action="toggle-browser-microphone"`, true) : ""}`;
  }
  if (id === "controllers") {
    return `<div class="control-center-context__copy"><span>Controller</span><strong>${escapeHtml(currentData.controller.typeLabel)}</strong><small>Connected</small></div>${actionButton("Controller Settings", `data-route="controller"`, true)}`;
  }
  if (id === "profile") {
    return `<div class="control-center-context__copy"><span>Profile</span><strong>${escapeHtml(currentData.profile)}</strong></div>${actionButton("Account Settings", `data-route="account"`, true)}`;
  }
  if (id === "power") {
    return `<div class="control-center-context__copy"><span>Power</span><strong>Choose a power action</strong></div><div class="control-center-power">${actionButton("Sleep", `data-action="enter-sleep"`, true)}${actionButton("Restart PARA", `data-action="restart-shell"`)}${actionButton("Shut Down", `data-action="confirm-turn-off"`)}</div>`;
  }
  if (id === "switcher") {
    const running = runningExperiences();
    return running.length ? `<div class="control-center-context__copy"><span>Running</span><strong>${running.length} ${running.length === 1 ? "experience" : "experiences"}</strong></div><div class="control-center-running">${running.map((item, index) => actionButton(`${escapeHtml(item.kind)} · ${escapeHtml(item.title)}`, `data-route="${escapeHtml(item.route)}"`, index === 0)).join("")}</div>` : `<div class="control-center-context__copy"><span>Switcher</span><strong>No other apps running</strong></div>`;
  }
  if (id === "notifications") {
    const count = currentData.runtime.notifications.length;
    return `<div class="control-center-context__copy"><span>Notifications</span><strong>${count ? `${count} new` : "You’re all caught up"}</strong></div>${count ? actionButton("View Notifications", `data-route="notifications"`, true) : ""}`;
  }
  if (id === "captures") {
    return `<div class="control-center-context__copy"><span>Captures</span><strong>Media Gallery</strong><small>Screenshots and gameplay clips</small></div><div class="control-center-power">${actionButton("Take Screenshot", `data-action="capture-screenshot"`, true)}${actionButton("Open Gallery", `data-route="media-gallery"`)}</div>`;
  }
  if (id === "downloads") {
    const downloads = activeDownloads();
    if (!downloads.length) return `<div class="control-center-context__copy"><span>Downloads</span><strong>No active downloads</strong></div>${actionButton("Open ParaStore", `data-route="parastore"`, true)}`;
    return `<div class="control-center-context__copy"><span>Downloading</span><strong>${escapeHtml(downloads[0].title)}</strong><small>${downloads[0].progress || 0}%</small></div><div class="control-center-download"><i style="width:${downloads[0].progress || 0}%"></i></div>`;
  }
  return "";
}

function availableIds({ capabilities, network, audio, microphone, controller, profile, runtime }) {
  const ids = ["home", "switcher"];
  if (runtime.notifications.length) ids.push("notifications");
  if (capabilities.friends) ids.push("friends");
  ids.push("downloads");
  ids.push("captures");
  if (capabilities.music) ids.push("music");
  if (capabilities.network && network?.interfaces?.length) ids.push("network");
  ids.push("audio");
  if (audio?.microphone || microphone.available) ids.push("microphone");
  if (controller.connected) ids.push("controllers");
  if (profile) ids.push("profile");
  ids.push("power");
  return ids;
}

export function showControlCenterContext(id, focusContext = false, focus = null) {
  const context = document.querySelector("[data-control-center-context]");
  if (!context || !currentData || !definitions[id]) return false;
  lastSelectedId = id;
  document.querySelectorAll("[data-control-center-id]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.controlCenterId === id)));
  const content = contextMarkup(id);
  context.innerHTML = content;
  context.hidden = !content;
  context.dataset.contextFor = id;
  if (content) {
    // Keep the center tray physically stable while moving between controls.
    // Re-triggering an entrance transform on every focus move made the whole
    // Control Center appear to twitch. Only the first reveal animates.
    if (!context.classList.contains("is-visible")) context.classList.add("is-visible");
  }
  if (focusContext && content && focus) {
    const target = context.querySelector("[data-context-autofocus='true'],button,input");
    if (target) focus.setCurrent(target, true);
  }
  return Boolean(content);
}

export function collapseControlCenterContext(focus) {
  const context = document.querySelector("[data-control-center-context]:not([hidden])");
  if (!context || !context.contains(focus.current)) return false;
  const strip = document.querySelector(`[data-control-center-id="${lastSelectedId}"]`);
  if (strip) focus.setCurrent(strip, true);
  return true;
}

export async function populateControlCenter({ overlay, controller, focus }) {
  const panel = overlay.querySelector("[data-control-center-items]");
  if (!panel) return;
  let capabilities = {};
  let network = null;
  let audio = null;
  let microphone = { available: false, active: false, state: "unavailable" };
  try {
    capabilities = await paraApi.capabilities();
    const requests = [];
    if (capabilities.network) requests.push(paraApi.network().then((value) => { network = value; }).catch(() => {}));
    if (capabilities.audio || capabilities.microphone) requests.push(paraApi.audio().then((value) => { audio = value; }).catch(() => {}));
    await Promise.all(requests);
  } catch {
    capabilities = {};
  }

  microphone = await microphoneState();

  const profile = getState().activeProfile;
  const preferences = getProfilePreferences();
  const runtime = profileRuntime();
  currentData = { capabilities, network, audio, microphone, controller, profile, preferences, runtime };
  const available = availableIds(currentData);
  const hidden = new Set(preferences.controlCenter.hidden.filter((id) => !["home", "power"].includes(id)));
  const ordered = [...preferences.controlCenter.order, ...available.filter((id) => !preferences.controlCenter.order.includes(id))]
    .filter((id, index, all) => available.includes(id) && !hidden.has(id) && all.indexOf(id) === index);
  if (!ordered.includes("home")) ordered.unshift("home");
  if (!ordered.includes("power")) ordered.push("power");
  const selected = ordered.includes(lastSelectedId) ? lastSelectedId : ordered[0];
  panel.innerHTML = ordered.map((id) => stripButton(id, id === selected)).join("");

  const onFocus = (event) => {
    const control = event.target.closest?.("[data-control-center-id]");
    if (control) showControlCenterContext(control.dataset.controlCenterId);
  };
  panel.addEventListener("focusin", onFocus);
  panel.addEventListener("pointerover", onFocus);
  overlay.dataset.controlCenterReady = "true";
  const target = panel.querySelector(`[data-control-center-id="${selected}"]`) || panel.querySelector("button");
  if (target) focus.setCurrent(target, true);
  showControlCenterContext(selected);
  window.clearInterval(overlay._paraControlCenterTimer);
  overlay._paraControlCenterTimer = window.setInterval(() => {
    if (overlay.hidden || lastSelectedId !== "downloads") return;
    currentData.runtime = profileRuntime();
    showControlCenterContext("downloads");
  }, 500);
}

export function resetControlCenterData(overlay = null) {
  if (overlay?._paraControlCenterTimer) window.clearInterval(overlay._paraControlCenterTimer);
  currentData = null;
}

export function controlCenterShell() {
  return `<div class="control-center-scrim" data-action="close-control-center"></div><aside class="control-center" role="dialog" aria-modal="true" aria-label="PARA Control Center"><section class="control-center-context" data-control-center-context hidden></section><nav class="control-center-strip" data-control-center-items aria-label="Quick controls"><div class="control-center-loading"><i></i><span>Opening controls…</span></div></nav><div class="control-center-prompt"><b data-prompt="para">PARA</b><span>Close</span></div></aside>`;
}

export const controlCenterDefinitions = definitions;
