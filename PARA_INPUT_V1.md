# PARA Input v1

PARA Input is the first controller compatibility layer for PARA web games that were designed around keyboard and mouse.

## Included now

- New **Settings → Controllers → PARA Input** screen.
- Master enable switch and automatic web-game option.
- Default WASD + mouse profile.
- Left stick maps to movement keys.
- Right stick drives a virtual mouse pointer.
- Triggers can become left/right mouse clicks.
- Face buttons, bumpers, stick clicks, and D-pad can map to common keyboard keys.
- Mapping and pointer speed persist in `localStorage` under `para.input.v1`.
- Running games expose PARA Input from **Control Center → Controller**.
- Per-game enable/disable is stored by ParaStore runtime id.
- The PARA system button remains reserved for the console shell.
- Automatic compatibility stands down when a web title uses the browser Gamepad API directly, preventing PARA Input from fighting games with native controller support.

## Runtime boundary

The web runtime emits synthetic keyboard and mouse events inside the published game document. This is useful for HTML/JavaScript games that listen for normal DOM keyboard/mouse events. It cannot make browser-generated events trusted, and it cannot replace Linux-native input emulation for native PC games.

## Next

- Per-game profile editor and named community layouts.
- Input capture so a user can press a keyboard key instead of cycling choices.
- Gyro-to-mouse and stick response curves.
- Native Linux `uinput` service for Wine/Proton/Linux games.
- Cloud/profile sync for mappings.
