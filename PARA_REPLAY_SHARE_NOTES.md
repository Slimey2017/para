# PARA Replay + Share v1

Added:
- PARA Replay rolling gameplay buffer
- Save Last 30 Seconds
- Save Last 1 Minute
- Save Last 5 Minutes
- Capture Gallery share actions
- System share sheet when the browser/device supports file sharing
- YouTube, Facebook, PARA Chat, and Phone export handoff buttons

## Browser prototype limitation
A normal website cannot silently capture the user's desktop/game window. Browsers require the user to approve screen capture when PARA Replay starts. The native Linux PARA shell can own the compositor/capture pipeline and enable the rolling buffer automatically without a browser permission dialog.

YouTube/Facebook direct publishing needs OAuth/API credentials and a backend/native account integration. In this prototype those buttons export the capture and mark the handoff point for the native implementation.
