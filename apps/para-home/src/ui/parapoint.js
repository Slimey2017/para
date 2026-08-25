const DEADZONE = 0.22;
const MAX_SPEED = 13;
const BASE_SPEED = 2.2;

let active = false;
let cursor = null;
let x = 0;
let y = 0;
let previousButtons = [];
let cleanup = null;

function ensureCursor() {
  if (cursor?.isConnected) return cursor;
  cursor = document.createElement("div");
  cursor.className = "parapoint-cursor";
  cursor.innerHTML = `<span></span>`;
  cursor.setAttribute("aria-hidden", "true");
  document.body.append(cursor);
  return cursor;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function renderCursor() {
  const node = ensureCursor();
  node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function targetAtPoint() {
  cursor?.classList.add("is-probing");
  const element = document.elementFromPoint(x, y);
  cursor?.classList.remove("is-probing");
  return element;
}

function clickAtPoint() {
  const target = targetAtPoint();
  if (!target) return;
  const iframe = target.closest?.("iframe");
  if (iframe) {
    try {
      const rect = iframe.getBoundingClientRect();
      const innerDocument = iframe.contentDocument;
      const innerTarget = innerDocument?.elementFromPoint(x - rect.left, y - rect.top);
      if (innerTarget) {
        innerTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x - rect.left, clientY: y - rect.top }));
        innerTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x - rect.left, clientY: y - rect.top }));
        innerTarget.click?.();
        return;
      }
    } catch {
      document.dispatchEvent(new CustomEvent("para-parapoint-blocked", { detail: { reason: "cross-origin" } }));
      iframe.focus();
      return;
    }
  }
  const clickable = target.closest?.("button,a,input,textarea,select,[role='button'],[data-action],[data-route]") || target;
  if (clickable.matches?.("input,textarea")) {
    clickable.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("para-request-paraboard", { detail: { target: clickable } }));
    return;
  }
  clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
  clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
  clickable.click?.();
}

function rightClickAtPoint() {
  const target = targetAtPoint();
  if (!target) return;
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: x, clientY: y, button: 2 }));
}

function scrollBrowser(amount) {
  const frame = document.querySelector("[data-browser-frame]");
  try {
    if (frame?.contentWindow) frame.contentWindow.scrollBy({ top: amount, behavior: "smooth" });
    else window.scrollBy({ top: amount, behavior: "smooth" });
  } catch { window.scrollBy({ top: amount, behavior: "smooth" }); }
}

function onController(event) {
  if (!active) return;
  const axes = event.detail?.axes || [];
  const buttons = event.detail?.buttons || [];
  const edge = (index) => Boolean(buttons[index] && !previousButtons[index]);
  let dx = Number(axes[2] ?? axes[0] ?? 0);
  let dy = Number(axes[3] ?? axes[1] ?? 0);
  if (Math.abs(dx) < DEADZONE) dx = 0;
  if (Math.abs(dy) < DEADZONE) dy = 0;
  if (dx || dy) {
    const magnitude = Math.max(Math.abs(dx), Math.abs(dy));
    const speed = BASE_SPEED + (magnitude * magnitude) * MAX_SPEED;
    x = clamp(x + dx * speed, 8, window.innerWidth - 12);
    y = clamp(y + dy * speed, 8, window.innerHeight - 12);
    renderCursor();
  }
  if (edge(0)) clickAtPoint();
  if (edge(2)) rightClickAtPoint();
  if (edge(3)) scrollBrowser(170);
  if (edge(1)) document.dispatchEvent(new CustomEvent("para-browser-back"));
  if (edge(10)) toggleParaPoint();
  const lt = Number(event.detail?.rawButtons?.[6]?.value || 0);
  const rt = Number(event.detail?.rawButtons?.[7]?.value || 0);
  if (lt > .6) scrollBrowser(-45);
  if (rt > .6) scrollBrowser(45);
  previousButtons = [...buttons];
}

export function isParaPointActive() { return active; }

export function activateParaPoint() {
  if (active) return true;
  active = true;
  document.documentElement.dataset.parapoint = "active";
  x = window.innerWidth * .5;
  y = window.innerHeight * .5;
  previousButtons = [];
  renderCursor();
  document.addEventListener("para-controllerinput", onController);
  cleanup = () => document.removeEventListener("para-controllerinput", onController);
  document.dispatchEvent(new CustomEvent("para-parapointchange", { detail: { active: true } }));
  return true;
}

export function deactivateParaPoint() {
  if (!active) return false;
  active = false;
  cleanup?.();
  cleanup = null;
  cursor?.remove();
  cursor = null;
  previousButtons = [];
  delete document.documentElement.dataset.parapoint;
  document.dispatchEvent(new CustomEvent("para-parapointchange", { detail: { active: false } }));
  return true;
}

export function toggleParaPoint() { return active ? (deactivateParaPoint(), false) : activateParaPoint(); }
