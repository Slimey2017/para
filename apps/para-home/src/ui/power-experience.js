import { completePowerAction, preparePowerAction, requestPowerAction } from "../services/power-adapter.js";
import { resumeMenuMusic, suspendMenuMusic } from "../services/menu-music.js";

export const POWER_SEQUENCE_DURATION_MS = 8000;
export const POWER_TIMELINE_MS = Object.freeze({
  FADE_END: 1000,
  LOGO_END: 2000,
  MESSAGE_OUT: 5500,
  GLOW_CONTRACT: 7000,
  COMPLETE: POWER_SEQUENCE_DURATION_MS,
});

const SLEEP_LOGO_MS = 1000;
const SLEEP_MESSAGE_MS = 1150;
const SLEEP_CONTRACT_MS = 2700;
const SLEEP_BLACK_MS = 3250;
let activeSequence = null;
let confirmationReturnFocus = null;

function sequenceNode() {
  let node = document.querySelector("[data-power-sequence]");
  if (node) return node;
  node = document.createElement("div");
  node.className = "power-sequence";
  node.dataset.powerSequence = "";
  node.hidden = true;
  node.innerHTML = `<div class="power-sequence__center"><img src="./assets/para-logo.png" alt="PARA" /><p data-power-message></p></div>`;
  document.body.append(node);
  return node;
}

function scheduleAt(startedAt, offset, callback) {
  const delay = Math.max(0, startedAt + offset - performance.now());
  const timer = setTimeout(callback, delay);
  activeSequence?.timers.push(timer);
}

function startOverlay(kind, message, returnFocus) {
  const node = sequenceNode();
  node.className = `power-sequence power-sequence--${kind}`;
  node.querySelector("[data-power-message]").textContent = message;
  node.hidden = false;
  node.getBoundingClientRect();
  node.classList.add("is-active");
  activeSequence = { kind, phase: "entering", node, returnFocus, timers: [] };
  return node;
}

function finishWake() {
  if (!activeSequence || activeSequence.kind !== "sleep") return;
  const { node, returnFocus } = activeSequence;
  node.hidden = true;
  node.className = "power-sequence";
  activeSequence = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

export function wakeFromSleep() {
  if (!activeSequence || activeSequence.kind !== "sleep" || activeSequence.phase !== "asleep") return false;
  activeSequence.phase = "waking";
  resumeMenuMusic({ duration: 520 });
  activeSequence.node.classList.add("is-waking");
  const timer = setTimeout(finishWake, 520);
  activeSequence.timers.push(timer);
  return true;
}

export function beginSleep({ returnFocus = null } = {}) {
  if (activeSequence) return;
  const startedAt = performance.now();
  preparePowerAction();
  suspendMenuMusic({ duration: 850 });
  document.dispatchEvent(new CustomEvent("para-systemcue", { detail: { name: "sleep" } }));
  const node = startOverlay("sleep", "Entering Sleep", returnFocus);
  scheduleAt(startedAt, SLEEP_LOGO_MS, () => node.classList.add("has-logo", "is-pulsing"));
  scheduleAt(startedAt, SLEEP_MESSAGE_MS, () => node.classList.add("has-message"));
  scheduleAt(startedAt, SLEEP_CONTRACT_MS, () => node.classList.add("is-contracting"));
  scheduleAt(startedAt, SLEEP_BLACK_MS, () => {
    if (!activeSequence || activeSequence.kind !== "sleep") return;
    activeSequence.phase = "asleep";
    node.classList.add("is-complete");
    void requestPowerAction("suspend");
  });
}

export function beginPowerSequence(action, { returnFocus = null } = {}) {
  if (activeSequence || !["poweroff", "reboot"].includes(action)) return;
  const message = action === "poweroff" ? "Turning off PARA" : "Restarting PARA";
  const startedAt = performance.now();
  preparePowerAction();
  suspendMenuMusic({ duration: action === "poweroff" ? 950 : 650 });
  document.dispatchEvent(new CustomEvent("para-systemcue", { detail: { name: action === "poweroff" ? "shutdown" : "startup" } }));
  const node = startOverlay(action, message, returnFocus);

  scheduleAt(startedAt, POWER_TIMELINE_MS.FADE_END, () => node.classList.add("has-logo"));
  scheduleAt(startedAt, POWER_TIMELINE_MS.LOGO_END, () => node.classList.add("has-message", "is-pulsing"));
  scheduleAt(startedAt, POWER_TIMELINE_MS.MESSAGE_OUT, () => node.classList.add("is-message-fading", "is-contracting"));
  scheduleAt(startedAt, POWER_TIMELINE_MS.GLOW_CONTRACT, () => node.classList.add("is-logo-fading"));
  scheduleAt(startedAt, POWER_TIMELINE_MS.COMPLETE, () => {
    if (!activeSequence || activeSequence.kind !== action) return;
    activeSequence.phase = "complete";
    node.classList.add("is-complete");
    void completePowerAction(action);
  });
}

function powerConfirmationNode() {
  const existing = document.querySelector("[data-power-confirm]");
  if (existing) return existing;
  const modal = document.createElement("div");
  modal.className = "power-confirm";
  modal.dataset.powerConfirm = "";
  modal.dataset.transientPowerConfirm = "";
  modal.hidden = true;
  modal.innerHTML = `<section class="power-confirm__card" role="alertdialog" aria-modal="true" aria-labelledby="power-confirm-title" aria-describedby="power-confirm-copy"><span class="power-confirm__symbol" aria-hidden="true">○</span><h2 id="power-confirm-title">Turn off PARA?</h2><p id="power-confirm-copy">Any unsaved work may be lost.</p><div class="power-confirm__actions"><button type="button" class="action-button" data-action="cancel-turn-off" data-autofocus="true">Cancel</button><button type="button" class="action-button action-button--purple" data-action="turn-off-para">Turn Off</button></div></section>`;
  document.body.append(modal);
  return modal;
}

export function openTurnOffConfirmation(focus, returnFocus) {
  const modal = powerConfirmationNode();
  if (!modal || activeSequence) return;
  confirmationReturnFocus = returnFocus || focus.current;
  modal.hidden = false;
  requestAnimationFrame(() => focus.setCurrent(modal.querySelector("[data-autofocus='true']"), true));
}

export function cancelTurnOffConfirmation(focus) {
  const modal = document.querySelector("[data-power-confirm]:not([hidden])");
  if (!modal) return false;
  modal.hidden = true;
  if (confirmationReturnFocus?.isConnected) focus.setCurrent(confirmationReturnFocus, true);
  confirmationReturnFocus = null;
  if (modal.hasAttribute("data-transient-power-confirm")) modal.remove();
  return true;
}

export function confirmTurnOff() {
  const modal = document.querySelector("[data-power-confirm]:not([hidden])");
  if (modal?.hasAttribute("data-transient-power-confirm")) modal.remove();
  else if (modal) modal.hidden = true;
  confirmationReturnFocus = null;
}

export function consumePowerInput() {
  if (!activeSequence) return false;
  if (activeSequence.kind === "sleep" && activeSequence.phase === "asleep") wakeFromSleep();
  return true;
}

function captureInput(event) {
  if (!activeSequence) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (activeSequence.kind === "sleep" && activeSequence.phase === "asleep") wakeFromSleep();
}

window.addEventListener("keydown", captureInput, true);
window.addEventListener("pointerdown", captureInput, true);
window.addEventListener("click", captureInput, true);
