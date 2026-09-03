# PARA V58 — Blob Media CSP Fix

## Root cause
The saved capture bytes are valid. PARA Home's response CSP blocked `blob:` URLs from the `<video>` element because the Home shell did not declare `media-src`. With no `media-src`, the browser fell back to `default-src 'self'` and rejected Media Gallery's `blob:` source with `MEDIA_ERR_SRC_NOT_SUPPORTED` / URL safety check errors.

The temporary diagnostic `fetch(blobUrl)` also trips `connect-src 'self'`. That diagnostic should be removed after testing; production does **not** need `connect-src blob:` for video playback.

## V58 changes
- Adds `media-src 'self' data: blob:` to normal PARA Home responses.
- Adds the same media policy to the suspended Home shell.
- Mirrors the policy in the gateway server so both serving paths behave consistently.
- Keeps `connect-src 'self'` unchanged instead of widening network permissions just for a debug fetch.
- Adds a regression test that ensures all PARA shell CSP branches allow local blob media while `connect-src` stays tight.

## Expected result after deploy
Media Gallery can load its IndexedDB-backed `blob:` video URLs directly in `<video>` without the CSP rejection. Existing valid captures do not need transcoding or byte changes.

## Temporary diagnostics cleanup
The ZIP includes clean V57 `video-player.js` and `media.js` copies. If the temporary Claude `[para-player]` / `[para-gallery]` instrumentation is still installed, restore these clean copies or remove the diagnostic-only blob `fetch()` checks. Do not add `blob:` to `connect-src` merely to silence those logs.

## Validation
- Python compile: passed.
- V58 CSP regression: passed.
- Live local HTTP header check: normal Home returned `media-src 'self' data: blob:` with `X-Frame-Options: DENY`.
- Live local suspended-shell header check: returned the same `media-src` directive with `X-Frame-Options: SAMEORIGIN`.
