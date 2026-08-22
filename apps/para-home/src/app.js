import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation, keyboardController } from "./gamepad.js";
import { applyPreferences, getProfilePreferences, getState, replaceProfilePreferences, resetState, setProfilePreferences, setState, startupDestination } from "./state.js";
import { startupScreen, introScreen, setupScreen, activateIntro, activateSetupNetwork } from "./screens/boot.js";
import { profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen, activateHome } from "./screens/home.js";
import {
  appsScreen, activateApps, filterApps, bearHomeScreen, activateBearHome, filesScreen,
  downloadsScreen, activateFiles, launchLinuxApplication,
} from "./screens/libraries.js";
import {
  controllerScreen, updateControllerScreen, storageScreen, activateStorage,
  settingsScreen, displayScreen, accessibilityScreen, networkScreen, activateNetwork,
  accountScreen, powerScreen, healthScreen, activateHealth, recoveryScreen,
} from "./screens/system.js";
import {
  personalizationScreen, backgroundScreen, activateBackgroundScreen, openBackgroundPicker,
  cancelBackgroundPreview, applyCustomBackground, applyBackgroundSelection,
  cancelBackgroundSelection, selectBackgroundPreview, setBackgroundFit, restoreDefaultBackground,
  controlCenterSettingsScreen, activateControlCenterSettings,
} from "./screens/personalization.js";
import { controlCenterShell, populateControlCenter } from "./ui/control-center.js";
import { paraApi } from "./services/para-api.js";
import { takeRestartSequence } from "./services/power-adapter.js";
import {
  beginPowerSequence, beginSleep, cancelTurnOffConfirmation, confirmTurnOff,
  consumePowerInput, openTurnOffConfirmation,
} from "./ui/power-experience.js";

const root = document.querySelector("#para-app");
const overlay = document.querySelector("#para-overlay");
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
  personalization: personalizationScreen,
  background: backgroundScreen,
  "control-center-settings": controlCenterSettingsScreen,
};
const majorSections = ["home", "apps", "settings"];

let cleanupScreen = null;
let navigating = false;
let controllerStatus = keyboardController();
let overlayReturnFocus = null;
let preferenceTimer = null;

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
    const restarting = takeRestartSequence();
    cleanupScreen = activateIntro(() => router.go(restarting ? startupDestination() : "setup", { replace: true }));
  } else if (route === "home") {
    cleanupScreen = activateHome({ focus, controller: controllerStatus });
  } else if (route === "apps") {
    activateApps({ focus });
  } else if (route === "bear-home") {
    activateBearHome({ focus });
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
  } else if (route === "background") {
    cleanupScreen = activateBackgroundScreen({ focus, changed: schedulePreferenceSave });
  } else if (route === "control-center-settings") {
    activateControlCenterSettings({ focus, controller: controllerStatus });
  } else if (route === "setup" && getState().setupStep === 2) {
    activateSetupNetwork();
  }
}

const router = new Router(render);

function navigate(route, options = {}, target = null) {
  if (consumePowerInput()) return;
  closeControlCenter(false);
  if (navigating || route === router.current()) return;
  navigating = true;
  target?.classList.add("is-activating");
  root.classList.add("is-leaving");
  setTimeout(() => router.go(route, options), getState().reducedMotion ? 1 : 190);
}

function confirm(target = focus.current) {
  if (consumePowerInput()) return;
  if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") target.click();
}

function back() {
  if (consumePowerInput()) return;
  if (cancelTurnOffConfirmation(focus)) return;
  if (!overlay.hidden) {
    closeControlCenter();
    return;
  }
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

async function openControlCenter() {
  if (consumePowerInput()) return;
  if (!overlay.hidden) return;
  overlayReturnFocus = focus.current;
  overlay.innerHTML = controlCenterShell();
  overlay.hidden = false;
  updateControllerPrompts();
  focus.setCurrent(overlay.querySelector(".control-center-close"), true);
  await populateControlCenter({ overlay, controller: controllerStatus, focus });
}

function closeControlCenter(restore = true) {
  if (overlay.hidden) return;
  overlay.hidden = true;
  overlay.innerHTML = "";
  if (restore && overlayReturnFocus?.isConnected) focus.setCurrent(overlayReturnFocus, true);
  overlayReturnFocus = null;
}

function paraTap() {
  if (consumePowerInput()) return;
  if (overlay.hidden) openControlCenter();
  else closeControlCenter();
}

function paraHold() {
  if (consumePowerInput()) return;
  closeControlCenter(false);
  if (router.current() === "home") focus.focusFirst();
  else navigate("home", { replace: true });
}

function shoulder(direction) {
  if (consumePowerInput()) return;
  const currentIndex = majorSections.indexOf(router.current());
  if (currentIndex < 0) return;
  navigate(majorSections[(currentIndex + direction + majorSections.length) % majorSections.length]);
}

const focus = new FocusManager({ confirm, back, paraTap, paraHold, shoulder });
const gamepad = new GamepadNavigation({
  move: (direction) => { if (!consumePowerInput()) focus.move(direction); },
  confirm: () => confirm(),
  back,
  paraTap,
  paraHold,
  shoulder,
  connected: (controller) => {
    const hadController = controllerStatus.connected;
    controllerStatus = controller;
    updateControllerPrompts();
    document.dispatchEvent(new CustomEvent("para-controllerchange", { detail: controller }));
    if (controller.connected && !hadController) toast("Controller connected", `${controller.typeLabel} controls active`);
  },
});

function rerender() {
  render(router.current());
}

async function hydrateProfile(profile) {
  try {
    const payload = await paraApi.personalization(profile);
    if (payload.preferences) replaceProfilePreferences(payload.preferences, profile);
  } catch {
    // Local preferences remain available when the host does not provide profile storage.
  }
}

function schedulePreferenceSave() {
  clearTimeout(preferenceTimer);
  preferenceTimer = setTimeout(async () => {
    const profile = getState().activeProfile || "Player One";
    try { await paraApi.savePersonalization(profile, getProfilePreferences(profile)); } catch { /* local state remains active */ }
  }, 240);
}

async function loginToHome(profile, target) {
  setState({ loggedIn: true, activeProfile: profile });
  await hydrateProfile(profile);
  navigate("home", { replace: true }, target);
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

async function handleAction(action, target) {
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
      setState({ firstBootComplete: true, activeProfile: state.activeProfile || "Player One", setupStep: 6 });
      loginToHome(state.activeProfile || "Player One", target);
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
      loginToHome(target.dataset.profile || state.activeProfile || "Player One", target);
      break;
    case "guest-login":
      loginToHome("Guest", target);
      break;
    case "sign-out":
      setState({ loggedIn: false, activeProfile: null });
      navigate("profiles", { replace: true }, target);
      break;
    case "restart-shell":
      closeControlCenter(false);
      beginPowerSequence("reboot", { returnFocus: target });
      break;
    case "enter-sleep":
      closeControlCenter(false);
      beginSleep({ returnFocus: target });
      break;
    case "confirm-turn-off":
      openTurnOffConfirmation(focus, target);
      break;
    case "cancel-turn-off":
      cancelTurnOffConfirmation(focus);
      break;
    case "turn-off-para":
      confirmTurnOff();
      closeControlCenter(false);
      beginPowerSequence("poweroff", { returnFocus: target });
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
    case "open-control-center":
      openControlCenter();
      break;
    case "close-control-center":
      closeControlCenter();
      break;
    case "toggle-microphone": {
      try {
        await paraApi.setAudio("microphone", { muted: target.dataset.microphoneMuted !== "true" });
        await populateControlCenter({ overlay, controller: controllerStatus, focus });
      } catch { /* the control disappears when the host capability is unavailable */ }
      break;
    }
    case "open-background-picker":
      openBackgroundPicker();
      break;
    case "cancel-background-preview":
      cancelBackgroundPreview(focus);
      break;
    case "apply-custom-background":
      if (await applyCustomBackground(focus)) {
        schedulePreferenceSave();
        rerender();
      } else toast("That image couldn’t be applied");
      break;
    case "preview-background":
      selectBackgroundPreview(target.dataset.backgroundId, focus);
      break;
    case "apply-background":
      if (applyBackgroundSelection()) {
        schedulePreferenceSave();
        toast("Background applied");
      }
      break;
    case "cancel-background-selection":
      cancelBackgroundSelection(focus);
      break;
    case "set-background-fit":
      if (setBackgroundFit(target.dataset.backgroundFit)) schedulePreferenceSave();
      break;
    case "restore-background-default":
      if (restoreDefaultBackground()) {
        schedulePreferenceSave();
        toast("PARA Default restored");
      }
      break;
    case "move-control-center-item":
      movePreferenceItem("controlCenter", target.dataset.itemId, Number(target.dataset.direction));
      break;
    case "toggle-control-center-item":
      togglePreferenceItem("controlCenter", target.dataset.itemId);
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

function movePreferenceItem(section, id, direction) {
  const preferences = getProfilePreferences();
  const visibleOrder = [...document.querySelectorAll("[data-arrangement-id]")].map((row) => row.dataset.arrangementId);
  const order = visibleOrder.length ? visibleOrder : [...preferences[section].order];
  const index = order.indexOf(id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= order.length) return;
  [order[index], order[destination]] = [order[destination], order[index]];
  const completeOrder = [...order, ...preferences[section].order.filter((item) => !order.includes(item))];
  setProfilePreferences({ [section]: { order: completeOrder } });
  schedulePreferenceSave();
  rerender();
}

function togglePreferenceItem(section, id) {
  const preferences = getProfilePreferences();
  const hidden = new Set(preferences[section].hidden);
  hidden.has(id) ? hidden.delete(id) : hidden.add(id);
  setProfilePreferences({ [section]: { hidden: [...hidden] } });
  schedulePreferenceSave();
  rerender();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-route], [data-action]");
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  if (target.dataset.route) navigate(target.dataset.route, {}, target);
  else handleAction(target.dataset.action, target);
});

document.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-audio-volume]")) return;
  try {
    const audio = await paraApi.setAudio("output", { volume: Number(event.target.value) });
    const output = overlay.querySelector("[data-audio-output]");
    if (output && audio.output) output.textContent = `${audio.output.volume}%`;
  } catch { /* the control will be refreshed on the next open */ }
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-audio-volume]")) return;
  const output = overlay.querySelector("[data-audio-output]");
  if (output) output.textContent = `${event.target.value}%`;
});

if (new URLSearchParams(location.search).get("reset") === "1") {
  resetState();
  history.replaceState({}, "", `${location.pathname}#/startup`);
}

async function start() {
  applyPreferences();
  const state = getState();
  if (state.loggedIn && state.activeProfile) await hydrateProfile(state.activeProfile);
  gamepad.start();
  setInterval(updateClock, 30_000);
  router.resolve();
}

start();
