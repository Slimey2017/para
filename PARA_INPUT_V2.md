# PARA Input V2

PARA Input V2 replaces the rough first-pass controller translator with a more game-like compatibility layer for web titles that only understand keyboard and mouse.

## Fixed

- Right-stick aiming defaults to **relative aim**, so it no longer stops at screen edges.
- Aim speed is frame-rate independent.
- Radial deadzone is rescaled instead of jumping from zero to a large movement step.
- Adjustable response curve, sensitivity, aim deadzone, movement deadzone, and trigger threshold.
- Left-stick WASD uses hysteresis to stop key chatter around the deadzone.
- Manually enabling PARA Input for a game now **forces** mapping even if that game polls the Gamepad API. Automatic mode still yields to native controller support.
- Legacy `keyCode` / `which` compatibility for older browser games.
- Start/View buttons, more keyboard outputs, middle mouse, and wheel mappings.
- Per-game runtime overrides are supported through `PARA.input.configureForThisGame()`.

## Default controls

- Left stick: WASD
- Right stick: relative mouse aim
- RT: left mouse
- LT: right mouse
- A: Space
- B: C
- X: E
- Y: R
- LB: Q
- RB: F
- View: Tab
- Menu: Escape
- L3: Shift
- R3: Ctrl

The PARA system button remains reserved for the console shell.
