# PARA Direct Capture, No MP4 Pipeline V56

V56 removes PARA's server-side capture conversion pipeline entirely.

## What changed

- New gameplay recordings and Replay clips are saved directly from the in-game `MediaRecorder` output to Media Gallery.
- PARA no longer uploads captures to `/api/v1/capture/normalize`.
- Removed the capture normalization queue, status/result/ack routes, worker thread, temporary encode files, and FFmpeg conversion helpers.
- Removed the `imageio-ffmpeg` dependency.
- A capture only gets the success toast after IndexedDB readback confirms the saved blob exists and has the expected size.
- Existing recordings left in old queued/processing/failed conversion states are treated as normal local videos when their blob exists.
- Media Gallery no longer shows `Processing MP4`, `MP4 failed`, or conversion-state banners.
- Capture playback errors are browser-neutral. Active PARA Home/runtime source no longer contains Chrome/Chromium wording.
- Renamed internal video/browser UI class names that used the word `chrome` so the active UI source is browser-brand neutral too.
- Legacy MP4 files remain playable/exportable, but PARA does not create new MP4 captures.

## Validation

- Python compile: passed
- JavaScript syntax: 43 modules passed
- API + repository regression suite: 93 passed, 0 failed
- Active app/runtime browser-brand search (`Chrome`/`Chromium`): no matches
- Capture conversion search (`ffmpeg`, `imageio`, normalize-capture routes/client): no active runtime matches
