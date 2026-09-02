# PARA Capture Save Handshake V55

V55 fixes the capture flow that could tell the player a gameplay video was saved even when the finished MP4 was not actually present in Media Gallery.

## What changed

### 1. Success now means the video is really in Media Gallery
The injected PARA game runtime no longer treats an accepted queue job or a finished FFmpeg encode as the final success condition.

The capture state now moves through a truthful sequence:

`recording secured locally -> queued -> processing -> saving -> verified -> ready`

Before showing **Gameplay capture saved to Media Gallery** or **Recent gameplay saved to Media Gallery**, PARA now:

1. receives and verifies the normalized MP4,
2. writes the final capture to the `para-media-gallery` IndexedDB store,
3. reads that exact record back,
4. verifies the saved Blob size and `ready` state.

Only after that readback succeeds does the runtime show the success message.

### 2. The original recording is protected before MP4 processing
As soon as a gameplay recording or replay is finalized, PARA first stores the original WebM in Media Gallery under the same capture ID with a processing state.

If normalization, download, verification, or final MP4 persistence fails, the original WebM remains available instead of disappearing. The item is marked as failed with messaging such as **MP4 failed · original kept**.

### 3. Capture jobs are acknowledged only after local persistence
V54's capture queue kept one encoder active at a time. V55 adds the missing save handshake.

Fetching `/api/v1/capture/normalize/result` no longer immediately destroys the completed server-side result. The finished MP4 remains available until the browser confirms Media Gallery persistence through:

`POST /api/v1/capture/normalize/ack?id=<job-id>`

This prevents a completed server result from being deleted before the client has actually saved it locally. Unacknowledged completed jobs are still cleaned up by the existing queue TTL.

### 4. Media Gallery shows real processing state
Media Gallery now understands queued, processing, saving, failed, and ready capture states. Pending items can appear immediately because the original recording has already been stored locally.

Ready-only actions such as publishing/sharing are held back until the final MP4 has passed persistence verification.

### 5. Media Gallery refreshes when the game runtime saves a capture
The runtime announces capture-library changes through a BroadcastChannel plus a storage pulse fallback. An already-open Media Gallery can refresh when a staged recording changes to a verified MP4.

Object URLs are released before reload so the Gallery does not keep displaying the staged WebM after the same capture ID has been replaced by the finished MP4.

## Validation

- Python compilation: passed
- PARA Home Media Gallery JavaScript syntax: passed
- Injected game-runtime JavaScript syntax: passed
- API test suite: **45 passed**
- Targeted V54/V55 repository regressions: **2 passed**
- Patch apply verification: passed

The reconstructed local baseline used for this patch does not contain every historical file from every older PARA patch, so no claim is made that an unrelated full reconstructed-repository suite is clean. The V55-specific and API coverage above passed.
