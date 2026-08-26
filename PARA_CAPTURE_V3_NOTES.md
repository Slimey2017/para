# PARA Capture Experience v3

## Added
- Control Center Capture quick actions
  - Screenshot
  - Save Recent Gameplay
  - Start Recording / Stop & Save
  - Media Gallery
- PARA Replay duration menu
  - 30 seconds
  - 1 minute
  - 3 minutes
  - 5 minutes
  - 10 minutes
  - 15 minutes
  - 30 minutes
- Full manual recording flow with saved Media Gallery clips
- Complete Media Gallery redesign
  - All / Videos / Screenshots filters
  - Large selected-media preview
  - Clean View / Share / Save / Delete actions
  - Horizontal capture rail
  - Video duration badges
- Fullscreen capture viewer
  - Photos and video
  - Previous / next capture
  - LB/RB navigation
  - Share and Save
  - Browser Fullscreen button
  - B / Escape closes back to the gallery

## Browser prototype limitation
Browser security requires a screen-selection permission prompt when screen capture begins. A native Linux PARA compositor/capture service can provide system-level Replay behavior without presenting a browser getDisplayMedia prompt each time.

## Validation
- PARA project validation: PASS (40 screens, 17 services)
- Consumer UI audit: PASS (52 rendered states)
- pytest: 37 PASS, 1 existing repository failure
  - `services/mock-api/server.py` still exists, while the repository test expects that legacy file to be removed.
  - This is unrelated to the Capture v3 changes.
