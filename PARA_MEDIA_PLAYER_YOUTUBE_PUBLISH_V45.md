# PARA Media Player + YouTube Publish V45

V45 upgrades PARA Capture now that the end-to-end YouTube upload path is proven.

## Proper PARA video player

- Replaces the browser-default video controls in Media Gallery and the full capture viewer with a PARA player.
- Adds play/pause, 10-second skip back/forward, timeline scrubbing, elapsed/total time, mute, volume, playback speed, click-to-play, double-click fullscreen, and a fullscreen button.
- Keeps the existing WebM duration-repair behavior for MediaRecorder captures that omit useful duration metadata.
- Seeks a tiny amount into a paused capture so the Media Gallery can show a real frame instead of a dead/blank first frame when possible.
- Adds a direct **Upload to YouTube** action from both the Media Gallery hero and fullscreen capture viewer.

## YouTube publishing polish

- Adds custom thumbnail frame selection from the PARA capture itself.
- Adds tags and video category, defaulting gameplay captures to YouTube's Gaming category (`20`).
- Adds optional scheduled publishing. Scheduled videos are uploaded Private with YouTube `status.publishAt`, as required by the YouTube Data API.
- Remembers the user's normal Private / Unlisted / Public choice locally for the next upload.
- Shows real browser-to-PARA upload percentage, then changes the stage text while PARA/YouTube finish server-side processing instead of pretending that 100% means YouTube is done.
- Adds an upload-complete screen with **Open on YouTube**.
- Refreshes the connected YouTube channel snapshot after a successful upload and shows subscribers, channel views, and video count. This is groundwork for PARA Creator milestones; no $5K reward formula is invented in V45.

## Thumbnail behavior

If the user selects a frame, PARA extracts a 1280×720 JPEG after the Google OAuth return, uploads the video, then calls YouTube's custom-thumbnail endpoint for that new video. If YouTube rejects the custom thumbnail (for example because the channel is not eligible), the video remains successfully uploaded and PARA reports only the thumbnail warning.

The short-lived Google upload grant stays in server memory until the thumbnail request finishes, or until its normal timeout. PARA still does not persist a Google refresh token for upload.

## YouTube API rules reflected in V45

- Video tags are sent as `snippet.tags` and kept under YouTube's 500-character aggregate limit.
- Category is sent as `snippet.categoryId`.
- Scheduling uses `status.publishAt`, and the upload is forced to Private while scheduled.
- API uploads from an unverified YouTube API project can still be forced Private by YouTube.

## Validation

- V45-specific API + repository tests: 4 passed.
- Full `tests/test_api.py` + `tests/test_repository.py`: 80 passed, 1 pre-existing legacy failure (`apps/para-home/src/mock-data.js` is still present while the old cleanup test expects it deleted).
- `app.js`, `media.js`, `video-player.js`, and `para-api.js` pass `node --check`.
- `services/api/server.py` passes Python compilation.
