import { BACKGROUND_OPTIONS, getProfilePreferences, getProfileRuntime, getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { page, tile, listRow, progress, toggleRow } from "../ui/components.js";
import { demoStorageBytes } from "../services/experience-runtime.js";
import { getParaInputSettings, paraInputOutputLabel, PARA_INPUT_CONTROLS } from "../services/para-input.js";

export function controllerScreen() {
  const input = getParaInputSettings();
  return page({
    title: "Controllers",
    description: "Controllers available to PARA. PulseWave features appear only on verified PulseWave hardware.",
    eyebrow: "Input",
    body: `<section class="controller-hero"><div class="controller-shape" aria-hidden="true"><i data-controller-live-stick></i><b data-controller-live-button="0"></b><b data-controller-live-button="1"></b><b data-controller-live-button="2"></b><b data-controller-live-button="3"></b></div><div><span class="eyebrow" data-controller-slot>Controller</span><h2 data-controller-name>No controller connected</h2><p data-controller-detail>Connect a controller, then press any button.</p></div></section>
      <section class="panel para-input-entry"><div><span class="eyebrow">PARA Input</span><h2>Make keyboard games controller-ready</h2><p>Translate sticks, triggers, and buttons into keyboard and mouse controls with a system profile.</p></div><div class="para-input-entry__state"><strong>${input.enabled ? "Ready" : "Off"}</strong><small>${input.automaticWebGames ? "Automatic web-game mapping On" : "Manual activation"}</small><button class="action-button" data-route="para-input" data-autofocus="true">Open PARA Input</button></div></section>
      <div class="controller-map" data-controller-map hidden><h2>Controls</h2><div><span><b data-prompt="confirm">Enter</b><strong>Select</strong><small>Primary action</small></span><span><b data-prompt="back">Esc</b><strong>Back</strong><small>Return or cancel</small></span><span><b data-prompt="para">PARA</b><strong>PARA</strong><small>Tap controls · hold Home</small></span></div></div>
      <section class="panel pulsewave-firmware" data-pulsewave-firmware hidden><span class="eyebrow">PulseWave hardware</span><h2>Controller firmware</h2><p>Firmware updates, battery health, wake support, and hardware profiles are available only for genuine PulseWave controllers.</p><button class="action-button" data-action="check-controller-firmware">Check for update</button></section>`,
  });
}

export function paraInputScreen() {
  const input = getParaInputSettings();
  const bindings = PARA_INPUT_CONTROLS.map((control, index) => `<button type="button" class="para-input-binding" data-action="cycle-para-input-binding" data-input-control="${control.id}" ${index === 0 ? "data-autofocus='true'" : ""}><span><strong>${control.label}</strong><small>Press A to cycle output</small></span><em>${paraInputOutputLabel(input.bindings[control.id])}</em></button>`).join("");
  const aimMode = input.rightStickMode === "relative" ? "Relative Aim" : "Screen Cursor";
  return page({
    title: "PARA Input",
    description: "Turn controller input into keyboard and mouse controls for games that were never built for a controller.",
    eyebrow: "Controllers",
    className: "para-input-page",
    body: `<section class="para-input-hero panel"><div><span class="eyebrow">Compatibility layer V2</span><h2>Controller → keyboard + mouse</h2><p>V2 uses proper relative-stick aiming, smoother deadzones, frame-rate independent sensitivity, and forced mapping when you enable it for a game.</p></div><button type="button" class="para-input-master ${input.enabled ? "is-on" : ""}" data-action="toggle-para-input"><span>${input.enabled ? "ON" : "OFF"}</span><small>Master switch</small></button></section>
      <section class="panel para-input-auto"><div><span class="eyebrow">Web games</span><h2>Automatic mapping</h2><p>Use PARA Input automatically only when a game is not using native controller input. Manually enabling PARA Input in Control Center now forces the mapping instead of immediately backing off.</p></div><button type="button" class="toggle ${input.automaticWebGames ? "is-on" : ""}" data-action="toggle-para-input-auto" aria-pressed="${input.automaticWebGames}"><span></span></button></section>
      <section class="panel para-input-pointer"><div><span class="eyebrow">Right stick</span><h2>${aimMode}</h2><p>${input.rightStickMode === "relative" ? "Best for shooters and camera control. Aim keeps moving even after the virtual pointer reaches a screen edge." : "Best for menus, point-and-click games, and games that need an actual screen position."}</p></div><div class="para-input-tuning"><button type="button" class="action-button action-button--ghost" data-action="toggle-para-input-aim-mode">Mode: ${aimMode}</button><label>Sensitivity <strong data-para-input-speed-output>${Math.round(input.pointerSpeed)}</strong><input type="range" min="250" max="2200" step="50" value="${input.pointerSpeed}" data-para-input-speed></label><label>Aim deadzone <strong data-para-input-right-deadzone-output>${input.rightDeadzone.toFixed(2)}</strong><input type="range" min="0.06" max="0.45" step="0.01" value="${input.rightDeadzone}" data-para-input-right-deadzone></label><label>Response curve <strong data-para-input-curve-output>${input.pointerCurve.toFixed(2)}</strong><input type="range" min="0.75" max="2.75" step="0.05" value="${input.pointerCurve}" data-para-input-curve></label><button type="button" class="action-button action-button--ghost" data-action="toggle-para-input-invert">Vertical ${input.invertY ? "Inverted" : "Normal"}</button></div></section>
      <section class="panel para-input-pointer"><div><span class="eyebrow">Left stick + triggers</span><h2>Movement tuning</h2><p>Movement uses press/release hysteresis so WASD does not chatter when the stick hovers around the deadzone.</p></div><div class="para-input-tuning"><label>Move deadzone <strong data-para-input-left-deadzone-output>${input.leftDeadzone.toFixed(2)}</strong><input type="range" min="0.10" max="0.55" step="0.01" value="${input.leftDeadzone}" data-para-input-left-deadzone></label><label>Trigger threshold <strong data-para-input-trigger-output>${input.triggerThreshold.toFixed(2)}</strong><input type="range" min="0.08" max="0.80" step="0.02" value="${input.triggerThreshold}" data-para-input-trigger></label></div></section>
      <section class="para-input-bindings"><div class="panel__head"><div><span class="eyebrow">Default profile</span><h2>Keyboard bindings</h2></div><button class="action-button action-button--ghost" data-action="reset-para-input">Reset</button></div><div class="para-input-binding-grid">${bindings}</div><p class="para-input-help">V2 adds Start/View, more keyboard keys, middle mouse, and wheel outputs. The PARA system button is still reserved for the console.</p></section>`,
  });
}

export function activateParaInputScreen() {
  const outputFor = (selector, value) => {
    const output = document.querySelector(selector);
    if (output) output.textContent = value;
  };
  const onInput = (event) => {
    if (event.target.matches("[data-para-input-speed]")) outputFor("[data-para-input-speed-output]", event.target.value);
    if (event.target.matches("[data-para-input-right-deadzone]")) outputFor("[data-para-input-right-deadzone-output]", Number(event.target.value).toFixed(2));
    if (event.target.matches("[data-para-input-left-deadzone]")) outputFor("[data-para-input-left-deadzone-output]", Number(event.target.value).toFixed(2));
    if (event.target.matches("[data-para-input-curve]")) outputFor("[data-para-input-curve-output]", Number(event.target.value).toFixed(2));
    if (event.target.matches("[data-para-input-trigger]")) outputFor("[data-para-input-trigger-output]", Number(event.target.value).toFixed(2));
  };
  document.addEventListener("input", onInput);
  return () => document.removeEventListener("input", onInput);
}

export function updateControllerScreen(controller) {
  const name = document.querySelector("[data-controller-name]");
  const detail = document.querySelector("[data-controller-detail]");
  const map = document.querySelector("[data-controller-map]");
  if (!name || !detail || !map) return;
  name.textContent = controller.connected ? controller.name : "No controller connected";
  detail.textContent = controller.connected ? `${controller.typeLabel} controls active` : "Connect a controller, then press any button.";
  map.hidden = !controller.connected;
  const firmware = document.querySelector("[data-pulsewave-firmware]"); if (firmware) firmware.hidden = !(controller.connected && controller.type === "para");
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
  return page({ title: "Storage", description: "Disk space, saved data, and connected drives.", eyebrow: "System", body: `<div class="storage-shortcuts"><button class="action-button action-button--ghost" data-route="saved-data" data-autofocus="true">Saved Data</button></div><div data-storage-view><div class="library-loading"><span></span><strong>Reading storage…</strong></div></div>` });
}

export async function activateStorage() {
  const container = document.querySelector("[data-storage-view]");
  if (!container) return;
  try {
    const payload = await paraApi.storage();
    const primary = payload.primary || {};
    const demoBytes = demoStorageBytes();
    if (payload.web_edition || primary.capacity_known === false) {
      let browserSummary = "Capacity is managed by this browser.";
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.quota) {
          const used = Number(estimate.usage || 0);
          const quota = Number(estimate.quota || 0);
          const free = Math.max(0, quota - used);
          browserSummary = `${(free / 1_000_000_000).toFixed(1)} GB available to browser storage`;
        }
      } catch { /* browser storage estimate is optional */ }
      container.innerHTML = `<section class="storage-overview panel"><div class="panel__head"><div><span class="eyebrow">PARA Web Edition</span><h2>Browser storage</h2></div><strong>${escapeHtml(browserSummary)}</strong></div><p class="storage-usage">PARA does not expose Render/container disks as console storage.</p></section>${demoBytes ? `<section class="panel demo-storage"><div><span class="eyebrow">PARA demos</span><h2>${(demoBytes / 1_000_000).toFixed(1)} MB</h2></div><button class="action-button action-button--ghost" data-route="games">Manage</button></section>` : ""}<section class="storage-mounts"><h2>Connected drives</h2><div class="library-empty library-empty--small"><span>▯</span><h2>No device drives exposed in Web Edition</h2><p>External drives are available in the native PARA build.</p></div></section>`;
      return;
    }
    const mounts = (payload.mounts || []).filter((mount) => mount.external);
    container.innerHTML = `<section class="storage-overview panel"><div class="panel__head"><div><span class="eyebrow">Primary storage</span><h2>${primary.total_gb} GB</h2></div><strong>${primary.free_gb} GB free</strong></div>${progress(primary.used_percent)}<p class="storage-usage">${primary.used_gb} GB used</p></section>${demoBytes ? `<section class="panel demo-storage"><div><span class="eyebrow">PARA demos</span><h2>${(demoBytes / 1_000_000).toFixed(1)} MB</h2></div><button class="action-button action-button--ghost" data-route="games">Manage</button></section>` : ""}<section class="storage-mounts"><h2>Connected drives</h2>${mounts.length ? `<div class="drive-grid">${mounts.map((mount) => `<div class="drive-card"><span>▯</span><strong>${escapeHtml(mount.name)}</strong><small>${mount.free_gb} GB free · ${escapeHtml(mount.filesystem)}</small></div>`).join("")}</div>` : `<div class="library-empty library-empty--small"><span>▯</span><h2>No external drives connected</h2></div>`}</section>`;
  } catch { container.innerHTML = `<div class="library-empty"><span>▯</span><h2>Storage information is unavailable</h2></div>`; }
}


export function settingsScreen() {
  const state = getState();
  const preferences = getProfilePreferences();
  const background = BACKGROUND_OPTIONS[preferences.background.selection] || BACKGROUND_OPTIONS["para-aurora"];
  const connectedControllers = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const controllerSummary = connectedControllers.length ? `${connectedControllers.length} connected` : "No controller connected";
  const soundSummary = preferences.sound.menuMusic ? `Menu music ${preferences.sound.menuMusicVolume}%` : "Menu music Off";
  const cards = [
    ["Appearance", "Background, Home & display", "personalization", "◩", background.name],
    ["Controllers", "PulseWave, mapping & profiles", "controller", "◇", controllerSummary],
    ["Sound", "Audio, menu music & microphone", "audio-settings", "◖", soundSummary],
    ["Network", "Wi-Fi, Ethernet & connection test", "network", "⌁", navigator.onLine ? "Online" : "Offline"],
    ["Account", "Profile, sign-in & family", "account", "●", state.activeProfile || "Local profile"],
    ["Storage", "Games, apps, captures & drives", "storage", "▯", "Manage storage"],
    ["PARA Files", "Browse files and downloads", "files", "▤", "File manager"],
    ["Media Gallery", "Screenshots and gameplay clips", "media-gallery", "▣", "Captures"],
    ["Accessibility", "Vision, hearing, controls & motion", "accessibility", "◎", "Quick access"],
    ["Notifications", "Friends, downloads & system alerts", "notifications", "◌", "Recent activity"],
    ["Games & Apps", "Library, files & game preferences", "games", "▦", "Your library"],
    ["System", "Power, health, updates & about", "health", "+", "PARA status"],
  ];
  const body = cards.map((item, index) => `<button type="button" class="settings-home-card ${index < 3 ? "settings-home-card--primary" : ""}" data-route="${item[2]}" data-focus-id="settings-card-${index}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="settings-home-card__icon">${item[3]}</span><span class="settings-home-card__copy"><strong>${item[0]}</strong><small>${item[1]}</small></span><em>${escapeHtml(item[4])}</em></button>`).join("");
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
  return page({ title: "Network", description: "Connections available to PARA.", eyebrow: "System", body: `<section class="panel network-service-status"><div class="panel__head"><div><span class="eyebrow">PARA Network</span><h2>${navigator.onLine ? "Services available" : "Offline"}</h2></div><span class="${navigator.onLine ? "status-ok" : "status-warn"}">${navigator.onLine ? "Online" : "Attention"}</span></div><p>${navigator.onLine ? "Store, social, cloud saves, and account services can connect." : "Local games, saves, Files, and Settings remain available."}</p></section><div class="panel"><div class="panel__head"><h2>Connections</h2><button class="action-button action-button--ghost" data-action="refresh-network" data-autofocus="true">Refresh</button></div><div data-network-view><div class="library-loading"><span></span><strong>Checking connections…</strong></div></div></div>` });
}

export async function activateNetwork() {
  const container = document.querySelector("[data-network-view]");
  if (!container) return;
  try {
    const payload = await paraApi.network();
    if (!payload.interfaces?.length) { container.innerHTML = `<div class="library-empty library-empty--small"><span>⌁</span><h2>No network interfaces found</h2></div>`; return; }
    container.innerHTML = `<div class="network-interface-list">${payload.interfaces.map((item) => { const type = item.kind === "wifi" ? "Wi-Fi" : item.kind === "web" ? "Web connection" : "Ethernet"; return `<div class="network-interface"><span>${item.kind === "wifi" ? "⌁" : "↔"}</span><div><strong>${escapeHtml(item.name)}</strong><small>${type}</small></div><b class="${item.connected ? "is-connected" : ""}">${item.connected ? "Connected" : escapeHtml(item.state)}</b></div>`; }).join("")}</div>`;
  } catch { container.innerHTML = `<div class="network-browser-state"><span>⌁</span><div><strong>${navigator.onLine ? "Online" : "Offline"}</strong><small>Browser connection status</small></div></div>`; }
}

export function audioSettingsScreen() {
  const sound = getProfilePreferences().sound;
  return page({ title: "Audio", description: "Sound controls for PARA.", eyebrow: "System", body: `<div class="panel"><div class="list">${toggleRow({ title: "Menu music", meta: "Play Sleep Music No. 1 while browsing PARA. It automatically yields to background media.", action: "toggle-menu-music", value: sound.menuMusic !== false, icon: "♫", autofocus: true })}${toggleRow({ title: "Interface sounds", meta: "Focus, confirm, and notification sounds", action: "toggle-interface-sounds", value: sound.interfaceSounds, icon: "◖" })}</div><label class="settings-slider"><span><strong>Menu music volume</strong><small>PARA fades this out while a Media Session app is playing.</small></span><input type="range" min="0" max="100" step="1" value="${sound.menuMusicVolume ?? 22}" data-menu-music-volume /><output data-menu-music-volume-output>${sound.menuMusicVolume ?? 22}%</output></label><label class="settings-slider"><span><strong>Interface volume</strong><small>Applies to PARA navigation sounds</small></span><input type="range" min="0" max="100" step="1" value="${sound.volume}" data-interface-volume /><output data-interface-volume-output>${sound.volume}%</output></label><div class="audio-media-note"><span>♫</span><div><strong>Background media</strong><small>Compatible ParaStore apps can publish track metadata and Play/Pause/Previous/Next controls to Control Center through the PARA Media Session API.</small></div></div></div>` });
}

export function notificationsScreen() {
  const notifications = getProfileRuntime().notifications;
  const unread = notifications.filter((note) => !note.readAt).length;
  return page({ title: "Notifications", description: "Recent events for this profile.", eyebrow: "System", body: notifications.length ? `<div class="notification-toolbar"><span>${unread ? `${unread} new` : "All read"}</span>${unread ? `<button class="action-button action-button--ghost" data-action="mark-all-notifications-read">Mark all as read</button>` : ""}</div><div class="notification-list">${notifications.map((note, index) => `<button class="notification-row ${note.readAt ? "" : "is-unread"}" ${note.route ? `data-route="${escapeHtml(note.route)}"` : `data-action="mark-notification-read"`} data-notification-id="${escapeHtml(note.id)}" aria-label="${escapeHtml(`${note.title}${note.readAt ? "" : ", new"}`)}" ${index === 0 ? "data-autofocus='true'" : ""}><span>◌</span><div><strong>${escapeHtml(note.title)}</strong><small>${new Date(note.createdAt).toLocaleDateString()}${note.readAt ? " · Read" : " · New"}</small></div></button>`).join("")}</div>` : `<div class="library-empty"><span>◌</span><h2>You’re all caught up</h2></div>` });
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
    const systemLabel = system.web_edition ? "PARA Web Edition · Cloud session" : `${escapeHtml(system.machine)} · ${escapeHtml(system.hostname)}`;
    container.innerHTML = `<span class="update-check">✓</span><div><span class="eyebrow">PARA ${escapeHtml(health.version)}</span><h2>PARA is responding</h2><p>${systemLabel}</p></div><button class="action-button action-button--ghost" data-action="run-health-check">Check again</button>`;
  } catch { container.innerHTML = `<div><h2>PARA needs attention</h2><p>System information could not be reached.</p></div><button class="action-button" data-action="run-health-check">Try again</button>`; }
}

export function recoveryScreen() {
  return page({ title: "PARA Recovery", description: "Repair the system without exposing developer tools.", eyebrow: "Recovery environment", body: `<section class="recovery-status panel"><span class="status-ok">Ready</span><div><h2>Choose a recovery action</h2><p>PARA keeps repair actions separate from normal Home.</p></div></section><div class="recovery-list">${listRow({ title: "Repair Storage", meta: "Check system and game data for problems", icon: "▯", action: "repair-storage", autofocus: true })}${listRow({ title: "Network Recovery", meta: "Reconnect and repair PARA Network services", icon: "⌁", action: "network-recovery" })}${listRow({ title: "Roll Back Update", meta: "Return to the previous known-good PARA build", icon: "↶", action: "rollback-update" })}${listRow({ title: "Safe Mode", meta: "Start only core PARA services", icon: "+", action: "safe-mode" })}${listRow({ title: "Restart PARA", meta: "Restart normally", icon: "↻", action: "restart-shell" })}${listRow({ title: "Reset PARA", meta: "Reset interface preferences and replay setup", icon: "≈", action: "reset-first-boot" })}</div>` });
}

export function savedDataScreen() {
  return page({ title:"Saved Data", description:"Local saves, restore points, and cloud-sync readiness.", eyebrow:"Storage", body:`<section class="panel"><div class="panel__head"><div><span class="eyebrow">Save protection</span><h2>Never tied to uninstall</h2></div><span class="status-ok">Protected</span></div><p>PARA keeps game installations separate from saved data. Local versions remain available even when cloud services are offline.</p></section><div data-saved-data-view><div class="library-loading"><span></span><strong>Reading saves…</strong></div></div>` });
}
export async function activateSavedData() {
  const host=document.querySelector("[data-saved-data-view]"); if(!host)return()=>{};
  const {listSaveData}=await import("../services/save-data.js");
  const render=()=>{const saves=listSaveData(); host.innerHTML=saves.length?`<div class="saved-data-list">${saves.map((x,i)=>`<button class="notification-row" ${i===0?"data-autofocus='true'":""} data-action="open-save-history" data-save-id="${x.gameId}"><span>☁</span><div><strong>${x.title}</strong><small>${new Date(x.updatedAt).toLocaleString()} · ${x.versions.length} restore point${x.versions.length===1?'':'s'}</small></div><b>${x.syncState}</b></button>`).join('')}</div>`:`<div class="library-empty"><span>☁</span><h2>No save data yet</h2><p>Supported games will create local saves here. PARA does not invent demo saves.</p></div>`}; render(); document.addEventListener("para-savedatachange",render); return()=>document.removeEventListener("para-savedatachange",render);
}
