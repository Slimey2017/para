# PARA Adaptive Game Capture v14

## Why v13 could still save gray video
Some WEB games render through multiple canvases, WebGL surfaces, video layers, or DOM/CSS rather than one ordinary 2D canvas. A canvas-only capture path can therefore decode successfully while still containing a blank or gray frame.

## v14 capture strategy
1. Detect visible canvas and video rendering surfaces.
2. Composite all directly capturable game layers into a dedicated 30 FPS encoder canvas.
3. Reject a direct-capture surface when it is effectively blank.
4. For renderers that cannot expose real pixels, fall back to current-tab capture.
5. Reuse that current-tab capture for the rest of the game session so Record/Replay do not repeatedly open the browser picker.
6. On Chromium with Element Capture support, restrict self-tab capture to the game body so PARA's injected system shell is excluded from the captured frames.

## Browser limitation
A hosted web application cannot silently start getDisplayMedia. If a title requires the self-tab fallback, Chrome must ask the user to approve screen capture once for that session. PARA requests `This Tab`, verifies the capture handle where supported, then reuses the stream. A native PARA Linux compositor can remove this browser permission step later.

## Build marker
- Version: 0.9.6
- Build: v14-adaptive-game-capture

## Validation
- Repository pytest: 43/43 passed
- PARA stabilization gate: passed
- Project validator: 40 screens / 17 services
- Consumer UI audit: 52 rendered states
- Render smoke: passed
