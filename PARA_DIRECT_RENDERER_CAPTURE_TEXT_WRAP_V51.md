# PARA Direct Renderer Capture + Text Wrap V51

V51 fixes the two live-test failures immediately after V50.

## 1. Blank direct-capture surface

V50 composited visible `<canvas>` / `<video>` surfaces into a second 2D canvas before recording. That is unreliable for WebGL games: a WebGL canvas can visibly render while `drawImage()` / pixel reads from a second canvas return black, especially when the renderer uses `preserveDrawingBuffer=false`.

V51 now prefers the renderer's own capture stream:

- Finds the dominant visible game canvas/video.
- Calls the surface's own `captureStream()` (`canvas.captureStream(30)` for canvas games).
- Keeps captured game audio when available.
- Marks captures as `direct-canvas-stream` or `direct-video-stream`.
- Uses the V50 compositor only as a fallback if the renderer itself cannot expose a stream.
- Does **not** restore `getDisplayMedia()`, screen capture, or Chrome's "Choose This Tab" flow.
- The temporary runtime recording still goes through V50's server-side H.264/AAC MP4 normalization before it reaches Media Gallery.

This specifically avoids the WebGL-to-2D copy path that produced `The game renderer returned a blank direct-capture surface.` during live testing.

## 2. Error text escaping the Control Center

The injected in-game toast had no viewport width limit and no word wrapping. Longer capture diagnostics could therefore run outside the pill / screen.

V51 adds:

- `max-width: min(560px, calc(100vw - 24px))`
- normal whitespace wrapping
- `overflow-wrap: anywhere`
- `word-break: break-word`
- centered multiline error text
- matching overflow protection for Control Center context copy

Long capture errors now remain inside the UI instead of escaping across the screen.

## Files changed

- `services/api/server.py`
- `tests/test_repository.py`

## Verification

- Python compile: passed.
- Existing JS syntax checks for the V50 capture/control-center modules: passed.
- V51 regression + API suite: **45 passed**.
- Full repository test file retains the pre-existing unrelated failure that expects `apps/para-home/src/mock-data.js` to be absent.

## Live test

After deploying V51, launch the same game and make a fresh short recording from the in-game PARA Control Center. The capture path should report a direct renderer stream instead of failing on the blank compositor surface. Long diagnostics, if any, should wrap inside the toast.
