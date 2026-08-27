# PARA Capture Experience v4 fixes

This build fixes the three capture problems reported after v3.

## 1. Stop & Save survives Control Center closing
- Manual recording state lives in the capture service, not the Control Center UI.
- A persistent recording HUD appears at the top-right while recording.
- The HUD shows elapsed time and provides Stop & Save even after Control Center closes.
- Reopening Control Center also refreshes the Capture panel so it shows Stop & Save.

## 2. Recorded videos are finalized and playable
- Recorder compatibility now prefers VP8 WebM before VP9 and checks browser playback support.
- Manual recordings request the final MediaRecorder data chunk before stopping.
- PARA validates that recorded blobs can load video metadata before saving them to Media Gallery.
- Gallery videos have native playback controls.
- Fullscreen viewer uses an explicit video source MIME type and reloads the media element.
- Replay retains the initial WebM chunk required for container initialization.

## 3. Capture PARA, not unrelated Chrome tabs
- getDisplayMedia now prefers the current tab, includes self-capture, disables surface switching, and excludes monitor capture where supported.
- PARA exposes a Capture Handle and checks the selected tab when Chrome supports Capture Handle.
- On modern Chromium, Element Capture restricts the video track to #para-app. This removes browser chrome, other tabs, and the Control Center overlay from the recorded frame.
- If the user selects another tab/window and Chrome exposes the required APIs, PARA rejects it and asks for This Tab (PARA) instead of recording the wrong thing.

## Web prototype limitation
A normal hosted website cannot silently bypass the browser's screen-capture permission picker. The native Linux PARA shell can replace this with compositor-level capture later. The browser build now makes This Tab the preferred source and verifies/restricts self-capture on supporting Chromium builds.

## Validation
- PARA project validation: 40 screens, 17 services
- Consumer UI audit: 52 rendered states passed
- Smoke check passed
- Repository tests: 36 passed, 1 pre-existing failure because services/mock-api/server.py still exists while the old repository test expects it removed
