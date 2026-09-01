# PARA No-Tab MP4 Capture V50

V50 removes Chromium self-tab recording from PARA gameplay capture and moves final video compatibility to PARA's server-side capture pipeline.

## What changed

### Chrome tab recording is gone

- PARA no longer calls `getDisplayMedia()` for gameplay video capture.
- There is no "Choose This Tab" fallback and no Capture Handle / tab restriction path.
- Home Capture Controls no longer pretend they can record the browser shell. They direct the player to open a game and use the in-game PARA controls.
- In-game capture records the game's composited renderer frames directly.

### WebM is temporary transport only

Chromium still provides `MediaRecorder`, which PARA uses only to package the direct game-frame stream long enough to send it to the PARA API. That temporary WebM is not saved to Media Gallery as a new V50 capture.

The new flow is:

`game frames -> temporary WebM -> PARA /api/v1/capture/normalize -> FFmpeg -> MP4 H.264/AAC -> playback verification -> Media Gallery`

### Server-side MP4 normalization

`POST /api/v1/capture/normalize` now:

- accepts temporary WebM capture bodies up to 256 MB;
- requires a signed-in PARA Account on hosted/non-loopback deployments;
- limits the server to one capture transcode at a time;
- repairs/generates timestamps where possible and tolerates damaged input packets;
- encodes H.264 video with `yuv420p` pixel format;
- encodes AAC audio when an audio track exists;
- forces even video dimensions;
- writes `faststart` MP4 metadata for browser-friendly playback;
- returns only the normalized `video/mp4` bytes to the game runtime.

The original temporary WebM is discarded after processing.

### FFmpeg on Render

V50 adds `imageio-ffmpeg==0.6.0` and updates the Render build command to install `requirements.txt` before the stabilization check.

FFmpeg resolution order is:

1. `PARA_FFMPEG_PATH`, if explicitly configured;
2. a system `ffmpeg` executable;
3. the FFmpeg binary bundled by `imageio-ffmpeg`.

No new secret or Supabase migration is required for V50.

### Media Gallery

- New V50 gameplay videos are stored as `video/mp4` and marked `captureVersion: 5`.
- Capture metadata records H.264/AAC normalization and the original temporary MIME type.
- Media Gallery labels new clips as MP4 while keeping legacy WebM playback support for older captures.
- Old WebM captures are not rewritten automatically. V50 prevents new raw WebM captures from becoming the final gallery asset.

## Capture behavior

Manual recording:

1. PARA captures direct game frames.
2. Stop & Save finalizes the temporary recorder.
3. PARA shows `Processing capture · creating MP4`.
4. The server normalizes the recording.
5. The returned MP4 is locally playback-verified.
6. Only then is it written to Media Gallery.

Replay uses the same normalization path and shows `Processing replay · creating MP4` before saving.

If normalization fails, PARA does not save a broken new clip to Media Gallery.

## Limits / first live test

- Hosted capture normalization requires the player to be signed in.
- V50 currently caps a temporary upload at 256 MB. Hosting-provider request/time limits may be lower than PARA's own limit.
- The first production test should be a short 10–15 second clip.
- V50 cannot retroactively repair the existing Aug 31 WebM in IndexedDB. It only changes the new-capture pipeline.

## Validation

- `normalize_capture_file()` was exercised with a generated VP8/Opus WebM and produced a playable H.264/AAC MP4.
- The same transcode succeeded with the `imageio-ffmpeg` bundled FFmpeg binary used as the fallback for Render.
- Python compile check passed.
- Changed frontend JavaScript syntax checks passed.
- The injected in-game runtime script was extracted and passed `node --check`.
- API + repository suite: **88 passed, 1 known unrelated legacy failure**.
- The remaining failure is the pre-existing `apps/para-home/src/mock-data.js` cleanup assertion and is not related to V50 capture.

## Files changed

- `services/api/server.py`
- `apps/para-home/src/services/capture-service.js`
- `apps/para-home/src/ui/control-center.js`
- `apps/para-home/src/ui/video-player.js`
- `apps/para-home/src/screens/media.js`
- `requirements.txt`
- `render.yaml`
- `tests/test_api.py`
- `tests/test_repository.py`
- `PARA_NO_TAB_MP4_CAPTURE_V50.md`
