# PARA V58 — Capture Fidelity + Blob Playback Fix

V58 now fixes **both** sides of the three-day video failure: PARA Home must be allowed to play local `blob:` media, and the in-game recorder must stop accepting a technically decodable but visually wrong capture.

## What was actually wrong

### 1. PARA Home blocked valid local video URLs
The normal and suspended Home CSP did not declare `media-src`, so `<video src="blob:...">` fell back to `default-src 'self'` and the browser rejected the Media Gallery URL.

V58 adds:

`media-src 'self' data: blob:;`

to the normal Home shell, suspended Home shell, and gateway serving path. `connect-src 'self'` stays unchanged. Production playback does not need blob fetch permission.

### 2. V57 playback verification was too weak for visual fidelity
V57 correctly stopped saving recordings that could not decode or advance. But it could still accept the **wrong renderer surface** or a capture whose dimensions did not match what the player saw.

The direct-surface selector had a canvas-first bias. If a title had a smaller HUD/overlay canvas plus a larger primary game/video surface, PARA could choose the canvas simply because it was a canvas. The resulting file could decode and advance normally while looking wrong.

V58 now ranks direct capture candidates primarily by visible viewport coverage, then aspect sanity and area. Canvas is only a tie-breaker.

### 3. Aspect-ratio and resolution sanity checks
A direct stream is rejected when its encoded dimensions are badly inconsistent with the on-screen game surface. PARA then falls back to the compositor path instead of saving a distorted recording.

After recording, playback verification now also checks:

- decoded aspect ratio against the expected capture dimensions;
- decoded resolution against the expected capture resolution;
- duration sanity;
- actual playback advancement.

A capture that merely "plays" is no longer enough.

### 4. Motion capture is no longer hard-locked to 30 FPS
Canvas capture now requests 60 FPS. The recorder uses an adaptive video bitrate based on capture resolution and frame rate:

- 1080p-class at 60 FPS: about 14 Mbps
- 720p-class at 60 FPS: about 10 Mbps
- 480p-class at 60 FPS: about 7 Mbps

Lower-frame-rate streams use lower targets. This avoids using the same bitrate for every game and reduces the chance of ugly high-motion compression.

### 5. Capture version
New V58 gameplay captures are stored as `captureVersion: 9`.

### 6. Clean player files included
The bundle includes clean V57 copies of:

- `apps/para-home/src/ui/video-player.js`
- `apps/para-home/src/screens/media.js`
- `apps/para-home/src/services/capture-service.js`
- `apps/para-home/src/app.js`

Use these to overwrite any temporary `[para-player]` / `[para-gallery]` debugging versions. Do not keep diagnostic `fetch(blobUrl)` calls.

## Validation performed

- Python compile: passed for API server, gateway server, and repository tests.
- Injected game-runtime JavaScript syntax: passed with `node --check`.
- Clean PARA Home media JavaScript syntax: passed with `node --check`.
- V57 playback/replay regression: passed.
- V56 direct Media Gallery save/readback regression: passed with V58 capture version updated.
- V58 CSP regression: passed.
- V58 capture-fidelity regression: passed.

## First live test

Delete or ignore the old broken test capture and make a **new** short gameplay recording after deploying V58. Old malformed captures cannot be visually repaired by changing the recorder code after the fact.

Expected new path:

`correct visible game surface -> 60 FPS-capable direct/composited stream -> adaptive WebM encode -> aspect/resolution/playback verification -> IndexedDB -> blob: playback in Media Gallery`
