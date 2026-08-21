export function homeScreen() {
  const hotspot = ({
    label, x, y, w, h, route, action = "dashboard-stub", className = "", autofocus = false,
  }) => `<button class="dashboard-hotspot ${className}" style="--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%" ${route ? `data-route="${route}"` : `data-action="${action}"`} data-dashboard-label="${label}" aria-label="${label}" ${autofocus ? "data-autofocus='true'" : ""}><span class="visually-hidden">${label}</span></button>`;

  return `<section class="para-dashboard" aria-label="PARA Home dashboard">
    <div class="console-art-frame para-dashboard__frame">
      <img class="console-art-frame__image" src="./assets/para-home-dashboard.png" alt="PARA Home, a matte-black and purple console dashboard with launcher cards, recent activity, system overview, and shortcuts" />

      ${hotspot({ label: "Home — current section", x: 29.1, y: 3.2, w: 10.3, h: 6.9, action: "home-current", className: "dashboard-hotspot--pill" })}
      ${hotspot({ label: "ParaStore", x: 40.1, y: 3.2, w: 7.4, h: 6.9, route: "store", className: "dashboard-hotspot--pill" })}
      ${hotspot({ label: "Creator Mode", x: 47.8, y: 3.2, w: 9.5, h: 6.9, route: "creator", className: "dashboard-hotspot--pill" })}
      ${hotspot({ label: "Settings", x: 57.8, y: 3.2, w: 11.2, h: 6.9, route: "settings", className: "dashboard-hotspot--pill" })}

      ${hotspot({ label: "3 notifications", x: 74.6, y: 19.4, w: 10.9, h: 6.0, route: "notifications", className: "dashboard-hotspot--small" })}
      ${hotspot({ label: "Quick Menu", x: 86.0, y: 19.4, w: 10.2, h: 6.0, route: "quick", className: "dashboard-hotspot--small" })}

      ${hotspot({ label: "Continue", x: 4.9, y: 31.6, w: 17.9, h: 27.8, route: "games", autofocus: true })}
      ${hotspot({ label: "Explore", x: 23.9, y: 31.6, w: 16.8, h: 27.8, route: "store" })}
      ${hotspot({ label: "Create", x: 41.7, y: 31.6, w: 16.8, h: 27.8, route: "creator" })}
      ${hotspot({ label: "Community", x: 59.3, y: 31.6, w: 16.8, h: 27.8, route: "social" })}
      ${hotspot({ label: "System", x: 77.0, y: 31.6, w: 17.5, h: 27.8, route: "settings" })}

      ${hotspot({ label: "Neon Drift — recent game mock", x: 5.0, y: 67.5, w: 16.5, h: 10.2, action: "dashboard-stub", className: "dashboard-hotspot--activity" })}
      ${hotspot({ label: "Project Aurora — recent creator mock", x: 21.7, y: 67.5, w: 16.5, h: 10.2, route: "creator", className: "dashboard-hotspot--activity" })}
      ${hotspot({ label: "Screenshot 0423 — recent capture mock", x: 38.0, y: 67.5, w: 16.5, h: 10.2, action: "dashboard-stub", className: "dashboard-hotspot--activity" })}

      ${hotspot({ label: "Profile", x: 5.0, y: 84.6, w: 13.5, h: 9.2, route: "account", className: "dashboard-hotspot--shortcut" })}
      ${hotspot({ label: "Messages", x: 19.4, y: 84.6, w: 13.7, h: 9.2, route: "social", className: "dashboard-hotspot--shortcut" })}
      ${hotspot({ label: "Calendar — placeholder", x: 33.2, y: 84.6, w: 14.3, h: 9.2, action: "dashboard-stub", className: "dashboard-hotspot--shortcut" })}
      ${hotspot({ label: "Achievements — placeholder", x: 48.2, y: 84.6, w: 14.2, h: 9.2, action: "dashboard-stub", className: "dashboard-hotspot--shortcut" })}
      ${hotspot({ label: "Library", x: 63.7, y: 84.6, w: 13.7, h: 9.2, route: "apps", className: "dashboard-hotspot--shortcut" })}
      ${hotspot({ label: "Help — placeholder", x: 78.3, y: 84.6, w: 16.1, h: 9.2, action: "dashboard-stub", className: "dashboard-hotspot--shortcut" })}

      <time class="dashboard-live-clock" data-clock aria-label="Current time">--:--</time>
    </div>
  </section>`;
}
