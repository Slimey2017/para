// Browser Gamepad API adapter. It does not claim OS-level PulseWave support.
export class GamepadNavigation {
  constructor({ move, confirm, back, quick, shoulder, connected }) {
    this.handlers = { move, confirm, back, quick, shoulder, connected };
    this.previous = [];
    this.lastAxisMove = 0;
    window.addEventListener("gamepadconnected", (event) => connected(true, event.gamepad.id));
    window.addEventListener("gamepaddisconnected", () => connected(false, "No controller"));
  }

  start() {
    const poll = () => {
      const gamepad = [...(navigator.getGamepads?.() || [])].find(Boolean);
      if (gamepad) this.read(gamepad);
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  read(gamepad) {
    const pressed = gamepad.buttons.map((button) => button.pressed);
    const edge = (index) => pressed[index] && !this.previous[index];
    if (edge(0)) this.handlers.confirm();
    if (edge(1)) this.handlers.back();
    if (edge(9)) this.handlers.quick();
    if (edge(4)) this.handlers.shoulder(-1);
    if (edge(5)) this.handlers.shoulder(1);
    if (edge(12)) this.handlers.move("up");
    if (edge(13)) this.handlers.move("down");
    if (edge(14)) this.handlers.move("left");
    if (edge(15)) this.handlers.move("right");

    const now = performance.now();
    if (now - this.lastAxisMove > 180) {
      const [x = 0, y = 0] = gamepad.axes;
      if (Math.abs(x) > .65) { this.handlers.move(x > 0 ? "right" : "left"); this.lastAxisMove = now; }
      else if (Math.abs(y) > .65) { this.handlers.move(y > 0 ? "down" : "up"); this.lastAxisMove = now; }
    }
    this.previous = pressed;
  }
}

