const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
const DIRECTION_KEYS = Object.freeze({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" });
const KEY_REPEAT_DELAY_MS = 350;
const KEY_REPEAT_RATE_MS = 120;
const POINTER_HANDOFF_DISTANCE = 6;

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function visible(node) {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && node.getAttribute("aria-disabled") !== "true";
}

export class FocusManager {
  constructor({ confirm, back, paraTap, paraHold, shoulder, secondary, options }) {
    this.handlers = { confirm, back, paraTap, paraHold, shoulder, secondary, options };
    this.current = null;
    this.inputDevice = "";
    this.memory = new Map();
    this.inputLockedUntil = 0;
    this.paraKeyDown = false;
    this.paraHoldTimer = null;
    this.directionTimers = new Map();
    this.pointer = null;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("focusin", (event) => this.setCurrent(event.target));
    document.addEventListener("pointermove", (event) => this.onPointerMove(event));
    document.addEventListener("pointerdown", () => this.setInputDevice("pointer"));
    this.setInputDevice("keyboard", false);
  }

  scope() {
    return document.querySelector(".files-dialog:not([hidden])")
      || document.querySelector(".files-context:not([hidden])")
      || document.querySelector(".power-confirm:not([hidden])")
      || document.querySelector(".background-confirm:not([hidden])")
      || document.querySelector("#para-overlay:not([hidden])")
      || document;
  }

  candidates(scope = this.scope()) {
    return [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
  }

  setInputDevice(device, announce = true) {
    if (!device || this.inputDevice === device) return;
    this.inputDevice = device;
    document.documentElement.dataset.inputDevice = device;
    if (device === "pointer") this.current?.removeAttribute("data-focused");
    else if (this.current?.isConnected) this.current.setAttribute("data-focused", "true");
    if (announce) document.dispatchEvent(new CustomEvent("para-inputdevicechange", { detail: { device } }));
  }

  onPointerMove(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (!this.pointer) {
      this.pointer = { x: event.clientX, y: event.clientY };
      return;
    }
    const distance = Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y);
    if (distance < POINTER_HANDOFF_DISTANCE) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.setInputDevice("pointer");
    const target = event.target.closest?.(FOCUSABLE);
    if (target && visible(target)) this.setCurrent(target, false);
  }

  focusId(target) {
    if (!target) return "";
    return target.dataset.focusId
      || target.id
      || target.dataset.route
      || target.dataset.action
      || target.dataset.filesEntry
      || target.dataset.appId
      || "";
  }

  zoneOf(target) {
    return target?.closest?.("[data-focus-zone]") || null;
  }

  scopeKey(target) {
    return target?.closest?.("[data-focus-scope]")?.dataset.focusScope || "global";
  }

  memoryKey(target) {
    const zone = this.zoneOf(target)?.dataset.focusZone || "default";
    return `${this.scopeKey(target)}::${zone}`;
  }

  remember(target) {
    const id = this.focusId(target);
    if (id) this.memory.set(this.memoryKey(target), id);
  }

  focusFirst({ zone = "", scope = this.scope() } = {}) {
    const candidates = this.candidates(scope).filter((node) => !zone || this.zoneOf(node)?.dataset.focusZone === zone);
    const preferred = candidates.find((node) => node.dataset.autofocus === "true");
    const remembered = candidates.find((node) => this.memory.get(this.memoryKey(node)) === this.focusId(node));
    const target = remembered || preferred || candidates[0];
    if (target) requestAnimationFrame(() => this.setCurrent(target, true));
  }

  setCurrent(target, focus = false) {
    if (!target || !target.matches?.(FOCUSABLE) || !visible(target)) return;
    if (this.current && this.current !== target) this.current.removeAttribute("data-focused");
    const changed = this.current !== target;
    this.current = target;
    this.remember(target);
    if (this.inputDevice !== "pointer" || focus) target.setAttribute("data-focused", "true");
    if (focus) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: document.documentElement.dataset.reducedMotion === "true" ? "auto" : "smooth" });
    }
    if (changed) document.dispatchEvent(new CustomEvent("para-focuschange", { detail: { target, inputDevice: this.inputDevice } }));
  }

  lockInput(duration = 150) {
    this.inputLockedUntil = Math.max(this.inputLockedUntil, performance.now() + duration);
  }

  findByFocusId(id, candidates = this.candidates()) {
    return candidates.find((node) => this.focusId(node) === id) || null;
  }

  zoneTarget(zoneName, direction, origin, candidates) {
    const zoneItems = candidates.filter((node) => this.zoneOf(node)?.dataset.focusZone === zoneName);
    if (!zoneItems.length) return null;
    const remembered = zoneItems.find((node) => this.memory.get(this.memoryKey(node)) === this.focusId(node));
    if (remembered) return remembered;
    return this.rank(origin, zoneItems, direction, false)[0]?.item || zoneItems[0];
  }

  rank(origin, items, direction, enforceDirection = true) {
    const originPoint = center(origin.getBoundingClientRect());
    return items.map((item) => {
      const point = center(item.getBoundingClientRect());
      const dx = point.x - originPoint.x;
      const dy = point.y - originPoint.y;
      const valid = direction === "left" ? dx < -8 : direction === "right" ? dx > 8 : direction === "up" ? dy < -8 : dy > 8;
      if (enforceDirection && !valid) return null;
      const horizontal = direction === "left" || direction === "right";
      const primary = horizontal ? Math.abs(dx) : Math.abs(dy);
      const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
      const alignmentPenalty = secondary > primary * 1.35 ? secondary * 2.4 : secondary * 1.7;
      return { item, score: primary + alignmentPenalty };
    }).filter(Boolean).sort((a, b) => a.score - b.score);
  }

  move(direction) {
    if (performance.now() < this.inputLockedUntil) return false;
    const items = this.candidates();
    if (!items.length) return false;
    if (!this.current || !items.includes(this.current)) {
      this.setCurrent(items.find((node) => node.dataset.autofocus === "true") || items[0], true);
      return true;
    }
    if (this.current.matches("input[type='range']") && (direction === "left" || direction === "right")) {
      direction === "left" ? this.current.stepDown() : this.current.stepUp();
      this.current.dispatchEvent(new Event("input", { bubbles: true }));
      this.current.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    const zone = this.zoneOf(this.current);
    const suffix = `${direction[0].toUpperCase()}${direction.slice(1)}`;
    const explicitId = this.current.dataset[`nav${suffix}`] || zone?.dataset[`nav${suffix}`];
    const explicitZone = this.current.dataset[`nav${suffix}Zone`] || zone?.dataset[`nav${suffix}Zone`];
    let target = explicitId ? this.findByFocusId(explicitId, items) : null;
    if (!target && explicitZone) target = this.zoneTarget(explicitZone, direction, this.current, items);

    if (!target) {
      const zoneItems = zone ? items.filter((item) => this.zoneOf(item) === zone && item !== this.current) : [];
      target = this.rank(this.current, zoneItems, direction)[0]?.item || null;
    }

    // Some console screens intentionally contain vertical movement inside a
    // focus group. Settings uses this so Up/Down never guesses that the player
    // meant to jump into a different category. Horizontal movement can still use
    // explicit zone links, while LB/RB handles deliberate category changes.
    const containVertical = zone?.dataset.navContainY === "true";
    if (!target && containVertical && (direction === "up" || direction === "down")) {
      return false;
    }

    // For normal screens a focus zone is a preference, not a trap. If there is
    // no sensible item in the current zone, continue spatial navigation across
    // the rest of the screen.
    if (!target) {
      target = this.rank(
        this.current,
        items.filter((item) => item !== this.current),
        direction,
      )[0]?.item || null;
    }
    if (!target) return false;
    this.setCurrent(target, true);
    return true;
  }

  startDirection(direction) {
    if (this.directionTimers.has(direction)) return;
    this.move(direction);
    const delay = window.setTimeout(() => {
      const repeat = window.setInterval(() => this.move(direction), KEY_REPEAT_RATE_MS);
      this.directionTimers.set(direction, { delay, repeat });
    }, KEY_REPEAT_DELAY_MS);
    this.directionTimers.set(direction, { delay, repeat: 0 });
  }

  stopDirection(direction) {
    const timers = this.directionTimers.get(direction);
    if (!timers) return;
    window.clearTimeout(timers.delay);
    if (timers.repeat) window.clearInterval(timers.repeat);
    this.directionTimers.delete(direction);
  }

  onKeyDown(event) {
    const direction = DIRECTION_KEYS[event.key];
    const textEditing = event.target.matches?.("input:not([type='range']),textarea,select");
    if (textEditing && (direction || event.key === "Enter" || (!event.ctrlKey && !event.metaKey && event.key.length === 1))) return;
    if (direction) {
      event.preventDefault();
      this.setInputDevice("keyboard");
      if (!event.repeat) this.startDirection(direction);
    } else if (event.key === "Enter" && this.current) {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.confirm(this.current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.back();
    } else if (["p", "m"].includes(event.key.toLowerCase()) && !this.paraKeyDown) {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.paraKeyDown = true;
      this.paraHoldTimer = setTimeout(() => {
        this.paraHoldTimer = null;
        if (this.paraKeyDown) this.handlers.paraHold();
      }, 650);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.shoulder(-1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.shoulder(1);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.secondary();
    } else if (event.key.toLowerCase() === "y" && !event.target.matches("input,textarea")) {
      event.preventDefault();
      this.setInputDevice("keyboard");
      this.handlers.options();
    }
  }

  onKeyUp(event) {
    const direction = DIRECTION_KEYS[event.key];
    if (direction) this.stopDirection(direction);
    if (!["p", "m"].includes(event.key.toLowerCase()) || !this.paraKeyDown) return;
    event.preventDefault();
    this.paraKeyDown = false;
    if (this.paraHoldTimer) {
      clearTimeout(this.paraHoldTimer);
      this.paraHoldTimer = null;
      this.handlers.paraTap();
    }
  }
}
