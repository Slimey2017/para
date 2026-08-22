import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation, keyboardController } from "./gamepad.js";
import {
  applyPreferences, DEFAULT_CONTROL_CENTER_ORDER, getProfilePreferences, getState, postStartupDestination,
  replaceProfilePreferences, resetState, setProfilePreferences, setSetupAccountChoice,
  setSetupChoice, setState, startupDestination,
} from "./state.js";
import {
  SETUP_CHAPTERS, startupScreen, introScreen, setupScreen, activateIntro,
  activateSetupChapter, playSetupAudioTest, updateSetupControllerStatus,
} from "./screens/boot.js";
import { profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen, activateHome } from "./screens/home.js";
import {
  appsScreen, activateApps, filterApps, launchLinuxApplication,
} from "./screens/libraries.js";
import { filesScreen, downloadsScreen, activateFiles, filesBack } from "./screens/files.js";
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
import {
  collapseControlCenterContext, controlCenterShell, populateControlCenter,
  resetControlCenterData, showControlCenterContext,
} from "./ui/control-center.js";
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
let idleSleepTimer = null;
let overlayCloseTimer = null;

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
  const setup = getState().setupChoices;
  let value;
  try {
    value = new Intl.DateTimeFormat(`${setup.language || "en"}-${setup.region || "US"}`, { hour: "numeric", minute: "2-digit", timeZone: setup.timeZone || undefined }).format(now);
  } catch {
    value = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now);
  }
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
    const frame = requestAnimationFrame(() => router.go(startupDestination(), { replace: true }));
    cleanupScreen = () => cancelAnimationFrame(frame);
  } else if (route === "intro") {
    takeRestartSequence();
    cleanupScreen = activateIntro(() => router.go(postStartupDestination(), { replace: true }));
  } else if (route === "home") {
    cleanupScreen = activateHome({ focus, controller: controllerStatus });
  } else if (route === "apps") {
    activateApps({ focus });
  } else if (route === "files" || route === "downloads") {
    cleanupScreen = activateFiles({ focus, initialLocation: route === "downloads" ? "downloads" : "home" });
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
  } else if (route === "setup") {
    cleanupScreen = activateSetupChapter({ controller: controllerStatus, focus, changed: () => { schedulePreferenceSave(getState().activeProfile || getState().setupChoices.profileName || "Player One"); rerender(); } });
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
  if (filesBack()) return;
  if (!overlay.hidden) {
    if (collapseControlCenterContext(focus)) return;
    closeControlCenter();
    return;
  }
  if (["startup", "intro", "setup", "profiles"].includes(router.current())) return;
  root.classList.add("is-leaving");
  setTimeout(() => router.back(), getState().reducedMotion ? 1 : 150);
}

async function openControlCenter() {
  if (consumePowerInput()) return;
  if (!overlay.hidden) return;
  clearTimeout(overlayCloseTimer);
  overlay.classList.remove("is-closing");
  overlayReturnFocus = focus.current;
  overlay.innerHTML = controlCenterShell();
  overlay.hidden = false;
  updateControllerPrompts();
  await populateControlCenter({ overlay, controller: controllerStatus, focus });
}

function closeControlCenter(restore = true) {
  if (overlay.hidden) return;
  overlay.classList.add("is-closing");
  const returnTarget = restore ? overlayReturnFocus : null;
  clearTimeout(overlayCloseTimer);
  overlayCloseTimer = setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove("is-closing");
    overlay.innerHTML = "";
    resetControlCenterData();
    if (returnTarget?.isConnected) focus.setCurrent(returnTarget, true);
    overlayReturnFocus = null;
  }, getState().reducedMotion ? 1 : 210);
}

function paraTap() {
  if (consumePowerInput()) return;
  if (router.current() === "setup" && getState().setupStep === 0 && controllerStatus.connected) {
    setSetupChoice("inputMode", "controller");
    rerender();
    return;
  }
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

function secondary() {
  if (consumePowerInput()) return;
  document.dispatchEvent(new CustomEvent("para-secondary", { detail: { target: focus.current, controller: controllerStatus } }));
}

function options() {
  if (consumePowerInput()) return;
  document.dispatchEvent(new CustomEvent("para-options", { detail: { target: focus.current, controller: controllerStatus } }));
}

const focus = new FocusManager({ confirm, back, paraTap, paraHold, shoulder, secondary, options });
const gamepad = new GamepadNavigation({
  move: (direction) => { if (!consumePowerInput()) { resetIdleSleep(); focus.move(direction); } },
  confirm: () => confirm(),
  back,
  paraTap,
  paraHold,
  shoulder,
  secondary,
  options,
  connected: (controller) => {
    const hadController = controllerStatus.connected;
    controllerStatus = controller;
    updateControllerPrompts();
    updateSetupControllerStatus(controller);
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

function schedulePreferenceSave(profileOverride = "") {
  clearTimeout(preferenceTimer);
  preferenceTimer = setTimeout(async () => {
    const profile = profileOverride || getState().activeProfile || "Player One";
    try { await paraApi.savePersonalization(profile, getProfilePreferences(profile)); } catch { /* local state remains active */ }
  }, 240);
}

async function loginToHome(profile, target) {
  setState({ loggedIn: true, activeProfile: profile });
  await hydrateProfile(profile);
  resetIdleSleep();
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
    case "setup-next":
      setState({ setupStep: Math.min(SETUP_CHAPTERS.length - 1, state.setupStep + 1) });
      rerender();
      break;
    case "setup-back":
      setState({ setupStep: Math.max(0, state.setupStep - 1) });
      rerender();
      break;
    case "finish-setup":
      setState({ firstBootComplete: true, setupStep: SETUP_CHAPTERS.length - 1 });
      loginToHome(state.activeProfile || state.setupChoices.profileName || "Player One", target);
      break;
    case "setup-use-controller":
      if (controllerStatus.connected) setSetupChoice("inputMode", "controller");
      rerender();
      break;
    case "setup-use-keyboard":
      setSetupChoice("inputMode", "keyboard");
      rerender();
      break;
    case "setup-network-later":
      setSetupChoice("networkChoice", "later");
      toast("Network", "Set up later");
      break;
    case "setup-account-offline": {
      const profile = state.setupChoices.profileName?.trim() || "Player One";
      setState({ activeProfile: profile, setupChoices: { accountMode: "offline", profileName: profile } });
      toast("Offline profile ready", profile);
      break;
    }
    case "setup-skip-provider":
      setSetupAccountChoice(target.dataset.providerGroup, target.dataset.provider, "skipped");
      rerender();
      break;
    case "setup-sleep-timer":
      setSetupChoice("sleepMinutes", Number(target.dataset.value));
      resetIdleSleep();
      rerender();
      break;
    case "setup-background": {
      const profile = state.activeProfile || state.setupChoices.profileName || "Player One";
      setProfilePreferences({ background: { selection: target.dataset.backgroundId } }, profile);
      schedulePreferenceSave(profile);
      rerender();
      break;
    }
    case "setup-open-background-picker":
      document.querySelector("[data-setup-background-input]")?.click();
      break;
    case "setup-audio-test":
      if (!(await playSetupAudioTest())) toast("Sound couldn’t play");
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
    case "open-control-center":
      openControlCenter();
      break;
    case "close-control-center":
      closeControlCenter();
      break;
    case "control-center-open-context":
      showControlCenterContext(target.dataset.controlCenterId, true, focus);
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
    case "restore-control-center-order":
      setProfilePreferences({ controlCenter: { order: [...DEFAULT_CONTROL_CENTER_ORDER], hidden: [] } });
      schedulePreferenceSave();
      toast("Control Center restored");
      rerender();
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
  if (event.target.matches("[data-setup-setting]")) {
    setSetupChoice(event.target.dataset.setupSetting, event.target.value);
    updateClock();
    return;
  }
  if (event.target.matches("[data-setup-safe-area]")) {
    setSetupChoice("safeArea", Number(event.target.value));
    return;
  }
  if (event.target.matches("[data-audio-volume]")) {
    try {
      const audio = await paraApi.setAudio("output", { volume: Number(event.target.value) });
      const output = overlay.querySelector("[data-audio-output]");
      if (output && audio.output) output.textContent = `${audio.output.volume}%`;
    } catch { /* the current level remains visible */ }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-setup-setting='profileName']")) {
    setSetupChoice("profileName", event.target.value);
    return;
  }
  if (event.target.matches("[data-setup-safe-area]")) {
    const value = Number(event.target.value);
    setSetupChoice("safeArea", value);
    const output = document.querySelector("[data-safe-area-value]");
    const frame = document.querySelector(".setup-display-frame");
    if (output) output.textContent = `${value}%`;
    if (frame) frame.style.setProperty("--setup-inset", `${value}%`);
    return;
  }
  if (event.target.matches("[data-audio-volume]")) {
    const output = overlay.querySelector("[data-audio-output]");
    if (output) output.textContent = `${event.target.value}%`;
  }
});

function resetIdleSleep() {
  clearTimeout(idleSleepTimer);
  idleSleepTimer = null;
  const state = getState();
  const minutes = Number(state.setupChoices.sleepMinutes) || 0;
  if (!state.firstBootComplete || !state.loggedIn || minutes <= 0) return;
  idleSleepTimer = setTimeout(() => beginSleep({ returnFocus: focus.current }), minutes * 60_000);
}

document.addEventListener("pointerdown", resetIdleSleep, { passive: true });
document.addEventListener("keydown", resetIdleSleep, { passive: true });

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
  resetIdleSleep();
  router.resolve();
}

start();
