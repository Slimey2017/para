# PARA YouTube Direct Upload V44

V44 turns the existing **PARA Share Center → YouTube** destination into a real upload flow for gameplay videos captured in PARA.

## What works

- Media Gallery gameplay clips can open a dedicated **Upload gameplay** dialog.
- The creator chooses a YouTube title, description, visibility, and whether the video is made for kids.
- Screenshots are intentionally not offered as YouTube video uploads.
- PARA requests `https://www.googleapis.com/auth/youtube.upload` only when the user chooses to upload. The normal Google / YouTube account-link flow remains read-only with `youtube.readonly`.
- Google OAuth still returns through the existing PARA callback and keeps the Google / YouTube account link synchronized.
- The temporary Google upload access token is kept only in short-lived server memory behind an opaque HttpOnly cookie. PARA does not persist a Google refresh token or put Google OAuth tokens in `public.external_accounts`.
- The selected capture remains in PARA's IndexedDB through the Google round trip, then PARA resumes the pending upload automatically.
- PARA starts a YouTube `videos.insert` resumable upload and streams the selected video to the returned YouTube upload session.
- A successful upload clears the one-shot upload session and reports the YouTube video ID / effective privacy status.

## Google Cloud setup required

The existing YouTube Data API v3 project must also have this scope added in **Google Auth Platform → Data Access**:

`https://www.googleapis.com/auth/youtube.upload`

Keep the app in Testing while developing and make sure the Google account being used is listed as a test user.

## Important YouTube behavior

YouTube documents that uploads made through `videos.insert` from unverified API projects created after July 28, 2020 are restricted to **Private** until the API project completes the applicable compliance audit. PARA surfaces that warning in the upload dialog instead of pretending Public / Unlisted is guaranteed during testing.

## Web-hosting note

V44 streams the browser upload through the PARA API server so the Google access token never needs to be exposed to PARA Home. The application-side upload cap is 2 GB, but the hosted Render service or browser/network path may enforce a lower request-size or timeout limit. Short gameplay clips are the intended first test target.

## Files changed

- `services/api/server.py`
- `apps/para-home/src/app.js`
- `apps/para-home/src/services/para-api.js`
- `apps/para-home/styles.css`
- `apps/para-home/privacy/index.html`
- `tests/test_api.py`
- `tests/test_repository.py`

## Verification

- `python -m unittest tests.test_api` → 38 passed.
- V44 repository regression test passes.
- `python -m py_compile services/api/server.py` passes.
- `node --check apps/para-home/src/app.js` passes.
- `node --check apps/para-home/src/services/para-api.js` passes.
- The repository's older full `tests.test_repository` suite still has the known unrelated `apps/para-home/src/mock-data.js` assertion failure from the uploaded base repository.
