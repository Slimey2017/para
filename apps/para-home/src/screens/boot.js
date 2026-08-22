import { brand, hints, listRow, livingBackground, paraLogo, toggleRow } from "../ui/components.js";
import { paraApi, escapeHtml } from "../services/para-api.js";
import { getState } from "../state.js";

const setupSteps = ["Welcome", "Display", "Network", "Accessibility", "Privacy", "Account/Profile", "Ready"];

export function startupScreen() {
  return `<section class="screen screen--center screen--quiet startup-calm">${livingBackground()}${brand()}<div class="startup-calm__orb" aria-hidden="true"></div><div><h1>Starting PARA</h1><div class="loading-line" aria-label="Loading"></div></div></section>`;
}

export function introScreen() {
  return `<section class="boot-screen" aria-label="PARA welcome animation">
    <div class="boot-stage" data-boot-stage="fade"><div class="para-logo">${paraLogo("para-logo__image")}<strong>PARA</strong></div></div>
    <div class="boot-stage" data-boot-stage="liquid"><div class="liquid"><span class="liquid__blob liquid__blob--purple"></span><span class="liquid__blob liquid__blob--white"></span></div><p class="boot-caption">A new current</p></div>
    <div class="boot-stage" data-boot-stage="splash"><div class="splash"></div><div class="para-logo boot-reveal-logo">${paraLogo("para-logo__image")}<strong>PARA</strong></div></div>
    <div class="boot-stage" data-boot-stage="melt"><div class="para-logo melt-logo">${paraLogo("para-logo__image")}<strong>PARA</strong></div></div>
    <div class="boot-stage" data-boot-stage="beat"><div class="beat-orb"></div><p class="boot-caption">Feel the pulse</p></div>
    <button class="action-button action-button--ghost boot-screen__skip" data-action="skip-intro">Skip</button>
  </section>`;
}

function setupProgress(step) {
  return `<div class="setup-progress" aria-label="Setup step ${step + 1} of ${setupSteps.length}">${setupSteps.map((label, index) => `<span class="${index === step ? "is-current" : index < step ? "is-complete" : ""}" title="${label}"></span>`).join("")}</div>`;
}

function setupBody(step) {
  const state = getState();
  const bodies = [
    `<div class="setup-question setup-question--welcome"><div class="setup-symbol">◯</div><span class="eyebrow">Welcome</span><h1>Welcome to PARA</h1><p class="lede">Play, create, and make this space your own.</p></div>`,
    `<div class="setup-question"><span class="eyebrow">Display</span><h1>How does this look?</h1><p class="lede">Choose the spacing that feels best on this screen.</p><div class="display-readout"><div><strong data-display-resolution>Reading…</strong><span>Resolution</span></div><div><strong data-refresh-rate>Reading…</strong><span>Refresh rate</span></div><div><strong data-hdr-status>Reading…</strong><span>Color range</span></div></div><div class="choice-grid">${listRow({ title: "Living room", meta: "Comfortable from the couch", icon: "▭", action: "select-tv", autofocus: true, selected: state.displayMode === "Living room" })}${listRow({ title: "Desk", meta: "More information on screen", icon: "□", action: "select-monitor", selected: state.displayMode === "Desk" })}${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", icon: "Aa", action: "toggle-large", value: state.largeText })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Network</span><h1>Are you connected?</h1><p class="lede">PARA will use the connection already configured on this system.</p><div class="choice-stack" data-setup-network><div class="library-loading"><span></span><strong>Checking connections…</strong></div></div></div>`,
    `<div class="setup-question"><span class="eyebrow">Accessibility</span><h1>What would make PARA more comfortable?</h1><p class="lede">These choices take effect immediately.</p><div class="choice-stack">${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", icon: "Aa", action: "toggle-large", value: state.largeText, autofocus: true })}${toggleRow({ title: "Reduce motion", meta: "Use calmer transitions", icon: "≈", action: "toggle-reduced", value: state.reducedMotion })}${toggleRow({ title: "High contrast", meta: "Strengthen text and edges", icon: "◐", action: "toggle-contrast", value: state.highContrast })}</div></div>`,
    `<div class="setup-question setup-question--privacy"><span class="eyebrow">Privacy</span><h1>Your space stays yours</h1><p class="lede">Your PARA activity and profile are kept on this device.</p><div class="privacy-shield" aria-hidden="true">◇</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Account/Profile</span><h1>Who will use this PARA?</h1><p class="lede">Choose a local profile for this session.</p><div class="profile-grid setup-profile-grid"><button class="profile-card" data-action="setup-profile" data-profile="Player One" data-autofocus="true"><span class="avatar">P1</span><span class="profile-card__name">Player One</span></button><button class="profile-card" data-action="setup-guest" data-profile="Guest"><span class="avatar avatar--blue">G</span><span class="profile-card__name">Guest</span></button></div></div>`,
    `<div class="setup-question setup-question--ready"><div class="ready-ring" aria-hidden="true"><i></i></div><span class="eyebrow">Ready</span><h1>You’re all set</h1><p class="lede">Welcome home.</p></div>`,
  ];
  return bodies[step] || bodies[0];
}

export function setupScreen() {
  const { setupStep } = getState();
  return `<section class="screen first-setup">${livingBackground()}<header class="setup-top">${brand()}${setupProgress(setupStep)}<span class="setup-count">${setupStep + 1} / ${setupSteps.length}</span></header><main class="setup-stage">${setupBody(setupStep)}<div class="setup-actions">${setupStep > 0 ? `<button class="action-button action-button--ghost" data-action="setup-back">Back</button>` : ""}<button class="action-button" data-action="${setupStep === setupSteps.length - 1 ? "finish-setup" : "setup-next"}">${setupStep === setupSteps.length - 1 ? "Enter PARA" : "Continue"}</button></div></main>${hints({ back: false, context: false, options: false })}</section>`;
}

export async function activateSetupNetwork() {
  const container = document.querySelector("[data-setup-network]");
  if (!container) return;
  try {
    const payload = await paraApi.network();
    if (!payload.interfaces?.length) {
      container.innerHTML = `<div class="setup-network-state"><span>⌁</span><div><strong>No connection found</strong><small>You can continue and connect later.</small></div></div>`;
      return;
    }
    container.innerHTML = payload.interfaces.map((item) => `<div class="setup-network-state"><span>${item.kind === "wifi" ? "⌁" : "↔"}</span><div><strong>${item.kind === "wifi" ? "Wi-Fi" : "Ethernet"}</strong><small>${escapeHtml(item.name)}</small></div><b>${item.connected ? "Connected" : "Not connected"}</b></div>`).join("");
  } catch {
    container.innerHTML = `<div class="setup-network-state"><span>⌁</span><div><strong>Continue without a connection</strong><small>You can connect later in System.</small></div></div>`;
  }
}

export function activateIntro(onComplete) {
  const names = ["fade", "liquid", "splash", "melt", "beat"];
  const duration = getState().reducedMotion ? 220 : 1350;
  let index = 0;
  const setStage = () => document.querySelectorAll("[data-boot-stage]").forEach((stage) => { stage.dataset.active = String(stage.dataset.bootStage === names[index]); });
  setStage();
  const timer = setInterval(() => {
    index += 1;
    if (index >= names.length) {
      clearInterval(timer);
      setTimeout(onComplete, duration * .55);
      return;
    }
    setStage();
  }, duration);
  return () => clearInterval(timer);
}
