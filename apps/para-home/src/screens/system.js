import { getProfilePreferences, getProfileRuntime, getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { page, tile, listRow, progress, toggleRow } from "../ui/components.js";
import { demoStorageBytes } from "../services/experience-runtime.js";

export function controllerScreen() {
  return page({ title: "Controllers", description: "Controllers available to PARA.", eyebrow: "Input", body: `<section class="controller-hero"><div class="controller-shape" aria-hidden="true"><i data-controller-live-stick></i><b data-controller-live-button="0"></b><b data-controller-live-button="1"></b><b data-controller-live-button="2"></b><b data-controller-live-button="3"></b></div><div><span class="eyebrow" data-controller-slot>Controller</span><h2 data-controller-name>No controller connected</h2><p data-controller-detail>Connect a controller, then press any button.</p></div></section><div class="controller-map" data-controller-map hidden><h2>Controls</h2><div><span><b data-prompt="confirm">Enter</b><strong>Select</strong><small>Primary action</small></span><span><b data-prompt="back">Esc</b><strong>Back</strong><small>Return or cancel</small></span><span><b data-prompt="para">PARA</b><strong>PARA</strong><small>Tap controls · hold Home</small></span></div></div>` });
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

export function activateControllerScreen() {
  const onInput = (event) => {
    const { buttons = [], axes = [] } = event.detail || {};
    document.querySelectorAll("[data-controller-live-button]").forEach((node) => node.classList.toggle("is-pressed", Boolean(buttons[Number(node.dataset.controllerLiveButton)])));
    const stick = document.querySelector("[data-controller-live-stick]");
    if (stick) stick.style.transform = `translate(${Math.round((axes[0] || 0) * 8)}px, ${Math.round((axes[1] || 0) * 8)}px)`;
  };
  document.addEventListener("para-controllerinput", onInput);
  return () => document.removeEventListener("para-controllerinput", onInput);
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
    const demoBytes = demoStorageBytes();
    container.innerHTML = `<section class="storage-overview panel"><div class="panel__head"><div><span class="eyebrow">Primary storage</span><h2>${primary.total_gb} GB</h2></div><strong>${primary.free_gb} GB free</strong></div>${progress(primary.used_percent)}<p class="storage-usage">${primary.used_gb} GB used</p></section>${demoBytes ? `<section class="panel demo-storage"><div><span class="eyebrow">PARA demos</span><h2>${(demoBytes / 1_000_000).toFixed(1)} MB</h2></div><button class="action-button action-button--ghost" data-route="games">Manage</button></section>` : ""}<section class="storage-mounts"><h2>Connected drives</h2>${mounts.length ? `<div class="drive-grid">${mounts.map((mount) => `<div class="drive-card"><span>▯</span><strong>${escapeHtml(mount.name)}</strong><small>${mount.free_gb} GB free · ${escapeHtml(mount.filesystem)}</small></div>`).join("")}</div>` : `<div class="library-empty library-empty--small"><span>▯</span><h2>No external drives connected</h2></div>`}</section>`;
  } catch { container.innerHTML = `<div class="library-empty"><span>▯</span><h2>Storage information is unavailable</h2></div>`; }
}

export function settingsScreen() {
  const cards = [
    ["Appearance", "Background, Home & display", "personalization", "◩", "Violet Horizon"],
    ["Controllers", "PulseWave, mapping & profiles", "controller", "◇", "Player 1"],
    ["Sound", "Audio, menu music & microphone", "audio-settings", "◖", "Menu music 35%"],
    ["Network", "Wi-Fi, Ethernet & connection test", "network", "⌁", navigator.onLine ? "Online" : "Offline"],
    ["Account", "Profile, sign-in & family", "account", "●", "Local profile"],
    ["Storage", "Games, apps, captures & drives", "storage", "▯", "Manage storage"],
    ["Accessibility", "Vision, hearing, controls & motion", "accessibility", "◎", "Quick access"],
    ["Notifications", "Friends, downloads & system alerts", "notifications", "◌", "Recent activity"],
    ["Games & Apps", "Library, files & game preferences", "games", "▦", "Your library"],
    ["System", "Power, health, updates & about", "health", "+", "PARA status"],
  ];
  const body = cards.map((item, index) => `<button type="button" class="settings-home-card ${index < 3 ? "settings-home-card--primary" : ""}" data-route="${item[2]}" data-focus-id="settings-card-${index}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="settings-home-card__icon">${item[3]}</span><span class="settings-home-card__copy"><strong>${item[0]}</strong><small>${item[1]}</small></span><em>${item[4]}</em></button>`).join("");
  return page({
    title: "Settings",
    description: "Set up PARA your way.",
    eyebrow: "PARA",
    className: "settings-page settings-page--lounge",
    body: `<div class="settings-lounge-grid" data-focus-scope="settings">${body}</div>`,
  });
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
  } catch { container.innerHTML = `<div class="network-browser-state"><span>⌁</span><div><strong>${navigator.onLine ? "Online" : "Offline"}</strong><small>Browser connection status</small></div></div>`; }
}

export function audioSettingsScreen() {
  const sound = getProfilePreferences().sound;
  return page({ title: "Audio", description: "Sound controls for PARA.", eyebrow: "System", body: `<div class="panel"><div class="list">${toggleRow({ title: "Menu music", meta: "Play A Slow Dream while browsing PARA", action: "toggle-menu-music", value: sound.menuMusic !== false, icon: "♫", autofocus: true })}${toggleRow({ title: "Interface sounds", meta: "Focus, confirm, and notification sounds", action: "toggle-interface-sounds", value: sound.interfaceSounds, icon: "◖" })}</div><label class="settings-slider"><span><strong>Menu music volume</strong><small>Quiet by default for comfortable couch listening</small></span><input type="range" min="0" max="100" step="1" value="${sound.menuMusicVolume ?? 22}" data-menu-music-volume /><output data-menu-music-volume-output>${sound.menuMusicVolume ?? 22}%</output></label><label class="settings-slider"><span><strong>Interface volume</strong><small>Applies to PARA navigation sounds</small></span><input type="range" min="0" max="100" step="1" value="${sound.volume}" data-interface-volume /><output data-interface-volume-output>${sound.volume}%</output></label></div>` });
}

export function notificationsScreen() {
  const notifications = getProfileRuntime().notifications;
  return page({ title: "Notifications", description: "Recent events for this profile.", eyebrow: "System", body: notifications.length ? `<div class="notification-list">${notifications.map((note, index) => `<button class="notification-row" ${note.route ? `data-route="${escapeHtml(note.route)}"` : "disabled"} ${index === 0 ? "data-autofocus='true'" : ""}><span>◌</span><div><strong>${escapeHtml(note.title)}</strong><small>${new Date(note.createdAt).toLocaleDateString()}</small></div></button>`).join("")}</div>` : `<div class="library-empty"><span>◌</span><h2>You’re all caught up</h2></div>` });
}

export function aboutScreen() {
  return page({ title: "About PARA", description: "System and build information.", eyebrow: "PARA OS Web", body: `<section class="about-build panel"><span class="eyebrow">Current build</span><h2>PARA OS Web · Build 0.7.3</h2><p>Linux console shell interface</p></section><div class="settings-grid">${tile({ title: "PARA Lab", meta: "Browser, display, and controller diagnostics", route: "para-lab", icon: "⌬", autofocus: true })}</div>` });
}

export function paraLabScreen() {
  return page({ title: "PARA Lab", description: "Live diagnostic information for this session.", eyebrow: "Experimental", body: `<div class="lab-grid" data-para-lab><div><span>Frame rate</span><strong data-lab-fps>Reading…</strong></div><div><span>Resolution</span><strong data-lab-resolution>Reading…</strong></div><div><span>Browser</span><strong data-lab-browser>Reading…</strong></div><div><span>Gamepads</span><strong data-lab-gamepads>Reading…</strong></div><div><span>Connection</span><strong data-lab-online>Reading…</strong></div></div>` });
}

export function activateParaLab() {
  let alive = true;
  let frames = 0;
  let started = performance.now();
  let frame = 0;
  const update = () => {
    if (!alive) return;
    frames += 1;
    const now = performance.now();
    if (now - started >= 1000) {
      const fps = document.querySelector("[data-lab-fps]");
      if (fps) fps.textContent = `${Math.round(frames * 1000 / (now - started))} FPS`;
      frames = 0; started = now;
      const resolution = document.querySelector("[data-lab-resolution]");
      const browser = document.querySelector("[data-lab-browser]");
      const gamepads = document.querySelector("[data-lab-gamepads]");
      const online = document.querySelector("[data-lab-online]");
      if (resolution) resolution.textContent = `${window.innerWidth} × ${window.innerHeight}`;
      if (browser) browser.textContent = navigator.userAgentData?.brands?.at(-1)?.brand || navigator.userAgent.split(" ").at(-1)?.split("/")[0] || "Browser";
      if (gamepads) gamepads.textContent = `${[...(navigator.getGamepads?.() || [])].filter(Boolean).length} connected`;
      if (online) online.textContent = navigator.onLine ? "Online" : "Offline";
    }
    frame = requestAnimationFrame(update);
  };
  frame = requestAnimationFrame(update);
  return () => { alive = false; cancelAnimationFrame(frame); };
}

export function resetParaScreen() {
  return page({ title: "Reset PARA", description: "Remove profiles, settings, demos, and saved activity from this browser.", eyebrow: "System", body: `<section class="reset-panel panel"><span>↺</span><div><h2>Start over?</h2><p>PARA will replay the startup and all 14 setup chapters.</p></div><button class="action-button" data-action="reset-first-boot" data-autofocus="true">Reset PARA</button></section>` });
}

export function accountScreen() {
  const profile = getState().activeProfile || "P1";
  const initials = profile.slice(0, 2).toUpperCase();
  return page({ title: "Account", description: "The profile used for this PARA session.", eyebrow: "Local profile", body: `<section class="account-hero panel"><span class="avatar">${escapeHtml(initials)}</span><div><h2>${escapeHtml(profile)}</h2><p>Stored on this device</p></div><button class="action-button action-button--ghost" data-route="profiles" data-autofocus="true">Switch Profile</button></section><div class="tile-grid tile-grid--wide account-actions">${tile({ title: "Marks", meta: "Milestones earned on PARA", route: "marks", icon: "◇" })}${tile({ title: "Sign out", meta: "Return to profile selection", action: "sign-out", icon: "↗" })}</div>` });
}

export function powerScreen() {
  return page({
    title: "Power",
    description: "Choose what PARA should do next.",
    eyebrow: "System",
    body: `<div class="power-grid">
      ${tile({ title: "Return Home", meta: "Return to PARA Home", route: "home", icon: "⌂", autofocus: true, className: "power-tile" })}
      ${tile({ title: "Sleep", meta: "Enter a low-power rest state", action: "enter-sleep", icon: "◒", className: "power-tile power-tile--primary" })}
      ${tile({ title: "Restart PARA", meta: "Restart PARA and begin again", action: "restart-shell", icon: "↻", className: "power-tile" })}
      ${tile({ title: "Turn Off PARA", meta: "Shut down PARA", action: "confirm-turn-off", icon: "○", className: "power-tile power-tile--primary" })}
      ${tile({ title: "Sign Out", meta: "Return to profile selection", action: "sign-out", icon: "↗", className: "power-tile" })}
      ${tile({ title: "Recovery", meta: "Open PARA Recovery", route: "recovery", icon: "+", className: "power-tile" })}
    </div>
    <div class="power-confirm" data-power-confirm hidden>
      <section class="power-confirm__card" role="alertdialog" aria-modal="true" aria-labelledby="power-confirm-title" aria-describedby="power-confirm-copy">
        <span class="power-confirm__symbol" aria-hidden="true">○</span>
        <h2 id="power-confirm-title">Turn off PARA?</h2>
        <p id="power-confirm-copy">Any unsaved work may be lost.</p>
        <div class="power-confirm__actions">
          <button type="button" class="action-button" data-action="cancel-turn-off" data-autofocus="true">Cancel</button>
          <button type="button" class="action-button action-button--purple" data-action="turn-off-para">Turn Off</button>
        </div>
      </section>
    </div>`,
  });
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
