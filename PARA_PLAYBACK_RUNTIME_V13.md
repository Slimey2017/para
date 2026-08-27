# PARA Playback Runtime v13

Fixes blank/0:00 gameplay recordings.

- Records game frames through a dedicated 30 FPS compositor canvas.
- Uses only one cloned audio track so encoder topology stays valid.
- Decodes each completed recording before saving it to IndexedDB.
- Stores capture dimensions and captureVersion 2.
- Media Viewer uses direct video src and recovers missing WebM duration metadata.
- Older broken clips remain in the gallery but may still be unplayable; new v13 recordings are verified before save.
