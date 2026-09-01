# PARA Runtime Capture + Online Trophies V49

V49 fixes two separate architecture bugs uncovered by live testing.

## 1. Why the new clip still failed in Chrome and Edge

V48 hardened `apps/para-home/src/services/capture-service.js`, but gameplay recorded from the in-game PARA Control Center does **not** use that recorder. Store games receive a second MediaRecorder stack injected by `services/api/server.py`.

That runtime recorder could accept PARA's canvas/compositor stream and still produce WebM video that Chromium later refused to decode. Chrome and Edge both failing is consistent with the same Chromium media path, not proof that WebM itself is unsupported.

V49 hardens the actual in-game recorder:

- probes every candidate encoder by recording and decoding a short real sample before the recording starts;
- prefers VP8/Opus WebM, then VP9/Opus, then generic WebM;
- records ordinary captures in 1-second chunks;
- waits for MediaRecorder's real final `dataavailable`/`stop` lifecycle instead of a fixed delay;
- verifies dimensions, playback advancement, and decoded frames before saving a clip;
- first tries PARA's permission-free game compositor;
- if Chromium rejects that compositor stream, automatically falls back to browser-native self-tab capture and validates that stream too;
- never adds a new clip to Media Gallery unless the final recording passes playback validation;
- saves verified runtime clips as `captureVersion: 4`.

The fallback may ask the player once to choose **This Tab** because a hosted web app cannot silently acquire browser-native tab capture permission.

## 2. Trophies really were local

The production Supabase project already had a real achievement system: `achievement_definitions` plus `player_achievement_progress`. However, PARA Home/game runtime was only writing earned progress into local profile state. The production `player_achievement_progress` table had zero rows when V49 was audited.

V49 adds real account-backed trophy progress while keeping direct browser writes locked down:

- new authenticated API routes:
  - `GET /api/v1/achievements/progress`
  - `POST /api/v1/achievements/unlock`
  - `POST /api/v1/achievements/progress`
- PARA's backend resolves the signed-in account from the HttpOnly session;
- a new service-role-only Supabase RPC performs validated, monotonic achievement updates;
- browser/anon/authenticated database roles still cannot execute that write RPC directly;
- cloud progress is loaded when the account session/profile is restored;
- local progress newer than cloud progress stays marked `SYNC PENDING` instead of being falsely marked synced;
- the Achievements screen now visibly labels records `CLOUD SYNCED`, `SYNC PENDING`, or `LOCAL ONLY`.

The production migration `secure_online_achievement_runtime_v49` was applied to Supabase during this patch. Its execute privileges were verified as **postgres + service_role only**.

## Render secret required

`render.yaml` now declares `PARA_SUPABASE_SERVICE_ROLE_KEY` with `sync: false`.

Set the production Supabase service-role secret **directly in Render's environment settings**. Do not put that secret in source code, a commit, or chat. If the secret is absent, gameplay still works and trophies remain local/pending rather than being lost.

## What is actually online now

After V49 is deployed and the Render secret is configured, PARA Account auth, Steam links, Google/YouTube links, store/catalog data, achievement definitions, and earned trophy progress are account/cloud backed.

Not every PARA state should be cloud data. Installed/running games, downloads, and raw Media Gallery captures are device/browser-local by design. Full profile runtime/preferences, messages, input configuration, and some save/notification state still use local/host storage and would need a separate PARA Cloud State pass if cross-device sync is desired.

## Validation

- Python compile: PASS
- `app.js` syntax: PASS
- `para-api.js` syntax: PASS
- `media.js` syntax: PASS
- API tests: **43 passed**
- Repository regression tests: **43 passed, 1 pre-existing unrelated failure**
- Full suite: **86 passed, 1 pre-existing unrelated failure**

The unrelated failure is the old cleanup assertion expecting `apps/para-home/src/mock-data.js` not to exist. V49 does not touch that legacy file.

The V49 raw patch was also applied to a clean V48 package baseline with `git apply --check` before packaging.
