const DEADZONE = 0.28;
const REPEAT_DELAY_MS = 350;
const REPEAT_RATE_MS = 120;

const KEYBOARD_CONTROLLER = Object.freeze({
  connected: false,
  name: "Keyboard and mouse",
  type: "keyboard",
  typeLabel: "Keyboard",
  prompts: {
    confirm: "Enter", back: "Esc", secondary: "⇧F10", options: "Y", para: "P",
    shoulderPrevious: "PgUp", shoulderNext: "PgDn",
  },
});

function identifyController(name = "Controller") {
  const value = String(name);
  if (/xbox|xinput|microsoft|045e/i.test(value)) {
    return { type: "xbox", typeLabel: "Xbox Wireless Controller", prompts: { confirm: "A", back: "B", secondary: "X", options: "Y", para: "PARA", shoulderPrevious: "LB", shoulderNext: "RB" } };
  }
  if (/playstation|dualshock|dualsense|sony|054c/i.test(value)) {
    return { type: "playstation", typeLabel: "DualSense / PlayStation Controller", prompts: { confirm: "✕", back: "○", secondary: "□", options: "△", para: "PARA", shoulderPrevious: "L1", shoulderNext: "R1" } };
  }
  if (/nintendo|switch|057e/i.test(value)) {
    return { type: "nintendo", typeLabel: "Nintendo Controller", prompts: { confirm: "B", back: "A", secondary: "Y", options: "X", para: "PARA", shoulderPrevious: "L", shoulderNext: "R" } };
  }
  if (/pulsewave|para controller|para pulse/i.test(value)) return { type: "para", typeLabel: "PulseWave Controller", prompts: { confirm: "Blue", back: "Red", secondary: "Green", options: "Yellow", para: "PARA", shoulderPrevious: "Left", shoulderNext: "Right" } };
  return { type: "generic", typeLabel: "Wireless / USB Gamepad", prompts: { confirm: "A", back: "B", secondary: "X", options: "Y", para: "Home", shoulderPrevious: "L", shoulderNext: "R" } };
}

function meaningful(gamepad) {
  return gamepad.buttons.some((button) => button.pressed) || gamepad.axes.some((value) => Math.abs(value) >= DEADZONE);
}

export function keyboardController() {
  return { ...KEYBOARD_CONTROLLER, prompts: { ...KEYBOARD_CONTROLLER.prompts } };
}

// Browser Gamepad API input is normalized here. A Linux-native input service can
// emit the same actions without changing focus behavior or any PARA screen.
export class GamepadNavigation {
  constructor({ move, confirm, back, paraTap, paraHold, shoulder, secondary, options, connected, inputDevice }) {
    this.handlers = { move, confirm, back, paraTap, paraHold, shoulder, secondary, options, connected, inputDevice };
    this.activeIndex = null;
    this.profile = null;
    this.previous = [];
    this.directionState = new Map();
    this.paraPressedAt = 0;
    this.paraHeld = false;
    window.addEventListener("gamepaddisconnected", (event) => {
      if (event.gamepad.index === this.activeIndex) this.releaseActiveController();
    });
  }

  activate(gamepad) {
    this.activeIndex = gamepad.index;
    this.previous = gamepad.buttons.map(() => false);
    this.directionState.clear();
    this.profile = identifyController(gamepad.id);
    this.handlers.connected({ connected: true, name: gamepad.id || "Controller", mapping: gamepad.mapping || "unknown", ...this.profile });
    this.handlers.inputDevice?.("controller");
  }

  releaseActiveController() {
    this.activeIndex = null;
    this.profile = null;
    this.previous = [];
    this.directionState.clear();
    this.handlers.connected(keyboardController());
    this.handlers.inputDevice?.("keyboard");
  }

  start() {
    const poll = () => {
      const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
      let gamepad = this.activeIndex === null ? null : pads.find((item) => item.index === this.activeIndex);
      if (this.activeIndex !== null && !gamepad) this.releaseActiveController();
      if (!gamepad) {
        gamepad = pads.find(meaningful) || null;
        if (gamepad) this.activate(gamepad);
      }
      if (gamepad) this.read(gamepad);
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  repeatDirection(direction, active, now) {
    const state = this.directionState.get(direction);
    if (!active) {
      this.directionState.delete(direction);
      return;
    }
    if (!state) {
      this.handlers.move(direction);
      this.directionState.set(direction, { next: now + REPEAT_DELAY_MS });
      return;
    }
    if (now >= state.next) {
      this.handlers.move(direction);
      state.next = now + REPEAT_RATE_MS;
    }
  }

  read(gamepad) {
    const pressed = gamepad.buttons.map((button) => button.pressed);
    const edge = (index) => Boolean(pressed[index] && !this.previous[index]);
    const now = performance.now();
    const [axisX = 0, axisY = 0] = gamepad.axes;
    const axisActive = Math.abs(axisX) >= DEADZONE || Math.abs(axisY) >= DEADZONE;
    const anyAxisActive = gamepad.axes.some((value) => Math.abs(value) >= DEADZONE);
    const buttonsChanged = pressed.some((value, index) => value !== this.previous[index]);

    if (buttonsChanged || anyAxisActive) {
      this.handlers.inputDevice?.("controller");
      document.dispatchEvent(new CustomEvent("para-controllerinput", { detail: { buttons: pressed, rawButtons: gamepad.buttons, axes: [...gamepad.axes], index: gamepad.index } }));
    }

    // When a published game is running, PARA must stop treating ordinary
    // gamepad buttons/sticks as shell navigation. The embedded game reads the
    // same controller through the Gamepad API. PARA keeps only its dedicated
    // system button so gameplay cannot accidentally move Home focus or leave
    // the runtime.
    const gameRuntimeActive = Boolean(document.querySelector(".store-game-frame"));
    const paraPointActive = document.documentElement.dataset.parapoint === "active";

    if (!gameRuntimeActive && !paraPointActive) {
      if (edge(0)) this.handlers.confirm();
      if (edge(1)) this.handlers.back();
      if (edge(2)) this.handlers.secondary();
      if (edge(3)) this.handlers.options();
      if (edge(4)) this.handlers.shoulder(-1);
      if (edge(5)) this.handlers.shoulder(1);
      if (edge(11) && !document.querySelector(".para-browser-app")) document.dispatchEvent(new CustomEvent("para-immersive-toggle"));
    }

    const paraIndex = gamepad.buttons.length > 16 ? 16 : 9;
    if (pressed[paraIndex] && !this.previous[paraIndex]) {
      this.paraPressedAt = now;
      this.paraHeld = false;
    }
    if (pressed[paraIndex] && !this.paraHeld && now - this.paraPressedAt >= 650) {
      this.paraHeld = true;
      this.handlers.paraHold();
    }
    if (!pressed[paraIndex] && this.previous[paraIndex] && !this.paraHeld) this.handlers.paraTap();

    const preferHorizontal = Math.abs(axisX) >= Math.abs(axisY);
    const left = Boolean(pressed[14] || (preferHorizontal && axisX <= -DEADZONE));
    const right = Boolean(pressed[15] || (preferHorizontal && axisX >= DEADZONE));
    const up = Boolean(pressed[12] || (!preferHorizontal && axisY <= -DEADZONE));
    const down = Boolean(pressed[13] || (!preferHorizontal && axisY >= DEADZONE));
    if (!gameRuntimeActive && !paraPointActive) {
      this.repeatDirection("left", left, now);
      this.repeatDirection("right", right, now);
      this.repeatDirection("up", up, now);
      this.repeatDirection("down", down, now);
    } else {
      this.directionState.clear();
    }
    this.previous = pressed;
  }
}

export const GAMEPAD_NAVIGATION_DEFAULTS = Object.freeze({ deadzone: DEADZONE, repeatDelay: REPEAT_DELAY_MS, repeatRate: REPEAT_RATE_MS });
