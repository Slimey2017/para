import { getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { paraLogo } from "../ui/components.js";

const paths = {
  apps: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  controller: '<path d="M7 8h10a5 5 0 0 1 4.8 6.4l-1 3.3a2.2 2.2 0 0 1-3.7.9L14.8 16H9.2l-2.3 2.6a2.2 2.2 0 0 1-3.7-.9l-1-3.3A5 5 0 0 1 7 8Z"/><path d="M7 11v4M5 13h4"/><circle cx="17" cy="12" r=".8" class="icon-fill"/><circle cx="19" cy="14" r=".8" class="icon-fill"/>',
  storage: '<path d="M4 6h16l2 12H2L4 6Z"/><path d="M3 15h18"/><circle cx="18" cy="17" r=".7" class="icon-fill"/>',
  files: '<path d="M3 7h7l2 2h9v10H3V7Z"/><path d="M3 10h18"/>',
  network: '<path d="M2 8.8a16 16 0 0 1 20 0"/><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" class="icon-fill"/>',
  power: '<path d="M12 2v10"/><path d="M6.3 5.8a8 8 0 1 0 11.4 0"/>',
};

const sections = [
  { id: "continue", title: "Continue" },
  { id: "explore", title: "Explore" },
  { id: "create", title: "Create" },
  { id: "community", title: "Community" },
  { id: "system", title: "System" },
];

function icon(name, className = "home-icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.apps}</svg>`;
}

function initials(profile) {
  return profile.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function mainNavigation() {
  return sections.map(({ id, title }, index) => `<button class="home-section-tab" type="button" role="tab" id="home-tab-${id}" aria-controls="home-context" aria-selected="${index === 0}" data-home-section-target="${id}" ${index === 0 ? "data-autofocus='true'" : ""}><span>${title}</span></button>`).join("");
}

function applicationArtwork(application) {
  if (application.icon) return `<img src="${escapeHtml(application.icon)}" alt="" />`;
  if (application.id === "para:files") return '<span class="home-app__files" aria-hidden="true"><i></i></span>';
  return `<span class="home-app__letter" aria-hidden="true">${escapeHtml(application.name.slice(0, 1).toUpperCase())}</span>`;
}

function applicationButton(application) {
  const name = escapeHtml(application.name);
  const destination = application.launch?.kind === "route"
    ? `data-route="${escapeHtml(application.launch.route)}"`
    : `data-action="launch-linux-app" data-app-id="${escapeHtml(application.id)}" data-app-name="${name}"`;
  return `<button class="home-app" type="button" ${destination}><span class="home-app__art">${applicationArtwork(application)}</span><strong>${name}</strong></button>`;
}

function quietState(section, title) {
  return `<div class="home-context-empty"><span>${section}</span><h2>${title}</h2></div>`;
}

function loadingState(section) {
  return `<div class="home-context-empty home-context-empty--loading"><span>${section}</span><i aria-hidden="true"></i></div>`;
}

function applicationStrip(section, applications, emptyMessage) {
  if (!applications.length) return quietState(section, emptyMessage);
  return `<div class="home-context-heading"><span>${section}</span><small>${applications.length} ${applications.length === 1 ? "application" : "applications"}</small></div><div class="home-content-strip">${applications.map(applicationButton).join("")}</div>`;
}

function systemAction(title, route, iconName) {
  return `<button class="home-system-action" type="button" data-route="${route}"><span>${icon(iconName)}</span><strong>${title}</strong></button>`;
}

function contextMarkup(section, model) {
  if (section === "continue") return quietState("Continue", "Nothing to continue");
  if (section === "community") return quietState("Community", "No community services are connected");
  if (section === "explore") {
    if (model.loading) return loadingState("Explore");
    if (model.failed) return quietState("Explore", "Apps couldn’t be loaded");
    return applicationStrip("Explore", model.applications, "No applications available");
  }
  if (section === "create") {
    if (model.loading) return loadingState("Create");
    if (model.failed) return quietState("Create", "Creation apps couldn’t be loaded");
    const creatorApps = model.applications.filter((application) => application.roles?.includes("creator"));
    return applicationStrip("Create", creatorApps, "No creation apps found");
  }
  const actions = [systemAction("Settings", "settings", "settings")];
  if (model.capabilities.files) actions.push(systemAction("Files", "files", "files"));
  if (model.controller?.connected) actions.push(systemAction("Controllers", "controller", "controller"));
  if (model.capabilities.storage) actions.push(systemAction("Storage", "storage", "storage"));
  if (model.capabilities.network) actions.push(systemAction("Network", "network", "network"));
  if (model.capabilities.power) actions.push(systemAction("Power", "power", "power"));
  return `<div class="home-context-heading"><span>System</span></div><div class="home-system-strip">${actions.join("")}</div>`;
}

export function homeScreen() {
  const profile = getState().activeProfile || "Player One";
  return `<section class="home-ui" data-home-section="continue" aria-label="PARA Home"><div class="home-backdrop profile-wallpaper" aria-hidden="true"><span class="home-backdrop__veil"></span><span class="home-backdrop__light"></span><span class="home-backdrop__particles"></span></div><header class="home-header"><button class="home-wordmark" type="button" data-action="open-control-center" aria-label="Open PARA Control Center">${paraLogo("home-wordmark__logo")}<strong>PARA</strong></button><div class="home-status"><time class="home-status__clock" data-clock>--:--</time><button class="home-profile" type="button" data-route="account" aria-label="Open ${escapeHtml(profile)} profile"><span>${escapeHtml(initials(profile))}</span></button></div></header><div class="home-canvas" aria-hidden="true"></div><main class="home-dock"><nav class="home-sections" role="tablist" aria-label="PARA Home">${mainNavigation()}</nav><section class="home-context" id="home-context" role="tabpanel" aria-labelledby="home-tab-continue" aria-live="polite">${quietState("Continue", "Nothing to continue")}</section></main></section>`;
}

export function activateHome({ focus, controller }) {
  const root = document.querySelector(".home-ui");
  const context = root?.querySelector(".home-context");
  if (!root || !context) return () => {};

  const model = { applications: [], capabilities: {}, controller, loading: true, failed: false };
  let selected = "continue";
  let transitionTimer = null;
  let alive = true;

  const renderContext = (section, animate = true) => {
    selected = section;
    root.dataset.homeSection = section;
    root.querySelectorAll("[data-home-section-target]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.homeSectionTarget === section));
    });
    context.setAttribute("aria-labelledby", `home-tab-${section}`);
    clearTimeout(transitionTimer);
    const update = () => {
      if (!alive || selected !== section) return;
      context.innerHTML = contextMarkup(section, model);
      context.classList.remove("is-changing");
    };
    if (!animate || getState().reducedMotion) update();
    else {
      context.classList.add("is-changing");
      transitionTimer = setTimeout(update, 105);
    }
  };

  const tabFromEvent = (event) => event.target.closest?.("[data-home-section-target]");
  const onFocus = (event) => {
    const tab = tabFromEvent(event);
    if (tab) renderContext(tab.dataset.homeSectionTarget);
  };
  const onPointer = (event) => {
    const tab = tabFromEvent(event);
    if (tab && tab.dataset.homeSectionTarget !== selected) renderContext(tab.dataset.homeSectionTarget);
  };
  const onClick = (event) => {
    const tab = tabFromEvent(event);
    if (!tab) return;
    renderContext(tab.dataset.homeSectionTarget);
    focus.setCurrent(tab, true);
  };
  const onControllerChange = (event) => {
    model.controller = event.detail;
    if (selected === "system") renderContext(selected, false);
  };

  root.addEventListener("focusin", onFocus);
  root.addEventListener("pointerover", onPointer);
  root.addEventListener("click", onClick);
  document.addEventListener("para-controllerchange", onControllerChange);

  Promise.allSettled([paraApi.capabilities(), paraApi.applications()]).then(([capabilities, applications]) => {
    if (!alive) return;
    if (capabilities.status === "fulfilled") model.capabilities = capabilities.value || {};
    if (applications.status === "fulfilled") model.applications = applications.value.applications || [];
    else model.failed = true;
    model.loading = false;
    renderContext(selected, false);
  });

  return () => {
    alive = false;
    clearTimeout(transitionTimer);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("pointerover", onPointer);
    root.removeEventListener("click", onClick);
    document.removeEventListener("para-controllerchange", onControllerChange);
  };
}
