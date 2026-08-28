import { paraApi, escapeHtml } from "../services/para-api.js";
import { page } from "../ui/components.js";

function applicationCard(application, index) {
  const name = escapeHtml(application.name);
  const route = application.launch?.kind === "route" ? `data-route="${escapeHtml(application.launch.route)}"` : `data-action="launch-system-app" data-app-id="${escapeHtml(application.id)}" data-app-name="${name}"`;
  const icon = application.icon
    ? `<img src="${application.icon}" alt="" />`
    : application.id === "para:files"
      ? `<span class="app-icon app-icon--files" aria-hidden="true"><i></i></span>`
      : application.id === "para:browser"
        ? `<span class="app-icon app-icon--browser" aria-hidden="true">◎</span>`
        : `<span class="app-icon app-icon--letter" aria-hidden="true">${name.slice(0, 1)}</span>`;
  return `<button class="installed-app" ${route} data-app-category="${escapeHtml(application.category)}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="installed-app__icon">${icon}</span><span class="installed-app__name">${name}</span></button>`;
}

export function appsScreen() {
  return page({
    title: "Apps",
    description: "Applications available on this PARA system.",
    eyebrow: "Library",
    className: "apps-page",
    body: `<div class="app-library-toolbar" data-app-categories hidden></div><div class="installed-app-grid" data-app-library><div class="library-loading"><span></span><strong>Finding applications…</strong></div></div>`,
  });
}

export async function activateApps({ focus }) {
  const container = document.querySelector("[data-app-library]");
  const categories = document.querySelector("[data-app-categories]");
  if (!container || !categories) return;
  try {
    const payload = await paraApi.applications();
    const browser = { id: "para:browser", name: "PARA Browser", category: "Tools", launch: { kind: "route", route: "browser" } };
    const applications = [browser, ...(payload.applications || []).filter((item) => item.id !== browser.id)];
    payload.categories = ["All Apps", ...new Set([...(payload.categories || []).filter((item) => item !== "All Apps"), "Tools"])];
    if (!applications.length) {
      container.innerHTML = `<div class="library-empty"><span>▦</span><h2>No applications available</h2></div>`;
      return;
    }
    categories.hidden = false;
    categories.innerHTML = payload.categories.map((category, index) => `<button data-action="filter-apps" data-app-filter="${escapeHtml(category)}" class="${index === 0 ? "is-active" : ""}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`).join("");
    container.innerHTML = applications.map(applicationCard).join("");
    focus.focusFirst();
  } catch {
    container.innerHTML = `<div class="library-empty"><span>▦</span><h2>Apps couldn’t be loaded</h2><button class="action-button" data-action="reload-apps" data-autofocus="true">Try again</button></div>`;
    focus.focusFirst();
  }
}

export function filterApps(category) {
  document.querySelectorAll("[data-app-category]").forEach((card) => { card.hidden = category !== "All Apps" && card.dataset.appCategory !== category; });
  document.querySelectorAll("[data-app-filter]").forEach((button) => {
    const selected = button.dataset.appFilter === category;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

export async function launchSystemApplication(id) {
  return paraApi.launchApplication(id);
}
