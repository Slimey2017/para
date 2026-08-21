import { getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";

const paths = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  apps: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  play: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" class="icon-fill"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  creator: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/>',
  community: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  system: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z"/>',
  wifi: '<path d="M2 8.8a16 16 0 0 1 20 0"/><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" class="icon-fill"/>',
  storage: '<path d="M4 6h16l2 12H2L4 6Z"/><path d="M3 15h18"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3V6Z"/>',
  power: '<path d="M12 2v10"/><path d="M6.3 5.8a8 8 0 1 0 11.4 0"/>',
};

function icon(name) { return `<svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.system}</svg>`; }

function launcher({ title, subtitle, iconName, route, autofocus = false, disabled = false }) {
  return `<button class="home-launcher" ${route ? `data-route="${route}"` : ""} ${disabled ? "disabled aria-disabled='true'" : ""} ${autofocus ? "data-autofocus='true'" : ""}><span class="home-launcher__glow" aria-hidden="true"></span><span class="home-launcher__icon">${icon(iconName)}</span><span class="home-launcher__copy"><strong>${title}</strong><small>${subtitle}</small></span></button>`;
}

function shortcut({ title, iconName, route }) {
  return `<button class="home-shortcut" data-route="${route}"><span class="home-shortcut__icon">${icon(iconName)}</span><strong>${title}</strong></button>`;
}

export function homeScreen() {
  const profile = getState().activeProfile || "Player One";
  return `<section class="home-ui" aria-label="PARA Home"><div class="home-backdrop" aria-hidden="true"><img class="home-backdrop__art" src="./assets/para-home-background.png" alt="" /><span class="home-backdrop__veil"></span><span class="home-backdrop__pulse"></span></div><header class="home-header"><div class="home-wordmark" aria-label="PARA"><span class="home-wordmark__mark" aria-hidden="true"><i></i></span><strong>PARA</strong></div><nav class="home-nav" aria-label="Primary navigation"><span class="home-nav__current">${icon("home")}<b>Home</b></span><button class="home-nav__button" data-route="apps">${icon("apps")}<span>Apps</span></button><button class="home-nav__button" data-route="settings">${icon("settings")}<span>Settings</span></button></nav><div class="home-status"><button class="home-status__icon" data-route="network" aria-label="Network">${icon("wifi")}</button><time class="home-status__clock" data-clock>--:--</time><button class="home-status__icon" data-route="power" aria-label="Power">${icon("power")}</button></div></header><div class="home-welcome"><div><p class="home-welcome__greeting"><span data-greeting>Good afternoon</span>, ${escapeHtml(profile)}!</p><h1>Welcome home</h1><p>Your applications and system are ready.</p></div><button class="home-utility" data-route="quick">${icon("apps")}<span>Quick Menu</span></button></div><div class="home-launchers" aria-label="Main launcher">${launcher({ title: "Continue", subtitle: "No recent activity", iconName: "play", disabled: true })}${launcher({ title: "Explore", subtitle: "Open your applications", iconName: "explore", route: "apps", autofocus: true })}${launcher({ title: "Create", subtitle: "No creator tools available", iconName: "creator", disabled: true })}${launcher({ title: "Community", subtitle: "No connected services", iconName: "community", disabled: true })}${launcher({ title: "System", subtitle: "Manage your PARA", iconName: "system", route: "settings" })}</div><section class="home-live-panel" aria-labelledby="system-overview-heading"><div class="home-live-panel__head"><h2 id="system-overview-heading">System Overview</h2><span data-home-host>Checking…</span></div><div class="home-live-metrics"><button data-route="storage"><span>${icon("storage")}</span><strong data-home-storage>Checking…</strong><small>Storage</small></button><button data-route="network"><span>${icon("wifi")}</span><strong data-home-network>Checking…</strong><small>Network</small></button><div><span>${icon("system")}</span><strong data-home-system>Checking…</strong><small>System</small></div></div></section><section class="home-section home-shortcuts"><h2>Shortcuts</h2><div class="home-shortcut-grid home-shortcut-grid--compact">${shortcut({ title: "Apps", iconName: "apps", route: "apps" })}${shortcut({ title: "Bear Home", iconName: "folder", route: "bear-home" })}${shortcut({ title: "Downloads", iconName: "folder", route: "downloads" })}${shortcut({ title: "Profile", iconName: "profile", route: "account" })}${shortcut({ title: "Settings", iconName: "settings", route: "settings" })}</div></section></section>`;
}

export async function activateHomeData() {
  try {
    const [storage, network, system] = await Promise.all([paraApi.storage(), paraApi.network(), paraApi.system()]);
    const primary = storage.primary;
    document.querySelectorAll("[data-home-storage]").forEach((node) => { node.textContent = `${primary.free_gb} GB free`; });
    document.querySelectorAll("[data-home-network]").forEach((node) => { node.textContent = network.connected ? "Connected" : "Offline"; });
    document.querySelectorAll("[data-home-system]").forEach((node) => { node.textContent = "PARA ready"; });
    document.querySelectorAll("[data-home-host]").forEach((node) => { node.textContent = system.hostname || "PARA"; });
  } catch {
    document.querySelectorAll("[data-home-storage], [data-home-network], [data-home-system], [data-home-host]").forEach((node) => { node.textContent = "Unavailable"; });
  }
}
