# PARA Game Session + Capture Runtime v12

- ParaStore game sessions now write into the active profile runtime, so Continue knows the game was played.
- Store game Continue entries survive runtime pruning and resume the exact title.
- The in-game Control Center removes expensive full-screen backdrop blur and caches gamepad masks for smoother navigation.
- In-game screenshots, recording, and Replay use the title's own game canvas with `canvas.captureStream()` instead of Chrome display capture.
- Normal in-game capture no longer opens the browser screen-share picker.
- WebAudio is mirrored into the capture stream when possible.
