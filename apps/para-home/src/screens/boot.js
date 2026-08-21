import { brand, hints, listRow, livingBackground, toggleRow } from "../ui/components.js";
import { getState } from "../state.js";

const setupSteps = ["Welcome", "Display", "Network", "Accessibility", "Privacy", "Account/Profile", "Ready"];

export function startupScreen() {
  return `<section class="screen screen--center screen--quiet startup-calm">${livingBackground()}${brand()}<div class="startup-calm__orb" aria-hidden="true"></div><div><h1>Starting PARA</h1><div class="loading-line" aria-label="Loading"></div></div></section>`;
}

export function introScreen() {
  return `<section class="boot-screen" aria-label="PARA welcome animation">
    <div class="boot-stage" data-boot-stage="fade"><div class="para-logo">PARA</div></div>
    <div class="boot-stage" data-boot-stage="liquid"><div class="liquid"><span class="liquid__blob liquid__blob--purple"></span><span class="liquid__blob liquid__blob--white"></span></div><p class="boot-caption">A new current</p></div>
    <div class="boot-stage" data-boot-stage="splash"><div class="splash"></div><div class="para-logo boot-reveal-logo">PARA</div></div>
    <div class="boot-stage" data-boot-stage="melt"><div class="para-logo melt-logo">PARA</div></div>
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
    `<div class="setup-question"><span class="eyebrow">Display</span><h1>How does this look?</h1><p class="lede">PARA has chosen settings for this screen. You can adjust them now or anytime in Settings.</p><div class="display-readout"><div><strong data-display-resolution>1920 × 1080</strong><span>Resolution</span></div><div><strong data-refresh-rate>60 Hz</strong><span>Refresh rate</span></div><div><strong data-hdr-status>Standard range</strong><span>Color range</span></div></div><div class="choice-grid">${listRow({ title: "Living room", meta: "Comfortable from the couch", icon: "▭", action: "select-tv", autofocus: true, selected: state.displayMode === "Living room" })}${listRow({ title: "Desk", meta: "More space for windows", icon: "□", action: "select-monitor", selected: state.displayMode === "Desk" })}${listRow({ title: "Adjust safe area", meta: "Keep the full interface on screen", icon: "⌗", action: "unavailable" })}${listRow({ title: "Interface size", meta: state.largeText ? "Large" : "Standard", icon: "Aa", action: "toggle-large", end: state.largeText ? "Large" : "Standard" })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Network</span><h1>Connect to the internet?</h1><p class="lede">Choose a connection to use for downloads, play, and communication.</p><div class="choice-stack">${listRow({ title: "PulseWave 5G", meta: "Secure · Strong signal", icon: "⌁", action: "choose-network", autofocus: true, end: state.selectedNetwork === "PulseWave 5G" ? "Connected" : "" })}${listRow({ title: "Ethernet", meta: "Connect a cable for the most stable experience", icon: "↔", action: "choose-ethernet" })}${listRow({ title: "Skip for now", meta: "Continue without internet", icon: "→", action: "choose-offline" })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Accessibility</span><h1>What would make PARA more comfortable?</h1><p class="lede">Choose any options you want. Everything can be changed later.</p><div class="choice-stack choice-stack--two">${toggleRow({ title: "Screen reader", meta: "Hear items and actions", icon: "◉", action: "toggle-screen-reader", value: state.screenReader, autofocus: true })}${toggleRow({ title: "Larger text", meta: "Increase text throughout PARA", icon: "Aa", action: "toggle-large", value: state.largeText })}${toggleRow({ title: "Reduce motion", meta: "Use calmer transitions", icon: "≈", action: "toggle-reduced", value: state.reducedMotion })}${toggleRow({ title: "High contrast", meta: "Strengthen text and edges", icon: "◐", action: "toggle-contrast", value: state.highContrast })}${toggleRow({ title: "Captions", meta: "Show speech and sound captions", icon: "CC", action: "toggle-captions", value: state.captions })}${toggleRow({ title: "Controller assistance", meta: "Extra help with holds and timing", icon: "⌁", action: "toggle-controller-assist", value: state.controllerAssist })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Privacy</span><h1>Choose what you share</h1><p class="lede">You can change these choices whenever you like.</p><div class="choice-stack">${toggleRow({ title: "Share diagnostics", meta: "Help improve stability and performance", icon: "◇", action: "toggle-diagnostics-sharing", value: state.diagnosticsSharing, autofocus: true })}${toggleRow({ title: "Personalized recommendations", meta: "Tailor games, apps, and Store suggestions", icon: "✦", action: "toggle-personalization", value: state.personalization })}${toggleRow({ title: "Location services", meta: "Allow location for supported experiences", icon: "⌖", action: "toggle-location", value: state.locationServices })}</div></div>`,
    `<div class="setup-question"><span class="eyebrow">Account/Profile</span><h1>Who will use this PARA?</h1><p class="lede">Start with a profile or enter as a guest.</p><div class="profile-grid setup-profile-grid"><button class="profile-card" data-action="setup-profile" data-profile="Player One" data-autofocus="true"><span class="avatar">P1</span><span class="profile-card__name">Player One</span></button><button class="profile-card" data-action="setup-guest" data-profile="Guest"><span class="avatar avatar--blue">G</span><span class="profile-card__name">Guest</span></button><button class="profile-card" data-action="add-profile"><span class="avatar avatar--add">＋</span><span class="profile-card__name">Add Profile</span></button></div></div>`,
    `<div class="setup-question setup-question--ready"><div class="ready-ring" aria-hidden="true"><i></i></div><span class="eyebrow">Ready</span><h1>You’re all set</h1><p class="lede">Welcome home.</p></div>`,
  ];
  return bodies[step] || bodies[0];
}

export function setupScreen() {
  const { setupStep } = getState();
  return `<section class="screen first-setup">${livingBackground()}<header class="setup-top">${brand()}${setupProgress(setupStep)}<span class="setup-count">${setupStep + 1} / ${setupSteps.length}</span></header><main class="setup-stage">${setupBody(setupStep)}<div class="setup-actions">${setupStep > 0 ? `<button class="action-button action-button--ghost" data-action="setup-back">Back</button>` : ""}<button class="action-button" data-action="${setupStep === setupSteps.length - 1 ? "finish-setup" : "setup-next"}">${setupStep === setupSteps.length - 1 ? "Enter PARA" : "Continue"}</button></div></main>${hints({ back: false, context: false, options: false })}</section>`;
}

export function activateIntro(onComplete) {
  const names = ["fade", "liquid", "splash", "melt", "beat"];
  const duration = getState().reducedMotion ? 220 : 1350;
  let index = 0;
  const setStage = () => document.querySelectorAll("[data-boot-stage]").forEach((stage) => { stage.dataset.active = String(stage.dataset.bootStage === names[index]); });
  setStage();
  const timer = setInterval(() => { index += 1; if (index >= names.length) { clearInterval(timer); setTimeout(onComplete, duration * .55); return; } setStage(); }, duration);
  return () => clearInterval(timer);
}
