import { escapeHtml } from "../services/para-api.js";

const LETTER_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];
const SYMBOL_ROWS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["@","#","$","%","&","-","+","(",")"],
  [".",",","?","!","'",'"',":","/"],
];

let activeTarget = null;
let originalValue = "";
let shifted = false;
let symbols = false;

function rows() {
  return symbols ? SYMBOL_ROWS : LETTER_ROWS;
}

function keyButton(key, autofocus = false) {
  return `<button type="button" class="paraboard-key" data-action="paraboard-key" data-key="${escapeHtml(key)}" ${autofocus ? 'data-autofocus="true"' : ""}>${escapeHtml(shifted && !symbols ? key.toUpperCase() : key.toLowerCase())}</button>`;
}

function layout() {
  const rowHtml = rows().map((row, rowIndex) => `<div class="paraboard-row">${row.map((key, keyIndex) => keyButton(key, rowIndex === 0 && keyIndex === 0)).join("")}</div>`).join("");
  return `${rowHtml}<div class="paraboard-row paraboard-row--actions">
    <button type="button" class="paraboard-key paraboard-key--wide ${shifted ? "is-active" : ""}" data-action="paraboard-shift">⇧ Shift</button>
    <button type="button" class="paraboard-key paraboard-key--wide ${symbols ? "is-active" : ""}" data-action="paraboard-symbols">${symbols ? "ABC" : "123!?"}</button>
    <button type="button" class="paraboard-key paraboard-key--space" data-action="paraboard-key" data-key=" ">Space</button>
    <button type="button" class="paraboard-key paraboard-key--wide" data-action="paraboard-backspace">⌫</button>
    <button type="button" class="paraboard-key paraboard-key--done" data-action="paraboard-done">Done</button>
  </div>`;
}

function previewValue() {
  return activeTarget?.value ?? "";
}

export function isParaBoardOpen() {
  return Boolean(activeTarget);
}

export function paraBoardTarget() {
  return activeTarget;
}

export function openParaBoard(target, { overlay, focus, controllerLabel = "Controller" } = {}) {
  if (!target || !overlay) return false;
  activeTarget = target;
  originalValue = target.value || "";
  shifted = false;
  symbols = false;
  overlay.innerHTML = `<div class="paraboard-scrim" data-action="paraboard-cancel"></div>
    <section class="paraboard" role="dialog" aria-modal="true" aria-label="PARA on-screen keyboard">
      <header class="paraboard-header">
        <div><span>PARABOARD</span><h2>${escapeHtml(target.getAttribute("aria-label") || target.placeholder || "Type")}</h2></div>
        <small>${escapeHtml(controllerLabel)} · D-pad/Stick Move · A Type · B Cancel</small>
      </header>
      <div class="paraboard-entry" data-paraboard-preview>${escapeHtml(previewValue())}<span class="paraboard-caret" aria-hidden="true"></span></div>
      <div class="paraboard-layout" data-paraboard-layout>${layout()}</div>
      <footer><span><b>A</b> Type</span><span><b>X</b> Backspace</span><span><b>Y</b> Space</span><span><b>B</b> Cancel</span></footer>
    </section>`;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  document.documentElement.dataset.paraboard = "open";
  requestAnimationFrame(() => focus?.focusFirst());
  return true;
}

function refresh(overlay, focus, keepAction = "") {
  const preview = overlay?.querySelector("[data-paraboard-preview]");
  if (preview) preview.innerHTML = `${escapeHtml(previewValue())}<span class="paraboard-caret" aria-hidden="true"></span>`;
  const host = overlay?.querySelector("[data-paraboard-layout]");
  if (host) {
    host.innerHTML = layout();
    requestAnimationFrame(() => {
      if (keepAction) {
        const node = host.querySelector(`[data-action="${keepAction}"]`);
        if (node) return focus?.setCurrent(node, true);
      }
      focus?.focusFirst();
    });
  }
}

function emitInput() {
  if (!activeTarget) return;
  activeTarget.dispatchEvent(new Event("input", { bubbles: true }));
}

export function paraBoardInsert(value, overlay, focus) {
  if (!activeTarget) return;
  const text = shifted && !symbols ? String(value).toUpperCase() : String(value);
  const start = Number.isInteger(activeTarget.selectionStart) ? activeTarget.selectionStart : activeTarget.value.length;
  const end = Number.isInteger(activeTarget.selectionEnd) ? activeTarget.selectionEnd : activeTarget.value.length;
  activeTarget.value = activeTarget.value.slice(0, start) + text + activeTarget.value.slice(end);
  const position = start + text.length;
  try { activeTarget.setSelectionRange(position, position); } catch { /* not every input type supports selection */ }
  emitInput();
  if (shifted && !symbols && text.trim()) shifted = false;
  refresh(overlay, focus);
}

export function paraBoardBackspace(overlay, focus) {
  if (!activeTarget) return;
  const start = Number.isInteger(activeTarget.selectionStart) ? activeTarget.selectionStart : activeTarget.value.length;
  const end = Number.isInteger(activeTarget.selectionEnd) ? activeTarget.selectionEnd : activeTarget.value.length;
  if (start !== end) activeTarget.value = activeTarget.value.slice(0, start) + activeTarget.value.slice(end);
  else if (start > 0) activeTarget.value = activeTarget.value.slice(0, start - 1) + activeTarget.value.slice(end);
  const position = start === end ? Math.max(0, start - 1) : start;
  try { activeTarget.setSelectionRange(position, position); } catch { }
  emitInput();
  refresh(overlay, focus, "paraboard-backspace");
}

export function paraBoardToggleShift(overlay, focus) {
  shifted = !shifted;
  refresh(overlay, focus, "paraboard-shift");
}

export function paraBoardToggleSymbols(overlay, focus) {
  symbols = !symbols;
  shifted = false;
  refresh(overlay, focus, "paraboard-symbols");
}

export function closeParaBoard({ overlay, focus, commit = true } = {}) {
  if (!activeTarget) return false;
  const target = activeTarget;
  if (!commit) {
    target.value = originalValue;
    emitInput();
  } else {
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
  activeTarget = null;
  originalValue = "";
  shifted = false;
  symbols = false;
  delete document.documentElement.dataset.paraboard;
  if (overlay) {
    overlay.hidden = true;
    overlay.innerHTML = "";
    overlay.classList.remove("is-closing");
  }
  requestAnimationFrame(() => { if (target?.isConnected) focus?.setCurrent(target, true); });
  return true;
}
