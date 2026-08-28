# PARA Unified Control Center v15

This build fixes Control Center behavior in PARA Home and mirrors the same control model into top-level Game Mode.

## Fixes

- Hold PARA now returns to PARA Home instead of opening Switcher.
- Keyboard `P` is the single development PARA-button fallback; legacy `M` was removed.
- Dead Friends and Quick Settings entries were removed from the Home Control Center definition/default order.
- Control Center customization now includes Captures and Music consistently.
- When a shell overlay is open, PARA Home owns controller navigation even if a game runtime is present.
- Game Mode Control Center now uses the same core order as Home: Home, Switcher, Notifications, Downloads, Captures, Music, Network, Sound, Microphone, Controller, Profile, Power.
- Game Mode gained real controller/profile/download/notification/network contexts and honest unavailable states instead of fake data.
- Game Mode controller input remains masked from the game while the system Control Center is open.
- Game Mode directional behavior now matches the console model: Left/Right move the strip, Up enters contextual actions, Down/Back returns to the strip, and Back closes the Control Center.

## Version

- Version: 0.9.7
- Build: v15-unified-control-center
