# PARA Chrome-Safe Capture V48

V48 moves the fix upstream into PARA's recorder after Chrome reported that it rejected the stored capture's video stream. V45-V47 made local playback diagnostics trustworthy; V48 prevents newly recorded clips from reaching Media Gallery unless Chrome can actually decode and play the exact output PARA just encoded.

## What changed

### Codec preflight with fallback

Before manual recording, recent-clip recording, or PARA Replay begins, PARA now performs a short encode -> decode probe on the selected screen stream.

Codec order when tab audio is present:

1. `video/webm;codecs=vp8,opus`
2. `video/webm;codecs=vp9,opus`
3. generic `video/webm`

When the capture stream has no audio track, PARA uses VP8, then VP9, then generic WebM. `MediaRecorder.isTypeSupported()` is only the first filter. A codec does not win until Chrome records a probe and then successfully plays that probe itself. If the first candidate fails, PARA automatically tries the next supported candidate.

### Stable chunk collection

Normal recordings now use a shared 1-second MediaRecorder timeslice. Recorder output is collected through one session helper instead of separate ad-hoc handlers for manual clips and recent clips.

When stopping a recording, PARA waits for the MediaRecorder `stop` event. MediaRecorder queues its final `dataavailable` event before `stop`, so the Blob is not assembled until the final recorder chunk has reached PARA's collector.

Replay's `requestData()` path now waits for the requested data event instead of sleeping for an arbitrary 180 ms before reading the rolling buffer.

### Decode validation before Media Gallery

Every saved clip must pass all of these checks before IndexedDB receives it:

- non-empty recording bytes
- real video dimensions
- Chrome can load/decode the WebM stream
- muted playback can start
- the media timeline advances
- a decoded video frame is available

Valid clips are stored as capture version 3 with `playbackVerified: true` and the recorder MIME that produced them.

If validation fails, the clip is rejected before Media Gallery. PARA keeps the detailed Chrome media error, including `Chrome rejected this capture's video stream.` for decode failures.

## Important limitation

This prevents **new bad captures**. It does not rewrite the already-recorded Aug 31 WebM. That old clip's encoded bytes are already fixed in the file. YouTube can transcode a file that Chrome refuses to play locally, which is why the successful YouTube upload did not prove Chrome compatibility.

## Files changed

- `apps/para-home/src/services/capture-service.js`
- `tests/test_repository.py`

## Verification

- V45-V48 targeted repository regressions: `4 passed`
- Combined `tests/test_repository.py` + `tests/test_api.py`: `83 passed`, `1` pre-existing unrelated failure
- Remaining unrelated failure: `apps/para-home/src/mock-data.js` still exists while the legacy cleanup test expects it to be gone
- `node --check apps/para-home/src/services/capture-service.js`: passed
- Python test file compile check: passed
