import { tile, topbar, hints, progress, listRow } from "../ui/components.js";

export function homeScreen() {
  const primary = [
    { title: "Games", meta: "Your play library", route: "games", icon: "◇", accent: "#9d5cff", autofocus: true },
    { title: "Apps", meta: "Media, tools, and more", route: "apps", icon: "▦", accent: "#5aa6ff" },
    { title: "ParaStore", meta: "Preview catalog", route: "store", icon: "◈", accent: "#efbc5e", badge: "Mock" },
    { title: "Bear Home", meta: "Your files, made friendly", route: "bear-home", icon: "⌂", accent: "#c98f63" },
    { title: "Creator", meta: "Build on PARA", route: "creator", icon: "✦", accent: "#73ddb1" },
    { title: "Social", meta: "Friends, parties, calls", route: "social", icon: "◎", accent: "#ff7fb0" },
    { title: "Settings", meta: "System and account", route: "settings", icon: "⚙", accent: "#a6a0ae" },
  ];
  return `<section class="screen">
    ${topbar()}<div class="screen-head"><div class="screen-head__copy"><span class="eyebrow">Good morning · Mock profile</span><h1>Welcome to your current.</h1><p class="lede">Pick up where you left off, or move somewhere new.</p></div><div class="action-row"><button class="action-button action-button--ghost" data-route="notifications">3 notifications</button><button class="action-button" data-route="quick">Open quick menu</button></div></div>
    <div class="dashboard content-scroll">
      <div class="dashboard__main"><div class="tile-grid">${tile({ title: "Hollow Circuit", meta: "Quick Resume · mock activity", route: "games", icon: "▶", badge: "Resume", className: "tile--hero", art: true, accent: "#a85eff" })}${primary.map(tile).join("")}</div></div>
      <aside class="dashboard__rail">
        <div class="panel"><div class="panel__head"><h3>System pulse</h3><span class="badge badge--preview">Mock</span></div><div class="metric-row"><div class="metric"><div class="metric__value">72°</div><div class="metric__label">Temperature</div></div><div class="metric"><div class="metric__value">860 GB</div><div class="metric__label">Free</div></div><div class="metric"><div class="metric__value">VR —</div><div class="metric__label">VR-US</div></div></div></div>
        <div class="panel"><div class="panel__head"><h3>Download active</h3><button class="badge" data-route="downloads">View all</button></div><p style="font-weight:700">Hollow Circuit</p><p class="micro" style="margin:7px 0 14px">3.8 GB of 5.9 GB · simulated</p>${progress(64)}</div>
        <div class="panel"><div class="panel__head"><h3>Connected</h3><span class="status-chip">Online mock</span></div><div class="list">${listRow({ title: "PulseWave Controller", meta: "Browser mapping · battery mock", icon: "⌁", route: "controller", end: "84%" })}${listRow({ title: "PARA-LAB-5G", meta: "NetworkManager not connected", icon: "◌", route: "network", end: "Mock" })}</div></div>
      </aside>
    </div>${hints({ back: false })}
  </section>`;
}

