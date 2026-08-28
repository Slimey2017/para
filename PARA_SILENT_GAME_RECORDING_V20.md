# PARA Silent Game Recording v20

Version: 0.9.12  
Build: `v20-silent-game-recording`

## Fix

The persistent top-center **Recording · Stop & Save** pill has been removed from Game Mode.

Manual recording now stays out of the gameplay view:

- starting a recording does not create a floating recording banner
- successful start/stop/save is silent in the game view
- recording state and Stop & Save remain available inside Control Center > Captures
- capture errors still surface so failures are not hidden
- screenshots, replay capture, Media Gallery, and the recording engine are unchanged

The game cache marker is bumped to v20 so deployed clients load the updated Game Mode shell.
