import { paraApi, escapeHtml } from "../services/para-api.js";
import { page } from "../ui/components.js";
import { systemApplicationRecords } from "../services/system-app-registry.js";

function applicationCard(application, index) {
  const name = escapeHtml(application.name);
  const route = application.launch?.kind === "route" ? `data-route="${escapeHtml(application.launch.route)}"` : `data-action="launch-system-app" data-app-id="${escapeHtml(application.id)}" data-app-name="${name}"`;
  const iconKind = application.iconType || application.icon || "";
  const systemIcons = {
    friends: "✦", achievements: "◇", media: "▣", music: "♫", files: "", store: "P", settings: "⚙",
  };
  const icon = application.icon && String(application.icon).includes("/")
    ? `<img src="${application.icon}" alt="" />`
    : application.id === "para:files" || iconKind === "files"
      ? `<span class="app-icon app-icon--files" aria-hidden="true"><i></i></span>`
      : application.id === "para:browser"
        ? `<span class="app-icon app-icon--browser" aria-hidden="true">◎</span>`
        : iconKind && systemIcons[iconKind] !== undefined
          ? `<span class="app-icon app-icon--system app-icon--${escapeHtml(iconKind)}" aria-hidden="true">${systemIcons[iconKind]}</span>`
          : `<span class="app-icon app-icon--letter" aria-hidden="true">${name.slice(0, 1)}</span>`;
  const detail = application.description ? `<span class="installed-app__meta">${escapeHtml(application.description)}</span>` : "";
  return `<button class="installed-app" ${route} data-app-category="${escapeHtml(application.category)}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="installed-app__icon">${icon}</span><span class="installed-app__copy"><span class="installed-app__name">${name}</span>${detail}</span></button>`;
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
    const browser = { id: "para:browser", name: "PARA Browser", category: "Tools", iconType: "browser", description: "Browse the web", launch: { kind: "route", route: "browser" } };
    const builtIns = [browser, ...systemApplicationRecords()];
    const builtInIds = new Set(builtIns.map((item) => item.id));
    const applications = [...builtIns, ...(payload.applications || []).filter((item) => !builtInIds.has(item.id))];
    payload.categories = ["All Apps", ...new Set([...builtIns.map((item) => item.category), ...(payload.categories || []).filter((item) => item !== "All Apps")])];
    if (!applications.length) {
      container.innerHTML = `<div class="library-empty"><span>▦</span><h2>No applications available</h2></div>`;
      return;
    }
    categories.hidden = false;
    categories.innerHTML = payload.categories.map((category, index) => `<button data-action="filter-apps" data-app-filter="${escapeHtml(category)}" class="${index === 0 ? "is-active" : ""}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`).join("");
    container.innerHTML = applications.map(applicationCard).join("");
    focus.focusFirst();
  } catch {
    // System apps belong to PARA itself and must remain launchable even when the
    // native application scanner is unavailable in the hosted web edition.
    const browser = { id: "para:browser", name: "PARA Browser", category: "Tools", iconType: "browser", description: "Browse the web", launch: { kind: "route", route: "browser" } };
    const applications = [browser, ...systemApplicationRecords()];
    categories.hidden = false;
    const fallbackCategories = ["All Apps", ...new Set(applications.map((item) => item.category))];
    categories.innerHTML = fallbackCategories.map((category, index) => `<button data-action="filter-apps" data-app-filter="${escapeHtml(category)}" class="${index === 0 ? "is-active" : ""}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`).join("");
    container.innerHTML = applications.map(applicationCard).join("");
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
