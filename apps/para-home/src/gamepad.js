const KEYBOARD_CONTROLLER = Object.freeze({
  connected: false,
  name: "Keyboard and mouse",
  type: "keyboard",
  typeLabel: "Keyboard",
  prompts: { confirm: "Enter", back: "Esc", secondary: "C", options: "Y", para: "PARA" },
});

function identifyController(name = "Controller") {
  const value = String(name);
  if (/xbox|xinput|microsoft|045e/i.test(value)) {
    return { type: "xbox", typeLabel: "Xbox", prompts: { confirm: "A", back: "B", secondary: "X", options: "Y", para: "PARA" } };
  }
  if (/playstation|dualshock|dualsense|sony|054c/i.test(value)) {
    return { type: "playstation", typeLabel: "PlayStation Mode", prompts: { confirm: "✕", back: "○", secondary: "□", options: "△", para: "PARA" } };
  }
  if (/nintendo|switch|057e/i.test(value)) {
    return { type: "nintendo", typeLabel: "Nintendo", prompts: { confirm: "B", back: "A", secondary: "Y", options: "X", para: "PARA" } };
  }
  return { type: "para", typeLabel: "PARA", prompts: { confirm: "Blue", back: "Red", secondary: "Green", options: "Yellow", para: "PARA" } };
}

export function keyboardController() {
  return { ...KEYBOARD_CONTROLLER, prompts: { ...KEYBOARD_CONTROLLER.prompts } };
}

// The browser Gamepad API is the shared input adapter. Linux-native controller
// services can provide the same normalized shape without changing the UI.
export class GamepadNavigation {
  constructor({ move, confirm, back, paraTap, paraHold, shoulder, connected }) {
    this.handlers = { move, confirm, back, paraTap, paraHold, shoulder, connected };
    this.previous = [];
    this.lastAxisMove = 0;
    this.activeIndex = null;
    this.paraPressedAt = 0;
    this.paraHeld = false;
    window.addEventListener("gamepadconnected", (event) => this.report(event.gamepad));
    window.addEventListener("gamepaddisconnected", (event) => {
      if (event.gamepad.index === this.activeIndex) {
        this.activeIndex = null;
        this.previous = [];
        this.handlers.connected(keyboardController());
      }
    });
  }

  report(gamepad) {
    const profile = identifyController(gamepad.id);
    this.activeIndex = gamepad.index;
    this.handlers.connected({ connected: true, name: gamepad.id || "Controller", ...profile });
  }

  start() {
    const poll = () => {
      const gamepad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      if (gamepad) {
        if (gamepad.index !== this.activeIndex) this.report(gamepad);
        this.read(gamepad);
      } else if (this.activeIndex !== null) {
        this.activeIndex = null;
        this.previous = [];
        this.handlers.connected(keyboardController());
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  read(gamepad) {
    const pressed = gamepad.buttons.map((button) => button.pressed);
    const edge = (index) => pressed[index] && !this.previous[index];
    if (edge(0)) this.handlers.confirm();
    if (edge(1)) this.handlers.back();
    const paraIndex = gamepad.buttons.length > 16 ? 16 : 9;
    const now = performance.now();
    if (pressed[paraIndex] && !this.previous[paraIndex]) {
      this.paraPressedAt = now;
      this.paraHeld = false;
    }
    if (pressed[paraIndex] && !this.paraHeld && now - this.paraPressedAt >= 650) {
      this.paraHeld = true;
      this.handlers.paraHold();
    }
    if (!pressed[paraIndex] && this.previous[paraIndex] && !this.paraHeld) this.handlers.paraTap();
    if (edge(4)) this.handlers.shoulder(-1);
    if (edge(5)) this.handlers.shoulder(1);
    if (edge(12)) this.handlers.move("up");
    if (edge(13)) this.handlers.move("down");
    if (edge(14)) this.handlers.move("left");
    if (edge(15)) this.handlers.move("right");

    if (now - this.lastAxisMove > 180) {
      const [x = 0, y = 0] = gamepad.axes;
      if (Math.abs(x) > .65) {
        this.handlers.move(x > 0 ? "right" : "left");
        this.lastAxisMove = now;
      } else if (Math.abs(y) > .65) {
        this.handlers.move(y > 0 ? "down" : "up");
        this.lastAxisMove = now;
      }
    }
    this.previous = pressed;
  }
}
