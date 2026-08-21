import { getState } from "../state.js";

const paths = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  store: '<path d="M6 8V6a6 6 0 0 1 12 0v2"/><path d="M4 8h16l-1 13H5L4 8Z"/>',
  creator: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/><path d="M4 20h4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  play: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" class="icon-fill"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  community: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  system: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" class="icon-fill"/>',
  wifi: '<path d="M2 8.8a16 16 0 0 1 20 0"/><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" class="icon-fill"/>',
  battery: '<rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4"/><path d="M5 9h10v6H5z" class="icon-fill"/>',
  gamepad: '<path d="M6 8h12a4 4 0 0 1 3.8 5.2l-1.4 4.1a2.5 2.5 0 0 1-4.2 1l-1.5-1.7H9.3l-1.5 1.7a2.5 2.5 0 0 1-4.2-1l-1.4-4.1A4 4 0 0 1 6 8Z"/><path d="M7 11v4M5 13h4"/><circle cx="16.5" cy="12" r=".8" class="icon-fill"/><circle cx="18.5" cy="14" r=".8" class="icon-fill"/>',
  file: '<path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
  temperature: '<path d="M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z"/><path d="M10 7v9"/><circle cx="10" cy="18" r="2" class="icon-fill"/>',
  storage: '<path d="M4 6h16l2 12H2L4 6Z"/><path d="M3 15h18"/><circle cx="18" cy="16.5" r=".8" class="icon-fill"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  messages: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h2v2H8zM14 14h2v2h-2z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.4 9a3 3 0 1 1 4.7 2.5c-1.4.9-2.1 1.4-2.1 3"/><circle cx="12" cy="18" r=".7" class="icon-fill"/>',
};

function icon(name, className = "") {
  return `<svg class="home-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.system}</svg>`;
}

function routeAttributes({ route, action = "dashboard-stub", label }) {
  return route ? `data-route="${route}"` : `data-action="${action}" data-dashboard-label="${label}"`;
}

function launcher({ title, subtitle, iconName, route, autofocus = false, progress = false }) {
  return `<button class="home-launcher" ${routeAttributes({ route, label: title })} ${autofocus ? "data-autofocus='true'" : ""}>
    <span class="home-launcher__glow" aria-hidden="true"></span>
    <span class="home-launcher__icon">${icon(iconName)}</span>
    <span class="home-launcher__copy"><strong>${title}</strong><small>${subtitle}</small></span>
    ${progress ? '<span class="home-launcher__progress" aria-label="Mock progress: 78 percent"><i></i></span>' : ""}
  </button>`;
}

function activity({ title, meta, iconName, route, action }) {
  return `<button class="home-activity" ${routeAttributes({ route, action, label: title })} data-mock="true">
    <span class="home-activity__icon">${icon(iconName)}</span>
    <span><strong>${title}</strong><small>${meta}</small></span>
  </button>`;
}

function shortcut({ title, iconName, route, action }) {
  return `<button class="home-shortcut" ${routeAttributes({ route, action, label: title })}>
    <span class="home-shortcut__icon">${icon(iconName)}</span><strong>${title}</strong>
  </button>`;
}

export function homeScreen() {
  const activeProfile = getState().activeProfile;
  const profile = activeProfile === "Player One" || !activeProfile ? "P1" : activeProfile;

  return `<section class="home-ui" aria-label="PARA Home">
    <div class="home-backdrop" aria-hidden="true">
      <img class="home-backdrop__art" src="./assets/para-home-background.png" alt="" />
      <span class="home-backdrop__veil"></span>
      <span class="home-backdrop__pulse"></span>
    </div>

    <header class="home-header">
      <div class="home-wordmark" aria-label="PARA"><span class="home-wordmark__mark" aria-hidden="true"><i></i></span><strong>PARA</strong></div>
      <nav class="home-nav" aria-label="Primary navigation">
        <button class="home-nav__button home-nav__button--current" data-action="home-current" aria-current="page">${icon("home")}<span>Home</span></button>
        <button class="home-nav__button" data-route="store">${icon("store")}<span>Store</span></button>
        <button class="home-nav__button" data-route="creator">${icon("creator")}<span>Creator</span></button>
        <button class="home-nav__button" data-route="settings">${icon("settings")}<span>Settings</span></button>
      </nav>
      <div class="home-status" aria-label="System status">
        <button class="home-status__coins" data-route="store" data-mock="true" aria-label="12,450 mock ParaPoints">${icon("coin")}<strong>12,450</strong></button>
        <span class="home-status__divider" aria-hidden="true"></span>
        <button class="home-status__icon" data-route="network" aria-label="Network settings">${icon("wifi")}</button>
        <time class="home-status__clock" data-clock aria-label="Current time">--:--</time>
        <button class="home-status__icon" data-route="power" aria-label="Power menu">${icon("battery")}</button>
      </div>
    </header>

    <div class="home-welcome">
      <div>
        <p class="home-welcome__greeting"><span data-greeting>Good afternoon</span>, ${profile}!</p>
        <h1>Welcome back</h1>
        <p>Pick up where you left off, or discover something new.</p>
      </div>
      <div class="home-welcome__actions">
        <button class="home-utility" data-route="notifications">${icon("bell")}<span>3 Notifications</span></button>
        <button class="home-utility" data-route="quick">${icon("grid")}<span>Quick Menu</span></button>
      </div>
    </div>

    <div class="home-launchers" aria-label="Main launcher">
      ${launcher({ title: "Continue", subtitle: "Jump back in", iconName: "play", route: "games", autofocus: true, progress: true })}
      ${launcher({ title: "Explore", subtitle: "Discover new things", iconName: "explore", route: "store" })}
      ${launcher({ title: "Create", subtitle: "Make something amazing", iconName: "creator", route: "creator" })}
      ${launcher({ title: "Community", subtitle: "Connect with others", iconName: "community", route: "social" })}
      ${launcher({ title: "System", subtitle: "Manage your setup", iconName: "system", route: "settings" })}
    </div>

    <div class="home-lower">
      <section class="home-section home-recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent Activity <span>Mock activity</span></h2>
        <div class="home-activity-strip">
          ${activity({ title: "Neon Drift", meta: "Played 1h ago", iconName: "gamepad", route: "games" })}
          ${activity({ title: "Project Aurora", meta: "Edited 3h ago", iconName: "file", route: "creator" })}
          ${activity({ title: "Screenshot_0423", meta: "Captured 5h ago", iconName: "image", action: "dashboard-stub" })}
        </div>
      </section>

      <section class="home-system-panel" aria-labelledby="overview-heading">
        <h2 id="overview-heading">System Overview <span>Mock status</span></h2>
        <div class="home-metrics">
          <button class="home-metric" data-action="dashboard-stub" data-dashboard-label="Temperature" data-mock="true">
            <span>${icon("temperature")}</span><strong>72°</strong><small>Temperature</small>
          </button>
          <button class="home-metric" data-route="storage" data-mock="true">
            <span>${icon("storage")}</span><strong>860 GB</strong><small>Free Space</small>
          </button>
          <button class="home-metric" data-route="network" data-mock="true">
            <span>${icon("wifi")}</span><strong>Connected</strong><small>PulseWave 5G</small>
          </button>
        </div>
      </section>
    </div>

    <section class="home-section home-shortcuts" aria-labelledby="shortcuts-heading">
      <h2 id="shortcuts-heading">Shortcuts</h2>
      <div class="home-shortcut-grid">
        ${shortcut({ title: "Profile", iconName: "profile", route: "account" })}
        ${shortcut({ title: "Messages", iconName: "messages", route: "social" })}
        ${shortcut({ title: "Calendar", iconName: "calendar", action: "dashboard-stub" })}
        ${shortcut({ title: "Achievements", iconName: "trophy", action: "dashboard-stub" })}
        ${shortcut({ title: "Library", iconName: "grid", route: "apps" })}
        ${shortcut({ title: "Help", iconName: "help", action: "dashboard-stub" })}
      </div>
    </section>
  </section>`;
}
