import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation, keyboardController } from "./gamepad.js";
import { applyPreferences, getState, resetState, setState, startupDestination } from "./state.js";
import { startupScreen, introScreen, setupScreen, activateIntro, activateSetupNetwork } from "./screens/boot.js";
import { profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen, activateHomeData } from "./screens/home.js";
import {
  appsScreen, activateApps, filterApps, bearHomeScreen, filesScreen,
  downloadsScreen, activateFiles, launchLinuxApplication,
} from "./screens/libraries.js";
import {
  quickScreen, controllerScreen, updateControllerScreen, storageScreen, activateStorage,
  settingsScreen, displayScreen, accessibilityScreen, networkScreen, activateNetwork,
  accountScreen, powerScreen, healthScreen, activateHealth, recoveryScreen,
} from "./screens/system.js";

const root = document.querySelector("#para-app");
const toastRegion = document.querySelector("#toast-region");
const renderers = {
  startup: startupScreen,
  intro: introScreen,
  setup: setupScreen,
  login: loginScreen,
  profiles: profilesScreen,
  home: homeScreen,
  apps: appsScreen,
  "bear-home": bearHomeScreen,
  files: filesScreen,
  downloads: downloadsScreen,
  quick: quickScreen,
  controller: controllerScreen,
  storage: storageScreen,
  settings: settingsScreen,
  display: displayScreen,
  accessibility: accessibilityScreen,
  network: networkScreen,
  account: accountScreen,
  power: powerScreen,
  health: healthScreen,
  recovery: recoveryScreen,
};
const majorSections = ["home", "apps", "settings"];

let cleanupScreen = null;
let navigating = false;
let controllerStatus = keyboardController();

function toast(title, message = "") {
  const node = document.createElement("div");
  node.className = "toast";
  const heading = document.createElement("strong");
  heading.textContent = title;
  node.append(heading);
  if (message) {
    const detail = document.createElement("span");
    detail.textContent = message;
    node.append(detail);
  }
  toastRegion.append(node);
  setTimeout(() => node.remove(), 3200);
}

function updateClock() {
  const now = new Date();
  const value = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now);
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  document.querySelectorAll("[data-clock]").forEach((clock) => { clock.textContent = value; });
  document.querySelectorAll("[data-greeting]").forEach((node) => { node.textContent = greeting; });
}

function updateControllerPrompts() {
  document.documentElement.dataset.controller = controllerStatus.type;
  document.querySelectorAll("[data-prompt]").forEach((node) => {
    node.textContent = controllerStatus.prompts[node.dataset.prompt] || "";
  });
  if (router.current() === "controller") updateControllerScreen(controllerStatus);
}

async function estimateRefreshRate() {
  const samples = [];
  let previous = 0;
  return new Promise((resolve) => {
    const frame = (time) => {
      if (previous) samples.push(time - previous);
      previous = time;
      if (samples.length < 24) requestAnimationFrame(frame);
      else {
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        resolve(Math.round(1000 / average));
      }
    };
    requestAnimationFrame(frame);
  });
}

async function updateDisplayInfo() {
  const width = window.screen?.width || window.innerWidth;
  const height = window.screen?.height || window.innerHeight;
  const hdr = window.matchMedia?.("(dynamic-range: high)")?.matches;
  document.querySelectorAll("[data-display-resolution]").forEach((node) => { node.textContent = `${width} × ${height}`; });
  document.querySelectorAll("[data-hdr-status]").forEach((node) => { node.textContent = hdr ? "HDR available" : "Standard range"; });
  const refresh = await estimateRefreshRate();
  document.querySelectorAll("[data-refresh-rate]").forEach((node) => { node.textContent = `${refresh} Hz`; });
}

function activateHomeMotion() {
  const cards = [...document.querySelectorAll(".home-launcher:not(:disabled)")];
  const cleanups = cards.map((card) => {
    const move = (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      card.style.setProperty("--my", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    };
    const leave = () => {
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "35%");
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    return () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", leave);
    };
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function render(route) {
  cleanupScreen?.();
  cleanupScreen = null;
  root.innerHTML = (renderers[route] || homeScreen)();
  root.classList.remove("is-leaving");
  root.classList.add("is-entering");
  requestAnimationFrame(() => root.classList.remove("is-entering"));
  navigating = false;
  updateClock();
  updateControllerPrompts();
  updateDisplayInfo();
  focus.focusFirst();

  if (route === "startup") {
    const timer = setTimeout(() => router.go(startupDestination(), { replace: true }), 850);
    cleanupScreen = () => clearTimeout(timer);
  } else if (route === "intro") {
    cleanupScreen = activateIntro(() => router.go("setup", { replace: true }));
  } else if (route === "home") {
    const stopMotion = activateHomeMotion();
    activateHomeData();
    cleanupScreen = stopMotion;
  } else if (route === "apps") {
    activateApps({ focus });
  } else if (route === "files" || route === "downloads") {
    activateFiles();
  } else if (route === "storage") {
    activateStorage();
  } else if (route === "network") {
    activateNetwork();
  } else if (route === "health") {
    activateHealth();
  } else if (route === "controller") {
    updateControllerScreen(controllerStatus);
  } else if (route === "setup" && getState().setupStep === 2) {
    activateSetupNetwork();
  }
}

const router = new Router(render);

function navigate(route, options = {}, target = null) {
  if (navigating || route === router.current()) return;
  navigating = true;
  target?.classList.add("is-activating");
  root.classList.add("is-leaving");
  setTimeout(() => router.go(route, options), getState().reducedMotion ? 1 : 190);
}

function confirm(target = focus.current) {
  if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") target.click();
}

function back() {
  const bearMenu = document.querySelector("[data-bear-menu]");
  if (bearMenu && !bearMenu.hidden) {
    bearMenu.hidden = true;
    focus.setCurrent(document.querySelector("[data-action='bear-menu']"), true);
    return;
  }
  if (["startup", "intro", "setup", "profiles"].includes(router.current())) return;
  root.classList.add("is-leaving");
  setTimeout(() => router.back(), getState().reducedMotion ? 1 : 150);
}

function quick() {
  if (router.current() === "quick") back();
  else navigate("quick");
}

function shoulder(direction) {
  const currentIndex = majorSections.indexOf(router.current());
  if (currentIndex < 0) return;
  navigate(majorSections[(currentIndex + direction + majorSections.length) % majorSections.length]);
}

const focus = new FocusManager({ confirm, back, quick, shoulder });
const gamepad = new GamepadNavigation({
  move: (direction) => focus.move(direction),
  confirm: () => confirm(),
  back,
  quick,
  shoulder,
  connected: (controller) => {
    const hadController = controllerStatus.connected;
    controllerStatus = controller;
    updateControllerPrompts();
    if (controller.connected && !hadController) toast("Controller connected", `${controller.typeLabel} controls active`);
  },
});

function rerender() {
  render(router.current());
}

function toggle(key, label) {
  const state = getState();
  const next = !state[key];
  setState({ [key]: next });
  toast(label, next ? "On" : "Off");
  rerender();
}

async function openLinuxApplication(target) {
  const name = target.dataset.appName || "Application";
  try {
    await launchLinuxApplication(target.dataset.appId);
    toast(`Opening ${name}`);
  } catch {
    toast(`${name} couldn’t be opened`);
  }
}

function handleAction(action, target) {
  const state = getState();
  switch (action) {
    case "skip-intro":
      navigate("setup", { replace: true }, target);
      break;
    case "setup-next":
      setState({ setupStep: Math.min(6, state.setupStep + 1) });
      rerender();
      break;
    case "setup-back":
      setState({ setupStep: Math.max(0, state.setupStep - 1) });
      rerender();
      break;
    case "finish-setup":
      setState({ firstBootComplete: true, loggedIn: true, activeProfile: state.activeProfile || "Player One", setupStep: 6 });
      navigate("home", { replace: true }, target);
      break;
    case "setup-profile":
      setState({ activeProfile: target.dataset.profile || "Player One" });
      rerender();
      break;
    case "setup-guest":
      setState({ activeProfile: "Guest" });
      rerender();
      break;
    case "select-profile":
      setState({ activeProfile: target.dataset.profile || "Player One" });
      navigate("login", {}, target);
      break;
    case "profile-login":
      setState({ loggedIn: true, activeProfile: target.dataset.profile || state.activeProfile || "Player One" });
      navigate("home", { replace: true }, target);
      break;
    case "guest-login":
      setState({ loggedIn: true, activeProfile: "Guest" });
      navigate("home", { replace: true }, target);
      break;
    case "sign-out":
      setState({ loggedIn: false, activeProfile: null });
      navigate("profiles", { replace: true }, target);
      break;
    case "restart-shell":
      location.reload();
      break;
    case "reset-first-boot":
      resetState();
      navigate("intro", { replace: true }, target);
      break;
    case "toggle-reduced":
      toggle("reducedMotion", "Reduce motion");
      break;
    case "toggle-large":
      toggle("largeText", "Larger text");
      break;
    case "toggle-contrast":
      toggle("highContrast", "High contrast");
      break;
    case "select-tv":
      setState({ displayMode: "Living room" });
      rerender();
      break;
    case "select-monitor":
      setState({ displayMode: "Desk" });
      rerender();
      break;
    case "cycle-display-mode":
      setState({ displayMode: state.displayMode === "Living room" ? "Desk" : "Living room" });
      rerender();
      break;
    case "filter-apps":
      filterApps(target.dataset.appFilter || "All Apps");
      focus.focusFirst();
      break;
    case "reload-apps":
      activateApps({ focus });
      break;
    case "launch-linux-app":
      openLinuxApplication(target);
      break;
    case "open-collection":
      setState({ fileCollection: target.dataset.collection || "downloads" });
      navigate("files", {}, target);
      break;
    case "bear-menu": {
      const menu = document.querySelector("[data-bear-menu]");
      if (menu) {
        menu.hidden = false;
        requestAnimationFrame(() => focus.setCurrent(menu.querySelector("[data-autofocus='true']"), true));
      }
      break;
    }
    case "bear-menu-close":
      back();
      break;
    case "refresh-network":
      activateNetwork();
      break;
    case "run-health-check":
      activateHealth();
      break;
    default:
      break;
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-route], [data-action]");
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  if (target.dataset.route) navigate(target.dataset.route, {}, target);
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
