import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation, keyboardController } from "./gamepad.js";
import {
  addProfile, applyPreferences, DEFAULT_CONTROL_CENTER_ORDER, getProfilePreferences, getState, postStartupDestination,
  replaceProfilePreferences, resetState, setProfilePreferences, setSetupAccountChoice,
  setSetupChoice, setState, startupDestination,
} from "./state.js";
import {
  SETUP_CHAPTERS, startupScreen, introScreen, setupScreen, activateIntro,
  activateSetupChapter, playSetupAudioTest, updateSetupControllerStatus,
} from "./screens/boot.js";
import { createProfileScreen, profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen, activateHome } from "./screens/home.js";
import {
  appsScreen, activateApps, filterApps, launchLinuxApplication,
} from "./screens/libraries.js";
import { filesScreen, downloadsScreen, activateFiles, filesBack } from "./screens/files.js";
import {
  controllerScreen, updateControllerScreen, activateControllerScreen, storageScreen, activateStorage,
  settingsScreen, displayScreen, accessibilityScreen, networkScreen, activateNetwork,
  accountScreen, powerScreen, healthScreen, activateHealth, recoveryScreen, audioSettingsScreen,
  notificationsScreen, aboutScreen, paraLabScreen, activateParaLab, resetParaScreen,
} from "./screens/system.js";
import {
  gamesScreen, demosScreen, paraStoreScreen, storeProductScreen, gameScreen, activateDemoGame,
  creatorScreen, activateCreator, communityScreen, activateCommunity, marksScreen, messagesScreen, activateParaStore, activateStoreProduct,
  storeGameScreen, activateStoreGame, installStoreItem, uninstallStoreItem,
  playCreatorTone, clearCreatorDrawing,
} from "./screens/experiences.js";
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
import { mountLiveClock, updateLiveClocks } from "./services/live-clock.js";
import { setMenuMusicVolume, syncMenuMusic, toggleMenuMusic, unlockMenuMusic } from "./services/menu-music.js";
import { applyBrowserBackground, clearProfileAssets } from "./services/profile-assets.js";
import {
  activeDownloads, recordExperience, refreshDemoDownloads, removeDemo, startDemoInstall,
} from "./services/experience-runtime.js";
import { toggleMicrophone } from "./services/microphone.js";
import {
  playConfirmSound, playNavigationSound, playNotificationSound, playSystemCue,
  setInterfaceSoundVolume, toggleInterfaceSounds,
} from "./services/sound-effects.js";
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
  "create-profile": createProfileScreen,
  home: homeScreen,
  apps: appsScreen,
  games: gamesScreen,
  demos: demosScreen,
  parastore: paraStoreScreen,
  "store-product": storeProductScreen,
  "store-game": storeGameScreen,
  creator: creatorScreen,
  community: communityScreen,
  messages: messagesScreen,
  marks: marksScreen,
  "demo-pong": () => gameScreen("demo-pong"),
  "demo-racer": () => gameScreen("demo-racer"),
  "demo-platformer": () => gameScreen("demo-platformer"),
  files: filesScreen,
  downloads: downloadsScreen,
  controller: controllerScreen,
  storage: storageScreen,
  settings: settingsScreen,
  display: displayScreen,
  accessibility: accessibilityScreen,
  "audio-settings": audioSettingsScreen,
  network: networkScreen,
  notifications: notificationsScreen,
  about: aboutScreen,
  "para-lab": paraLabScreen,
  "reset-para": resetParaScreen,
  account: accountScreen,
  power: powerScreen,
  health: healthScreen,
  recovery: recoveryScreen,
  personalization: personalizationScreen,
  background: backgroundScreen,
  "control-center-settings": controlCenterSettingsScreen,
};
let cleanupScreen = null;
let cleanupClock = null;
let navigating = false;
let controllerStatus = keyboardController();
let overlayReturnFocus = null;
let preferenceTimer = null;
let idleSleepTimer = null;
let idleDimTimer = null;
let overlayCloseTimer = null;
let activeInputDevice = "keyboard";

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

function updateControllerPrompts() {
  const promptSource = activeInputDevice === "controller" ? controllerStatus : keyboardController();
  document.documentElement.dataset.controller = promptSource.type;
  document.documentElement.dataset.inputDevice = activeInputDevice;
  document.querySelectorAll("[data-prompt]").forEach((node) => {
    node.textContent = promptSource.prompts[node.dataset.prompt] || "";
  });
  if (router.current() === "controller") updateControllerScreen(controllerStatus);
}

function setActiveInputDevice(device) {
  activeInputDevice = device;
  focus.setInputDevice(device);
  updateControllerPrompts();
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
  syncMenuMusic({ gameRunning: route === "store-game" || ["demo-pong", "demo-racer", "demo-platformer"].includes(route) });
  cleanupScreen?.();
  cleanupScreen = null;
  cleanupClock?.();
  cleanupClock = null;
  root.innerHTML = (renderers[route] || homeScreen)();
  root.classList.remove("is-leaving");
  root.classList.add("is-entering");
  requestAnimationFrame(() => root.classList.remove("is-entering"));
  navigating = false;
  cleanupClock = mountLiveClock(root);
  const background = getProfilePreferences().background;
  if (background.selection === "custom" && background.source === "browser") void applyBrowserBackground(getState().activeProfile || "P1");
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
  } else if (["demo-pong", "demo-racer", "demo-platformer"].includes(route)) {
    cleanupScreen = activateDemoGame({ route });
  } else if (route === "creator") {
    cleanupScreen = activateCreator();
  } else if (route === "community") {
    cleanupScreen = activateCommunity();
  } else if (route === "parastore") {
    cleanupScreen = activateParaStore();
  } else if (route === "store-product") {
    cleanupScreen = activateStoreProduct();
  } else if (route === "store-game") {
    cleanupScreen = activateStoreGame();
  } else if (route === "files" || route === "downloads") {
    cleanupScreen = activateFiles({ focus, initialLocation: route === "downloads" ? "downloads" : "home" });
    if (route === "files") recordExperience({ id: "para:files", title: "Files", route: "files", kind: "App", accent: "#8458ff", mark: "▱" });
  } else if (route === "storage") {
    activateStorage();
  } else if (route === "network") {
    activateNetwork();
  } else if (route === "health") {
    activateHealth();
  } else if (route === "controller") {
    updateControllerScreen(controllerStatus);
    cleanupScreen = activateControllerScreen();
  } else if (route === "para-lab") {
    cleanupScreen = activateParaLab();
  } else if (route === "background") {
    cleanupScreen = activateBackgroundScreen({ focus, changed: schedulePreferenceSave });
  } else if (route === "control-center-settings") {
    activateControlCenterSettings({ focus, controller: controllerStatus });
  } else if (route === "setup") {
    cleanupScreen = activateSetupChapter({ controller: controllerStatus, focus, changed: () => { schedulePreferenceSave(getState().activeProfile || getState().setupChoices.profileName || "P1"); rerender(); } });
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
  if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") {
    playConfirmSound();
    target.click();
  }
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
    resetControlCenterData(overlay);
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
  if (router.current() === "home") {
    document.dispatchEvent(new CustomEvent("para-home-section-shift", { detail: { direction } }));
    return;
  }
  if (router.current() === "settings") {
    const zones = ["settings-console", "settings-connections", "settings-profile", "settings-system"];
    const currentZone = focus.zoneOf(focus.current)?.dataset.focusZone || zones[0];
    const currentIndex = Math.max(0, zones.indexOf(currentZone));
    const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + zones.length) % zones.length;
    focus.focusFirst({ zone: zones[nextIndex] });
  }
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
document.addEventListener("para-focuschange", playNavigationSound);
document.addEventListener("para-inputdevicechange", (event) => {
  activeInputDevice = event.detail?.device || "keyboard";
  updateControllerPrompts();
});
document.addEventListener("para-systemcue", (event) => playSystemCue(event.detail?.name));
document.addEventListener("para-startup-sound", (event) => playSystemCue(event.detail?.cue || "startup"));
document.addEventListener("para-downloadcomplete", (event) => {
  const item = event.detail?.downloads?.[0];
  if (item) {
    playNotificationSound();
    toast(`${item.title} is ready`);
  }
  if (["demos", "parastore", "games"].includes(router.current())) rerender();
});
document.addEventListener("para-markearned", (event) => {
  playNotificationSound();
  toast("Mark earned", event.detail?.title || "New milestone");
});
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
  inputDevice: setActiveInputDevice,
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
    const profile = profileOverride || getState().activeProfile || "P1";
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
    recordExperience({ id: target.dataset.appId, title: name, route: "apps", kind: "App", accent: "#9161ff", mark: name.slice(0, 1).toUpperCase() });
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
      addProfile(state.setupChoices.profileName || "P1");
      setState({ firstBootComplete: true, setupStep: SETUP_CHAPTERS.length - 1 });
      loginToHome(state.activeProfile || state.setupChoices.profileName || "P1", target);
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
      const profile = state.setupChoices.profileName?.trim() || "P1";
      addProfile(profile);
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
      const profile = state.activeProfile || state.setupChoices.profileName || "P1";
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
      setState({ activeProfile: target.dataset.profile || "P1" });
      navigate("login", {}, target);
      break;
    case "profile-login":
      loginToHome(target.dataset.profile || state.activeProfile || "P1", target);
      break;
    case "create-profile": {
      const name = document.querySelector("[data-new-profile-name]")?.value || "";
      if (!addProfile(name)) {
        toast("Choose another name");
        break;
      }
      setState({ activeProfile: name.trim() });
      navigate("login", { replace: true }, target);
      break;
    }
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
      try { await clearProfileAssets(); } catch { /* browser storage may already be empty */ }
      resetState();
      navigate("intro", { replace: true }, target);
      break;
    case "restart-current-app":
      render(router.current());
      break;
    case "return-home-after-crash":
      router.go("home", { replace: true });
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
    case "toggle-browser-microphone":
      await toggleMicrophone();
      await populateControlCenter({ overlay, controller: controllerStatus, focus });
      showControlCenterContext("microphone", true, focus);
      break;
    case "toggle-menu-music":
      toast("Menu music", toggleMenuMusic() ? "On" : "Off");
      schedulePreferenceSave();
      rerender();
      break;
    case "toggle-interface-sounds":
      toast("Interface sounds", toggleInterfaceSounds() ? "On" : "Off");
      schedulePreferenceSave();
      rerender();
      break;
    case "install-demo":
      if (startDemoInstall(target.dataset.demoId)) {
        toast("Installing demo", target.closest(".demo-card")?.querySelector("h2")?.textContent || "Download started");
        rerender();
      }
      break;
    case "filter-store":
      document.querySelectorAll("[data-store-category]").forEach((button) => button.classList.toggle("is-active", button === target));
      break;
    case "start-current-demo":
      break;
    case "remove-demo":
      removeDemo(target.dataset.demoId);
      toast("Demo removed");
      rerender();
      break;
    case "play-creator-tone":
      playCreatorTone(target);
      break;
    case "clear-creator-drawing":
      clearCreatorDrawing();
      toast("Sketch cleared");
      break;
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
    case "open-store-product":
      if (target.dataset.storeId) {
        sessionStorage.setItem("para.store.product", target.dataset.storeId);
        navigate("store-product", {}, target);
      }
      break;
    case "install-store-game": {
      const id = target.dataset.storeId || sessionStorage.getItem("para.store.product") || "";
      try {
        const item = await paraApi.storeProduct(id);
        if (!["WEB", "JAVASCRIPT", "UNITY_WEBGL"].includes(item.runtime)) {
          toast("Install unavailable", "This web preview currently installs WEB titles only.");
          break;
        }
        if (installStoreItem(item)) {
          toast(`${item.title || "Game"} installed`, "Ready to play");
          rerender();
        }
      } catch (error) {
        toast("Install failed", error.message || "Could not install this title");
      }
      break;
    }
    case "play-store-game":
      if (target.dataset.storeId) {
        sessionStorage.setItem("para.store.launch", target.dataset.storeId);
        navigate("store-game", {}, target);
      }
      break;
    case "uninstall-store-game":
      if (target.dataset.storeId) {
        uninstallStoreItem(target.dataset.storeId);
        toast("Game removed", "It can be installed again from ParaStore");
        rerender();
      }
      break;
    case "store-more-info":
      toast("More options", "Wishlist and sharing can plug in here next.");
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
    updateLiveClocks(root);
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
  if (event.target.matches("[data-menu-music-volume]")) {
    setMenuMusicVolume(event.target.value);
    schedulePreferenceSave();
  }
  if (event.target.matches("[data-interface-volume]")) {
    setInterfaceSoundVolume(event.target.value);
    schedulePreferenceSave();
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
  if (event.target.matches("[data-menu-music-volume]")) {
    setMenuMusicVolume(event.target.value);
    schedulePreferenceSave();
  }
  if (event.target.matches("[data-menu-music-volume]")) {
    setMenuMusicVolume(event.target.value);
    document.querySelectorAll("[data-menu-music-volume-output]").forEach((output) => { output.textContent = `${event.target.value}%`; });
  }
  if (event.target.matches("[data-interface-volume]")) {
    setInterfaceSoundVolume(event.target.value);
    document.querySelectorAll("[data-interface-volume-output], [data-audio-output]").forEach((output) => { output.textContent = `${event.target.value}%`; });
  }
});

function resetIdleSleep() {
  clearTimeout(idleSleepTimer);
  clearTimeout(idleDimTimer);
  idleSleepTimer = null;
  idleDimTimer = null;
  document.documentElement.classList.remove("is-idle");
  const state = getState();
  if (state.firstBootComplete && state.loggedIn) idleDimTimer = setTimeout(() => document.documentElement.classList.add("is-idle"), 90_000);
  const minutes = Number(state.setupChoices.sleepMinutes) || 0;
  if (!state.firstBootComplete || !state.loggedIn || minutes <= 0) return;
  idleSleepTimer = setTimeout(() => beginSleep({ returnFocus: focus.current }), minutes * 60_000);
}

document.addEventListener("pointerdown", () => { unlockMenuMusic(); resetIdleSleep(); }, { passive: true });
document.addEventListener("keydown", () => { unlockMenuMusic(); resetIdleSleep(); }, { passive: true });

function updateOnlineState() {
  document.documentElement.dataset.online = String(navigator.onLine);
  let banner = document.querySelector("[data-offline-banner]");
  if (!navigator.onLine && !banner) {
    banner = document.createElement("div");
    banner.className = "offline-banner";
    banner.dataset.offlineBanner = "";
    banner.innerHTML = `<span>⌁</span><div><strong>PARA is offline</strong><small>Local games, Files, and Creator remain available.</small></div>`;
    document.body.append(banner);
  } else if (navigator.onLine && banner) banner.remove();
}

function showCrashScreen(error) {
  if (document.querySelector("[data-crash-screen]")) return;
  closeControlCenter(false);
  cleanupScreen?.();
  cleanupClock?.();
  const detail = String(error?.stack || error?.message || error || "Unknown error");
  root.innerHTML = `<section class="screen crash-screen" data-crash-screen><img src="./assets/para-logo.png" alt="" /><span class="eyebrow">PARA encountered a problem.</span><h1>This experience stopped unexpectedly.</h1><div><button class="action-button" data-action="restart-current-app" data-autofocus="true">Restart App</button><button class="action-button action-button--ghost" data-action="return-home-after-crash">Return Home</button></div><details><summary>Technical details</summary><pre></pre></details></section>`;
  root.querySelector("pre").textContent = detail;
  focus.focusFirst();
}

window.addEventListener("error", (event) => showCrashScreen(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showCrashScreen(event.reason));
window.addEventListener("online", updateOnlineState);
window.addEventListener("offline", updateOnlineState);
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    navigate("para-lab");
  }
});

if (new URLSearchParams(location.search).get("reset") === "1") {
  resetState();
  history.replaceState({}, "", `${location.pathname}#/startup`);
}

async function start() {
  applyPreferences();
  syncMenuMusic();
  const state = getState();
  if (state.loggedIn && state.activeProfile) await hydrateProfile(state.activeProfile);
  gamepad.start();
  updateOnlineState();
  window.setInterval(() => refreshDemoDownloads(), 500);
  resetIdleSleep();
  router.resolve();
}

start();
