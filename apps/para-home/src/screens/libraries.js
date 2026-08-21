import { mock } from "../mock-data.js";
import { page, tile, stubNotice, listRow } from "../ui/components.js";

export function gamesScreen() {
  const body = `<div class="panel" style="margin-bottom:22px"><div class="panel__head"><div><h2>Installed & available</h2><p class="tile__meta">All titles are fictional development data.</p></div><div class="action-row"><button class="action-button action-button--ghost" data-action="filter-stub">Filter</button><button class="action-button" data-route="store">Find games</button></div></div></div><div class="tile-grid tile-grid--compact">${mock.games.map((game, index) => tile({ title: game.title, meta: game.meta, action: "game-stub", icon: index === 1 ? "▶" : "◇", badge: game.status, accent: game.color, autofocus: index === 0 })).join("")}</div>`;
  return page({ title: "Games", description: "A controller-first library shell with space reserved for licenses, installs, compatibility, and Quick Resume.", eyebrow: "Library · Mock catalog", body });
}

export function appsScreen() {
  const body = `<div class="tile-grid">${mock.apps.map((app, index) => tile({ title: app.title, meta: app.meta, route: app.title === "Bear Home" ? "bear-home" : app.title === "Creator Mode" ? "creator" : undefined, action: app.title === "VR-US" ? "vrus-stub" : "app-stub", icon: app.icon, badge: app.status, autofocus: index === 0, disabled: app.title === "VR-US" })).join("")}</div>`;
  return page({ title: "Apps", description: "A home for media, communication, creation, and future Linux application containers.", eyebrow: "Applications · Mock library", body });
}

export function storeScreen() {
  const body = `${stubNotice("ParaStore commerce")}<div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "Fresh currents", meta: "Curated concept titles — no checkout", action: "store-stub", icon: "✦", badge: "Preview", className: "tile--hero", art: true, autofocus: true })}${tile({ title: "Games", meta: "Mock discovery rail", action: "store-stub", icon: "◇", badge: "Mock" })}${tile({ title: "Apps", meta: "Mock discovery rail", action: "store-stub", icon: "▦", badge: "Mock" })}${tile({ title: "Creator drops", meta: "UGC boundary only", action: "store-stub", icon: "✧", badge: "Stub" })}</div>`;
  return page({ title: "ParaStore", description: "Discovery UI only. Purchases, licenses, refunds, ratings, and downloads need a real trusted backend.", eyebrow: "Storefront · No commerce", body });
}

export function bearHomeScreen() {
  const hotspot = ({ label, x, y, w, h, route, action = "bear-folder-stub", className = "", autofocus = false }) =>
    `<button class="bear-hotspot ${className}" style="--x:${x}%;--y:${y}%;--w:${w}%;--h:${h}%" ${route ? `data-route="${route}"` : `data-action="${action}" data-collection="${label}"`} data-focus-label="${label}" aria-label="Open ${label}" ${autofocus ? "data-autofocus='true'" : ""}></button>`;

  return `<section class="bear-home-room" aria-label="Bear Home visual file manager">
    <div class="console-art-frame bear-home-room__frame">
    <img class="console-art-frame__image bear-home-room__art" src="./assets/bear-home-room.png" alt="A warm illustrated wooden living room with a chibi PARA bear and glowing file-category signs" />
    ${hotspot({ label: "PARA Home", x: 0, y: 0, w: 18, h: 10, route: "home", className: "bear-hotspot--brand" })}
    ${hotspot({ label: "Videos", x: 2.7, y: 15.8, w: 10.2, h: 10.5, autofocus: true })}
    ${hotspot({ label: "Discs", x: 28.2, y: 20.1, w: 8.2, h: 8.8 })}
    ${hotspot({ label: "Music", x: 60.4, y: 14.8, w: 9.4, h: 9.3 })}
    ${hotspot({ label: "Documents", x: 73.8, y: 18.7, w: 12.2, h: 9.6 })}
    ${hotspot({ label: "External Drives", x: 88.3, y: 19.8, w: 10.4, h: 12.8 })}
    ${hotspot({ label: "Downloads", x: 68.7, y: 74.1, w: 13.2, h: 12.5, route: "downloads" })}
    ${hotspot({ label: "Settings", x: 10.2, y: 77.5, w: 9.5, h: 17.5, route: "settings", className: "bear-hotspot--round" })}
    ${hotspot({ label: "More collections", x: 38.7, y: 48.4, w: 9.2, h: 25.5, action: "bear-more", className: "bear-hotspot--bear" })}
    <time class="bear-live-clock" data-clock aria-label="Current time">--:--</time>
    <span class="bear-room-mode">Interactive mock room</span>
    <div class="bear-room-hints"><span><b>↕↔</b> Move</span><span><b>Enter</b> Open</span><span><b>Esc</b> Back</span><span><b>M</b> Quick</span></div>
    <aside class="bear-drawer" data-bear-drawer hidden aria-label="More Bear Home collections">
      <div class="panel__head"><div><span class="eyebrow">More rooms</span><h2 style="margin-top:12px">Bear’s other shelves</h2></div><button class="action-button action-button--ghost" data-action="bear-drawer-close" aria-label="Close more collections">×</button></div>
      <p class="muted">These collections are reserved for the full file service. Selecting one explains its current development status.</p>
      <div class="list">
        ${listRow({ title: "Photos", meta: "Screenshots and albums · mock", icon: "▧", action: "bear-folder-stub", autofocus: true })}
        ${listRow({ title: "Games / UGC", meta: "Mods and creator content · stub", icon: "◇", action: "bear-folder-stub" })}
        ${listRow({ title: "Cloud", meta: "Provider boundary not connected", icon: "☁", action: "bear-folder-stub" })}
        ${listRow({ title: "Trash", meta: "Deletion is not implemented", icon: "⌫", action: "bear-folder-stub" })}
      </div>
    </aside>
    </div>
  </section>`;
}

export function creatorScreen() {
  const body = `<div class="tile-grid tile-grid--wide">${tile({ title: "Project dock", meta: "Open local development projects", action: "creator-stub", icon: "⌁", badge: "Stub", className: "tile--hero", art: true, autofocus: true })}${tile({ title: "PARA SDK", meta: "Protocol types and mock API", action: "creator-stub", icon: "{ }", badge: "Early" })}${tile({ title: "Device simulator", meta: "PulseWave and VR-US test data", action: "creator-stub", icon: "◎", badge: "Planned" })}${tile({ title: "Package validator", meta: "Manifest checks and signing boundary", action: "creator-stub", icon: "✓", badge: "Stub" })}${tile({ title: "Developer options", meta: "Safe local switches only", action: "creator-stub", icon: "⚙", badge: "Preview" })}</div>`;
  return page({ title: "Creator Mode", description: "The future workspace for games, apps, packages, controller maps, and PARA-safe test environments.", eyebrow: "Developer tools · Early shell", body });
}
