import { getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { profileRuntime, pruneContinueQueue, recentExperiences } from "../services/experience-runtime.js";
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

function navigationAttributes(up = "", down = "") {
  return `${up ? ` data-nav-up="${escapeHtml(up)}"` : ""}${down ? ` data-nav-down="${escapeHtml(down)}"` : ""}`;
}

function applicationButton(application, up = "", down = "") {
  const name = escapeHtml(application.name);
  const destination = application.launch?.kind === "route"
    ? `data-route="${escapeHtml(application.launch.route)}"`
    : `data-action="launch-linux-app" data-app-id="${escapeHtml(application.id)}" data-app-name="${name}"`;
  return `<button class="home-flow-row" type="button" ${destination} data-focus-id="home-app:${escapeHtml(application.id)}"${navigationAttributes(up, down)}><span class="home-flow-row__art">${applicationArtwork(application)}</span><span class="home-flow-row__copy"><strong>${name}</strong><small>Creator app</small></span><i aria-hidden="true">›</i></button>`;
}

function continueEmptyState() {
  return `<div class="home-context-empty"><span>Continue</span><h2>Ready to play?</h2><p>Choose something from Explore.</p><button class="home-text-action" type="button" data-home-open-section="explore" data-focus-id="continue:explore">Open Explore <i aria-hidden="true">→</i></button></div>`;
}

function quietState(section, title, detail = "") {
  return `<div class="home-context-empty"><span>${section}</span><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ""}</div>`;
}

function flowAction(title, subtitle, route, mark, focusId = `home-route:${route}`, up = "", down = "") {
  return `<button class="home-flow-row" type="button" data-route="${escapeHtml(route)}" data-focus-id="${escapeHtml(focusId)}"${navigationAttributes(up, down)}><span class="home-flow-row__art home-flow-row__art--mark" aria-hidden="true">${escapeHtml(mark)}</span><span class="home-flow-row__copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span><i aria-hidden="true">›</i></button>`;
}

function activityTime(experience, now = Date.now()) {
  const timestamp = Number(experience.lastOpened || experience.installedAt || experience.queuedAt || 0);
  if (!timestamp) return "Available";
  const elapsed = Math.max(0, now - timestamp);
  const prefix = experience.lastOpened
    ? (experience.kind === "Game" ? "Last played" : "Used")
    : "Installed";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${prefix} ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix} ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `${prefix} yesterday`;
  if (days < 7) return `${prefix} ${days} days ago`;
  return `${prefix} ${new Date(experience.lastOpened).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function continueItem(experience, index, queue) {
  const focusId = `continue:item:${experience.id}`;
  const up = index === 0 ? "home-nav:continue" : `continue:item:${queue[index - 1].id}`;
  const down = index < queue.length - 1 ? `continue:item:${queue[index + 1].id}` : "";
  const activity = activityTime(experience);
  const status = experience.queueStatus || activity;
  const action = experience.queueStatus ? "Play" : "Resume";
  const platform = experience.platform || experience.kind || "App";
  return `<button class="home-continue-item" type="button" data-continue-item data-continue-id="${escapeHtml(experience.id)}" data-route="${escapeHtml(experience.route)}" data-focus-id="${escapeHtml(focusId)}" data-nav-left="${escapeHtml(focusId)}" data-nav-right="${escapeHtml(focusId)}"${navigationAttributes(up, down)} style="--continue-accent:${escapeHtml(experience.accent || "#9b5cff")}" aria-label="${escapeHtml(`${experience.title}. ${status}. ${action}`)}"><span class="home-continue-item__art" aria-hidden="true">${escapeHtml(experience.mark || "◉")}</span><span class="home-continue-item__copy"><small>${escapeHtml(platform)}</small><strong>${escapeHtml(experience.title)}</strong><span data-continue-summary>${escapeHtml(status)}</span><span class="home-continue-item__details"><time data-continue-time>${escapeHtml(activity)}</time><i aria-hidden="true"></i><b>${action}</b></span></span></button>`;
}

function continueMarkup(experiences) {
  const queue = experiences.slice(0, 10);
  if (!queue.length) return continueEmptyState();
  return `<div class="home-continue-carousel" aria-label="Continue">${queue.map((experience, index) => continueItem(experience, index, queue)).join("")}</div>`;
}

function contextMarkup(section, model) {
  if (section === "continue") return continueMarkup(model.recent);
  if (section === "community") return `<div class="home-flow"><section class="home-flow-section"><h3>PARA Updates</h3><div class="home-flow-list">${flowAction("PARA Updates", "News, patches, and Lab notes", "community", "◎", "home-route:community", "home-nav:community")}</div></section></div>`;
  if (section === "explore") {
    const actions = [
      ["Games", "Installed for this profile", "games", "◉"],
      ["Apps", model.applications.length ? `${model.applications.length} available` : "Open the app library", "apps", "▦"],
      ["Demos", model.runtime.installedDemos.length ? `${model.runtime.installedDemos.length} installed` : "Playable PARA experiences", "demos", "◇"],
      ["ParaStore", "Discover and install demos", "parastore", "▱"],
    ];
    return `<div class="home-flow">${actions.map(([title, subtitle, route, mark], index) => `<section class="home-flow-section"><h3>${title}</h3><div class="home-flow-list">${flowAction(title, subtitle, route, mark, `home-route:${route}`, index === 0 ? "home-nav:explore" : `home-route:${actions[index - 1][2]}`, index < actions.length - 1 ? `home-route:${actions[index + 1][2]}` : "")}</div></section>`).join("")}</div>`;
  }
  if (section === "create") {
    const creatorApps = model.applications.filter((application) => application.roles?.includes("creator"));
    const hasRecentProject = Boolean(model.runtime.creator.note || model.runtime.creator.drawing);
    const focusIds = [
      ...(hasRecentProject ? ["create:recent-project"] : []),
      "create:playground",
      ...creatorApps.map((application) => `home-app:${application.id}`),
    ];
    const navFor = (focusId) => {
      const index = focusIds.indexOf(focusId);
      return {
        up: index === 0 ? "home-nav:create" : focusIds[index - 1],
        down: index < focusIds.length - 1 ? focusIds[index + 1] : "",
      };
    };
    const recentProject = hasRecentProject
      ? `<section class="home-flow-section"><h3>Recent Projects</h3><div class="home-flow-list">${flowAction("Creator Playground", "Continue your saved work", "creator", "✦", "create:recent-project", navFor("create:recent-project").up, navFor("create:recent-project").down)}</div></section>`
      : "";
    const playgroundNav = navFor("create:playground");
    return `<div class="home-flow">${recentProject}<section class="home-flow-section"><h3>Installed Creator Apps</h3><div class="home-flow-list">${flowAction("Creator Playground", "Draw, write, and build a beat", "creator", "✦", "create:playground", playgroundNav.up, playgroundNav.down)}${creatorApps.map((application) => { const nav = navFor(`home-app:${application.id}`); return applicationButton(application, nav.up, nav.down); }).join("")}</div></section></div>`;
  }
  return quietState("Community", "No updates available");
}

function primaryFocusId(section, model) {
  if (section === "continue") return model.recent.length ? `continue:item:${model.recent[0].id}` : "continue:explore";
  if (section === "explore") return "home-route:games";
  if (section === "community") return "home-route:community";
  if (section === "create") return model.runtime.creator.note || model.runtime.creator.drawing ? "create:recent-project" : "create:playground";
  return "";
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

  const model = { applications: [], recent: recentExperiences(), runtime: profileRuntime() };
  let selected = sections.some(({ id }) => id === root.dataset.homeSection) ? root.dataset.homeSection : "continue";
  let transitionTimer = null;
  let enterFrame = null;
  let centerFrame = null;
  let alive = true;

  const prepareContinueCarousel = (selectedItem = null) => {
    const carousel = context.querySelector(".home-continue-carousel");
    const item = selectedItem || carousel?.querySelector("[data-continue-item]");
    if (!carousel || !item) return;
    const centerSpace = Math.max(28, (context.clientHeight - item.offsetHeight) / 2);
    carousel.style.setProperty("--continue-center-space", `${centerSpace}px`);
  };

  const updateContinueFocus = (target) => {
    const item = target?.closest?.("[data-continue-item]");
    const rows = [...context.querySelectorAll("[data-continue-item]")];
    if (!item || !context.contains(item) || !rows.length) {
      context.classList.remove("is-carousel-active");
      return;
    }
    const selectedIndex = rows.indexOf(item);
    context.classList.add("is-carousel-active");
    rows.forEach((row, index) => {
      row.dataset.focusDistance = String(Math.min(3, Math.abs(index - selectedIndex)));
      row.dataset.focusSide = index < selectedIndex ? "previous" : index > selectedIndex ? "next" : "current";
    });
    prepareContinueCarousel(item);
    focus.lockInput(190);
    if (centerFrame) cancelAnimationFrame(centerFrame);
    centerFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!alive || !item.isConnected) return;
      prepareContinueCarousel(item);
      const top = item.offsetTop - (context.clientHeight - item.offsetHeight) / 2;
      context.scrollTo({
        top: Math.max(0, top),
        behavior: getState().reducedMotion ? "auto" : "smooth",
      });
    }));
  };

  const renderContext = (section, animate = true) => {
    if (!sections.some(({ id }) => id === section)) return;
    const previousIndex = sections.findIndex(({ id }) => id === selected);
    const nextIndex = sections.findIndex(({ id }) => id === section);
    const changed = section !== selected;
    selected = section;
    rememberedHomeSection = section;
    root.dataset.homeSection = section;
    root.querySelectorAll("[data-home-section-target]").forEach((tab) => {
      const active = tab.dataset.homeSectionTarget === section;
      tab.setAttribute("aria-selected", String(active));
      if (active) tab.dataset.navDown = primaryFocusId(section, model);
      else delete tab.dataset.navDown;
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
      context.classList.remove("is-exiting-next", "is-exiting-previous", "is-carousel-active");
      if (changed) context.scrollTop = 0;
      prepareContinueCarousel();
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
  const onFocusChange = (event) => {
    const target = event.detail?.target;
    if (target && root.contains(target)) updateContinueFocus(target);
  };
  const onRuntimeChange = () => {
    model.recent = recentExperiences();
    model.runtime = profileRuntime();
    renderContext(selected, false);
  };

  root.addEventListener("focusin", onFocus);
  root.addEventListener("pointerover", onPointer);
  root.addEventListener("click", onClick);
  document.addEventListener("para-home-section-shift", onSectionShift);
  document.addEventListener("para-runtimechange", onRuntimeChange);
  document.addEventListener("para-focuschange", onFocusChange);

  renderContext(selected, false);

  const activityTimer = window.setInterval(() => {
    if (selected !== "continue" || !model.recent.length) return;
    const experiences = new Map(model.recent.map((experience) => [experience.id, experience]));
    context.querySelectorAll("[data-continue-item]").forEach((row) => {
      const experience = experiences.get(row.dataset.continueId);
      if (!experience) return;
      const activity = activityTime(experience);
      const time = row.querySelector("[data-continue-time]");
      const summary = row.querySelector("[data-continue-summary]");
      if (time) time.textContent = activity;
      if (summary && !experience.queueStatus) summary.textContent = activity;
    });
  }, 60_000);

  paraApi.applications().then((applications) => {
    if (!alive) return;
    model.applications = applications.applications || [];
    model.recent = pruneContinueQueue(model.applications.map((application) => application.id));
    model.runtime = profileRuntime();
    if (["continue", "explore", "create"].includes(selected)) renderContext(selected, false);
  }).catch(() => {});

  return () => {
    alive = false;
    window.clearInterval(activityTimer);
    clearTimeout(transitionTimer);
    if (enterFrame) cancelAnimationFrame(enterFrame);
    if (centerFrame) cancelAnimationFrame(centerFrame);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("pointerover", onPointer);
    root.removeEventListener("click", onClick);
    document.removeEventListener("para-home-section-shift", onSectionShift);
    document.removeEventListener("para-runtimechange", onRuntimeChange);
    document.removeEventListener("para-focuschange", onFocusChange);
  };
}
