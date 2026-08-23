import { brand, hints, livingBackground, paraLogo, toggleRow } from "../ui/components.js";
import { paraApi, escapeHtml, formatBytes } from "../services/para-api.js";
import { applyBrowserBackground, saveBrowserBackground } from "../services/profile-assets.js";
import {
  BACKGROUND_OPTIONS, BUILT_IN_BACKGROUND_IDS, getProfilePreferences, getState,
  setProfilePreferences,
} from "../state.js";
import {
  beginStartupSignals, finishStartupSignals, STARTUP_TIMELINE_MS, updateStartupSignals,
} from "../services/startup-adapter.js";

export const SETUP_CHAPTERS = Object.freeze([
  "Controller",
  "Language & Region",
  "Display Area",
  "Internet",
  "PARA Account",
  "Gaming Accounts",
  "Other Accounts",
  "Privacy",
  "Accessibility",
  "Audio",
  "Power & Sleep",
  "Background",
  "Updates & Storage",
  "Ready",
]);

const GAMING_PROVIDERS = Object.freeze([
  ["steam", "Steam"],
  ["playstation", "PlayStation"],
  ["xbox", "Xbox"],
  ["nintendo", "Nintendo"],
]);
const OTHER_PROVIDERS = Object.freeze([["google", "Google"]]);

export function startupScreen() {
  return `<section class="startup-black" aria-label="Starting PARA"></section>`;
}

export function introScreen() {
  return `<section class="para-ignition" data-ignition-phase="black" aria-label="PARA startup">
    <div class="para-ignition__center">
      <span class="para-ignition__point" aria-hidden="true"></span>
      <div class="para-ignition__lockup">
        <div class="para-ignition__ring" aria-hidden="true">
          <span class="para-ignition__ring-glow"></span>
          <svg class="para-ignition__trace" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55"></circle></svg>
          <span class="para-ignition__energy para-ignition__energy--one"></span>
          <span class="para-ignition__energy para-ignition__energy--two"></span>
          ${paraLogo("para-ignition__mark")}
        </div>
        <div class="para-ignition__type"><strong>PARA</strong><span>Play. Create. Connect.</span></div>
      </div>
    </div>
  </section>`;
}

function setupProgress(step) {
  const progress = ((step + 1) / SETUP_CHAPTERS.length) * 100;
  return `<div class="setup-journey" aria-label="Setup chapter ${step + 1} of ${SETUP_CHAPTERS.length}">
    <div><span>SETUP · ${String(step + 1).padStart(2, "0")} / ${SETUP_CHAPTERS.length}</span><strong>${SETUP_CHAPTERS[step]}</strong></div>
    <div class="setup-journey__line" role="progressbar" aria-valuemin="1" aria-valuemax="${SETUP_CHAPTERS.length}" aria-valuenow="${step + 1}"><i style="width:${progress}%"></i></div>
  </div>`;
}

function choiceButton({ title, meta, action, value = "", selected = false, disabled = false, autofocus = false, icon = "◦", extra = "" }) {
  return `<button type="button" class="setup-choice ${selected ? "is-selected" : ""}" data-action="${action}" ${value ? `data-value="${escapeHtml(value)}"` : ""} ${extra} ${disabled ? "disabled aria-disabled='true'" : ""} ${autofocus && !disabled ? "data-autofocus='true'" : ""}><span class="setup-choice__icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${meta}</small></span><i aria-hidden="true"></i></button>`;
}

function accountProviderRows(providers, group, values) {
  return providers.map(([id, name]) => {
    const skipped = values[id] === "skipped";
    return `<div class="setup-provider"><span aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span><strong>${escapeHtml(name)}</strong><button type="button" class="action-button action-button--ghost" disabled>Connect</button><button type="button" class="action-button ${skipped ? "action-button--ghost" : ""}" data-action="setup-skip-provider" data-provider-group="${group}" data-provider="${id}">${skipped ? "Skipped" : "Skip"}</button></div>`;
  }).join("");
}

function privacyRow(title, description) {
  return `<div class="setup-fixed-row"><span><strong>${title}</strong><small>${description}</small></span><b>Off</b></div>`;
}

function setupBackgroundChoices(selected) {
  return BUILT_IN_BACKGROUND_IDS.map((id) => {
    const option = BACKGROUND_OPTIONS[id];
    return `<button type="button" class="setup-background-choice ${selected === id ? "is-selected" : ""}" data-action="setup-background" data-background-id="${id}" style="--setup-wallpaper:url('${option.image}')"><span aria-hidden="true"></span><strong>${escapeHtml(option.name)}</strong></button>`;
  }).join("");
}

function setupBody(step) {
  const state = getState();
  const choices = state.setupChoices;
  const profile = state.activeProfile || choices.profileName || "P1";
  const background = getProfilePreferences(profile).background.selection;
  const bodies = [
    `<div class="setup-question setup-question--center"><div class="setup-controller-symbol" aria-hidden="true"><i></i></div><span class="eyebrow">Controller</span><h1>How will you control PARA?</h1><p class="lede">Connect a PulseWave Controller by USB-C and press the PARA button, or continue with keyboard and mouse.</p><div class="setup-controller-state" data-setup-controller-status><strong>Waiting for a controller</strong><span>Keyboard and mouse are ready</span></div><div class="setup-choice-grid setup-choice-grid--two">${choiceButton({ title: "Connected controller", meta: "Press the PARA button to choose it", action: "setup-use-controller", selected: choices.inputMode === "controller", disabled: true, icon: "◉", extra: "data-setup-controller-choice" })}${choiceButton({ title: "Keyboard & mouse", meta: "Continue in PC mode", action: "setup-use-keyboard", selected: choices.inputMode === "keyboard", autofocus: true, icon: "⌨" })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Language & Region</span><h1>Where are you using PARA?</h1><p class="lede">Time and regional formats will follow these choices.</p><div class="setup-form-grid"><label><span>Language</span><select data-setup-setting="language"><option value="en" selected>English</option></select></label><label><span>Country or region</span><select data-setup-setting="region">${[choices.region, "US", "CA", "GB", "AU", "JP", "DE", "FR"].filter((value, index, all) => value && all.indexOf(value) === index).map((value) => `<option value="${escapeHtml(value)}" ${value === choices.region ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label><label><span>Time zone</span><select data-setup-setting="timeZone"><option value="${escapeHtml(choices.timeZone)}" selected>${escapeHtml(choices.timeZone)}</option></select></label><label><span>Keyboard layout</span><select data-setup-setting="keyboardLayout"><option value="system" selected>System default</option></select></label></div></div>`,
    `<div class="setup-question"><span class="eyebrow">Display Area</span><h1>Can you see all four corners?</h1><p class="lede">Adjust the boundary until every corner sits comfortably inside your screen.</p><div class="setup-display-frame" style="--setup-inset:${Number(choices.safeArea) || 0}%"><i></i><i></i><i></i><i></i><strong>PARA</strong></div><label class="setup-slider"><span><strong>Screen boundary</strong><output data-safe-area-value>${Number(choices.safeArea) || 0}%</output></span><input type="range" min="0" max="8" step="1" value="${Number(choices.safeArea) || 0}" data-setup-safe-area /></label><div class="display-readout"><div><strong data-display-resolution>Reading…</strong><span>Resolution</span></div><div><strong data-refresh-rate>Reading…</strong><span>Refresh rate</span></div><div><strong data-hdr-status>Reading…</strong><span>Color range</span></div></div><div class="setup-choice-grid setup-choice-grid--two">${choiceButton({ title: "Living room", meta: "Larger interface for TVs", action: "select-tv", selected: state.displayMode === "Living room", autofocus: true, icon: "▭" })}${choiceButton({ title: "Desk", meta: "More room for monitors", action: "select-monitor", selected: state.displayMode === "Desk", icon: "□" })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Internet</span><h1>Connect to the internet?</h1><p class="lede">Use a connection already available to PARA, or set this up later.</p><div class="choice-stack" data-setup-network><div class="library-loading"><span></span><strong>Checking connections…</strong></div></div><div class="setup-inline-actions"><button class="action-button action-button--ghost" data-action="setup-network-later">Set Up Later</button></div></div>`,
    `<div class="setup-question"><span class="eyebrow">PARA Account</span><h1>How would you like to enter PARA?</h1><p class="lede">You can use PARA offline without connecting an account.</p><div class="setup-account-actions"><button class="action-button action-button--ghost" disabled>Log In</button><button class="action-button action-button--ghost" disabled>Create Account</button><button class="action-button" data-action="setup-account-offline" data-autofocus="true">Continue Offline</button></div><label class="setup-profile-name"><span>Profile name</span><input type="text" maxlength="32" value="${escapeHtml(choices.profileName)}" data-setup-setting="profileName" autocomplete="off" /></label></div>`,
    `<div class="setup-question"><span class="eyebrow">Gaming Accounts</span><h1>Connect your gaming accounts?</h1><p class="lede">This step is optional. Only supported libraries and services will be available through PARA.</p><div class="setup-provider-list">${accountProviderRows(GAMING_PROVIDERS, "gamingAccounts", choices.gamingAccounts)}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Other Accounts</span><h1>Connect another service?</h1><p class="lede">You can skip this and continue setting up PARA.</p><div class="setup-provider-list">${accountProviderRows(OTHER_PROVIDERS, "otherAccounts", choices.otherAccounts)}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Privacy</span><h1>Choose what PARA can use</h1><p class="lede">These optional services remain off unless you choose to enable them later.</p><div class="setup-fixed-list">${privacyRow("Diagnostics", "Share reliability and performance information")}${privacyRow("Personalization", "Use activity to tailor suggestions")}${privacyRow("Location services", "Allow apps to request your location")}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Accessibility</span><h1>What would make PARA more comfortable?</h1><p class="lede">These display choices take effect immediately.</p><div class="choice-stack">${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", icon: "Aa", action: "toggle-large", value: state.largeText, autofocus: true })}${toggleRow({ title: "Reduce motion", meta: "Use calmer transitions", icon: "≈", action: "toggle-reduced", value: state.reducedMotion })}${toggleRow({ title: "High contrast", meta: "Strengthen text and edges", icon: "◐", action: "toggle-contrast", value: state.highContrast })}</div><div class="setup-system-access"><strong>Screen reader</strong><span>PARA follows your system accessibility settings.</span></div></div>`,
    `<div class="setup-question"><span class="eyebrow">Audio</span><h1>Can you hear PARA clearly?</h1><p class="lede">PARA will use the current system audio output.</p><div class="setup-audio-state" data-setup-audio><div class="library-loading"><span></span><strong>Checking audio…</strong></div></div><button class="action-button" data-action="setup-audio-test" data-autofocus="true">Play Test Sound</button></div>`,
    `<div class="setup-question"><span class="eyebrow">Power & Sleep</span><h1>When should PARA sleep?</h1><p class="lede">Inactivity sleep protects the display and lowers power use.</p><div class="setup-choice-grid">${[[15, "After 15 minutes"], [30, "After 30 minutes"], [60, "After 1 hour"], [0, "Never automatically"]].map(([value, title], index) => choiceButton({ title, meta: value ? "Wake to continue where you left off" : "Use Sleep from the Power menu", action: "setup-sleep-timer", value: String(value), selected: Number(choices.sleepMinutes) === value, autofocus: index === 0, icon: "◒" })).join("")}</div></div>`,
    `<div class="setup-question setup-question--background"><div class="setup-background-live profile-wallpaper" aria-hidden="true"><span></span></div><span class="eyebrow">Background</span><h1>Choose your PARA background</h1><p class="lede">You can change it at any time in Personalization.</p><div class="setup-background-grid">${setupBackgroundChoices(background)}</div><button class="setup-custom-background" data-action="setup-open-background-picker" data-setup-custom-background hidden><span aria-hidden="true">＋</span><strong>Add Custom Background</strong><small>PNG, JPEG, or WebP</small></button><input type="file" accept="image/png,image/jpeg,image/webp" data-setup-background-input hidden /><p class="setup-background-result" data-setup-background-result aria-live="polite"></p></div>`,
    `<div class="setup-question"><span class="eyebrow">Updates & Storage</span><h1>Is this storage ready?</h1><p class="lede">PARA will use storage detected on this system.</p><div class="setup-storage" data-setup-storage><div class="library-loading"><span></span><strong>Reading storage…</strong></div></div></div>`,
    `<div class="setup-question setup-question--center setup-question--ready"><div class="ready-ring" aria-hidden="true"><i></i></div><span class="eyebrow">Ready</span><h1>PARA is ready.</h1><p class="lede">Play. Create. Connect.</p></div>`,
  ];
  return bodies[step] || bodies[0];
}

export function setupScreen() {
  const { setupStep } = getState();
  return `<section class="screen first-setup">${livingBackground()}<header class="setup-top">${brand()}${setupProgress(setupStep)}</header><main class="setup-stage">${setupBody(setupStep)}<div class="setup-actions">${setupStep > 0 ? `<button class="action-button action-button--ghost" data-action="setup-back">Back</button>` : ""}<button class="action-button" data-action="${setupStep === SETUP_CHAPTERS.length - 1 ? "finish-setup" : "setup-next"}">${setupStep === SETUP_CHAPTERS.length - 1 ? "Enter PARA" : "Continue"}</button></div></main>${hints({ back: false, context: false, options: false })}</section>`;
}

function ignitionPhase(elapsed) {
  if (elapsed < STARTUP_TIMELINE_MS.BLACK_END) return "black";
  if (elapsed < STARTUP_TIMELINE_MS.POINT_END) return "point";
  if (elapsed < STARTUP_TIMELINE_MS.ORBIT_START) return "ring";
  if (elapsed < STARTUP_TIMELINE_MS.CHARGE_END) return "orbit";
  if (elapsed < STARTUP_TIMELINE_MS.MARK_END) return "forming";
  if (elapsed < STARTUP_TIMELINE_MS.BRAND_END) return "brand";
  if (elapsed < STARTUP_TIMELINE_MS.COMPLETE) return "transition";
  return "complete";
}

export function activateIntro(onComplete) {
  const node = document.querySelector(".para-ignition");
  if (!node) return () => {};
  const startedAt = performance.now();
  let frame = 0;
  let previous = "";
  let finished = false;
  beginStartupSignals();
  const run = (now) => {
    const elapsed = Math.min(STARTUP_TIMELINE_MS.COMPLETE, now - startedAt);
    const phase = ignitionPhase(elapsed);
    node.style.setProperty("--ignition-progress", String(elapsed / STARTUP_TIMELINE_MS.COMPLETE));
    if (phase !== previous) {
      node.dataset.ignitionPhase = phase;
      updateStartupSignals(previous, phase);
      previous = phase;
    }
    if (phase === "complete") {
      finished = true;
      finishStartupSignals();
      onComplete();
      return;
    }
    frame = requestAnimationFrame(run);
  };
  frame = requestAnimationFrame(run);
  return () => {
    cancelAnimationFrame(frame);
    if (!finished) finishStartupSignals();
  };
}

export function updateSetupControllerStatus(controller) {
  const status = document.querySelector("[data-setup-controller-status]");
  const choice = document.querySelector("[data-setup-controller-choice]");
  if (!status || !choice) return;
  choice.disabled = !controller.connected;
  choice.setAttribute("aria-disabled", String(!controller.connected));
  status.innerHTML = controller.connected
    ? `<strong>${escapeHtml(controller.typeLabel)} connected</strong><span>Press the PARA button to choose it</span>`
    : `<strong>Waiting for a controller</strong><span>Keyboard and mouse are ready</span>`;
}

export async function activateSetupNetwork() {
  const container = document.querySelector("[data-setup-network]");
  if (!container) return;
  try {
    const payload = await paraApi.network();
    if (!payload.interfaces?.length) {
      container.innerHTML = `<div class="setup-network-state"><span>⌁</span><div><strong>No connection found</strong><small>You can connect later in System.</small></div></div>`;
      return;
    }
    container.innerHTML = payload.interfaces.map((item) => `<div class="setup-network-state"><span>${item.kind === "wifi" ? "⌁" : "↔"}</span><div><strong>${item.kind === "wifi" ? "Wi-Fi" : "Ethernet"}</strong><small>${escapeHtml(item.name)}</small></div><b>${item.connected ? "Connected" : "Available"}</b></div>`).join("");
  } catch {
    container.innerHTML = `<div class="setup-network-state"><span>⌁</span><div><strong>Set up later</strong><small>Network settings remain available in System.</small></div></div>`;
  }
}

export async function activateSetupAudio() {
  const container = document.querySelector("[data-setup-audio]");
  if (!container) return;
  try {
    const payload = await paraApi.audio();
    if (payload.output) {
      container.innerHTML = `<div class="setup-audio-output"><span aria-hidden="true">◖</span><div><strong>System audio</strong><small>${payload.output.muted ? "Muted" : `${payload.output.volume}% volume`}</small></div></div>`;
      return;
    }
  } catch { /* current system output remains selected */ }
  container.innerHTML = `<div class="setup-audio-output"><span aria-hidden="true">◖</span><div><strong>System audio</strong><small>Current output selected</small></div></div>`;
}

export async function playSetupAudioTest() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return false;
  try {
    const context = new AudioEngine();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(392, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(523.25, context.currentTime + 0.45);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.68);
    oscillator.addEventListener("ended", () => context.close());
    return true;
  } catch {
    return false;
  }
}

export async function activateSetupStorage() {
  const container = document.querySelector("[data-setup-storage]");
  if (!container) return;
  try {
    const payload = await paraApi.storage();
    const drives = [payload.primary, ...(payload.mounts || [])].filter(Boolean);
    container.innerHTML = drives.map((drive, index) => `<div class="setup-storage-row"><span aria-hidden="true">${drive.optical ? "◉" : drive.external ? "▯" : "▰"}</span><div><strong>${escapeHtml(drive.name || (index === 0 ? "Internal Storage" : "Storage"))}</strong><small>${formatBytes(Math.round(Number(drive.free_gb || 0) * 1_000_000_000))} free</small></div></div>`).join("");
  } catch {
    container.innerHTML = "";
  }
}

export function activateSetupBackground({ focus, changed }) {
  const input = document.querySelector("[data-setup-background-input]");
  const custom = document.querySelector("[data-setup-custom-background]");
  const result = document.querySelector("[data-setup-background-result]");
  if (!input || !custom) return () => {};
  const onChange = async () => {
    const file = input.files?.[0];
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return;
    const profile = getState().activeProfile || getState().setupChoices.profileName || "P1";
    try {
      let source = "browser";
      let revision = Date.now();
      try {
        const capabilities = await paraApi.capabilities();
        if (capabilities.custom_backgrounds) {
          const saved = await paraApi.uploadBackground(profile, file);
          source = "host";
          revision = saved.revision;
        } else revision = await saveBrowserBackground(profile, file);
      } catch {
        revision = await saveBrowserBackground(profile, file);
      }
      setProfilePreferences({ background: { selection: "custom", source, revision } }, profile);
      if (source === "browser") await applyBrowserBackground(profile);
      if (result) result.textContent = "Custom background selected";
      changed();
    } catch {
      if (result) result.textContent = "That image couldn’t be applied";
      focus.setCurrent(custom, true);
    }
  };
  input.addEventListener("change", onChange);
  custom.hidden = !(globalThis.File && globalThis.indexedDB);
  return () => input.removeEventListener("change", onChange);
}

export function activateSetupChapter({ controller, focus, changed }) {
  const step = getState().setupStep;
  if (step === 0) updateSetupControllerStatus(controller);
  if (step === 3) void activateSetupNetwork();
  if (step === 9) void activateSetupAudio();
  if (step === 11) return activateSetupBackground({ focus, changed });
  if (step === 12) void activateSetupStorage();
  return () => {};
}
