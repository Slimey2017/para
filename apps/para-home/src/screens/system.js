import { mock } from "../mock-data.js";
import { getState } from "../state.js";
import { page, tile, listRow, progress, topbar, hints, stubNotice } from "../ui/components.js";

export function notificationsScreen() {
  const body = `<div class="panel"><div class="panel__head"><h2>Latest</h2><button class="action-button action-button--ghost" data-action="clear-mock">Clear mock items</button></div><div class="list">${mock.notifications.map((item, index) => listRow({ ...item, action: "notification-stub", end: index === 0 ? "New" : "" , autofocus: index === 0 })).join("")}</div></div>`;
  return page({ title: "Notifications", description: "System, social, download, and app notices will gather here.", eyebrow: "Activity · Mock items", body });
}

export function downloadsScreen() {
  const body = `<div class="panel"><div class="panel__head"><h2>Transfer queue</h2><span class="badge badge--preview">Simulation only</span></div><div class="list">${mock.downloads.map((item, index) => `<button class="list-row" data-action="download-stub" ${index === 0 ? "data-autofocus='true'" : ""}><span class="list-row__icon">↓</span><span class="list-row__body"><span class="list-row__title">${item.title}</span><span class="list-row__meta">${item.meta}</span><span style="display:block;margin-top:12px">${progress(item.progress)}</span></span><span class="list-row__end">${item.progress}%</span></button>`).join("")}</div></div>`;
  return page({ title: "Downloads", description: "A queue prototype for apps, games, media, system packages, pause rules, and bandwidth controls.", eyebrow: "Transfers · Mock", body });
}

export function quickScreen() {
  return `<section class="screen" style="padding:0;background:rgba(0,0,0,.35)"><aside class="quick-menu">
    ${topbar({ mockLabel: false })}<div><span class="eyebrow">Quick menu</span><h2 style="margin-top:16px">At a glance</h2></div>
    <div class="metric-row"><div class="metric"><div class="metric__value">84%</div><div class="metric__label">PulseWave mock</div></div><div class="metric"><div class="metric__value">72°</div><div class="metric__label">Temperature mock</div></div><div class="metric"><div class="metric__value">5G</div><div class="metric__label">Network mock</div></div></div>
    <div class="list">${listRow({ title: "Notifications", meta: "3 mock notices", route: "notifications", icon: "✦", autofocus: true })}${listRow({ title: "Downloads", meta: "1 simulated transfer active", route: "downloads", icon: "↓" })}${listRow({ title: "Controller", meta: "Browser Gamepad API", route: "controller", icon: "⌁" })}${listRow({ title: "Accessibility", meta: "Visual preferences", route: "accessibility", icon: "◎" })}${listRow({ title: "Power", meta: "Safe development actions", route: "power", icon: "○" })}</div>
    <div style="margin-top:auto">${hints()}</div>
  </aside></section>`;
}

export function controllerScreen() {
  const body = `<div class="tile-grid tile-grid--wide">${tile({ title: "PulseWave Controller", meta: "Browser-compatible controller mapping", action: "controller-test", icon: "⌁", badge: "Browser API", className: "tile--hero", art: true, autofocus: true })}${tile({ title: "Pair a controller", meta: "OS Bluetooth pairing service required", action: "pair-stub", icon: "+", badge: "Stub" })}${tile({ title: "Button map", meta: "A confirm · B back · Menu quick", action: "controller-test", icon: "◇", badge: "Prototype" })}${tile({ title: "Haptics test", meta: "No vibration is triggered", action: "haptics-stub", icon: "≈", badge: "Stub" })}</div>${stubNotice("Native PulseWave pairing, firmware, battery, and secure transport")}`;
  return page({ title: "Controllers", description: "The frontend supports keyboard and Browser Gamepad input; native PulseWave hardware support remains isolated behind a service boundary.", eyebrow: "Input · Safe prototype", body });
}

export function storageScreen() {
  const body = `<div class="panel"><div class="panel__head"><div><h2>Internal storage</h2><p class="tile__meta">Mock 1 TB development model — not a real disk scan</p></div><span class="badge badge--preview">Mock</span></div>${progress(14)}<div class="metric-row" style="margin-top:22px"><div class="metric"><div class="metric__value">140 GB</div><div class="metric__label">Used</div></div><div class="metric"><div class="metric__value">860 GB</div><div class="metric__label">Free</div></div><div class="metric"><div class="metric__value">0</div><div class="metric__label">Drives mounted</div></div></div></div><div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "Games & apps", meta: "82 GB mock usage", action: "storage-stub", icon: "◇", badge: "Mock", autofocus: true })}${tile({ title: "Captures", meta: "34 GB mock usage", action: "storage-stub", icon: "▧", badge: "Mock" })}${tile({ title: "External drives", meta: "No device access in dev mode", action: "storage-stub", icon: "▯", badge: "Stub" })}</div>`;
  return page({ title: "Storage", description: "Capacity, categories, external media, and safe move/copy flows will live here. Formatting and deletion are not implemented.", eyebrow: "Storage management · Non-destructive", body });
}

export function settingsScreen() {
  const items = [
    ["Network", "Connections and offline mode", "network", "⌁"], ["Controllers", "PulseWave pairing and mapping", "controller", "◇"],
    ["Storage", "Capacity and media", "storage", "▯"], ["Accessibility", "Comfort and input", "accessibility", "◎"],
    ["Account", "Profile and privacy", "account", "●"], ["Subscription", "Plans and benefits", "subscription", "✦"],
    ["Downloads", "Transfer queue", "downloads", "↓"], ["System & updates", "Version and update boundary", "recovery", "↻"],
    ["Power", "Exit the development session", "power", "○"],
  ];
  const body = `<div class="tile-grid tile-grid--settings">${items.map((item, index) => tile({ title: item[0], meta: item[1], route: item[2], icon: item[3], autofocus: index === 0 })).join("")}</div>`;
  return page({ title: "Settings", description: "PARA settings are grouped by what you are trying to do, with risky Linux integration kept outside the frontend.", eyebrow: "System · Development mode", body });
}

export function accessibilityScreen() {
  const state = getState();
  const body = `<div class="panel"><div class="panel__head"><h2>Display comfort</h2><span class="badge badge--live">Frontend works</span></div><div class="list">
    ${listRow({ title: "Reduce motion", meta: state.reducedMotion ? "On — decorative motion minimized" : "Off — full prototype motion", action: "toggle-reduced", icon: "≈", end: state.reducedMotion ? "On" : "Off", autofocus: true })}
    ${listRow({ title: "Large text", meta: state.largeText ? "On — enlarged base scale" : "Off — standard couch scale", action: "toggle-large", icon: "Aa", end: state.largeText ? "On" : "Off" })}
    ${listRow({ title: "High contrast", meta: state.highContrast ? "On — stronger edges" : "Off — standard contrast", action: "toggle-contrast", icon: "◐", end: state.highContrast ? "On" : "Off" })}
    ${listRow({ title: "Screen reader", meta: "Semantic labels included; full console TTS service planned", action: "accessibility-stub", icon: "◉", end: "Stub" })}
    ${listRow({ title: "Controller remapping", meta: "Requires native input service and per-profile storage", action: "accessibility-stub", icon: "⌁", end: "Stub" })}
  </div></div>`;
  return page({ title: "Accessibility", description: "Useful visual preferences work locally now. Broader assistive technology integration stays explicit about its current status.", eyebrow: "Comfort · Mixed status", body });
}

export function networkScreen() {
  const body = `<div class="panel"><div class="panel__head"><div><h2>Available networks</h2><p class="tile__meta">Simulated scan — NetworkManager is untouched</p></div><button class="action-button action-button--ghost" data-action="network-scan-stub">Scan again</button></div><div class="list">${mock.networks.map((network, index) => listRow({ ...network, action: "network-stub", icon: "⌁", end: network.signal, autofocus: index === 0 })).join("")}</div></div>${stubNotice("NetworkManager / iwd integration and credential storage")}`;
  return page({ title: "Network", description: "A future permission-aware network service will mediate Linux connectivity instead of the UI running privileged commands.", eyebrow: "Connectivity · Simulated", body });
}

export function accountScreen() {
  const body = `<div class="panel"><div class="panel__head"><div style="display:flex;align-items:center;gap:18px"><span class="avatar" style="width:78px;height:78px;font-size:1.5rem">P1</span><div><h2>Player One</h2><p class="tile__meta">Local prototype profile</p></div></div><span class="badge badge--preview">Not authenticated</span></div></div><div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "Profile", meta: "Name, avatar, controller assignment", action: "account-stub", icon: "●", badge: "Mock", autofocus: true })}${tile({ title: "Privacy", meta: "Permissions and telemetry choices", action: "account-stub", icon: "◇", badge: "Stub" })}${tile({ title: "Security", meta: "PIN, passkeys, recovery", action: "account-stub", icon: "⌾", badge: "Stub" })}${tile({ title: "Switch profile", meta: "Return to local profile cards", route: "profiles", icon: "↻" })}</div>`;
  return page({ title: "Account", description: "The identity shell avoids fake security. Real sign-in will require a backend, encrypted tokens, recovery policy, and parental controls.", eyebrow: "Profile · Local mock", body });
}

export function subscriptionScreen() {
  const body = `${stubNotice("Subscription billing and entitlement")}<div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "PARA Free", meta: "Local apps, calls, browser, and core device use must not require a plan", action: "subscription-stub", icon: "○", badge: "Concept", autofocus: true })}${tile({ title: "PARA Plus", meta: "Optional cloud and catalog benefits · concept only", action: "subscription-stub", icon: "✦", badge: "Concept" })}${tile({ title: "Manage plan", meta: "Unavailable — no billing service exists", action: "subscription-stub", icon: "↗", badge: "Stub", disabled: true })}</div>`;
  return page({ title: "Subscription", description: "A transparent concept page for optional services. Core console, calls, browser, and local apps are not presented as paywalled.", eyebrow: "Plans · No billing", body });
}

export function powerScreen() {
  const body = `<div class="tile-grid tile-grid--wide">${tile({ title: "Return Home", meta: "Go back to PARA Home", route: "home", icon: "⌂", autofocus: true })}${tile({ title: "Sign out profile", meta: "Clear local prototype session", action: "sign-out", icon: "↗" })}${tile({ title: "Restart PARA shell", meta: "Reload this browser prototype only", action: "restart-shell", icon: "↻" })}${tile({ title: "Sleep console", meta: "Requires logind integration", action: "power-stub", icon: "◐", badge: "Stub", disabled: true })}${tile({ title: "Shut down system", meta: "Never triggered by development mode", action: "power-stub", icon: "○", badge: "Disabled", disabled: true })}${tile({ title: "Recovery", meta: "Open the safe recovery menu", route: "recovery", icon: "+" })}</div>`;
  return page({ title: "Power", description: "Only frontend-safe actions work. Development mode cannot suspend, restart, or power off the PC.", eyebrow: "Session controls · Safe mode", body });
}

export function recoveryScreen() {
  const body = `<div class="panel"><div class="panel__head"><div><h2>Recovery center</h2><p class="tile__meta">Documentation and harmless prototype actions only</p></div><span class="badge badge--live">Safe</span></div><p class="muted">Real recovery must be designed, signed, tested on dedicated hardware, and separated from user data. This screen cannot edit partitions, bootloaders, firmware, or the host desktop.</p></div><div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "Restart PARA shell", meta: "Reload frontend state without touching Linux", action: "restart-shell", icon: "↻", badge: "Works", autofocus: true })}${tile({ title: "Replay first boot", meta: "Clear only browser prototype state", action: "reset-first-boot", icon: "≈", badge: "Works" })}${tile({ title: "System diagnostics", meta: "Read-only mock API health", action: "diagnostics", icon: "⌁", badge: "Works" })}${tile({ title: "Repair installation", meta: "Package verification design boundary", action: "recovery-stub", icon: "+", badge: "Stub", disabled: true })}${tile({ title: "Factory reset", meta: "Intentionally absent from this prototype", action: "recovery-stub", icon: "!", badge: "Not implemented", disabled: true })}</div>`;
  return page({ title: "Recovery", description: "A non-destructive recovery shell that tells the truth about what development mode can and cannot do.", eyebrow: "Recovery · Harmless prototype", body });
}
