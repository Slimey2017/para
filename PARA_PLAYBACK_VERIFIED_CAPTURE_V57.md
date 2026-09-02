# PARA Playback-Verified Capture V57

V57 fixes the case where PARA successfully stores video bytes but Media Gallery still cannot play them.

## What was wrong

V56 correctly removed the server-side MP4 conversion path, but the local recorder still trusted `MediaRecorder.isTypeSupported()` as if that proved the resulting file could decode. It does not. Manual recordings also kept the old timeslice/chunk pattern, and PARA Replay built one file from pieces taken out of the middle of a rolling MediaRecorder stream.

That meant PARA could reach this bad state:

`recorded bytes -> IndexedDB save succeeds -> PARA says saved -> player cannot decode the file`

## V57 changes

### 1. Real playback verification before a capture is accepted

The in-game runtime now records a short probe and actually loads it into a hidden video element. A recorder format only passes when PARA confirms:

- the recording decodes,
- the video has real dimensions,
- playback starts,
- playback time actually advances.

Recorder candidates are tried in this order:

1. VP8 WebM
2. VP9 WebM
3. generic WebM
4. the MediaRecorder default

A format reporting support is no longer enough by itself.

### 2. Manual recording is one finalized recording session

Normal gameplay recording no longer uses one-second timeslices. The recorder runs as one session and produces its finalized blob when Stop & Save is pressed.

Before Media Gallery accepts that blob, PARA performs the same real playback test. Only a verified blob is written with `playbackVerified: true`.

New local captures use `captureVersion: 8`.

### 3. Replay no longer chops the middle out of one MediaRecorder stream

PARA Replay now keeps rolling self-contained recorder segments instead of selecting arbitrary timeslice chunks from one long recording.

- Replay segment size: about 15 seconds
- Rolling buffer limit: 30 minutes
- Every segment is finalized and playback-verified before entering the replay buffer
- Saving recent gameplay stores the selected verified segments together in one Media Gallery replay item

This avoids the missing-header / discontinuous-stream problem from cutting chunks out of the middle of a MediaRecorder session.

### 4. Media Gallery can play segmented replays

The PARA video player now supports a replay playlist:

- automatically advances from one verified segment to the next,
- displays one total timeline,
- seeks across segment boundaries,
- skips forward/back across the whole replay.

The gallery hero player and fullscreen capture viewer both use the segmented playback path.

### 5. Honest exporting for segmented replay

A segmented replay is not pretended to be one uploadable WebM file. Exporting it saves numbered playable video parts. Direct YouTube upload is disabled for segmented replays until PARA has a proper single-file remux path that does not reintroduce the old converter problem.

Normal single-file gameplay recordings can still use the existing YouTube path.

## Existing broken captures

V57 prevents new captures from being marked playable unless they pass verification. It cannot reconstruct bytes from older captures that were already malformed before V57.

## Validation

- Full API + repository suite: **94 passed, 0 failed**
- PARA Home JavaScript syntax: **43 modules checked**
- Python compile: passed
- Injected in-game runtime JavaScript syntax: passed
- V57 patch applied cleanly to the V56 baseline and passed the same checks
