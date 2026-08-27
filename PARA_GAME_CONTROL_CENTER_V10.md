# PARA Game Control Center v10

This build replaces the temporary `PARA • Return to Library` escape button with a real, isolated PARA Game Mode system shell.

## Game Mode
- Tiny, low-opacity PARA system button instead of a text banner.
- Tap the controller PARA/Home button or press F1 to open Control Center.
- Hold the controller PARA/Home button for 650 ms to return Home.
- Control Center is injected into a Shadow DOM so game CSS cannot wreck its design.
- When Control Center is open, PARA masks ordinary Gamepad API input from the game so menu navigation does not also control gameplay.

## Game Control Center
- Resume
- Home
- Games
- Capture
- Media
- Fullscreen
- Sound
- Settings

## Capture in Game Mode
- Screenshot directly to the existing PARA Media Gallery IndexedDB.
- Start Recording and persistent Stop & Save pill.
- Start PARA Replay.
- Save last 30 seconds, 1 minute, or 5 minutes after Replay has buffered gameplay.
- Chrome still requires the capture-source permission picker in the hosted/browser build.

## Build identity
- Version: 0.9.2
- Build: v10-game-control-center
