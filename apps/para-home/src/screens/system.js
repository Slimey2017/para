import { getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { page, tile, listRow, progress, toggleRow } from "../ui/components.js";

export function controllerScreen() {
  return page({ title: "Controllers", description: "Controllers available to PARA.", eyebrow: "Input", body: `<section class="controller-hero"><div class="controller-shape" aria-hidden="true"></div><div><span class="eyebrow" data-controller-slot>Controller</span><h2 data-controller-name>No controller connected</h2><p data-controller-detail>Connect a controller, then press any button.</p></div></section><div class="controller-map" data-controller-map hidden><h2>Controls</h2><div><span><b data-prompt="confirm">Enter</b><strong>Select</strong><small>Primary action</small></span><span><b data-prompt="back">Esc</b><strong>Back</strong><small>Return or cancel</small></span><span><b data-prompt="para">PARA</b><strong>PARA</strong><small>Tap controls · hold Home</small></span></div></div>` });
}

export function updateControllerScreen(controller) {
  const name = document.querySelector("[data-controller-name]");
  const detail = document.querySelector("[data-controller-detail]");
  const map = document.querySelector("[data-controller-map]");
  if (!name || !detail || !map) return;
  name.textContent = controller.connected ? controller.name : "No controller connected";
  detail.textContent = controller.connected ? `${controller.typeLabel} controls active` : "Connect a controller, then press any button.";
  map.hidden = !controller.connected;
}

export function storageScreen() {
  return page({ title: "Storage", description: "Disk space and connected drives.", eyebrow: "System", body: `<div data-storage-view><div class="library-loading"><span></span><strong>Reading storage…</strong></div></div>` });
}

export async function activateStorage() {
  const container = document.querySelector("[data-storage-view]");
  if (!container) return;
  try {
    const payload = await paraApi.storage();
    const primary = payload.primary;
    const mounts = (payload.mounts || []).filter((mount) => mount.external);
    container.innerHTML = `<section class="storage-overview panel"><div class="panel__head"><div><span class="eyebrow">Primary storage</span><h2>${primary.total_gb} GB</h2></div><strong>${primary.free_gb} GB free</strong></div>${progress(primary.used_percent)}<p class="storage-usage">${primary.used_gb} GB used</p></section><section class="storage-mounts"><h2>Connected drives</h2>${mounts.length ? `<div class="drive-grid">${mounts.map((mount) => `<div class="drive-card"><span>▯</span><strong>${escapeHtml(mount.name)}</strong><small>${mount.free_gb} GB free · ${escapeHtml(mount.filesystem)}</small></div>`).join("")}</div>` : `<div class="library-empty library-empty--small"><span>▯</span><h2>No external drives connected</h2></div>`}</section>`;
  } catch { container.innerHTML = `<div class="library-empty"><span>▯</span><h2>Storage information is unavailable</h2></div>`; }
}

export function settingsScreen() {
  const items = [
    ["Personalization", "Background, Home, and Control Center", "personalization", "◩"],
    ["Display", "Screen information and interface size", "display", "▭"],
    ["Network", "Connections available to PARA", "network", "⌁"],
    ["Controllers", "Gamepads available to PARA", "controller", "◇"],
    ["Storage", "Disk usage and mounted drives", "storage", "▯"],
    ["Downloads", "Open your Downloads folder", "downloads", "↓"],
    ["Account", "Local PARA profile", "account", "●"],
    ["Accessibility", "Text, contrast, and motion", "accessibility", "◎"],
    ["Power", "Session controls", "power", "○"],
    ["Repair & health", "PARA and system status", "health", "+"],
  ];
  return page({ title: "System", description: "Manage the parts of PARA available on this system.", eyebrow: "Settings", className: "settings-page", body: `<div class="settings-grid">${items.map((item, index) => tile({ title: item[0], meta: item[1], route: item[2], icon: item[3], autofocus: index === 0, className: "settings-tile" })).join("")}</div>` });
}

export function displayScreen() {
  const state = getState();
  return page({ title: "Display", description: "Information from the screen running PARA.", eyebrow: "System", body: `<div class="system-columns"><section class="panel"><div class="panel__head"><h2>Current screen</h2><span class="status-ok">Active</span></div><div class="display-summary"><strong data-display-resolution>Reading…</strong><span data-refresh-rate>Reading…</span><span data-hdr-status>Reading…</span></div><div class="list">${listRow({ title: "Interface size", meta: "Choose couch or desk spacing", icon: "Aa", end: state.displayMode, action: "cycle-display-mode", autofocus: true })}${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", action: "toggle-large", value: state.largeText, icon: "Aa" })}</div></section><aside class="display-preview"><span>PARA</span><i></i><small>Current interface</small></aside></div>` });
}

export function accessibilityScreen() {
  const state = getState();
  return page({ title: "Accessibility", description: "Preferences that change the PARA interface now.", eyebrow: "System", body: `<div class="panel"><div class="list">${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", action: "toggle-large", value: state.largeText, icon: "Aa", autofocus: true })}${toggleRow({ title: "Reduce motion", meta: "Use calmer transitions", action: "toggle-reduced", value: state.reducedMotion, icon: "≈" })}${toggleRow({ title: "High contrast", meta: "Strengthen text and interface edges", action: "toggle-contrast", value: state.highContrast, icon: "◐" })}</div></div>` });
}

export function networkScreen() {
  return page({ title: "Network", description: "Connections available to PARA.", eyebrow: "System", body: `<div class="panel"><div class="panel__head"><h2>Connections</h2><button class="action-button action-button--ghost" data-action="refresh-network" data-autofocus="true">Refresh</button></div><div data-network-view><div class="library-loading"><span></span><strong>Checking connections…</strong></div></div></div>` });
}

export async function activateNetwork() {
  const container = document.querySelector("[data-network-view]");
  if (!container) return;
  try {
    const payload = await paraApi.network();
    if (!payload.interfaces?.length) { container.innerHTML = `<div class="library-empty library-empty--small"><span>⌁</span><h2>No network interfaces found</h2></div>`; return; }
    container.innerHTML = `<div class="network-interface-list">${payload.interfaces.map((item) => `<div class="network-interface"><span>${item.kind === "wifi" ? "⌁" : "↔"}</span><div><strong>${escapeHtml(item.name)}</strong><small>${item.kind === "wifi" ? "Wi-Fi" : "Ethernet"}</small></div><b class="${item.connected ? "is-connected" : ""}">${item.connected ? "Connected" : escapeHtml(item.state)}</b></div>`).join("")}</div>`;
  } catch { container.innerHTML = `<div class="library-empty library-empty--small"><span>⌁</span><h2>Network information is unavailable</h2></div>`; }
}

export function accountScreen() {
  const profile = getState().activeProfile || "Player One";
  const initials = profile === "Player One" ? "P1" : profile.slice(0, 2).toUpperCase();
  return page({ title: "Account", description: "The profile used for this PARA session.", eyebrow: "Local profile", body: `<section class="account-hero panel"><span class="avatar">${escapeHtml(initials)}</span><div><h2>${escapeHtml(profile)}</h2><p>Stored on this device</p></div><button class="action-button action-button--ghost" data-route="profiles" data-autofocus="true">Switch Profile</button></section><div class="tile-grid tile-grid--wide account-actions">${tile({ title: "Sign out", meta: "Return to profile selection", action: "sign-out", icon: "↗" })}</div>` });
}

export function powerScreen() {
  return page({ title: "Power", description: "Controls for the PARA session.", eyebrow: "System", body: `<div class="power-grid">${tile({ title: "Return Home", meta: "Go back to PARA Home", route: "home", icon: "⌂", autofocus: true })}${tile({ title: "Restart PARA", meta: "Reload the PARA interface", action: "restart-shell", icon: "↻" })}${tile({ title: "Sign out", meta: "Return to profile selection", action: "sign-out", icon: "↗" })}${tile({ title: "Recovery", meta: "Open PARA recovery choices", route: "recovery", icon: "+" })}</div>` });
}

export function healthScreen() {
  return page({ title: "Repair & health", description: "Live status from PARA and this system.", eyebrow: "System", body: `<section class="health-hero panel" data-health-view><div class="library-loading"><span></span><strong>Checking PARA…</strong></div></section><div class="tile-grid tile-grid--wide">${tile({ title: "Storage", meta: "View disk and drive status", route: "storage", icon: "▯", autofocus: true })}${tile({ title: "Network", meta: "View connection status", route: "network", icon: "⌁" })}${tile({ title: "Recovery", meta: "Restart or replay setup", route: "recovery", icon: "+" })}</div>` });
}

export async function activateHealth() {
  const container = document.querySelector("[data-health-view]");
  if (!container) return;
  try {
    const [health, system] = await Promise.all([paraApi.health(), paraApi.system()]);
    container.innerHTML = `<span class="update-check">✓</span><div><span class="eyebrow">PARA ${escapeHtml(health.version)}</span><h2>PARA is responding</h2><p>${escapeHtml(system.machine)} · ${escapeHtml(system.hostname)}</p></div><button class="action-button action-button--ghost" data-action="run-health-check">Check again</button>`;
  } catch { container.innerHTML = `<div><h2>PARA needs attention</h2><p>System information could not be reached.</p></div><button class="action-button" data-action="run-health-check">Try again</button>`; }
}

export function recoveryScreen() {
  return page({ title: "Recovery", description: "Safe actions for the PARA interface.", eyebrow: "Repair & health", body: `<div class="recovery-list">${listRow({ title: "Restart PARA", meta: "Reload the interface", icon: "↻", action: "restart-shell", autofocus: true })}${listRow({ title: "Replay welcome setup", meta: "Clear PARA interface preferences", icon: "≈", action: "reset-first-boot" })}</div>` });
}
