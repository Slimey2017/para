// Single owner for modal input. Prevents PARA overlays from stacking/fighting.
let owner = null;
let restoreTarget = null;

export function acquireOverlay(name, returnFocus = document.activeElement) {
  if (!name || (owner && owner !== name)) return false;
  owner = name;
  restoreTarget = returnFocus?.isConnected ? returnFocus : restoreTarget;
  document.documentElement.dataset.modalOwner = name;
  return true;
}

export function releaseOverlay(name, focusManager = null) {
  if (owner !== name) return false;
  owner = null;
  delete document.documentElement.dataset.modalOwner;
  const target = restoreTarget;
  restoreTarget = null;
  requestAnimationFrame(() => {
    if (!target?.isConnected) return;
    if (focusManager?.setCurrent) focusManager.setCurrent(target, true);
    else target.focus?.({ preventScroll: true });
  });
  return true;
}

export function overlayOwner() { return owner; }
export function overlayAvailable(name = "") { return !owner || owner === name; }
