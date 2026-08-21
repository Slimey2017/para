import { brand, hints, listRow } from "../ui/components.js";
import { getState } from "../state.js";

const setupSteps = ["Welcome", "Display", "Network", "Accessibility", "Privacy", "Ready"];

export function startupScreen() {
  return `<section class="screen screen--center screen--quiet">
    ${brand()}<div><span class="eyebrow">Safe development session</span><h1 style="margin-top:20px">Starting PARA Home</h1><p class="lede">Reading local prototype state. No system settings are being changed.</p><div class="loading-line" aria-label="Loading"></div></div>
  </section>`;
}

export function introScreen() {
  return `<section class="boot-screen" aria-label="PARA first-boot animation placeholder">
    <div class="boot-stage" data-boot-stage="fade"><div class="para-logo">PARA</div></div>
    <div class="boot-stage" data-boot-stage="liquid"><div class="liquid"><span class="liquid__blob liquid__blob--purple"></span><span class="liquid__blob liquid__blob--white"></span></div><p class="boot-caption">Purple meets light</p></div>
    <div class="boot-stage" data-boot-stage="splash"><div class="splash"></div><div class="para-logo" style="position:absolute">PARA</div><p class="boot-caption">A new current</p></div>
    <div class="boot-stage" data-boot-stage="melt"><div class="para-logo melt-logo">PARA</div><p class="boot-caption">Shape becomes motion</p></div>
    <div class="boot-stage" data-boot-stage="beat"><div class="beat-orb"></div><p class="boot-caption">Pulse detected · visual beat placeholder</p></div>
    <button class="action-button action-button--ghost boot-screen__skip" data-action="skip-intro">Skip intro</button>
  </section>`;
}

function setupBody(step) {
  const bodies = [
    `<div><span class="eyebrow">Hello, PARA</span><h1 style="margin-top:20px">Built around your room.</h1><p class="lede">This guided prototype reserves the real first-boot experience without modifying Linux or your current desktop.</p></div>
     <div class="panel"><div class="metric-row"><div class="metric"><div class="metric__value">16:9</div><div class="metric__label">Primary display target</div></div><div class="metric"><div class="metric__value">Local</div><div class="metric__label">Prototype state</div></div><div class="metric"><div class="metric__value">Mock</div><div class="metric__label">System services</div></div></div></div>`,
    `<div><span class="eyebrow">Display</span><h1 style="margin-top:20px">Set the room view.</h1><p class="lede">Choose a development preview. HDMI mode switching and HDR calibration are future Linux compositor integrations.</p>
      <div class="choice-grid">${listRow({ title: "Living-room TV", meta: "Large text · 10-foot layout", icon: "▭", action: "select-tv", autofocus: true })}${listRow({ title: "Desk monitor", meta: "Balanced density · near-field", icon: "□", action: "select-monitor" })}</div></div>`,
    `<div><span class="eyebrow">Network</span><h1 style="margin-top:20px">Connect later, safely.</h1><p class="lede">The mock scan below does not touch NetworkManager. Real connections will use a permission-aware Linux networking service.</p>
      <div class="list" style="margin-top:30px">${listRow({ title: "PARA-LAB-5G", meta: "Simulated network · WPA3", icon: "⌁", action: "choose-network", autofocus: true })}${listRow({ title: "Continue offline", meta: "Recommended for this prototype", icon: "○", action: "choose-offline" })}</div></div>`,
    `<div><span class="eyebrow">Accessibility</span><h1 style="margin-top:20px">Comfort comes first.</h1><p class="lede">These visual preferences work now in the frontend. Screen reader and input remapping integration remain future work.</p>
      <div class="panel" style="margin-top:30px"><div class="switch-row"><span><strong>Reduce motion</strong><span class="tile__meta">Shorten decorative movement</span></span><button class="action-button action-button--ghost" data-action="toggle-reduced" data-autofocus="true">Toggle</button></div><div class="switch-row"><span><strong>Large text</strong><span class="tile__meta">Increase couch-distance type</span></span><button class="action-button action-button--ghost" data-action="toggle-large">Toggle</button></div></div></div>`,
    `<div><span class="eyebrow">Privacy</span><h1 style="margin-top:20px">Nothing leaves this prototype.</h1><p class="lede">Account, presence, temperature, network, store, and library data are labeled mocks. There is no cloud identity or telemetry backend.</p>
      <div class="panel" style="margin-top:30px"><div class="switch-row"><span><strong>Diagnostics</strong><span class="tile__meta">Disabled · no collector exists</span></span><span class="badge">Off</span></div><div class="switch-row"><span><strong>Personalization sync</strong><span class="tile__meta">Unavailable until accounts are real</span></span><span class="badge badge--preview">Stub</span></div></div></div>`,
    `<div><span class="eyebrow">Ready</span><h1 style="margin-top:20px">Your current starts here.</h1><p class="lede">Finish setup to create a local development profile and enter the login flow.</p>
      <div class="panel" style="margin-top:30px"><div class="panel__head"><h3>Development profile</h3><span class="badge badge--live">Local only</span></div><p class="muted">Authentication, PIN locks, purchases, and subscription entitlements are not implemented.</p></div></div>`,
  ];
  return bodies[step] || bodies[0];
}

export function setupScreen() {
  const { setupStep } = getState();
  return `<section class="screen screen--center">
    <div class="setup-shell">
      <aside class="setup-rail">${brand()}<ol class="setup-steps">${setupSteps.map((label, index) => `<li class="setup-step ${index === setupStep ? "setup-step--active" : index < setupStep ? "setup-step--done" : ""}">${label}</li>`).join("")}</ol></aside>
      <div class="setup-content"><div>${setupBody(setupStep)}</div><div class="action-row">
        ${setupStep > 0 ? `<button class="action-button action-button--ghost" data-action="setup-back">Back</button>` : ""}
        <button class="action-button" data-action="${setupStep === setupSteps.length - 1 ? "finish-setup" : "setup-next"}">${setupStep === setupSteps.length - 1 ? "Finish setup" : "Continue"}</button>
      </div></div>
    </div>${hints({ back: false })}
  </section>`;
}

export function activateIntro(onComplete) {
  const names = ["fade", "liquid", "splash", "melt", "beat"];
  const duration = getState().reducedMotion ? 220 : 1650;
  let index = 0;
  const setStage = () => {
    document.querySelectorAll("[data-boot-stage]").forEach((stage) => stage.dataset.active = String(stage.dataset.bootStage === names[index]));
  };
  setStage();
  const timer = setInterval(() => {
    index += 1;
    if (index >= names.length) { clearInterval(timer); setTimeout(onComplete, duration * .55); return; }
    setStage();
  }, duration);
  return () => clearInterval(timer);
}

