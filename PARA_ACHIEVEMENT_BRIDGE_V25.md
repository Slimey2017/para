# PARA Achievement Bridge v25

Version: 0.9.17  
Build: `v25-achievement-bridge`

## Fixes

- Achievement SDK initialization now happens before the top-level game-shell guard, so achievement tracking remains available in same-origin framed game runtimes as well as direct Game Mode.
- Added a durable in-page achievement request queue (`__PARA_ACHIEVEMENT_QUEUE__`). Failed or early achievement requests are retained and retried after published definitions load.
- Added the `para-achievement-request` event bridge for games that start before the SDK is ready.
- Added `PARA.achievements.status()` for lightweight runtime diagnostics.
- Achievement unlock messages posted from a game frame now cause PARA Home to reload profile state from shared storage, play the notification cue, show an achievement toast, and refresh the Achievements page.
- Game launch cache marker bumped to v25.

## Why v24 could fail

The v24 achievement runtime was initialized after `if (window.top !== window.self) return;`. Any launch path that rendered the published title in a same-origin frame skipped the achievement SDK entirely. Game-side helpers also swallowed rejected promises, making the failure look like nothing happened.

v25 separates achievement tracking from the heavyweight top-level Control Center and capture shell so trophy progress is not dependent on how the game document is hosted.
