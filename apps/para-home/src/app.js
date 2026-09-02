import { Router } from "./router.js";
import { FocusManager } from "./focus-manager.js";
import { GamepadNavigation, keyboardController } from "./gamepad.js";
import {
  addProfile, applyPreferences, DEFAULT_CONTROL_CENTER_ORDER, getProfilePreferences, getProfileRuntime, getState, postStartupDestination,
  replaceProfilePreferences, resetState, setProfilePreferences, setProfileRuntime, setSetupAccountChoice,
  setSetupChoice, setState, startupDestination, syncStateFromStorage,
} from "./state.js";
import {
  SETUP_CHAPTERS, startupScreen, introScreen, setupScreen, activateIntro,
  activateSetupChapter, playSetupAudioTest, updateSetupControllerStatus,
} from "./screens/boot.js";
import { accountSignInScreen, accountSignUpScreen, accountRecoveryScreen, accountResetPasswordScreen, accountVerifyScreen, createProfileScreen, profilesScreen, loginScreen } from "./screens/auth.js";
import { homeScreen, activateHome } from "./screens/home.js";
import {
  appsScreen, activateApps, filterApps, launchSystemApplication,
} from "./screens/libraries.js";
import { filesScreen, downloadManagerScreen, activateFiles, activateDownloadManager, filesBack } from "./screens/files.js";
import { mediaGalleryScreen, achievementsScreen, activateMediaGallery, activateAchievements, removeCapture, selectMediaCapture, filterMediaGallery } from "./screens/media.js";
import { capturePlaybackBlob, capturePlaybackMime, captureScreenshot, recordRecentClip, startReplayBuffer, saveReplayClip, shareCapture, listCaptures, getCapture, replayStatus, startManualRecording, stopManualRecording, manualRecordingStatus } from "./services/capture-service.js";
import {
  controllerScreen, updateControllerScreen, activateControllerScreen, paraInputScreen, activateParaInputScreen, storageScreen, activateStorage,
  settingsScreen, displayScreen, accessibilityScreen, networkScreen, activateNetwork,
  accountScreen, activateAccount, powerScreen, healthScreen, activateHealth, recoveryScreen, audioSettingsScreen,
  notificationsScreen, aboutScreen, paraLabScreen, activateParaLab, resetParaScreen, savedDataScreen, activateSavedData,
} from "./screens/system.js";
import {
  gamesScreen, activateGames, demosScreen, paraStoreScreen, storeProductScreen, storeCartScreen, gameScreen, activateDemoGame,
  creatorScreen, activateCreator, communityScreen, activateCommunity, marksScreen, activateParaStore, activateStoreProduct, activateStoreCart,
  storeGameScreen, activateStoreGame, installStoreItem, uninstallStoreItem, addStoreCartItem, removeStoreCartItem,
  playCreatorTone, clearCreatorDrawing, currentStoreCartIds, toggleStoreWishlistItem,
} from "./screens/experiences.js";
import { friendsScreen, activateFriends } from "./screens/friends.js";
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
import { knownParaAccount, markParaAccountConnected, markParaAccountDisconnected, markParaAccountVerified, rememberParaAccount } from "./services/account-memory.js";
import { mountLiveClock, updateLiveClocks } from "./services/live-clock.js";
import { setMenuMusicVolume, syncMenuMusic, toggleMenuMusic, unlockMenuMusic, suspendMenuMusic } from "./services/menu-music.js";
import { mediaSessionAction, setMediaVolume, setGameMediaBalance, mediaSessionState } from "./services/media-session.js";
import { applyBrowserBackground, clearProfileAssets } from "./services/profile-assets.js";
import {
  activeDownloads, closeExperience, favoriteExperience, recordExperience, refreshDemoDownloads, removeDemo, runningExperiences, startDemoInstall, pauseDownload, resumeDownload, cancelDownload, markNotificationRead, markAllNotificationsRead,
} from "./services/experience-runtime.js";
import { toggleMicrophone } from "./services/microphone.js";
import { cycleParaInputBinding, getParaInputSettings, patchParaInputSettings, resetParaInputSettings } from "./services/para-input.js";
import {
  playConfirmSound, playNavigationSound, playNotificationSound, playSystemCue,
  setInterfaceSoundVolume, toggleInterfaceSounds,
} from "./services/sound-effects.js";
import { takeRestartSequence } from "./services/power-adapter.js";
import {
  browserScreen, activateBrowser, browserNavigate, browserBack, browserForward, browserReload, updateParaPointState,
} from "./screens/browser.js";
import {
  closeParaBoard, isParaBoardOpen, openParaBoard, paraBoardBackspace, paraBoardInsert, paraBoardToggleShift, paraBoardToggleSymbols,
} from "./ui/paraboard.js";
import { toggleParaPoint } from "./ui/parapoint.js";
import { activateParaVideoPlayers, paraVideoPlayerMarkup } from "./ui/video-player.js";
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
  "account-signin": accountSignInScreen,
  "account-recovery": accountRecoveryScreen,
  "account-reset-password": accountResetPasswordScreen,
  "account-signup": accountSignUpScreen,
  "account-verify": accountVerifyScreen,
  home: homeScreen,
  apps: appsScreen,
  browser: browserScreen,
  games: gamesScreen,
  "media-gallery": mediaGalleryScreen,
  achievements: achievementsScreen,
  demos: demosScreen,
  parastore: paraStoreScreen,
  "store-product": storeProductScreen,
  "store-cart": storeCartScreen,
  "store-game": storeGameScreen,
  creator: creatorScreen,
  community: communityScreen,
  friends: friendsScreen,
  messages: friendsScreen,
  marks: marksScreen,
  "demo-pong": () => gameScreen("demo-pong"),
  "demo-racer": () => gameScreen("demo-racer"),
  "demo-platformer": () => gameScreen("demo-platformer"),
  files: filesScreen,
  downloads: downloadManagerScreen,
  controller: controllerScreen,
  "para-input": paraInputScreen,
  storage: storageScreen,
  "saved-data": savedDataScreen,
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
let captureViewerUrl = "";
let youtubeThumbnailPickerUrl = "";
let activeInputDevice = "keyboard";
let gameTransitionInFlight = false;
const GAME_RETURN_TRANSITION_KEY = "para.game.transition.return";
const SHELL_PARAMS = new URLSearchParams(location.search);
const IS_SUSPENDED_GAME_SHELL = window.parent !== window && SHELL_PARAMS.get("para_suspended_shell") === "1";
const SUSPENDED_GAME_ID = SHELL_PARAMS.get("para_suspended_game") || "";
let pendingAccountRecovery = null;
let pendingIntegrationNotice = null;
let pendingYoutubeUploadReturn = null;
const YOUTUBE_UPLOAD_DRAFT_KEY = "para.youtube.upload.draft";
const YOUTUBE_DEFAULT_VISIBILITY_KEY = "para.youtube.defaultVisibility";

function captureAccountRecoveryFromUrl() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw || raw.startsWith("/")) return false;
  const params = new URLSearchParams(raw);
  if (params.get("type") !== "recovery" || !params.get("access_token")) return false;
  pendingAccountRecovery = {
    accessToken: params.get("access_token") || "",
    refreshToken: params.get("refresh_token") || "",
    expiresIn: Number(params.get("expires_in") || 3600),
  };
  history.replaceState({}, "", `${location.pathname}${location.search}#/account-reset-password`);
  return true;
}

function captureIntegrationReturnFromUrl() {
  const raw = location.hash.replace(/^#\/?/, "");
  const separator = raw.indexOf("?");
  if (separator < 0 || raw.slice(0, separator) !== "setup") return false;
  const params = new URLSearchParams(raw.slice(separator + 1));
  const integration = params.get("integration") || "";
  if (!["steam", "google"].includes(integration)) return false;
  const group = integration === "steam" ? "gamingAccounts" : "otherAccounts";
  const label = integration === "steam" ? "Steam" : "Google / YouTube";
  const status = params.get("status") || "";
  if (status === "connected") {
    setSetupAccountChoice(group, integration, "connected");
    pendingIntegrationNotice = {
      title: `${label} connected`,
      message: integration === "google"
        ? (params.get("youtube") === "none" ? "Your Google account is linked. No YouTube channel was found on it." : "Your Google account and YouTube channel are linked to this PARA Account.")
        : "Your Steam account is linked to this PARA Account.",
    };
  } else if (status === "cancelled") {
    setSetupAccountChoice(group, integration, "disconnected");
    pendingIntegrationNotice = { title: `${label} connection cancelled`, message: "Nothing was changed." };
  } else if (status === "signin_required") {
    setSetupAccountChoice(group, integration, "disconnected");
    pendingIntegrationNotice = { title: "Sign in to PARA first", message: `A PARA Account is required before ${label} can be linked.` };
  } else if (status === "config_required" && integration === "google") {
    setSetupAccountChoice(group, integration, "disconnected");
    pendingIntegrationNotice = { title: "Google setup required", message: "Add PARA's Google OAuth client ID and secret on Render, then try again." };
  } else if (status === "error") {
    setSetupAccountChoice(group, integration, "disconnected");
    pendingIntegrationNotice = { title: `${label} connection failed`, message: `PARA could not verify or save that ${label} account. Try again.` };
  }
  const returnRoute = sessionStorage.getItem("para.integration.return") === "account" ? "account" : "setup";
  sessionStorage.removeItem("para.integration.return");
  history.replaceState({}, "", `${location.pathname}${location.search}#/${returnRoute}`);
  return true;
}

function captureYouTubeUploadReturnFromUrl() {
  const raw = location.hash.replace(/^#\/?/, "");
  const separator = raw.indexOf("?");
  if (separator < 0 || raw.slice(0, separator) !== "media-gallery") return false;
  const params = new URLSearchParams(raw.slice(separator + 1));
  const status = params.get("youtube_upload") || "";
  if (!status) return false;
  pendingYoutubeUploadReturn = { status, reason: params.get("reason") || "" };
  history.replaceState({}, "", `${location.pathname}${location.search}#/media-gallery`);
  return true;
}

function sendSuspendedGameCommand(command, detail = {}) {
  if (!IS_SUSPENDED_GAME_SHELL) return false;
  try {
    window.parent.postMessage({ type: "para-suspended-game-command", command, suspendedGameId: SUSPENDED_GAME_ID, ...detail }, location.origin);
    return true;
  } catch {
    return false;
  }
}

function cachedStoreLaunchArtwork(storeId = "") {
  const id = String(storeId || "").trim();
  if (!id) return { title: "", urls: [] };
  try {
    const parsed = JSON.parse(sessionStorage.getItem(`para.store.artwork.${id}`) || "{}");
    return { title: String(parsed.title || ""), urls: Array.isArray(parsed.urls) ? parsed.urls.filter(Boolean).slice(0, 8) : [] };
  } catch { return { title: "", urls: [] }; }
}

function storeArtworkFromProduct(item = {}) {
  const assets = item.asset_references || {};
  const shots = Array.isArray(assets.screenshots) ? assets.screenshots : [];
  const paths = [...new Set([assets.hero, assets.cover, ...shots, assets.icon].filter(Boolean))];
  const urls = paths.slice(0, 8).map((path) => `/api/v1/store/asset?path=${encodeURIComponent(path)}`);
  if (item.id) {
    try { sessionStorage.setItem(`para.store.artwork.${item.id}`, JSON.stringify({ title: item.title || "PARA Game", urls })); } catch {}
  }
  return { title: String(item.title || ""), urls };
}

function gameTransitionNode({ mode = "launch", title = "", artwork = [] } = {}) {
  const node = document.createElement("div");
  node.className = `para-game-transition para-game-transition--${mode}`;
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  const heading = mode === "return" ? "Returning to PARA" : "Launching";
  const detail = title ? `<strong>${String(title).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch])}</strong>` : "";
  const slides = Array.isArray(artwork) ? artwork.filter(Boolean).slice(0, 8) : [];
  const slideMarkup = slides.length ? `<div class="para-game-transition__slideshow" aria-hidden="true">${slides.map((url, index) => `<img src="${String(url).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch])}" class="${index === 0 ? "is-active" : ""}">`).join("")}</div>` : "";
  node.innerHTML = `<div class="para-game-transition__backdrop"></div>${slideMarkup}<div class="para-game-transition__shade"></div><div class="para-game-transition__content"><img src="./assets/para-logo.png" alt=""><span>${heading}</span>${detail}<i aria-hidden="true"></i></div>`;
  if (slides.length > 1) {
    const images = [...node.querySelectorAll(".para-game-transition__slideshow img")];
    let slideIndex = 0;
    node._paraSlideTimer = window.setInterval(() => {
      images[slideIndex]?.classList.remove("is-active");
      slideIndex = (slideIndex + 1) % images.length;
      images[slideIndex]?.classList.add("is-active");
    }, 1500);
  }
  document.body.append(node);
  return node;
}

function storeGameTitle(storeId) {
  const id = String(storeId || "");
  const runtime = runningExperiences().find((item) => String(item.storeId || "") === id || String(item.id || "") === `store:${id}`);
  if (runtime?.title) return runtime.title;
  const button = [...document.querySelectorAll("[data-store-id]")].find((item) => item.dataset.storeId === id);
  const cardTitle = button?.closest("article,section")?.querySelector("h1,h2,h3,strong")?.textContent?.trim();
  return cardTitle || "PARA Game";
}

function transitionIntoGame(destination, title = "PARA Game", artwork = []) {
  if (gameTransitionInFlight) return false;
  gameTransitionInFlight = true;
  closeControlCenter(false);
  suspendMenuMusic();
  const node = gameTransitionNode({ mode: "launch", title, artwork });
  requestAnimationFrame(() => node.classList.add("is-visible"));
  const reduced = getState().reducedMotion;
  window.setTimeout(() => {
    node.classList.add("is-committed");
    window.setTimeout(() => window.location.assign(destination), reduced ? 1 : 120);
  }, reduced ? 20 : 500);
  return true;
}

function revealHomeAfterGame() {
  if (IS_SUSPENDED_GAME_SHELL) return;
  let payload = null;
  try { payload = JSON.parse(sessionStorage.getItem(GAME_RETURN_TRANSITION_KEY) || "null"); } catch (_) {}
  if (!payload) return;
  sessionStorage.removeItem(GAME_RETURN_TRANSITION_KEY);
  const node = gameTransitionNode({ mode: "return", title: payload.title || "" });
  node.classList.add("is-visible", "is-committed");
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("is-revealing")));
  window.setTimeout(() => node.remove(), getState().reducedMotion ? 30 : 620);
}

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

let recordingHudTimer = null;

function recordingClock(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function syncRecordingHud() {
  const status = manualRecordingStatus();
  let hud = document.querySelector("[data-para-recording-hud]");
  if (!status.active) {
    hud?.remove();
    window.clearInterval(recordingHudTimer);
    recordingHudTimer = null;
    document.documentElement.classList.remove("para-is-recording");
    return;
  }
  document.documentElement.classList.add("para-is-recording");
  if (!hud) {
    hud = document.createElement("button");
    hud.type = "button";
    hud.className = "para-recording-hud";
    hud.dataset.paraRecordingHud = "true";
    hud.dataset.action = "toggle-manual-recording";
    hud.setAttribute("aria-label", "Stop and save PARA recording");
    document.body.append(hud);
  }
  hud.disabled = Boolean(status.stopping);
  hud.innerHTML = `<i></i><span><strong>${status.stopping ? "Saving recording…" : "Recording PARA"}</strong><small>${recordingClock(status.elapsedMs)} · ${status.stopping ? "Please wait" : "Stop & Save"}</small></span><b>${status.stopping ? "…" : "■"}</b>`;
  if (!recordingHudTimer) recordingHudTimer = window.setInterval(syncRecordingHud, 500);
}

document.addEventListener("para-capture-state", () => {
  syncRecordingHud();
  const context = overlay.querySelector?.("[data-control-center-context][data-context-for='captures']");
  if (context && !overlay.hidden) showControlCenterContext("captures", false, focus);
});

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
  } else if (route === "games") {
    void activateGames({ focus });
  } else if (route === "browser") {
    cleanupScreen = activateBrowser();
    recordExperience({ id: "para:browser", title: "PARA Browser", route: "browser", kind: "App", accent: "#4285ff", mark: "◎" });
  } else if (["demo-pong", "demo-racer", "demo-platformer"].includes(route)) {
    cleanupScreen = activateDemoGame({ route });
  } else if (route === "creator") {
    cleanupScreen = activateCreator();
  } else if (route === "community") {
    cleanupScreen = activateCommunity();
  } else if (route === "friends" || route === "messages") {
    cleanupScreen = activateFriends({ focus });
  } else if (route === "parastore") {
    cleanupScreen = activateParaStore();
  } else if (route === "store-product") {
    cleanupScreen = activateStoreProduct();
  } else if (route === "store-cart") {
    cleanupScreen = activateStoreCart();
  } else if (route === "store-game") {
    cleanupScreen = activateStoreGame();
  } else if (route === "files") {
    cleanupScreen = activateFiles({ focus, initialLocation: "home" });
  } else if (route === "downloads") {
    void activateDownloadManager({ focus }).then((cleanup) => {
      if (router.current() === "downloads") cleanupScreen = cleanup;
      else cleanup?.();
    });
  } else if (route === "saved-data") {
    void activateSavedData().then((cleanup) => {
      if (router.current() === "saved-data") cleanupScreen = cleanup;
      else cleanup?.();
    });
  } else if (route === "media-gallery") {
    void activateMediaGallery().then((cleanup) => { if (router.current() === "media-gallery") cleanupScreen = cleanup; });
  } else if (route === "achievements") {
    void activateAchievements({ focus }).then((cleanup) => { if (router.current() === "achievements") cleanupScreen = cleanup; });
  } else if (route === "storage") {
    activateStorage();
  } else if (route === "network") {
    activateNetwork();
  } else if (route === "health") {
    activateHealth();
  } else if (route === "account") {
    activateAccount();
  } else if (route === "controller") {
    updateControllerScreen(controllerStatus);
    cleanupScreen = activateControllerScreen();
  } else if (route === "para-input") {
    cleanupScreen = activateParaInputScreen();
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
revealHomeAfterGame();

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
    if (activeInputDevice === "controller" && target.matches?.("input:not([type='range']):not([type='checkbox']):not([type='radio']), textarea")) {
      playConfirmSound();
      overlayReturnFocus = target;
      openParaBoard(target, { overlay, focus, controllerLabel: controllerStatus.typeLabel || "Controller" });
      return;
    }
    playConfirmSound();
    target.click();
  }
}

function back() {
  if (consumePowerInput()) return;
  if (isParaBoardOpen()) { closeParaBoard({ overlay, focus, commit: false }); return; }
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
  if (captureViewerUrl) { URL.revokeObjectURL(captureViewerUrl); captureViewerUrl = ""; }
  if (youtubeThumbnailPickerUrl) { URL.revokeObjectURL(youtubeThumbnailPickerUrl); youtubeThumbnailPickerUrl = ""; }
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
  navigate("home");
}

function openSwitcher() {
  clearTimeout(overlayCloseTimer);
  overlayReturnFocus = focus.current;
  const running = runningExperiences().slice(0, 5);
  overlay.innerHTML = `<div class="switcher-scrim" data-action="close-control-center"></div><section class="para-switcher" role="dialog" aria-modal="true" aria-label="PARA Switcher"><header><span>PARA Switcher</span><h2>${running.length ? "Running & suspended" : "Nothing running"}</h2><small>Resume a game or close it completely.</small></header><div class="para-switcher__cards">${running.length ? running.map((item,index)=>{ const art=item.artwork?`<img src="${escapeOverlayText(item.artwork)}" alt="">`:`<span>${item.kind === 'Game' ? '◈' : '▦'}</span>`; return `<article class="switcher-card" style="--switcher-accent:${item.accent || '#8d43ff'}"><button class="switcher-card__resume" type="button" data-action="resume-experience" data-experience-id="${escapeOverlayText(item.id)}" data-experience-route="${escapeOverlayText(item.route || 'home')}" data-store-id="${escapeOverlayText(item.storeId || '')}" ${index===0?'data-autofocus="true"':''}><span class="switcher-card__art">${art}</span><span class="switcher-card__copy"><small>${escapeOverlayText(item.kind || 'App')}</small><strong>${escapeOverlayText(item.title || 'Experience')}</strong><em>${escapeOverlayText(item.queueStatus || 'Suspended')}</em></span></button><button class="switcher-card__close" data-action="close-experience" data-experience-id="${escapeOverlayText(item.id)}" aria-label="Close ${escapeOverlayText(item.title || 'experience')}"><b>×</b><span>Close</span></button></article>`; }).join('') : `<div class="switcher-empty">Open a game or app and it will appear here.</div>`}</div><footer><span><b data-prompt="confirm">A</b> Resume</span><span><b data-prompt="back">B</b> Back</span><span><b>×</b> Close</span></footer></section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  updateControllerPrompts();
  requestAnimationFrame(()=>focus.focusFirst());
}

function escapeOverlayText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function youtubeCategoryOptions(selected = "20") {
  const categories = [
    ["20", "Gaming"], ["24", "Entertainment"], ["22", "People & Blogs"], ["23", "Comedy"],
    ["27", "Education"], ["28", "Science & Technology"], ["17", "Sports"], ["1", "Film & Animation"], ["10", "Music"],
  ];
  return categories.map(([id, label]) => `<option value="${id}" ${id === String(selected) ? "selected" : ""}>${label}</option>`).join("");
}

function drawThumbnailFrame(video, canvas) {
  if (!video?.videoWidth || !video?.videoHeight || !canvas) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const width = canvas.width || 1280;
  const height = canvas.height || 720;
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return true;
}

function setupYouTubeThumbnailPicker(item) {
  const video = overlay.querySelector("[data-youtube-thumbnail-video]");
  const canvas = overlay.querySelector("[data-youtube-thumbnail-canvas]");
  const range = overlay.querySelector("[data-youtube-thumbnail-time]");
  const label = overlay.querySelector("[data-youtube-thumbnail-time-label]");
  const enabled = overlay.querySelector("[data-youtube-thumbnail-enabled]");
  const picker = overlay.querySelector("[data-youtube-thumbnail-picker]");
  if (!video || !canvas || !range || !enabled || !picker) return;
  if (youtubeThumbnailPickerUrl) URL.revokeObjectURL(youtubeThumbnailPickerUrl);
  youtubeThumbnailPickerUrl = URL.createObjectURL(item.blob);
  video.src = youtubeThumbnailPickerUrl;
  const expected = Math.max(0.1, Number(item.durationMs || 0) / 1000);
  const updateLabel = () => { if (label) label.textContent = `${Number(range.value || 0).toFixed(1)}s`; };
  const seek = () => {
    updateLabel();
    try { video.currentTime = Math.max(0, Number(range.value || 0)); } catch {}
  };
  const ready = () => {
    const duration = Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : expected;
    range.max = String(Math.max(0.1, duration));
    range.step = "0.1";
    const initial = Math.min(Math.max(0.1, duration * 0.25), Math.max(0.1, duration - 0.05));
    range.value = String(initial);
    seek();
  };
  video.addEventListener("loadedmetadata", ready, { once: true });
  video.addEventListener("seeked", () => drawThumbnailFrame(video, canvas));
  video.addEventListener("loadeddata", () => drawThumbnailFrame(video, canvas));
  range.addEventListener("input", seek);
  enabled.addEventListener("change", () => picker.classList.toggle("is-disabled", !enabled.checked));
  video.load();
  if (video.readyState >= 1) ready();
}

async function captureThumbnailBlob(item, seconds) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(item.blob);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    const cleanup = () => { URL.revokeObjectURL(url); video.remove(); };
    const fail = () => { cleanup(); reject(new Error("PARA could not extract that thumbnail frame.")); };
    video.addEventListener("error", fail, { once: true });
    video.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : Math.max(0.1, Number(item.durationMs || 0) / 1000);
      try { video.currentTime = Math.min(Math.max(0, Number(seconds || 0)), Math.max(0, duration - 0.02)); } catch { fail(); }
    }, { once: true });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      if (!drawThumbnailFrame(video, canvas)) { fail(); return; }
      canvas.toBlob((blob) => {
        cleanup();
        if (blob) resolve(blob); else reject(new Error("PARA could not create the thumbnail image."));
      }, "image/jpeg", 0.9);
    }, { once: true });
    video.src = url;
    video.load();
  });
}

async function openYouTubeUploadDialog(captureId) {
  const item = await getCapture(captureId);
  if (!item) { toast("Capture not found"); return false; }
  if (item.type !== "clip") { toast("YouTube needs a video", "Choose a gameplay video instead of a screenshot."); return false; }
  clearTimeout(overlayCloseTimer);
  overlayReturnFocus = focus.current;
  const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(item.createdAt || Date.now());
  const defaultTitle = `PARA Gameplay · ${when}`.slice(0, 100);
  const savedVisibility = ["private", "unlisted", "public"].includes(localStorage.getItem(YOUTUBE_DEFAULT_VISIBILITY_KEY)) ? localStorage.getItem(YOUTUBE_DEFAULT_VISIBILITY_KEY) : "private";
  overlay.innerHTML = `<div class="share-center-scrim" data-action="close-control-center"></div>
    <section class="youtube-upload-dialog" role="dialog" aria-modal="true" aria-label="Upload gameplay to YouTube">
      <header class="share-center__header"><div><span>PARA × YOUTUBE</span><h2>Upload gameplay</h2><small>Publish this capture without leaving PARA.</small></div><button type="button" class="share-center__close" data-action="close-control-center" aria-label="Close YouTube upload">×</button></header>
      <div class="youtube-upload-layout">
        <div class="youtube-thumbnail-panel">
          <span class="youtube-upload-field-label">Thumbnail frame</span>
          <div class="youtube-thumbnail-picker" data-youtube-thumbnail-picker>
            <video muted playsinline preload="auto" data-youtube-thumbnail-video aria-hidden="true"></video>
            <canvas width="1280" height="720" data-youtube-thumbnail-canvas></canvas>
          </div>
          <div class="youtube-thumbnail-scrubber"><input type="range" min="0" max="15" step="0.1" value="1" data-youtube-thumbnail-time aria-label="Thumbnail frame time"><strong data-youtube-thumbnail-time-label>1.0s</strong></div>
          <label class="youtube-thumbnail-toggle"><input type="checkbox" data-youtube-thumbnail-enabled checked><span>Use this frame as the custom thumbnail</span></label>
          <small>Custom thumbnails require an eligible YouTube channel. If YouTube rejects it, the video still uploads normally.</small>
        </div>
        <div class="youtube-upload-form">
          <label><span>Title</span><input type="text" maxlength="100" value="${escapeOverlayText(defaultTitle)}" data-youtube-upload-title data-autofocus="true"></label>
          <label><span>Description</span><textarea maxlength="5000" rows="4" placeholder="Optional description" data-youtube-upload-description>Captured with PARA.</textarea></label>
          <label><span>Tags</span><input type="text" maxlength="500" placeholder="PARA, gameplay, gaming" value="PARA, gameplay" data-youtube-upload-tags></label>
          <div class="youtube-upload-form__split">
            <label><span>Category</span><select data-youtube-upload-category>${youtubeCategoryOptions("20")}</select></label>
            <label><span>Visibility</span><select data-youtube-upload-privacy><option value="private" ${savedVisibility === "private" ? "selected" : ""}>Private</option><option value="unlisted" ${savedVisibility === "unlisted" ? "selected" : ""}>Unlisted</option><option value="public" ${savedVisibility === "public" ? "selected" : ""}>Public</option></select></label>
          </div>
          <div class="youtube-upload-form__split">
            <label><span>Audience</span><select data-youtube-upload-audience><option value="" selected>Choose…</option><option value="false">No, not made for kids</option><option value="true">Yes, made for kids</option></select></label>
            <label><span>Schedule publish (optional)</span><input type="datetime-local" data-youtube-upload-schedule></label>
          </div>
          <p class="youtube-upload-note">A scheduled upload stays <strong>Private</strong> until the selected time, then YouTube publishes it. PARA remembers your normal visibility choice for the next upload.</p>
          <p class="youtube-upload-note youtube-upload-note--warning">While PARA's YouTube API project is unverified, YouTube forces API uploads to <strong>Private</strong>, regardless of the visibility you choose.</p>
        </div>
      </div>
      <footer class="youtube-upload-actions"><button type="button" class="action-button action-button--ghost" data-action="close-control-center">Cancel</button><button type="button" class="action-button" data-action="youtube-upload-authorize" data-capture-id="${escapeOverlayText(item.id)}">Authorize & Upload</button></footer>
    </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  setupYouTubeThumbnailPicker(item);
  updateControllerPrompts();
  requestAnimationFrame(() => focus.focusFirst());
  return true;
}

function saveYouTubeUploadDraft(captureId) {
  const title = String(overlay.querySelector("[data-youtube-upload-title]")?.value || "").trim();
  const description = String(overlay.querySelector("[data-youtube-upload-description]")?.value || "");
  const selectedPrivacy = String(overlay.querySelector("[data-youtube-upload-privacy]")?.value || "private");
  const audience = String(overlay.querySelector("[data-youtube-upload-audience]")?.value || "");
  const categoryId = String(overlay.querySelector("[data-youtube-upload-category]")?.value || "20");
  const tags = [...new Set(String(overlay.querySelector("[data-youtube-upload-tags]")?.value || "").split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 40);
  const scheduleRaw = String(overlay.querySelector("[data-youtube-upload-schedule]")?.value || "");
  const thumbnailEnabled = Boolean(overlay.querySelector("[data-youtube-thumbnail-enabled]")?.checked);
  const thumbnailTime = Number(overlay.querySelector("[data-youtube-thumbnail-time]")?.value || 0);
  if (!title) throw new Error("Give the YouTube video a title.");
  if (!audience) throw new Error("Choose whether the video is made for kids.");
  if (tags.join(",").length > 500) throw new Error("YouTube tags can total up to 500 characters.");
  let publishAt = "";
  if (scheduleRaw) {
    const schedule = new Date(scheduleRaw);
    if (!Number.isFinite(schedule.getTime()) || schedule.getTime() < Date.now() + 60_000) throw new Error("Choose a publish time at least one minute in the future.");
    publishAt = schedule.toISOString();
  }
  try { localStorage.setItem(YOUTUBE_DEFAULT_VISIBILITY_KEY, selectedPrivacy); } catch {}
  const draft = {
    captureId: String(captureId || ""), title, description, privacy: publishAt ? "private" : selectedPrivacy,
    madeForKids: audience === "true", tags, categoryId, publishAt,
    thumbnailRequested: thumbnailEnabled, thumbnailTime: Math.max(0, thumbnailTime), createdAt: Date.now(),
  };
  sessionStorage.setItem(YOUTUBE_UPLOAD_DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

function showYouTubeUploadProgress(draft) {
  overlay.innerHTML = `<div class="share-center-scrim"></div><section class="youtube-upload-progress" role="dialog" aria-modal="true" aria-label="Uploading to YouTube">
    <div class="youtube-upload-progress__mark">▶</div><span>PARA × YOUTUBE</span><h2>Uploading gameplay</h2><p data-youtube-upload-stage>Sending the capture securely through PARA…</p>
    <div class="youtube-upload-progress__bar"><i data-youtube-upload-bar style="width:0%"></i></div><strong data-youtube-upload-percent>0%</strong><small>${escapeOverlayText(draft.title || "Gameplay capture")}</small>
    <em>Keep PARA open until YouTube confirms the upload.</em>
  </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  return {
    stage: overlay.querySelector("[data-youtube-upload-stage]"),
    bar: overlay.querySelector("[data-youtube-upload-bar]"),
    percent: overlay.querySelector("[data-youtube-upload-percent]"),
  };
}

function showYouTubeUploadSuccess(result, { thumbnailWarning = "" } = {}) {
  const stats = result?.creator_stats || {};
  const stat = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value)) : "—";
  const scheduled = result?.publish_at ? `<p class="youtube-upload-success__schedule">Scheduled for ${escapeOverlayText(new Date(result.publish_at).toLocaleString())}</p>` : "";
  overlay.innerHTML = `<div class="share-center-scrim" data-action="close-control-center"></div><section class="youtube-upload-success" role="dialog" aria-modal="true" aria-label="YouTube upload complete">
    <div class="youtube-upload-success__mark">✓</div><span>UPLOAD COMPLETE</span><h2>Gameplay is on YouTube</h2><p>YouTube received the video${result?.privacy_status ? ` as <strong>${escapeOverlayText(result.privacy_status)}</strong>` : ""}. Processing can continue after this screen closes.</p>${scheduled}
    ${thumbnailWarning ? `<p class="youtube-upload-success__warning">${escapeOverlayText(thumbnailWarning)}</p>` : ""}
    <div class="youtube-creator-snapshot"><div><small>Subscribers</small><strong>${stat(stats.youtube_subscriber_count)}</strong></div><div><small>Channel views</small><strong>${stat(stats.youtube_view_count)}</strong></div><div><small>Videos</small><strong>${stat(stats.youtube_video_count)}</strong></div></div>
    <footer>${result?.watch_url ? `<a class="action-button" href="${escapeOverlayText(result.watch_url)}" target="_blank" rel="noopener">Open on YouTube ↗</a>` : ""}<button type="button" class="action-button action-button--ghost" data-action="close-control-center" data-autofocus="true">Done</button></footer>
  </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  requestAnimationFrame(() => focus.focusFirst());
}

async function resumePendingYouTubeUpload() {
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem(YOUTUBE_UPLOAD_DRAFT_KEY) || "null"); } catch { draft = null; }
  if (!draft?.captureId) { toast("YouTube upload expired", "Choose the capture again and restart the upload."); return false; }
  const item = await getCapture(draft.captureId);
  if (!item || item.type !== "clip") {
    sessionStorage.removeItem(YOUTUBE_UPLOAD_DRAFT_KEY);
    toast("Capture unavailable", "PARA could not find the gameplay video selected before Google sign-in.");
    return false;
  }
  const mime = item.mimeType || item.blob?.type || "video/webm";
  const extension = mime.includes("mp4") ? "mp4" : "webm";
  const file = new File([item.blob], `PARA-${item.id}.${extension}`, { type: mime });
  let thumbnailBlob = null;
  let thumbnailWarning = "";
  if (draft.thumbnailRequested) {
    try { thumbnailBlob = await captureThumbnailBlob(item, draft.thumbnailTime); }
    catch (error) { thumbnailWarning = error?.message || "PARA could not create the selected thumbnail frame."; }
  }
  const progress = showYouTubeUploadProgress(draft);
  try {
    const result = await paraApi.youtubeUploadCapture(file, { ...draft, thumbnailPending: Boolean(thumbnailBlob) }, (percent) => {
      const rounded = Math.max(0, Math.min(100, Math.round(percent)));
      if (progress.bar) progress.bar.style.width = `${rounded}%`;
      if (progress.percent) progress.percent.textContent = `${rounded}%`;
      if (rounded >= 100 && progress.stage) progress.stage.textContent = "PARA received the clip. YouTube is finishing the upload…";
    });
    if (thumbnailBlob && result?.video_id) {
      if (progress.stage) progress.stage.textContent = "Setting your selected thumbnail…";
      try { await paraApi.youtubeSetThumbnail(result.video_id, thumbnailBlob); }
      catch (error) { thumbnailWarning = error?.message || "The video uploaded, but YouTube could not use that custom thumbnail."; }
    }
    sessionStorage.removeItem(YOUTUBE_UPLOAD_DRAFT_KEY);
    showYouTubeUploadSuccess(result, { thumbnailWarning });
    return true;
  } catch (error) {
    if (error?.code === "youtube_upload_authorization_required") {
      toast("YouTube authorization expired", "Authorize the upload again and PARA will retry with the saved capture.");
    } else {
      toast("YouTube upload failed", error?.message || "YouTube could not accept this gameplay video.");
    }
    closeControlCenter(false);
    return false;
  }
}

function openShareCenter(target) {
  const captureId = target?.dataset?.captureId;
  if (!captureId || (!overlay.hidden && !overlay.querySelector("[data-capture-viewer]"))) return false;
  const captureKind = target.dataset.captureKind === "clip" ? "Gameplay clip" : "Screenshot";
  clearTimeout(overlayCloseTimer);
  overlayReturnFocus = focus.current || target;
  overlay.innerHTML = `<div class="share-center-scrim" data-action="close-control-center"></div>
    <section class="share-center" role="dialog" aria-modal="true" aria-label="Share Center">
      <header class="share-center__header"><div><span>PARA SHARE CENTER</span><h2>Share ${captureKind}</h2><small>Choose where this capture goes.</small></div><button type="button" class="share-center__close" data-action="close-control-center" aria-label="Close Share Center">×</button></header>
      <div class="share-center__destinations" data-focus-zone="share-destinations">
        <button type="button" class="share-destination share-destination--youtube" data-action="share-capture" data-share-target="youtube" data-capture-id="${captureId}" data-autofocus="true" ${captureKind === "Gameplay clip" ? "" : 'disabled aria-disabled="true"'}><b>▶</b><span><strong>YouTube</strong><small>${captureKind === "Gameplay clip" ? "Upload video or Short" : "Video captures only"}</small></span><em>${captureKind === "Gameplay clip" ? "Upload" : "Video"}</em></button>
        <button type="button" class="share-destination share-destination--facebook" data-action="share-capture" data-share-target="facebook" data-capture-id="${captureId}"><b>f</b><span><strong>Facebook</strong><small>Post to your connected account</small></span><em>Connect</em></button>
        <button type="button" class="share-destination share-destination--chat" data-action="share-capture" data-share-target="chat" data-capture-id="${captureId}"><b>◌</b><span><strong>PARA Chat</strong><small>Send to a friend or group</small></span><em>PARA</em></button>
        <button type="button" class="share-destination share-destination--phone" data-action="share-capture" data-share-target="phone" data-capture-id="${captureId}"><b>▯</b><span><strong>Send to Phone</strong><small>Export for nearby or companion transfer</small></span><em>Export</em></button>
        <button type="button" class="share-destination share-destination--system" data-action="share-capture" data-share-target="system" data-capture-id="${captureId}"><b>↗</b><span><strong>More</strong><small>Open the device share sheet</small></span><em>Share</em></button>
        <button type="button" class="share-destination share-destination--save" data-action="share-capture" data-share-target="files" data-capture-id="${captureId}"><b>⇩</b><span><strong>Save to Files</strong><small>Export the original capture</small></span><em>Save</em></button>
      </div>
      <footer class="share-center__footer"><span><b data-prompt="confirm">A</b> Select</span><span><b data-prompt="back">B</b> Back</span><span>Connected apps will publish directly in native PARA.</span></footer>
    </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  updateControllerPrompts();
  requestAnimationFrame(() => focus.focusFirst({ zone: "share-destinations" }));
  return true;
}


async function openCaptureViewer(captureId) {
  const items = await listCaptures();
  const index = items.findIndex((item) => item.id === captureId);
  if (index < 0) { toast("Capture not found"); return false; }
  const item = items[index];
  const previous = items[(index - 1 + items.length) % items.length];
  const next = items[(index + 1) % items.length];
  if (captureViewerUrl) URL.revokeObjectURL(captureViewerUrl);
  captureViewerUrl = URL.createObjectURL(capturePlaybackBlob(item));
  clearTimeout(overlayCloseTimer);
  if (overlay.hidden) overlayReturnFocus = focus.current;
  const media = item.type === "clip"
    ? paraVideoPlayerMarkup({ src: captureViewerUrl, mimeType: capturePlaybackMime(item), durationMs: item.durationMs, className: "para-video-player--viewer" })
    : `<img src="${captureViewerUrl}" alt="PARA screenshot">`;
  const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(item.createdAt);
  const length = item.type === "clip" ? `${Math.max(1, Math.round((item.durationMs || 0) / 1000))} sec` : `${item.width || ""}${item.width ? " × " : ""}${item.height || ""}`;
  overlay.innerHTML = `<div class="capture-viewer" data-capture-viewer data-capture-id="${item.id}" data-prev-id="${previous.id}" data-next-id="${next.id}">
    <header class="capture-viewer__header"><div><span>PARA MEDIA</span><strong>${item.type === "clip" ? "Gameplay video" : "Screenshot"}</strong><small>${when} · ${length}</small></div><button type="button" data-action="close-control-center" aria-label="Close viewer">×</button></header>
    <div class="capture-viewer__stage">${media}</div>
    <footer class="capture-viewer__controls">
      ${items.length > 1 ? `<button type="button" data-action="step-capture-viewer" data-capture-id="${previous.id}">← Previous</button>` : ""}
      ${item.type === "clip" ? `<button type="button" data-action="share-capture" data-share-target="youtube" data-capture-id="${item.id}" data-autofocus="true">▶ Upload to YouTube</button>` : ""}
      <button type="button" data-action="open-share-center" data-capture-id="${item.id}" data-capture-kind="${item.type}" ${item.type === "clip" ? "" : 'data-autofocus="true"'}>↗ Share</button>
      <button type="button" data-action="share-capture" data-share-target="files" data-capture-id="${item.id}">⇩ Save</button>
      <button type="button" data-action="capture-browser-fullscreen">⛶ Fullscreen</button>
      ${items.length > 1 ? `<button type="button" data-action="step-capture-viewer" data-capture-id="${next.id}">Next →</button>` : ""}
    </footer>
    <div class="capture-viewer__legend"><span><b data-prompt="back">B</b> Close</span><span><b data-prompt="shoulderPrevious">LB</b><b data-prompt="shoulderNext">RB</b> Previous / Next</span></div>
  </div>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  activateParaVideoPlayers(overlay, { onError: () => toast("Video could not play", "This capture may be damaged or use an unsupported codec.") });
  updateControllerPrompts();
  requestAnimationFrame(() => focus.focusFirst());
  return true;
}

function openReplaySaveMenu() {
  clearTimeout(overlayCloseTimer);
  if (overlay.hidden) overlayReturnFocus = focus.current;
  const replay = replayStatus();
  const durations = [
    [30_000, "30 seconds"], [60_000, "1 minute"], [3 * 60_000, "3 minutes"], [5 * 60_000, "5 minutes"],
    [10 * 60_000, "10 minutes"], [15 * 60_000, "15 minutes"], [30 * 60_000, "30 minutes"],
  ];
  overlay.innerHTML = `<div class="capture-menu-scrim" data-action="close-control-center"></div><section class="capture-menu" role="dialog" aria-modal="true" aria-label="Save recent gameplay">
    <header><span>PARA REPLAY</span><h2>Save what happened</h2><small>${replay.active ? "Replay is keeping recent gameplay in a temporary buffer." : "Turn on Replay first, then PARA can save what happened before you pressed the button."}</small></header>
    <div class="capture-menu__grid" data-focus-zone="replay-duration">
      ${replay.active ? durations.map(([ms,label], index) => `<button type="button" data-action="save-replay" data-replay-ms="${ms}" ${index === 0 ? 'data-autofocus="true"' : ""}><b>↺</b><span>Last ${label}</span></button>`).join("") : `<button type="button" class="capture-menu__enable" data-action="start-replay-from-menu" data-autofocus="true"><b>●</b><span><strong>Turn On PARA Replay</strong><small>Browser preview asks which screen to capture. Native PARA will manage this at the system level.</small></span></button>`}
    </div>
    <footer><span><b data-prompt="confirm">A</b> Select</span><span><b data-prompt="back">B</b> Back</span></footer>
  </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  updateControllerPrompts();
  requestAnimationFrame(() => focus.focusFirst({ zone: "replay-duration" }));
}

function openGameOptions(target) {
  const button = target?.closest?.('[data-continue-item], [data-store-id], .demo-card');
  if (!button) return false;
  const card = button.closest?.('[data-continue-item], .demo-card, .store-live-card, .home-store-shelf-card') || button;
  const title = card.querySelector?.('strong,h2')?.textContent?.trim() || 'Game';
  const route = button.dataset.route || card.dataset.route || '';
  const storeId = button.dataset.storeId || card.dataset.storeId || '';
  const expId = button.dataset.continueId || '';
  overlayReturnFocus = focus.current;
  overlay.innerHTML = `<div class="options-scrim" data-action="close-control-center"></div><aside class="game-options" role="dialog" aria-modal="true"><span>OPTIONS</span><h2>${title}</h2><div><button data-action="game-option-play" data-option-route="${route}" data-store-id="${storeId}" data-autofocus="true">Play / Resume</button><button data-action="game-option-info" data-store-id="${storeId}">Game Info</button><button data-action="game-option-update">Check for Update</button><button data-action="game-option-manage">Manage Game</button><button data-action="game-option-favorite" data-experience-id="${expId}">Add to Favorites</button>${storeId?`<button class="danger" data-action="uninstall-store-game" data-store-id="${storeId}">Uninstall</button>`:''}</div></aside>`;
  overlay.hidden=false; overlay.classList.remove('is-closing'); updateControllerPrompts(); requestAnimationFrame(()=>focus.focusFirst()); return true;
}

function shoulder(direction) {
  if (consumePowerInput()) return;
  const viewer = overlay.querySelector("[data-capture-viewer]");
  if (!overlay.hidden && viewer) { void openCaptureViewer(direction < 0 ? viewer.dataset.prevId : viewer.dataset.nextId); return; }
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
document.addEventListener("para-options", (event) => { if (openGameOptions(event.detail?.target)) playConfirmSound(); });
document.addEventListener("para-inputdevicechange", (event) => {
  activeInputDevice = event.detail?.device || "keyboard";
  updateControllerPrompts();
});
document.addEventListener("para-immersive-toggle", () => { if (router.current() !== "home") return; document.documentElement.classList.toggle("para-immersive"); toast(document.documentElement.classList.contains("para-immersive") ? "Immersive Home" : "Home controls", document.documentElement.classList.contains("para-immersive") ? "Press R3 again to restore the interface" : "Interface restored"); });
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
document.addEventListener("para-achievementearned", (event) => {
  playNotificationSound();
  toast("Achievement unlocked", event.detail?.name || "New achievement");
  if (router.current() === "achievements") rerender();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.type !== "para-achievementearned") return;
  syncStateFromStorage();
  playNotificationSound();
  toast("🏆 Achievement unlocked", event.data?.detail?.name || "New achievement");
  if (router.current() === "achievements") rerender();
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
    if (controller.connected && !hadController) { playNotificationSound(); toast(`${controller.typeLabel} connected`, `Player 1`); }
    if (!controller.connected && hadController) { playNotificationSound(); toast("Controller disconnected", router.current() === "store-game" ? "Game paused • reconnect a controller" : "Keyboard controls active"); document.documentElement.classList.toggle("controller-disconnected-in-game", router.current() === "store-game"); }
    if (controller.connected) document.documentElement.classList.remove("controller-disconnected-in-game");
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

function cloudAchievementTime(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

async function hydrateCloudAchievements(profile) {
  try {
    const payload = await paraApi.achievementProgress();
    const cloudItems = Array.isArray(payload?.items) ? payload.items : [];
    if (!cloudItems.length) return;
    const runtime = getProfileRuntime(profile);
    const localItems = Array.isArray(runtime.achievements) ? runtime.achievements : [];
    const merged = new Map(localItems.map((item) => [item.id, item]));
    for (const cloud of cloudItems) {
      const projectId = String(cloud.project_id || "");
      const key = String(cloud.achievement_key || "");
      if (!projectId || !key) continue;
      const id = `achievement:${projectId}:${key}`;
      const local = merged.get(id) || {};
      const unlockedAt = cloudAchievementTime(cloud.unlocked_at);
      const updatedAt = cloudAchievementTime(cloud.updated_at) || Date.now();
      const localProgress = Math.max(0, Number(local.progress || 0));
      const cloudProgress = Math.max(0, Number(cloud.progress || 0));
      merged.set(id, {
        ...local,
        id,
        achievementId: cloud.achievement_id || local.achievementId,
        projectId,
        key,
        name: cloud.name || local.name || key,
        description: cloud.description || local.description || "",
        points: Number(cloud.points || 0),
        kind: cloud.kind || local.kind || "BINARY",
        target: Math.max(1, Number(cloud.target || local.target || 1)),
        hidden: Boolean(cloud.hidden),
        iconUrl: cloud.icon_url || local.iconUrl || "",
        progress: Math.max(localProgress, cloudProgress),
        unlockedAt: local.unlockedAt || unlockedAt,
        updatedAt: Math.max(Number(local.updatedAt || 0), updatedAt),
        syncState: cloudProgress >= localProgress ? "cloud" : "pending",
      });
    }
    setProfileRuntime({ achievements: [...merged.values()] }, profile);
  } catch {
    // Offline/local achievements remain usable and can be synchronized later.
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
  await Promise.allSettled([hydrateProfile(profile), hydrateCloudAchievements(profile)]);
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

async function openSystemApplication(target) {
  const name = target.dataset.appName || "Application";
  try {
    await launchSystemApplication(target.dataset.appId);
    recordExperience({ id: target.dataset.appId, title: name, route: target.dataset.appKind === "Game" ? "games" : "apps", kind: target.dataset.appKind || "App", accent: "#9161ff", mark: name.slice(0, 1).toUpperCase() });
    toast(`Opening ${name}`);
  } catch {
    toast(`${name} couldn’t be opened`);
  }
}

async function launchStoreGameDirect(storeId) {
  const id = String(storeId || "").trim();
  if (!id) return false;
  sessionStorage.setItem("para.store.launch", id);
  sessionStorage.setItem("para.store.lastLibraryRoute", "games");
  if (IS_SUSPENDED_GAME_SHELL) {
    return sendSuspendedGameCommand(id === SUSPENDED_GAME_ID ? "resume" : "launch", { storeId: id });
  }
  let artwork = cachedStoreLaunchArtwork(id);
  if (!artwork.urls.length) {
    try {
      const item = await Promise.race([
        paraApi.storeProduct(id),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("art timeout")), 700)),
      ]);
      artwork = storeArtworkFromProduct(item || {});
    } catch { /* launch immediately when artwork cannot be prefetched */ }
  }
  const source = `/api/v1/store/content/${encodeURIComponent(id)}/index.html?para_game_mode=1&para_build=v25`;
  return transitionIntoGame(source, artwork.title || storeGameTitle(id), artwork.urls);
}

function rememberAccountReturn(route = "account") {
  sessionStorage.setItem("para.account.return", route);
}

function accountReturnRoute() {
  const route = sessionStorage.getItem("para.account.return") || "account";
  sessionStorage.removeItem("para.account.return");
  return renderers[route] ? route : "account";
}

function accountStatus(message = "", kind = "") {
  const node = document.querySelector("[data-account-auth-status]");
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}


function rememberVerificationEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (clean) sessionStorage.setItem("para.account.verify.email", clean);
  return clean;
}

function pendingVerificationEmail() {
  return sessionStorage.getItem("para.account.verify.email") || "";
}

async function sendVerificationCode(email) {
  const clean = rememberVerificationEmail(email);
  if (!clean) throw new Error("Enter a valid email address.");
  const result = await paraApi.authRequestVerification(clean);
  return result;
}

async function finishCloudAccountAuth(result, target) {
  const user = result?.user;
  if (!user) return false;
  const name = String(user.display_name || user.email?.split("@")[0] || "PARA User").trim().slice(0,24) || "PARA User";
  if (!getState().profiles.some((profile) => profile.toLowerCase() === name.toLowerCase())) addProfile(name);
  markParaAccountConnected(user);
  setState({ activeProfile: name, setupChoices: { accountMode: "online", accountEmail: user.email || "", profileName: name } });
  await Promise.allSettled([hydrateProfile(name), hydrateCloudAchievements(name)]);
  toast("PARA Account connected", name);
  navigate(accountReturnRoute(), { replace: true }, target);
  return true;
}

async function syncCloudAccountSession() {
  try {
    const session = await paraApi.authSession();
    if (session?.signed_in && session?.user) {
      const user = session.user;
      const name = String(user.display_name || user.email?.split("@")[0] || "PARA User").trim().slice(0,24) || "PARA User";
      if (!getState().profiles.some((profile) => profile.toLowerCase() === name.toLowerCase())) addProfile(name);
      markParaAccountConnected(user);
      setState({ activeProfile: name, setupChoices: { accountMode: "online", accountEmail: user.email || "", profileName: name } });
      await hydrateCloudAchievements(name);
      return session;
    }
  } catch { /* offline/local PARA remains usable */ }
  const known = knownParaAccount();
  if (known) {
    markParaAccountDisconnected();
    setState({ setupChoices: { accountMode: known.verified ? "verified" : "created", accountEmail: known.email, profileName: known.displayName || getState().setupChoices.profileName } });
  }
  return null;
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
    case "setup-account-signin":
      rememberAccountReturn("setup");
      navigate("account-signin", {}, target);
      break;
    case "setup-account-signup":
      rememberAccountReturn("setup");
      navigate("account-signup", {}, target);
      break;
    case "account-auth-back":
      navigate(accountReturnRoute(), { replace: true }, target);
      break;
    case "account-signin-submit": {
      const email = document.querySelector("[data-account-email]")?.value || "";
      const password = document.querySelector("[data-account-password]")?.value || "";
      accountStatus("Signing in…");
      target.disabled = true;
      try {
        const result = await paraApi.authSignIn(email, password);
        await finishCloudAccountAuth(result, target);
      } catch (error) {
        sessionStorage.setItem("para.account.recovery.email", String(email || "").trim().toLowerCase());
        const message = error?.code === "signin_failed" ? "Email or password is incorrect. Try again or reset your password." : (error?.message || "Sign in failed.");
        accountStatus(message, "error");
        toast("Couldn’t sign in", message);
        if (error?.payload?.project_ref) console.warn("PARA auth project", error.payload.project_ref);
      } finally { if (target?.isConnected) target.disabled = false; }
      break;
    }
    case "account-recovery-submit": {
      const email = document.querySelector("[data-account-email]")?.value || "";
      const clean = String(email).trim().toLowerCase();
      sessionStorage.setItem("para.account.recovery.email", clean);
      accountStatus("Sending secure recovery link…");
      target.disabled = true;
      try {
        await paraApi.authRequestPasswordRecovery(clean);
        accountStatus("If that email has a PARA Account, a recovery link is on the way. Check your inbox and spam folder.", "success");
        toast("Recovery link requested", "Check your email to continue.");
      } catch (error) {
        accountStatus(error?.message || "Couldn’t request password recovery.", "error");
        toast("Recovery request failed", error?.message || "Try again in a moment.");
      } finally { if (target?.isConnected) target.disabled = false; }
      break;
    }
    case "account-recovery-complete": {
      const password = document.querySelector("[data-account-new-password]")?.value || "";
      const confirmation = document.querySelector("[data-account-new-password-confirm]")?.value || "";
      if (!pendingAccountRecovery?.accessToken) { accountStatus("This recovery link is missing or expired. Request a new one.", "error"); break; }
      if (password !== confirmation) { accountStatus("Passwords do not match.", "error"); break; }
      if (password.length < 8) { accountStatus("Password must be at least 8 characters.", "error"); break; }
      accountStatus("Updating password…");
      target.disabled = true;
      try {
        const result = await paraApi.authCompletePasswordRecovery(pendingAccountRecovery.accessToken, pendingAccountRecovery.refreshToken, pendingAccountRecovery.expiresIn, password);
        pendingAccountRecovery = null;
        accountStatus("Password updated. Signing you in…", "success");
        toast("Password updated", "Your PARA Account is ready.");
        await finishCloudAccountAuth(result, target);
      } catch (error) {
        accountStatus(error?.message || "Couldn’t update the password. Request a new recovery link.", "error");
      } finally { if (target?.isConnected) target.disabled = false; }
      break;
    }

    case "account-signup-submit": {
      const displayName = document.querySelector("[data-account-display-name]")?.value || "";
      const email = document.querySelector("[data-account-email]")?.value || "";
      const password = document.querySelector("[data-account-password]")?.value || "";
      const confirmation = document.querySelector("[data-account-password-confirm]")?.value || "";
      if (password !== confirmation) { accountStatus("Passwords do not match.", "error"); break; }
      accountStatus("Creating your PARA Account…");
      target.disabled = true;
      try {
        const result = await paraApi.authSignUp(displayName, email, password);
        rememberParaAccount({ email, displayName: result?.user?.display_name || displayName, verified: Boolean(result?.user?.email_verified), connected: Boolean(result?.signed_in) });
        setState({ setupChoices: { accountMode: result?.signed_in ? "online" : "created", accountEmail: email, profileName: result?.user?.display_name || displayName } });
        rememberVerificationEmail(email);
        try {
          await sendVerificationCode(email);
          accountStatus("Account created. Sending you to email verification…", "success");
          toast("Verification code sent", "Check your email from PARA Protection Services.");
          navigate("account-verify", {}, target);
        } catch (verificationError) {
          if (result.signed_in) await finishCloudAccountAuth(result, target);
          else {
            const verificationMessage = verificationError?.message || "Account created, but the verification email could not be sent.";
            accountStatus(verificationMessage, "error");
            toast("Verification send failed", verificationMessage);
            console.error("PARA email verification send failed", verificationError);
          }
        }
      } catch (error) {
        if (error?.code === "account_exists") {
          sessionStorage.setItem("para.account.signin.email", email.trim().toLowerCase());
          accountStatus("That PARA Account already exists. Opening Sign In…", "error");
          toast("Account already exists", "Sign in with that email instead.");
          window.setTimeout(() => navigate("account-signin", { replace: true }, target), 650);
        } else {
          accountStatus(error?.message || "Account creation failed.", "error");
          toast("Couldn’t create account", error?.message || "Try again.");
        }
      } finally { if (target?.isConnected) target.disabled = false; }
      break;
    }

    case "account-verify-submit": {
      const email = pendingVerificationEmail();
      const code = document.querySelector("[data-account-verification-code]")?.value || "";
      if (!email) { accountStatus("No verification request is active. Sign in or create an account first.", "error"); break; }
      accountStatus("Checking code…");
      target.disabled = true;
      try {
        const result = await paraApi.authVerifyEmail(email, code);
        sessionStorage.removeItem("para.account.verify.email");
        const known = markParaAccountVerified(email);
        setState({ setupChoices: { accountMode: "verified", accountEmail: email, profileName: known?.displayName || getState().setupChoices.profileName } });
        accountStatus("Account created and email verified.", "success");
        toast("PARA Account created", "Email verified. Sign in to connect this console.");
        const session = await paraApi.authSession();
        if (session?.signed_in && session?.user) await finishCloudAccountAuth(session, target);
        else {
          sessionStorage.setItem("para.account.signin.email", email);
          navigate("account-signin", { replace: true }, target);
        }
      } catch (error) {
        accountStatus(error?.message || "That verification code was not accepted.", "error");
      } finally { if (target?.isConnected) target.disabled = false; }
      break;
    }
    case "account-verification-resend": {
      const email = pendingVerificationEmail();
      if (!email) { accountStatus("No email is waiting for verification.", "error"); break; }
      accountStatus("Sending a new code…");
      try {
        const result = await sendVerificationCode(email);
        accountStatus(`New code sent${result?.expires_in ? ` · expires in ${Math.round(result.expires_in / 60)} minutes` : ""}.`, "success");
        toast("Verification code sent", "Check your email.");
      } catch (error) {
        accountStatus(error?.message || "Couldn’t resend the code yet.", "error");
      }
      break;
    }
    case "account-cloud-signout":
      try { await paraApi.authSignOut(); } catch { /* local sign-out still wins */ }
      const known = markParaAccountDisconnected();
      setState({ setupChoices: { accountMode: known?.verified ? "verified" : (known ? "created" : "offline"), accountEmail: known?.email || "" } });
      toast("PARA Account signed out", known ? "Your account still exists. Sign in again anytime." : "");
      if (router.current() === "account") rerender();
      break;
    case "account-update-profile": {
      const displayName = document.querySelector("[data-account-new-display-name]")?.value || "";
      try { const result = await paraApi.authUpdateProfile(displayName); toast("Display name updated", result?.user?.display_name || displayName); rerender(); }
      catch (error) { toast("Couldn’t update account", error?.message || "Try again."); }
      break;
    }
    case "account-update-password": {
      const password = document.querySelector("[data-account-new-password]")?.value || "";
      try { await paraApi.authUpdatePassword(password); toast("Password updated", "Your PARA Account password has changed."); const input=document.querySelector("[data-account-new-password]"); if(input) input.value=""; }
      catch (error) { toast("Couldn’t update password", error?.message || "Use at least 8 characters."); }
      break;
    }
    case "account-send-password-reset": {
      const email = target.dataset.accountEmail || getState().setupChoices.accountEmail || "";
      target.disabled = true;
      try {
        await paraApi.authRequestPasswordRecovery(email);
        toast("Reset email sent", "Check your inbox for the secure PARA password reset link.");
      } catch (error) {
        toast("Couldn’t send reset email", error?.message || "Try again in a moment.");
      } finally {
        if (target?.isConnected) target.disabled = false;
      }
      break;
    }

    case "account-send-verification": {
      const email = target.dataset.accountEmail || "";
      try {
        await sendVerificationCode(email);
        toast("Verification code sent", "Check your email from PARA Protection Services.");
        navigate("account-verify", {}, target);
      } catch (error) { toast("Couldn’t send verification", error?.message || "Try again in a moment."); }
      break;
    }
    case "account-refresh":
      activateAccount();
      break;
    case "setup-account-offline": {
      const profile = state.setupChoices.profileName?.trim() || "P1";
      addProfile(profile);
      setState({ activeProfile: profile, setupChoices: { accountMode: "offline", profileName: profile } });
      toast("Offline profile ready", profile);
      break;
    }
    case "setup-connect-provider": {
      const provider = target.dataset.provider;
      if (!["steam", "google"].includes(provider)) {
        toast("Coming soon", "That account service is not supported yet.");
        break;
      }
      if (state.setupChoices.accountMode !== "online") {
        toast("Sign in to PARA first", "Connect your PARA Account before linking another service.");
        break;
      }
      const group = provider === "steam" ? "gamingAccounts" : "otherAccounts";
      setSetupAccountChoice(group, provider, "connecting");
      if (router.current() === "account") sessionStorage.setItem("para.integration.return", "account");
      else sessionStorage.removeItem("para.integration.return");
      target.disabled = true;
      if (provider === "steam") window.location.assign("/api/v1/integrations/steam/connect");
      else window.location.assign("/api/v1/integrations/google/connect");
      break;
    }
    case "setup-disconnect-provider": {
      const provider = target.dataset.provider;
      if (!["steam", "google"].includes(provider)) break;
      const group = provider === "steam" ? "gamingAccounts" : "otherAccounts";
      const label = provider === "steam" ? "Steam" : "Google / YouTube";
      target.disabled = true;
      try {
        if (provider === "steam") await paraApi.steamDisconnect();
        else await paraApi.googleDisconnect();
        setSetupAccountChoice(group, provider, "disconnected");
        toast(`${label} disconnected`, `The ${label} account link was removed from PARA.`);
        rerender();
      } catch (error) {
        toast(`Couldn’t disconnect ${label}`, error?.message || "Try again in a moment.");
      } finally {
        if (target?.isConnected) target.disabled = false;
      }
      break;
    }
    case "setup-skip-provider":
      setSetupAccountChoice(target.dataset.providerGroup, target.dataset.provider, "skipped");
      rerender();
      break;
    case "setup-toggle-privacy": {
      const id = target.dataset.privacyId;
      if (["diagnostics", "personalization", "location"].includes(id)) {
        const privacy = state.setupChoices.privacy || {};
        setState({ setupChoices: { privacy: { [id]: !privacy[id] } } });
        rerender();
      }
      break;
    }
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
      suspendMenuMusic({ duration: 420 });
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
    case "confirm-turn-off": {
      // A system confirmation owns the screen by itself. Close Control Center
      // completely before mounting the shutdown dialog so the two modal layers
      // can never stack on top of each other.
      const returnFocus = overlayReturnFocus || target;
      closeControlCenter(false);
      window.setTimeout(() => openTurnOffConfirmation(focus, returnFocus), getState().reducedMotion ? 8 : 230);
      break;
    }
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
    case "check-controller-firmware": toast("PulseWave firmware", controllerStatus.type === "para" ? "Controller is ready for firmware service integration." : "Firmware updates are available only for PulseWave hardware."); break;
    case "toggle-para-input": {
      const input = getParaInputSettings();
      patchParaInputSettings({ enabled: !input.enabled });
      toast("PARA Input", input.enabled ? "Off" : "On");
      rerender();
      break;
    }
    case "toggle-para-input-auto": {
      const input = getParaInputSettings();
      patchParaInputSettings({ automaticWebGames: !input.automaticWebGames });
      toast("Automatic mapping", input.automaticWebGames ? "Off" : "On for PARA web games");
      rerender();
      break;
    }
    case "toggle-para-input-invert": {
      const input = getParaInputSettings();
      patchParaInputSettings({ invertY: !input.invertY });
      rerender();
      break;
    }
    case "toggle-para-input-aim-mode": {
      const input = getParaInputSettings();
      patchParaInputSettings({ rightStickMode: input.rightStickMode === "relative" ? "cursor" : "relative" });
      rerender();
      break;
    }
    case "cycle-para-input-binding":
      cycleParaInputBinding(target.dataset.inputControl, 1);
      rerender();
      break;
    case "reset-para-input":
      resetParaInputSettings();
      toast("PARA Input", "Default WASD + mouse profile restored");
      rerender();
      break;
    case "repair-storage": toast("Repair Storage", "Storage check queued. Native repair service connects in the Linux build."); break;
    case "network-recovery": toast("Network Recovery", "PARA Network recovery check started."); break;
    case "rollback-update": toast("Roll Back Update", "Rollback requires a previous verified system image."); break;
    case "safe-mode": toast("Safe Mode", "Safe Mode will load core PARA services only in the native build."); break;
    case "open-save-history": {
      const { listSaveData } = await import("./services/save-data.js");
      const entry = listSaveData().find((item) => item.gameId === target.dataset.saveId);
      if (!entry) { toast("Save data unavailable"); break; }
      overlayReturnFocus = target;
      const versions = entry.versions || [];
      overlay.innerHTML = `<div class="media-viewer-scrim" data-action="close-control-center"></div><section class="save-history-dialog" role="dialog" aria-modal="true" aria-label="Save history"><header><div><span>SAVE HISTORY</span><strong>${entry.title}</strong></div><button type="button" data-action="close-control-center" aria-label="Close">×</button></header><div class="save-history-current"><span>Current save</span><strong>${new Date(entry.updatedAt).toLocaleString()}</strong><small>${entry.syncState || "Local"}</small></div><div class="save-history-list">${versions.length ? versions.map((version, index) => `<button type="button" data-action="restore-save-version" data-save-id="${entry.gameId}" data-version-index="${index}" ${index === 0 ? "data-autofocus='true'" : ""}><span>Restore point ${index + 1}</span><strong>${new Date(version.updatedAt || 0).toLocaleString()}</strong><small>${version.device || "Local"}</small></button>`).join("") : `<p>No older restore points yet.</p>`}</div><footer><button type="button" class="danger" data-action="delete-save-data" data-save-id="${entry.gameId}">Delete save data</button></footer></section>`;
      overlay.hidden = false; overlay.classList.remove("is-closing"); requestAnimationFrame(() => focus.focusFirst());
      break;
    }
    case "restore-save-version": {
      const { restoreSaveVersion } = await import("./services/save-data.js");
      const ok = restoreSaveVersion(target.dataset.saveId, Number(target.dataset.versionIndex));
      closeControlCenter(false); toast(ok ? "Save restored" : "Restore failed");
      if (router.current() === "saved-data") rerender();
      break;
    }
    case "delete-save-data": {
      const { deleteSaveData } = await import("./services/save-data.js");
      deleteSaveData(target.dataset.saveId); closeControlCenter(false); toast("Save data deleted");
      if (router.current() === "saved-data") rerender();
      break;
    }
    case "pause-download": pauseDownload(target.dataset.downloadId); toast("Download paused"); break;
    case "resume-download": resumeDownload(target.dataset.downloadId); toast("Download resumed"); break;
    case "cancel-download": cancelDownload(target.dataset.downloadId); toast("Download canceled"); break;
    case "mark-notification-read":
      if (markNotificationRead(target.dataset.notificationId)) rerender();
      break;
    case "mark-all-notifications-read":
      if (markAllNotificationsRead()) rerender();
      break;
    case "open-replay-menu":
      openReplaySaveMenu();
      break;
    case "start-replay-from-menu":
      try { await startReplayBuffer(); toast("PARA Replay started", "Recent gameplay is now being buffered."); openReplaySaveMenu(); } catch (error) { toast("Replay could not start", error?.message || "Screen capture is unavailable."); }
      break;
    case "toggle-manual-recording":
      try {
        if (manualRecordingStatus().active) { await stopManualRecording(); toast("Recording saved", "Added to Media Gallery"); }
        else { await startManualRecording(); toast("Recording started", "A Stop & Save control stays on screen after Control Center closes."); }
        syncRecordingHud();
        if (!overlay.hidden && overlay.querySelector("[data-control-center-context]")) showControlCenterContext("captures", true, focus);
        if (router.current() === "media-gallery") await activateMediaGallery();
      } catch (error) { toast("Recording unavailable", error?.message || "Screen capture is unavailable."); }
      break;
    case "open-media-viewer":
      await openCaptureViewer(target.dataset.captureId);
      break;
    case "step-capture-viewer":
      await openCaptureViewer(target.dataset.captureId);
      break;
    case "capture-browser-fullscreen": {
      const viewer = overlay.querySelector("[data-capture-viewer]");
      try { if (!document.fullscreenElement) await viewer?.requestFullscreen?.(); else await document.exitFullscreen?.(); } catch { toast("Fullscreen unavailable"); }
      break;
    }
    case "select-media-capture":
      selectMediaCapture(target.dataset.captureId);
      break;
    case "filter-media-gallery":
      filterMediaGallery(target.dataset.mediaFilter);
      focus.focusFirst();
      break;
    case "capture-screenshot":
      try { await captureScreenshot(); toast("Screenshot saved", "Added to Media Gallery"); await activateMediaGallery(); focus.focusFirst(); } catch (error) { toast("Screenshot not saved", error?.message || "Capture permission was not granted."); }
      break;
    case "capture-clip":
      try { toast("Recording", "Capturing 8 seconds…"); await recordRecentClip(8000); toast("Clip saved", "Added to Media Gallery"); await activateMediaGallery(); focus.focusFirst(); } catch (error) { toast("Clip not saved", error?.message || "Capture permission was not granted."); }
      break;
    case "start-replay":
      try { await startReplayBuffer(); toast("PARA Replay started", "Recent gameplay is now kept in a temporary rolling buffer."); if (!overlay.hidden && overlay.querySelector("[data-control-center-context]")) showControlCenterContext("captures", true, focus); } catch (error) { toast("Replay could not start", error?.message || "Screen capture is unavailable."); }
      break;
    case "save-replay":
      try { const ms = Number(target.dataset.replayMs || 60000); await saveReplayClip(ms); toast("Recent gameplay saved", `Saved the last ${ms >= 60000 ? Math.round(ms/60000) + "m" : Math.round(ms/1000) + "s"}`); await activateMediaGallery(); focus.focusFirst(); } catch (error) { toast("Replay not saved", error?.message || "Replay is unavailable."); }
      break;
    case "open-share-center":
      openShareCenter(target);
      break;
    case "share-capture":
      try {
        const destination = target.dataset.shareTarget || "system";
        if (destination === "youtube") {
          await openYouTubeUploadDialog(target.dataset.captureId);
          break;
        }
        if (destination === "facebook") {
          toast("Facebook account needed", "Direct Facebook publishing is not connected yet.");
          break;
        }
        if (destination === "chat") {
          toast("PARA Chat sharing", "Recipient picker connects when PARA accounts and messaging service are online.");
          break;
        }
        const result = await shareCapture(target.dataset.captureId, destination);
        closeControlCenter(false);
        toast(destination === "phone" ? "Send to Phone" : destination === "files" ? "Saved to Files" : "Share", result);
      } catch (error) { toast("Couldn’t share capture", error?.message || "Sharing is unavailable."); }
      break;
    case "youtube-upload-authorize":
      try {
        saveYouTubeUploadDraft(target.dataset.captureId);
        target.disabled = true;
        target.textContent = "Opening Google…";
        window.location.assign("/api/v1/integrations/google/youtube/authorize");
      } catch (error) {
        toast("YouTube upload needs one more thing", error?.message || "Check the upload details.");
      }
      break;
    case "media-toggle":
      await mediaSessionAction("toggle");
      showControlCenterContext("music");
      break;
    case "media-previous":
      await mediaSessionAction("previous");
      showControlCenterContext("music");
      break;
    case "media-next":
      await mediaSessionAction("next");
      showControlCenterContext("music");
      break;
    case "delete-capture":
      try { await removeCapture(target.dataset.captureId); toast("Capture deleted"); focus.focusFirst(); } catch { toast("Couldn’t delete capture"); }
      break;
    case "report-crash": toast("Problem report saved", "PARA kept the crash code and technical details for review."); break;
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
    case "launch-system-app":
      openSystemApplication(target);
      break;
    case "launch-linux-app":
      openSystemApplication(target);
      break;
    case "toggle-account-menu": {
      const wrap = target.closest("[data-account-quick]");
      const popover = wrap?.querySelector("[data-account-popover]");
      if (!wrap || !popover) break;
      document.querySelectorAll("[data-account-popover]:not([hidden])").forEach((node) => {
        if (node !== popover) { node.hidden = true; node.closest("[data-account-quick]")?.querySelector("[data-action='toggle-account-menu']")?.setAttribute("aria-expanded", "false"); }
      });
      const opening = popover.hidden;
      popover.hidden = !opening;
      target.setAttribute("aria-expanded", String(opening));
      if (opening) requestAnimationFrame(() => {
        const first = popover.querySelector("button:not([disabled])");
        if (first) focus.setCurrent(first, true);
      });
      break;
    }
    case "open-control-center":
      openControlCenter();
      break;
    case "close-control-center":
      closeControlCenter();
      break;
    case "control-center-open-context":
      showControlCenterContext(target.dataset.controlCenterId, true, focus);
      break;
    case "resume-experience": {
      const storeId = target.dataset.storeId || "";
      closeControlCenter(false);
      if (storeId) launchStoreGameDirect(storeId);
      else navigate(target.dataset.experienceRoute || "home", {}, target);
      break;
    }
    case "close-experience": {
      const experienceId = target.dataset.experienceId || "";
      if (IS_SUSPENDED_GAME_SHELL && experienceId === `store:${SUSPENDED_GAME_ID}`) {
        sendSuspendedGameCommand("close", { experienceId });
        break;
      }
      closeExperience(experienceId);
      toast("Experience closed");
      openSwitcher();
      break;
    }
    case "game-option-play": {
      const storeId = target.dataset.storeId || "";
      closeControlCenter(false);
      if (storeId) launchStoreGameDirect(storeId);
      else if (target.dataset.optionRoute) navigate(target.dataset.optionRoute, {}, target);
      break;
    }
    case "game-option-info":
      if (target.dataset.storeId) { sessionStorage.setItem("para.store.product", target.dataset.storeId); closeControlCenter(false); navigate("store-product", {}, target); } else toast("Game Info", "Activity, captures and achievements will appear in this hub.");
      break;
    case "game-option-update": toast("You’re up to date", "No update is required."); break;
    case "game-option-manage": toast("Manage Game", "Storage, saves and add-ons are ready for host integration."); break;
    case "game-option-favorite": favoriteExperience(target.dataset.experienceId, true); toast("Added to Favorites"); closeControlCenter(); break;
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
        const currentRoute = router.current();
        if (currentRoute && currentRoute !== "store-product") sessionStorage.setItem("para.store.returnRoute", currentRoute);
        navigate("store-product", {}, target);
      }
      break;
    case "store-product-back": {
      const returnRoute = sessionStorage.getItem("para.store.returnRoute") || "parastore";
      sessionStorage.removeItem("para.store.returnRoute");
      navigate(returnRoute === "store-product" ? "parastore" : returnRoute, {}, target);
      break;
    }
    case "add-store-cart": {
      const id = target.dataset.storeId || sessionStorage.getItem("para.store.product") || "";
      if (addStoreCartItem(id)) toast("Added to cart", "Ready when you are");
      else toast("Already in cart");
      rerender();
      break;
    }
    case "buy-store-game-now": {
      const id = target.dataset.storeId || sessionStorage.getItem("para.store.product") || "";
      addStoreCartItem(id);
      navigate("store-cart", {}, target);
      break;
    }
    case "remove-store-cart":
      if (target.dataset.storeId) {
        removeStoreCartItem(target.dataset.storeId);
        toast("Removed from cart");
        rerender();
      }
      break;
    case "toggle-store-wishlist": {
      const id = target.dataset.storeId || sessionStorage.getItem("para.store.product") || "";
      if (!id) break;
      const added = toggleStoreWishlistItem(id);
      toast(added ? "Added to Wishlist" : "Removed from Wishlist");
      rerender();
      break;
    }
    case "checkout-store-cart": {
      try {
        const quote = await paraApi.storeCheckoutQuote(currentStoreCartIds());
        const total = new Intl.NumberFormat("en-US", { style: "currency", currency: quote.currency || "USD" }).format(Number(quote.total || 0));
        toast("Server price verified", `${total} · ${quote.items?.length || 0} item(s). Live charging remains locked until Stripe test-mode checkout passes.`);
      } catch (error) { toast("Checkout verification failed", error.message || "Could not verify cart"); }
      break;
    }
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
      if (target.dataset.storeId) launchStoreGameDirect(target.dataset.storeId);
      break;
    case "uninstall-store-game":
      if (target.dataset.storeId) {
        uninstallStoreItem(target.dataset.storeId);
        toast("Game removed", "It can be installed again from ParaStore");
        rerender();
      }
      break;
    case "open-store-screenshot": {
      const shots = JSON.parse(sessionStorage.getItem("para.store.screenshots") || "[]");
      if (!shots.length) break;
      const index = Math.max(0, Math.min(Number(target.dataset.shotIndex || 0), shots.length - 1));
      const src = `/api/v1/store/asset?path=${encodeURIComponent(shots[index])}`;
      overlayReturnFocus = focus.current;
      overlay.innerHTML = `<div class="media-viewer-scrim" data-action="close-control-center"></div><section class="store-media-viewer" role="dialog" aria-modal="true" aria-label="Screenshot viewer"><header><strong>Screenshot ${index + 1} of ${shots.length}</strong><button type="button" data-action="close-control-center" aria-label="Close screenshot viewer">×</button></header><div class="store-media-viewer__stage"><img src="${src}" alt="Game screenshot"></div><footer>${shots.length > 1 ? `<button type="button" data-action="step-store-screenshot" data-shot-index="${(index - 1 + shots.length) % shots.length}">← Previous</button><button type="button" data-action="step-store-screenshot" data-shot-index="${(index + 1) % shots.length}" data-autofocus="true">Next →</button>` : `<button type="button" data-action="close-control-center" data-autofocus="true">Close</button>`}</footer></section>`;
      overlay.hidden = false;
      overlay.classList.remove("is-closing");
      requestAnimationFrame(() => focus.focusFirst());
      break;
    }
    case "step-store-screenshot": {
      const shots = JSON.parse(sessionStorage.getItem("para.store.screenshots") || "[]");
      if (!shots.length) break;
      const index = Math.max(0, Math.min(Number(target.dataset.shotIndex || 0), shots.length - 1));
      const src = `/api/v1/store/asset?path=${encodeURIComponent(shots[index])}`;
      overlay.innerHTML = `<div class="media-viewer-scrim" data-action="close-control-center"></div><section class="store-media-viewer" role="dialog" aria-modal="true" aria-label="Screenshot viewer"><header><strong>Screenshot ${index + 1} of ${shots.length}</strong><button type="button" data-action="close-control-center" aria-label="Close screenshot viewer">×</button></header><div class="store-media-viewer__stage"><img src="${src}" alt="Game screenshot"></div><footer><button type="button" data-action="step-store-screenshot" data-shot-index="${(index - 1 + shots.length) % shots.length}">← Previous</button><button type="button" data-action="step-store-screenshot" data-shot-index="${(index + 1) % shots.length}" data-autofocus="true">Next →</button></footer></section>`;
      requestAnimationFrame(() => focus.focusFirst());
      break;
    }
    case "store-more-info": {
      const id = target.dataset.storeId || sessionStorage.getItem("para.store.product") || "";
      overlayReturnFocus = target;
      overlay.innerHTML = `<div class="media-viewer-scrim" data-action="close-control-center"></div><section class="store-more-menu" role="dialog" aria-modal="true" aria-label="More game options"><header><strong>More options</strong><button type="button" data-action="close-control-center" aria-label="Close">×</button></header><div><button type="button" data-action="toggle-store-wishlist" data-store-id="${id}" data-autofocus="true">♡ Toggle Wishlist</button><button type="button" data-route="downloads">↓ Open Downloads</button><button type="button" data-route="media-gallery">▣ Media Gallery</button></div></section>`;
      overlay.hidden = false;
      overlay.classList.remove("is-closing");
      requestAnimationFrame(() => focus.focusFirst());
      break;
    }
    case "paraboard-key":
      paraBoardInsert(target.dataset.key || "", overlay, focus);
      break;
    case "paraboard-backspace":
      paraBoardBackspace(overlay, focus);
      break;
    case "paraboard-shift":
      paraBoardToggleShift(overlay, focus);
      break;
    case "paraboard-symbols":
      paraBoardToggleSymbols(overlay, focus);
      break;
    case "paraboard-done":
      closeParaBoard({ overlay, focus, commit: true });
      break;
    case "paraboard-cancel":
      closeParaBoard({ overlay, focus, commit: false });
      break;
    case "toggle-parapoint":
      toggleParaPoint();
      updateParaPointState();
      break;
    case "dismiss-browser-tutorial": {
      const tutorial = document.querySelector("[data-browser-tutorial]");
      if (tutorial) tutorial.hidden = true;
      try { localStorage.setItem("para.browser.tutorialSeen", "1"); } catch {}
      break;
    }
    case "browser-go": {
      const address = document.querySelector("[data-browser-address]");
      browserNavigate(address?.value || "");
      break;
    }
    case "browser-back":
      if (!browserBack()) toast("No previous page");
      break;
    case "browser-forward":
      if (!browserForward()) toast("No next page");
      break;
    case "browser-reload":
      browserReload();
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

document.addEventListener("para-request-paraboard", (event) => {
  const target = event.detail?.target;
  if (!target?.matches?.("input:not([type='range']):not([type='checkbox']):not([type='radio']), textarea")) return;
  if (isParaBoardOpen()) return;
  overlayReturnFocus = target;
  openParaBoard(target, { overlay, focus, controllerLabel: controllerStatus.typeLabel || "Controller" });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-account-quick]")) {
    document.querySelectorAll("[data-account-popover]:not([hidden])").forEach((node) => {
      node.hidden = true;
      node.closest("[data-account-quick]")?.querySelector("[data-action='toggle-account-menu']")?.setAttribute("aria-expanded", "false");
    });
  }
  const target = event.target.closest("[data-route], [data-action]");
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  if (target.closest("form")) event.preventDefault();
  if (target.matches("[data-continue-item]") && target.dataset.storeId) {
    launchStoreGameDirect(target.dataset.storeId);
    return;
  }
  if (target.dataset.notificationId) markNotificationRead(target.dataset.notificationId);
  if (target.dataset.route) navigate(target.dataset.route, {}, target);
  else handleAction(target.dataset.action, target);
});


document.addEventListener("submit", (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  const submitter = event.submitter || form.querySelector("button[type='submit'][data-action]");
  if (!submitter?.dataset.action) return;
  event.preventDefault();
  handleAction(submitter.dataset.action, submitter);
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
  if (event.target.matches("[data-para-input-speed]")) {
    patchParaInputSettings({ pointerSpeed: Number(event.target.value) });
    return;
  }
  if (event.target.matches("[data-para-input-right-deadzone]")) {
    patchParaInputSettings({ rightDeadzone: Number(event.target.value) });
    return;
  }
  if (event.target.matches("[data-para-input-left-deadzone]")) {
    patchParaInputSettings({ leftDeadzone: Number(event.target.value) });
    return;
  }
  if (event.target.matches("[data-para-input-curve]")) {
    patchParaInputSettings({ pointerCurve: Number(event.target.value) });
    return;
  }
  if (event.target.matches("[data-para-input-trigger]")) {
    patchParaInputSettings({ triggerThreshold: Number(event.target.value) });
    return;
  }
  if (event.target.matches("[data-interface-volume]")) {
    setInterfaceSoundVolume(event.target.value);
    schedulePreferenceSave();
  }
  if (event.target.matches("[data-media-volume]")) setMediaVolume(event.target.value);
  if (event.target.matches("[data-game-media-volume]")) setGameMediaBalance(event.target.value);
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
  if (event.target.matches("[data-media-volume]")) setMediaVolume(event.target.value);
  if (event.target.matches("[data-game-media-volume]")) setGameMediaBalance(event.target.value);
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
  const crashCode = `PARA-GAME-${String(Math.abs([...detail].reduce((sum, ch) => ((sum * 31) + ch.charCodeAt(0)) | 0, 17)) % 1000).padStart(3, "0")}`;
  root.innerHTML = `<section class="screen crash-screen" data-crash-screen><img src="./assets/para-logo.png" alt="" /><span class="eyebrow">PARA encountered a problem.</span><h1>This experience stopped unexpectedly.</h1><p class="crash-code">${crashCode}</p><div><button class="action-button" data-action="restart-current-app" data-autofocus="true">Restart App</button><button class="action-button action-button--ghost" data-action="report-crash">Report Problem</button><button class="action-button action-button--ghost" data-action="return-home-after-crash">Return Home</button></div><details><summary>Technical details</summary><pre></pre></details></section>`;
  root.querySelector("pre").textContent = detail;
  focus.focusFirst();
}

window.addEventListener("message", (event) => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("para_suspended_shell") !== "1" || event.origin !== window.location.origin || event.source !== window.parent) return;
  const data = event.data || {};
  if (data.type !== "para-shell-power-command") return;
  if (data.command === "sleep") {
    beginSleep({ returnFocus: focus.current });
    return;
  }
  if (data.command === "restart") {
    beginPowerSequence("reboot", { returnFocus: focus.current });
    return;
  }
  if (data.command === "shutdown") {
    openTurnOffConfirmation(focus, focus.current);
  }
});

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

captureAccountRecoveryFromUrl();
captureIntegrationReturnFromUrl();
captureYouTubeUploadReturnFromUrl();

if (new URLSearchParams(location.search).get("reset") === "1") {
  resetState();
  history.replaceState({}, "", `${location.pathname}#/startup`);
}

async function start() {
  applyPreferences();
  syncMenuMusic();
  await syncCloudAccountSession();
  const state = getState();
  if (state.loggedIn && state.activeProfile) await hydrateProfile(state.activeProfile);
  gamepad.start();
  updateOnlineState();
  window.setInterval(() => refreshDemoDownloads(), 500);
  resetIdleSleep();
  router.resolve();
  if (pendingIntegrationNotice) {
    toast(pendingIntegrationNotice.title, pendingIntegrationNotice.message);
    pendingIntegrationNotice = null;
  }
  if (pendingYoutubeUploadReturn) {
    const uploadReturn = pendingYoutubeUploadReturn;
    pendingYoutubeUploadReturn = null;
    if (uploadReturn.status === "authorized") {
      window.setTimeout(() => void resumePendingYouTubeUpload(), 120);
    } else if (uploadReturn.status === "cancelled") {
      toast("YouTube upload cancelled", "Nothing was uploaded.");
    } else if (uploadReturn.status === "signin_required") {
      toast("Sign in to PARA first", "A PARA Account is required before uploading to YouTube.");
    } else if (uploadReturn.status === "config_required") {
      toast("Google setup required", "Add PARA's Google OAuth client credentials on Render.");
    } else if (uploadReturn.status === "scope_required") {
      toast("YouTube upload permission missing", "Add the youtube.upload scope in Google Auth Platform → Data Access, then try again.");
    } else {
      toast("YouTube authorization failed", "Google could not authorize this upload. Try again.");
    }
  }
}

start();

// Stabilization: right stick scrolls the active app unless ParaPoint owns it.
let lastRightStickScroll = 0;
document.addEventListener("para-controllerinput", (event) => {
  if (document.documentElement.dataset.parapoint === "active") return;
  if (document.querySelector(".store-game-frame")) return;
  const y = Number(event.detail?.axes?.[3] || 0);
  if (Math.abs(y) < 0.28) return;
  const now = performance.now();
  if (now - lastRightStickScroll < 34) return;
  lastRightStickScroll = now;
  const current = focus.current;
  const scroller = current?.closest?.(".content-scroll,.page-body,[data-scroll-container]")
    || document.querySelector(".screen .content-scroll,.screen .page-body");
  if (!scroller) return;
  scroller.scrollBy({ top: y * 34, behavior: "auto" });
});

// Keep the persistent recording control synchronized with capture-service state.
syncRecordingHud();
