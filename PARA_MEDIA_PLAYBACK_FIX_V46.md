# PARA Media Playback Fix V46

V46 fixes the Media Gallery video player after V45 and removes the oversized fullscreen overlay button.

## Diagnosis

The `.webm` extension itself is not the problem.

PARA's capture service already chooses a MediaRecorder format only when both `MediaRecorder.isTypeSupported()` and a browser `<video>` element report that the format is playable. Current PARA capture preferences are VP8/Opus WebM, VP9/Opus WebM, then generic WebM.

The more suspicious bug was in the V45 custom player. MediaRecorder WebM files can report an unknown or infinite duration. V45 tried to force Chrome to calculate the duration by seeking the video to `1e10` seconds and then rewinding. That trick is fragile and can leave a valid capture sitting at the end of the file or otherwise interfere with playback.

V46 removes that forced seek completely. It uses PARA's stored expected duration for the UI while allowing the browser to play the WebM normally.

The exact August 31 capture file was not attached to this chat, so V46 cannot prove whether that individual old Blob has malformed container metadata. If the old capture still fails after V46, export that exact `.webm` with Save and inspect it separately. New captures now get a stronger playback test before PARA stores them.

## Player changes

- Removes the `currentTime = 1e10` WebM duration-repair seek.
- Passes the capture's real MIME type into the player and uses a typed `<source>` element.
- Checks `video.canPlayType()` before playback.
- Keeps playback available even if a MediaRecorder WebM is not seekable yet.
- Disables timeline seeking until the browser exposes a seekable range.
- Adds compact loading, buffering, and decode-error status messages.
- Preserves play/pause, skip, volume, speed, keyboard shortcuts, and the small fullscreen icon.

## Capture validation

PARA used to verify that Chrome could decode at least one frame before saving a recording. V46 strengthens this: the temporary video must actually start playing and advance its timeline before the capture is committed to IndexedDB.

That helps stop future captures that have a visible first frame but a broken playback timeline from entering Media Gallery.

## Fullscreen cleanup

The separate `⛶ Fullscreen` overlay in the Media Gallery hero is removed. The custom player's small fullscreen icon remains in the bottom control bar.

The giant button seen in the screenshot was also caused by conflicting CSS from V45: one rule left `bottom` set while a later rule added `top`, stretching the absolutely positioned button vertically. The obsolete hero fullscreen CSS is removed entirely.

## Changed files

- `apps/para-home/src/ui/video-player.js`
- `apps/para-home/src/screens/media.js`
- `apps/para-home/src/services/capture-service.js`
- `apps/para-home/src/app.js`
- `apps/para-home/styles.css`
- `tests/test_repository.py`

## Verification

- Node syntax checks pass for all changed JavaScript files.
- V45 media regression test passes.
- New V46 playback regression test passes.
- Reconstructed current repository suite: **81 passed, 1 failed**.
- The single failure is the already-known unrelated legacy assertion that expects `apps/para-home/src/mock-data.js` not to exist.
