# PARA V58 HUD Preservation Hotfix

## Bug

V58 improved capture-source selection, but direct `canvas.captureStream()` / `video.captureStream()` only contains pixels produced by that media element.

Games such as Slime Wars render major gameplay UI as normal DOM/SVG elements above the main renderer. That includes the kill feed, notifications, health/ammo UI, XP popups, level-up splash, scoreboards, respawn/game-over overlays, and other game-owned HUD layers. A direct canvas recording therefore looked like PARA had deleted the popups even though the game displayed them normally.

## Fix

The injected game runtime now distinguishes between two capture types:

1. **Canvas/video-only game**
   - Keeps the low-overhead direct renderer capture path.
   - Keeps the V58 60 FPS target and adaptive recording bitrate.

2. **Game with DOM/SVG HUD layers**
   - Finds the nearest large game root around the dominant renderer.
   - Supports an explicit `[data-para-capture-root]` override for developers.
   - Detects visible DOM/SVG visuals inside that root.
   - Uses browser Element Capture (`RestrictionTarget.fromElement()` + `track.restrictTo()`) to record the game root and all descendants.
   - PARA's injected `#para-game-system-shell` remains outside the capture root, so PARA Control Center / system overlays are not recorded with the game.
   - The target is temporarily made Element-Capture eligible with `isolation: isolate` and `transform-style: flat`, then its original inline values are restored when capture ends.

## Permission behavior

For games that require the DOM-HUD path, the browser may request current-tab capture permission. Choose **This Tab**. PARA then restricts the stream to the game element instead of saving the whole tab.

PARA does not silently fall back to canvas-only capture for a detected DOM-HUD game because doing so would recreate the missing-popup bug.

## Slime Wars result

The recorder boundary is the game screen/root around `#gameCanvas`, not `#gameCanvas` alone. HTML/SVG HUD descendants are therefore part of the recording while PARA's shadow-DOM system shell remains outside it.

## Validation

- `python -m py_compile services/api/server.py`: passed.
- Extracted injected runtime JavaScript: `node --check`: passed.
- Targeted regressions: 4 passed.
  - DOM HUD preservation path exists.
  - PARA system shell is excluded from the Element Capture root.
  - V58 capture-fidelity checks remain present.
  - V58 CSP still allows local `blob:` video without widening `connect-src`.

## Live test

After deploying, launch Slime Wars and start a **new** recording. When prompted for capture permission, choose **This Tab**. Trigger a kill-feed notification, XP popup, level-up/notification, or another HUD overlay and confirm that it appears in the saved Media Gallery video.
