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

## Share Center overlay pass
Added a controller-first Share Center overlay opened from each capture card.

Destinations shown:
- YouTube
- Facebook
- PARA Chat
- Send to Phone
- More / device share sheet
- Save to Files

The overlay uses PARA's existing modal, focus, controller prompt, and Back behavior instead of a separate popup system. YouTube/Facebook/Chat intentionally show integration-required messages rather than pretending a publish succeeded. Phone/Files/System share perform browser-supported export/share actions.

Validation:
- JavaScript syntax checks passed for app.js, media.js, and capture-service.js.
- PARA project validation passed (40 screens, 17 services).
- Consumer UI audit passed (52 rendered states).
- Repository test suite has one pre-existing unrelated failure: tests expect services/mock-api/server.py to be absent while the repository's own stabilization audit documents that its Linux systemd unit still references it.
