const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export class FocusManager {
  constructor({ confirm, back, paraTap, paraHold, shoulder }) {
    this.handlers = { confirm, back, paraTap, paraHold, shoulder };
    this.current = null;
    this.paraKeyDown = false;
    this.paraHoldTimer = null;
    this.onKeyDown = this.onKeyDown.bind(this);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", (event) => this.onKeyUp(event));
    document.addEventListener("focusin", (event) => this.setCurrent(event.target));
    document.addEventListener("pointermove", (event) => {
      const target = event.target.closest?.(FOCUSABLE);
      if (target) this.setCurrent(target, false);
    });
  }

  candidates() {
    const scope = document.querySelector(".background-confirm:not([hidden])") || document.querySelector("#para-overlay:not([hidden])") || document;
    return [...scope.querySelectorAll(FOCUSABLE)].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.getAttribute("aria-disabled") !== "true";
    });
  }

  focusFirst() {
    const scope = document.querySelector(".background-confirm:not([hidden])") || document.querySelector("#para-overlay:not([hidden])") || document;
    const preferred = scope.querySelector("[data-autofocus='true']");
    const target = preferred || this.candidates()[0];
    if (target) requestAnimationFrame(() => this.setCurrent(target, true));
  }

  setCurrent(target, focus = false) {
    if (!target || !target.matches?.(FOCUSABLE)) return;
    if (this.current && this.current !== target) this.current.removeAttribute("data-focused");
    this.current = target;
    target.setAttribute("data-focused", "true");
    if (focus) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  move(direction) {
    const items = this.candidates();
    if (!items.length) return;
    if (!this.current || !items.includes(this.current)) return this.setCurrent(items[0], true);
    if (this.current.matches("input[type='range']") && (direction === "left" || direction === "right")) {
      direction === "left" ? this.current.stepDown() : this.current.stepUp();
      this.current.dispatchEvent(new Event("input", { bubbles: true }));
      this.current.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const currentRect = this.current.getBoundingClientRect();
    const origin = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
    const ranked = items
      .filter((item) => item !== this.current)
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        const valid = direction === "left" ? dx < -8 : direction === "right" ? dx > 8 : direction === "up" ? dy < -8 : dy > 8;
        if (!valid) return null;
        const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
        const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
        return { item, score: primary + secondary * 2.25 };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    if (ranked[0]) this.setCurrent(ranked[0].item, true);
  }

  onKeyDown(event) {
    const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (directions[event.key]) {
      event.preventDefault();
      this.move(directions[event.key]);
    } else if (event.key === "Enter" && this.current) {
      event.preventDefault();
      this.handlers.confirm(this.current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.handlers.back();
    } else if (event.key.toLowerCase() === "m" && !this.paraKeyDown) {
      event.preventDefault();
      this.paraKeyDown = true;
      this.paraHoldTimer = setTimeout(() => {
        this.paraHoldTimer = null;
        if (this.paraKeyDown) this.handlers.paraHold();
      }, 650);
    } else if (event.key === "PageUp") {
      this.handlers.shoulder(-1);
    } else if (event.key === "PageDown") {
      this.handlers.shoulder(1);
    }
  }

  onKeyUp(event) {
    if (event.key.toLowerCase() !== "m" || !this.paraKeyDown) return;
    event.preventDefault();
    this.paraKeyDown = false;
    if (this.paraHoldTimer) {
      clearTimeout(this.paraHoldTimer);
      this.paraHoldTimer = null;
      this.handlers.paraTap();
    }
  }
}
