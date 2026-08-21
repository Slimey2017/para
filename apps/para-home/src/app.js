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
  settingsScreen, displayScreen, accessibilityScreen, networkScreen, audioScreen,
  privacyScreen, accountScreen, subscriptionScreen, vrusScreen, updatesScreen,
  powerScreen, healthScreen, recoveryScreen,
} from "./screens/system.js";

const root = document.querySelector("#para-app");
const toastRegion = document.querySelector("#toast-region");
const renderers = {
  startup: startupScreen, intro: introScreen, setup: setupScreen, login: loginScreen,
  profiles: profilesScreen, home: homeScreen, games: gamesScreen, apps: appsScreen,
  store: storeScreen, "bear-home": bearHomeScreen, creator: creatorScreen, calls: callsScreen,
  social: socialScreen, notifications: notificationsScreen, downloads: downloadsScreen,
  quick: quickScreen, controller: controllerScreen, storage: storageScreen, settings: settingsScreen,
  display: displayScreen, accessibility: accessibilityScreen, network: networkScreen, audio: audioScreen,
  privacy: privacyScreen, account: accountScreen, subscription: subscriptionScreen, vrus: vrusScreen,
  updates: updatesScreen, power: powerScreen, health: healthScreen, recovery: recoveryScreen,
};
const majorSections = ["games", "apps", "store", "bear-home", "creator", "social", "settings"];

let cleanupScreen = null;
let navigating = false;
let controllerStatus = { connected: false, name: "PulseWave Controller" };

function toast(title, message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<strong>${title}</strong>${message}`;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 3600);
}

function updateClock() {
  const now = new Date();
  const value = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(now);
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  document.querySelectorAll("[data-clock]").forEach((clock) => { clock.textContent = value; });
  document.querySelectorAll("[data-greeting]").forEach((node) => { node.textContent = greeting; });
}

function updateDisplayInfo() {
  const width = window.screen?.width || window.innerWidth;
  const height = window.screen?.height || window.innerHeight;
  const hdr = window.matchMedia?.("(dynamic-range: high)")?.matches;
  document.querySelectorAll("[data-display-resolution]").forEach((node) => { node.textContent = `${width} × ${height}`; });
  document.querySelectorAll("[data-refresh-rate]").forEach((node) => { node.textContent = "60 Hz"; });
  document.querySelectorAll("[data-hdr-status]").forEach((node) => { node.textContent = hdr ? "HDR available" : "Standard range"; });
}

function activateHomeMotion() {
  const cards = [...document.querySelectorAll(".home-launcher")];
  const cleanups = cards.map((card) => {
    const move = (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      card.style.setProperty("--my", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    };
    const leave = () => { card.style.setProperty("--mx", "50%"); card.style.setProperty("--my", "35%"); };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    return () => { card.removeEventListener("pointermove", move); card.removeEventListener("pointerleave", leave); };
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
  updateDisplayInfo();
  focus.focusFirst();
  if (route === "startup") {
    const timer = setTimeout(() => router.go(startupDestination(), { replace: true }), 850);
    cleanupScreen = () => clearTimeout(timer);
  } else if (route === "intro") {
    cleanupScreen = activateIntro(() => router.go("setup", { replace: true }));
  } else if (route === "home") cleanupScreen = activateHomeMotion();
}

const router = new Router(render);

function navigate(route, options = {}, target = null) {
  if (navigating || route === router.current()) return;
  navigating = true;
  target?.classList.add("is-activating");
  root.classList.add("is-leaving");
  setTimeout(() => router.go(route, options), getState().reducedMotion ? 1 : 170);
}

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
  root.classList.add("is-leaving");
  setTimeout(() => router.back(), getState().reducedMotion ? 1 : 140);
}

function quick() { if (router.current() === "quick") back(); else navigate("quick"); }
function shoulder(direction) {
  const currentIndex = majorSections.indexOf(router.current());
  if (currentIndex < 0) return;
  navigate(majorSections[(currentIndex + direction + majorSections.length) % majorSections.length]);
}

const focus = new FocusManager({ confirm, back, quick, shoulder });
const gamepad = new GamepadNavigation({
  move: (direction) => focus.move(direction), confirm: () => confirm(), back, quick, shoulder,
  connected: (connected, name) => {
    controllerStatus = { connected, name: name || "PulseWave Controller" };
    toast(connected ? "Controller connected" : "Controller disconnected", connected ? `${controllerStatus.name} is ready.` : "Reconnect a controller or continue with keyboard and mouse.");
  },
});

function rerender() { render(router.current()); }
function toggle(key, label) {
  const state = getState();
  const next = !state[key];
  setState({ [key]: next });
  toast(label, next ? "On" : "Off");
  rerender();
}

async function runDiagnostics() {
  try {
    const response = await fetch("/api/v1/health", { signal: AbortSignal.timeout(1800) });
    if (!response.ok) throw new Error("Health check failed");
    toast("System check complete", "No issues were found.");
  } catch { toast("Couldn’t finish the system check", "Try again in a moment."); }
}

function unavailable(title = "Unavailable") { toast(title, "This option isn’t available right now."); }

function handleAction(action, target) {
  const state = getState();
  const title = target?.dataset.title || target?.dataset.collection || target?.dataset.category || "This option";
  switch (action) {
    case "skip-intro": navigate("setup", { replace: true }, target); break;
    case "setup-next": setState({ setupStep: Math.min(6, state.setupStep + 1) }); rerender(); break;
    case "setup-back": setState({ setupStep: Math.max(0, state.setupStep - 1) }); rerender(); break;
    case "finish-setup": setState({ firstBootComplete: true, loggedIn: true, activeProfile: state.activeProfile || "Player One", setupStep: 6 }); navigate("home", { replace: true }, target); break;
    case "setup-profile": setState({ activeProfile: target?.dataset.profile || "Player One" }); toast("Profile selected", target?.dataset.profile || "Player One"); rerender(); break;
    case "setup-guest": setState({ activeProfile: "Guest" }); toast("Guest selected", "You can add a profile later."); rerender(); break;
    case "select-profile": setState({ activeProfile: target?.dataset.profile || "Player One" }); navigate("login", {}, target); break;
    case "profile-login": setState({ loggedIn: true, activeProfile: target?.dataset.profile || state.activeProfile || "Player One" }); navigate("home", { replace: true }, target); break;
    case "guest-login": setState({ loggedIn: true, activeProfile: "Guest" }); navigate("home", { replace: true }, target); break;
    case "sign-out": setState({ loggedIn: false, activeProfile: null }); navigate("profiles", { replace: true }, target); break;
    case "restart-shell": location.reload(); break;
    case "reset-first-boot": resetState(); navigate("intro", { replace: true }, target); break;
    case "toggle-reduced": toggle("reducedMotion", "Reduce motion"); break;
    case "toggle-large": toggle("largeText", "Larger text"); break;
    case "toggle-contrast": toggle("highContrast", "High contrast"); break;
    case "toggle-screen-reader": toggle("screenReader", "Screen reader"); break;
    case "toggle-captions": toggle("captions", "Captions"); break;
    case "toggle-controller-assist": toggle("controllerAssist", "Controller assistance"); break;
    case "toggle-diagnostics-sharing": toggle("diagnosticsSharing", "Share diagnostics"); break;
    case "toggle-personalization": toggle("personalization", "Personalized recommendations"); break;
    case "toggle-location": toggle("locationServices", "Location services"); break;
    case "select-tv": setState({ displayMode: "Living room" }); toast("Display layout", "Living room selected."); rerender(); break;
    case "select-monitor": setState({ displayMode: "Desk" }); toast("Display layout", "Desk selected."); rerender(); break;
    case "choose-network": case "network-select": setState({ selectedNetwork: target?.querySelector?.(".list-row__title")?.textContent || "PulseWave 5G" }); toast("Connected", "Your internet connection is ready."); rerender(); break;
    case "choose-ethernet": toast("Ethernet", "Connect a network cable to continue."); break;
    case "choose-offline": setState({ selectedNetwork: null }); toast("Offline mode", "You can connect later in Settings."); break;
    case "diagnostics": runDiagnostics(); break;
    case "controller-test": toast("Input test", controllerStatus.connected ? `${controllerStatus.name} is responding.` : "Press a button on your controller to connect it."); break;
    case "home-current": toast("PARA Home", "You’re already home."); break;
    case "bear-more": {
      const drawer = document.querySelector("[data-bear-drawer]");
      if (drawer) { drawer.hidden = false; requestAnimationFrame(() => focus.setCurrent(drawer.querySelector("[data-autofocus='true']") || drawer.querySelector("button"), true)); }
      break;
    }
    case "bear-drawer-close": back(); break;
    case "bear-folder": toast(title, "There are no items here yet."); break;
    case "clear-notifications": document.querySelectorAll(".os-row").forEach((row) => row.remove()); toast("Notifications cleared", "You’re all caught up."); break;
    case "check-updates": toast("You’re up to date", "No new updates are available."); break;
    case "library-filter": case "creator-filter": target?.parentElement?.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button === target)); break;
    case "browse-category": toast(title, `Browsing ${title}.`); break;
    case "add-profile": case "sign-in-options": case "store-product": case "wishlist": case "cart": case "store-search":
    case "game-open": case "creator-open": case "new-project": case "friend-open": case "join-friend": case "messages-open":
    case "invitations-open": case "party-start": case "find-friends": case "call-start": case "call-options":
    case "notification-open": case "download-open": case "download-options": case "pair-controller": case "controller-assign":
    case "controller-vibration": case "storage-open": case "display-option": case "network-refresh": case "network-details":
    case "network-test": case "audio-select": case "audio-option": case "privacy-option": case "account-option":
    case "plan-select": case "vr-connect": case "vr-option": case "update-option": case "update-history": case "system-power":
    case "unavailable": unavailable(title); break;
    default: unavailable(title);
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
