import { getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { recentExperience } from "../services/experience-runtime.js";
import { paraLogo } from "../ui/components.js";

const sections = [
  { id: "continue", title: "Continue" },
  { id: "explore", title: "Explore" },
  { id: "create", title: "Create" },
  { id: "community", title: "Community" },
];

let rememberedHomeSection = "continue";

function initials(profile) {
  return profile.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function mainNavigation(selected) {
  return sections.map(({ id, title }) => `<button class="home-section-tab" type="button" role="tab" id="home-tab-${id}" aria-controls="home-context" aria-selected="${id === selected}" data-home-section-target="${id}" data-focus-id="home-nav:${id}" ${id === selected ? "data-autofocus='true'" : ""}><span>${title}</span></button>`).join("");
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
  return `<button class="home-app" type="button" ${destination} data-focus-id="home-app:${escapeHtml(application.id)}"><span class="home-app__art">${applicationArtwork(application)}</span><strong>${name}</strong></button>`;
}

function continueEmptyState() {
  return `<div class="home-context-empty"><span>Continue</span><h2>Ready to play?</h2><p>Choose something from Explore.</p><button class="home-text-action" type="button" data-home-open-section="explore" data-focus-id="continue:explore">Open Explore <i aria-hidden="true">→</i></button></div>`;
}

function quietState(section, title, detail = "") {
  return `<div class="home-context-empty"><span>${section}</span><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ""}</div>`;
}

function exploreAction(title, subtitle, route, mark) {
  return `<button class="home-explore-action" type="button" data-route="${route}" data-focus-id="home-route:${route}"><span aria-hidden="true">${mark}</span><strong>${title}</strong><small>${subtitle}</small></button>`;
}

function continueMarkup(experience) {
  if (!experience) return continueEmptyState();
  return `<div class="home-resume" style="--resume-accent:${escapeHtml(experience.accent || "#9b5cff")}"><span class="home-resume__art" aria-hidden="true">${escapeHtml(experience.mark || "◉")}</span><div><span>${escapeHtml(experience.kind || "Recent")}</span><h2>${escapeHtml(experience.title)}</h2><button class="action-button" data-route="${escapeHtml(experience.route)}" data-focus-id="continue:resume">Resume</button></div></div>`;
}

function contextMarkup(section, model) {
  if (section === "continue") return continueMarkup(model.recent);
  if (section === "community") return `<div class="home-context-heading"><span>Community</span><small>Official PARA updates</small></div><div class="home-system-strip">${exploreAction("PARA Updates", "News, patches, and Lab notes", "community", "◎")}</div>`;
  if (section === "explore") {
    return `<div class="home-context-heading"><span>Explore</span><small>Games, apps, and demos</small></div><div class="home-explore-strip">${exploreAction("Games", "Installed for this profile", "games", "◉")}${exploreAction("Apps", "Available on PARA", "apps", "▦")}${exploreAction("Demos", "Small playable experiences", "demos", "◇")}${exploreAction("ParaStore", "Install free demos", "parastore", "▱")}</div>`;
  }
  if (section === "create") {
    const creatorApps = model.applications.filter((application) => application.roles?.includes("creator"));
    return `<div class="home-context-heading"><span>Create</span><small>Make something</small></div><div class="home-content-strip">${exploreAction("Creator Playground", "Draw, write, and build a beat", "creator", "✦")}${creatorApps.map(applicationButton).join("")}</div>`;
  }
  return quietState("Community", "No updates available");
}

export function homeScreen() {
  const profile = getState().activeProfile || "P1";
  const selected = sections.some(({ id }) => id === rememberedHomeSection) ? rememberedHomeSection : "continue";
  return `<section class="home-ui" data-home-section="${selected}" data-focus-scope="home" aria-label="PARA Home"><div class="home-backdrop profile-wallpaper" aria-hidden="true"><span class="home-backdrop__veil"></span><span class="home-backdrop__light"></span><span class="home-backdrop__particles"></span></div><header class="home-header" data-focus-zone="home-header" data-nav-down-zone="home-nav"><button class="home-wordmark" type="button" data-action="open-control-center" data-focus-id="home-header:para" aria-label="Open PARA Control Center">${paraLogo("home-wordmark__logo")}<strong>PARA</strong></button><div class="home-status"><time class="home-status__clock" data-clock>--:--</time><button class="home-profile" type="button" data-route="account" data-focus-id="home-header:profile" aria-label="Open ${escapeHtml(profile)} profile"><span>${escapeHtml(initials(profile))}</span></button></div></header><main class="home-dock"><nav class="home-sections" role="tablist" aria-label="PARA Home" data-focus-zone="home-nav" data-nav-up-zone="home-header" data-nav-down-zone="home-content">${mainNavigation(selected)}</nav><section class="home-context" id="home-context" role="tabpanel" aria-labelledby="home-tab-${selected}" aria-live="polite" data-focus-zone="home-content" data-focus-scope="home:${selected}" data-nav-up="home-nav:${selected}">${continueEmptyState()}</section></main><footer class="home-control-legend control-legend" aria-hidden="true"><span><b class="prompt-key prompt-key--blue" data-prompt="confirm">Enter</b>Select</span><span><b class="prompt-key prompt-key--red" data-prompt="back">Esc</b>Back</span><span><b class="prompt-key" data-prompt="shoulderPrevious">PgUp</b><b class="prompt-key" data-prompt="shoulderNext">PgDn</b>Sections</span></footer></section>`;
}

export function activateHome({ focus }) {
  const root = document.querySelector(".home-ui");
  const context = root?.querySelector(".home-context");
  if (!root || !context) return () => {};

  const model = { applications: [], recent: recentExperience() };
  let selected = sections.some(({ id }) => id === root.dataset.homeSection) ? root.dataset.homeSection : "continue";
  let transitionTimer = null;
  let enterFrame = null;
  let alive = true;

  const renderContext = (section, animate = true) => {
    if (!sections.some(({ id }) => id === section)) return;
    const previousIndex = sections.findIndex(({ id }) => id === selected);
    const nextIndex = sections.findIndex(({ id }) => id === section);
    const changed = section !== selected;
    selected = section;
    rememberedHomeSection = section;
    root.dataset.homeSection = section;
    root.querySelectorAll("[data-home-section-target]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.homeSectionTarget === section));
    });
    context.setAttribute("aria-labelledby", `home-tab-${section}`);
    context.dataset.focusScope = `home:${section}`;
    context.dataset.navUp = `home-nav:${section}`;
    clearTimeout(transitionTimer);
    if (enterFrame) cancelAnimationFrame(enterFrame);
    const hadContextFocus = context.contains(focus.current);
    const update = () => {
      if (!alive || selected !== section) return;
      context.innerHTML = contextMarkup(section, model);
      context.classList.remove("is-exiting-next", "is-exiting-previous");
      if (hadContextFocus) focus.focusFirst({ zone: "home-content", scope: context });
      if (animate && changed && !getState().reducedMotion) {
        context.classList.add(nextIndex > previousIndex ? "is-entering-next" : "is-entering-previous");
        enterFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
          context.classList.remove("is-entering-next", "is-entering-previous");
        }));
      }
    };
    if (!animate || !changed || getState().reducedMotion) update();
    else {
      if (changed) focus.lockInput(145);
      context.classList.add(nextIndex > previousIndex ? "is-exiting-next" : "is-exiting-previous");
      transitionTimer = setTimeout(update, changed ? 95 : 1);
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
    const sectionShortcut = event.target.closest?.("[data-home-open-section]");
    if (sectionShortcut) {
      const section = sectionShortcut.dataset.homeOpenSection;
      renderContext(section);
      return;
    }
    const tab = tabFromEvent(event);
    if (!tab) return;
    renderContext(tab.dataset.homeSectionTarget);
    focus.setCurrent(tab, true);
  };
  const onSectionShift = (event) => {
    const direction = Number(event.detail?.direction) || 1;
    const index = sections.findIndex(({ id }) => id === selected);
    const next = sections[(index + direction + sections.length) % sections.length].id;
    const fromContent = context.contains(focus.current);
    renderContext(next);
    if (!fromContent) focus.setCurrent(root.querySelector(`[data-home-section-target='${next}']`), true);
  };
  const onRuntimeChange = () => {
    model.recent = recentExperience();
    if (["continue", "explore"].includes(selected)) renderContext(selected, false);
  };

  root.addEventListener("focusin", onFocus);
  root.addEventListener("pointerover", onPointer);
  root.addEventListener("click", onClick);
  document.addEventListener("para-home-section-shift", onSectionShift);
  document.addEventListener("para-runtimechange", onRuntimeChange);

  renderContext(selected, false);

  paraApi.applications().then((applications) => {
    if (!alive) return;
    model.applications = applications.applications || [];
    renderContext(selected, false);
  }).catch(() => {});

  return () => {
    alive = false;
    clearTimeout(transitionTimer);
    if (enterFrame) cancelAnimationFrame(enterFrame);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("pointerover", onPointer);
    root.removeEventListener("click", onClick);
    document.removeEventListener("para-home-section-shift", onSectionShift);
    document.removeEventListener("para-runtimechange", onRuntimeChange);
  };
}
