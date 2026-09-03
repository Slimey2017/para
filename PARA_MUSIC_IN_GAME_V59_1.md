# PARA V59.1 — Music In Game

V59.1 extends the local-only PARA Music player into published WEB games without reopening the gameplay-recorder architecture.

## Behavior

- Start a local song in PARA Music, then launch a WEB game.
- PARA stores only local playback state in `localStorage` and keeps the audio bytes in the existing `para-music-library-v1` IndexedDB database.
- The same-origin injected game runtime reopens that local track and resumes at the saved position.
- In-game PARA Control Center → Music shows the actual track with Previous, Play/Pause, Next, Volume Down, and Volume Up.
- Returning to PARA Home restores the same track and position.
- Suspending/resuming a game also hands the song between the game runtime and suspended Home shell.
- PARA's own menu soundtrack stays muted whenever the local Music session is active, even when the local track is paused. It returns only when the local Music session is stopped/cleared.

## Recorder protection

PARA Music is kept out of the game's isolated HTML/WebAudio capture path. When a browser provides only mixed tab audio while local music is active, PARA avoids that mixed track rather than recording the user's song into the gameplay video.

## Browser limitation

A full page navigation destroys the previous document's `<audio>` element, so the browser build performs a local state handoff rather than literally preserving the same audio node. Usually playback resumes automatically. If browser autoplay policy blocks that resume, opening Control Center → Music and pressing Play resumes the selected track.

## Validation

- Home local-music JS syntax: passed.
- Media-session JS syntax: passed.
- Python API compile: passed.
- Injected game-runtime JS extraction + `node --check`: passed.
- V58 HUD recorder regression: passed.
- V58 CSP regression: passed.
- V58 capture-fidelity regression: passed.
- V59 local-only Music regression: passed.
- V59.1 in-game Music/recorder-isolation regression: passed.
