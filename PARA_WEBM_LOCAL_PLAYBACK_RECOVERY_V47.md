# PARA WebM Local Playback Recovery V47

V47 addresses the remaining Media Gallery failure where a stored capture can upload to YouTube but Chromium still reports that PARA cannot play it locally.

## What the failure tells us

The exact Aug 31 capture is stored in the browser's IndexedDB and was not attached to this chat, so its bytes cannot be inspected here. However, a successful YouTube ingest makes a completely empty file unlikely. The local path had two remaining strict MIME decisions that could reject otherwise valid WebM bytes:

1. The gallery created Blob URLs from the original MediaRecorder Blob, preserving codec-heavy MIME metadata such as `video/webm;codecs=vp8,opus`.
2. The custom player used a `<source type="...">` element and treated `canPlayType()` as a hard compatibility gate.

Chromium can be stricter about declared Blob/source MIME metadata than ingest/transcoding services that inspect the file contents directly.

## V47 changes

- Adds `capturePlaybackMime()` and `capturePlaybackBlob()` to the capture service.
- Existing WebM captures are re-wrapped for **playback only** as generic `video/webm`; the bytes are unchanged.
- Upload/export paths still use the untouched original Blob.
- Media Gallery and fullscreen capture viewer both use the normalized playback Blob URL.
- The PARA player now uses a direct `<video src="blob:...">` source instead of a typed nested `<source>` element.
- `canPlayType()` is now only a compatibility hint. It no longer blocks a stored capture before Chromium actually tries to load it.
- Playback errors now surface a more useful reason such as interrupted playback, decode failure, unsupported stream, or browser policy block.
- New capture validation tests the same normalized playback form used by Media Gallery so future recordings are checked against the real playback path.

## Fullscreen cleanup

The giant stretched fullscreen overlay button removed in V46 stays removed. Fullscreen remains available from the compact player control (`⛶`) and the fullscreen viewer footer.

## Validation

- JavaScript syntax checks passed for:
  - `apps/para-home/src/ui/video-player.js`
  - `apps/para-home/src/screens/media.js`
  - `apps/para-home/src/services/capture-service.js`
  - `apps/para-home/src/app.js`
- V45/V46/V47 media regression tests: **3/3 passed**.
- Full API + repository suite: **81 passed, 1 known unrelated failure**.
- The remaining failure is the existing legacy assertion expecting `apps/para-home/src/mock-data.js` to be absent.

## If the same old capture still fails

Use PARA's **Save** action and attach the exported `.webm`. Then the actual EBML/container structure, codecs, duration metadata, and packet timestamps can be inspected directly. If the bytes themselves are malformed, the next fix should be a capture/remux repair path rather than more player UI changes.
