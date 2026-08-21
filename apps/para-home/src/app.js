import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation } from "./gamepad.js";
import { applyPreferences, getState, resetState, setState, startupDestination } from "./state.js";
import { startupScreen, introScreen, setupScreen, activateIntro } from "./screens/boot.js";
import { profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen } from "./screens/home.js";
import { gamesScreen, appsScreen, storeScreen, bearHomeScreen, creatorScreen } from "./screens/libraries.js";
import { socialScreen, callsScreen } from "./screens/social.js";
import {
  notificationsScreen, downloadsScreen, quickScreen, controllerScreen, storageScreen,
  settingsScreen, accessibilityScreen, networkScreen, accountScreen, subscriptionScreen,
  powerScreen, recoveryScreen,
} from "./screens/system.js";

const root = document.querySelector("#para-app");
const toastRegion = document.querySelector("#toast-region");
const renderers = {
  startup: startupScreen, intro: introScreen, setup: setupScreen, login: loginScreen,
  profiles: profilesScreen, home: homeScreen, games: gamesScreen, apps: appsScreen,
  store: storeScreen, "bear-home": bearHomeScreen, creator: creatorScreen, calls: callsScreen,
  social: socialScreen, notifications: notificationsScreen, downloads: downloadsScreen,
  quick: quickScreen, controller: controllerScreen, storage: storageScreen, settings: settingsScreen,
  accessibility: accessibilityScreen, network: networkScreen, account: accountScreen,
  subscription: subscriptionScreen, power: powerScreen, recovery: recoveryScreen,
};
const majorSections = ["games", "apps", "store", "bear-home", "creator", "social", "settings"];

let cleanupScreen = null;
let controllerStatus = { connected: false, name: "Keyboard fallback" };

function toast(title, message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<strong>${title}</strong>${message}`;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4200);
}

function updateClock() {
  const value = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
  document.querySelectorAll("[data-clock]").forEach((clock) => { clock.textContent = value; });
}

function render(route) {
  cleanupScreen?.();
  cleanupScreen = null;
  const renderer = renderers[route] || homeScreen;
  root.innerHTML = renderer();
  updateClock();
  focus.focusFirst();

  if (route === "startup") {
    const timer = setTimeout(() => router.go(startupDestination(), { replace: true }), 850);
    cleanupScreen = () => clearTimeout(timer);
  } else if (route === "intro") {
    cleanupScreen = activateIntro(() => router.go("setup", { replace: true }));
  }
}

const router = new Router(render);

function confirm(target = focus.current) {
  if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") target.click();
}

function back() {
  const bearDrawer = document.querySelector("[data-bear-drawer]");
  if (bearDrawer && !bearDrawer.hidden) {
    bearDrawer.hidden = true;
    const bear = document.querySelector("[data-action='bear-more']");
    if (bear) focus.setCurrent(bear, true);
    return;
  }
  if (["startup", "intro", "setup", "profiles"].includes(router.current())) return;
  router.back();
}

function quick() {
  if (router.current() === "quick") router.back();
  else router.go("quick");
}

function shoulder(direction) {
  const currentIndex = majorSections.indexOf(router.current());
  if (currentIndex < 0) return;
  const next = (currentIndex + direction + majorSections.length) % majorSections.length;
  router.go(majorSections[next]);
}

const focus = new FocusManager({ confirm, back, quick, shoulder });
const gamepad = new GamepadNavigation({
  move: (direction) => focus.move(direction), confirm: () => confirm(), back, quick, shoulder,
  connected: (connected, name) => {
    controllerStatus = { connected, name };
    toast(connected ? "Controller connected" : "Controller disconnected", connected ? `${name} is using the browser input layer.` : "Keyboard navigation remains available.");
  },
});

function rerender() {
  render(router.current());
}

async function runDiagnostics() {
  try {
    const response = await fetch("/api/v1/health", { signal: AbortSignal.timeout(1800) });
    const data = await response.json();
    toast("Diagnostics passed", `${data.name} is ${data.status}; ${data.mode} mode is active.`);
  } catch {
    toast("Mock API unavailable", "Start PARA with make dev to enable local diagnostics. The frontend remains usable.");
  }
}

function handleAction(action, target) {
  const state = getState();
  switch (action) {
    case "skip-intro": router.go("setup", { replace: true }); break;
    case "setup-next": setState({ setupStep: Math.min(5, state.setupStep + 1) }); rerender(); break;
    case "setup-back": setState({ setupStep: Math.max(0, state.setupStep - 1) }); rerender(); break;
    case "finish-setup": setState({ firstBootComplete: true, setupStep: 5 }); router.go("login", { replace: true }); break;
    case "profile-login": setState({ loggedIn: true, activeProfile: target?.dataset.profile || "Player One" }); router.go("home", { replace: true }); break;
    case "guest-login": setState({ loggedIn: true, activeProfile: "Guest" }); router.go("home", { replace: true }); break;
    case "sign-out": setState({ loggedIn: false, activeProfile: null }); router.go("profiles", { replace: true }); break;
    case "restart-shell": location.reload(); break;
    case "reset-first-boot": resetState(); router.go("intro", { replace: true }); break;
    case "toggle-reduced": setState({ reducedMotion: !state.reducedMotion }); toast("Motion preference updated", !state.reducedMotion ? "Reduced motion is on." : "Full decorative motion is on."); rerender(); break;
    case "toggle-large": setState({ largeText: !state.largeText }); toast("Text preference updated", !state.largeText ? "Large text is on." : "Standard text is on."); rerender(); break;
    case "toggle-contrast": setState({ highContrast: !state.highContrast }); toast("Contrast preference updated", !state.highContrast ? "High contrast is on." : "Standard contrast is on."); rerender(); break;
    case "diagnostics": runDiagnostics(); break;
    case "controller-test": toast("Input layer active", controllerStatus.connected ? `${controllerStatus.name} is connected through the Browser Gamepad API.` : "No browser gamepad detected. Keyboard fallback is active."); break;
    case "bear-more": {
      const drawer = document.querySelector("[data-bear-drawer]");
      if (drawer) {
        drawer.hidden = false;
        requestAnimationFrame(() => focus.setCurrent(drawer.querySelector("[data-autofocus='true']") || drawer.querySelector("button"), true));
      }
      break;
    }
    case "bear-drawer-close": back(); break;
    case "bear-folder-stub": toast(`${target?.dataset.collection || target?.querySelector?.(".list-row__title")?.textContent || "Bear Home"} selected`, "The room navigation works; file reading, mounting, cloud access, and deletion remain intentionally stubbed."); break;
    case "select-tv": case "select-monitor": case "choose-network": case "choose-offline":
      toast("Setup choice saved locally", "This selection affects prototype UI state only."); break;
    case "clear-mock": toast("Mock notifications retained", "Persistent notification state is not implemented yet."); break;
    default: toast("Preview boundary", "This control is intentionally unfinished; the required backend or Linux service is documented as a stub.");
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-route], [data-action]");
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  if (target.dataset.route) router.go(target.dataset.route);
  else handleAction(target.dataset.action, target);
});

if (new URLSearchParams(location.search).get("reset") === "1") {
  resetState();
  history.replaceState({}, "", `${location.pathname}#/startup`);
}

applyPreferences();
gamepad.start();
setInterval(updateClock, 30_000);
router.resolve();
