# PARA Rate Limit + Capture Queue V54

V54 fixes PARA's recurring request-pile / HTTP 429 problem at the system level and removes the capture encoder's old "busy = 429" behavior.

## 1. Global API request resilience

`apps/para-home/src/services/para-api.js` now has one shared request policy for PARA Home:

- Limits ordinary API work to **4 concurrent requests** instead of letting screens fan out unlimited fetches.
- Deduplicates identical **in-flight GET/HEAD** requests.
- Uses short-lived GET caches so rerenders do not immediately refetch the same data.
- Gives ParaStore catalog/product/achievement lookups longer cache windows because those are common burst sources.
- Retries safe reads after HTTP **429** up to 3 times.
- Respects the server's `Retry-After` header when present.
- Falls back to exponential backoff with jitter when `Retry-After` is missing.
- Does **not** automatically retry or deduplicate mutations by default, avoiding accidental duplicate POST actions.
- Clears read caches after successful mutations so changed data can refresh normally.

Large YouTube uploads still use their dedicated progress-aware upload path. Thumbnail/background requests now share the normal concurrency gate.

## 2. Achievements no longer fan out product lookups

V53's old-game-title recovery used `Promise.allSettled()` across every missing store product.

V54 resolves those fallback products sequentially. Combined with the global GET cache/deduper, opening Achievements no longer creates its own mini request stampede.

## 3. Capture encoder now queues instead of returning 429

The old V50/V51 capture endpoint used one `BoundedSemaphore(1)`. If the encoder was already busy for two seconds, the next capture failed with:

`429 capture_encoder_busy`

V54 replaces that with a real server-side capture job queue.

New flow:

`temporary WebM upload -> 202 capture job -> queued/processing -> FFmpeg -> completed -> MP4 result`

New endpoints:

- `POST /api/v1/capture/normalize`
- `GET /api/v1/capture/normalize/status?id=<job>`
- `GET /api/v1/capture/normalize/result?id=<job>`

The encoder still processes **one FFmpeg job at a time**, but additional recordings wait in order instead of failing.

The in-game UI can now show:

- `Queued capture · 1 ahead`
- `Queued replay · 2 ahead`
- `Processing capture · creating MP4`

The queue keeps up to 8 waiting jobs and retains completed/failed job results for 30 minutes. If that safety limit is reached, the game keeps the raw Blob and waits/retries instead of surfacing a 429.

Hosted PARA still requires a signed-in PARA Account for capture processing. Loopback/local PARA keeps the existing local behavior.

## 4. What 429 still means

V54 intentionally does **not** remove legitimate anti-abuse limits such as email verification resend/attempt cooldowns. Those are real user-action limits and should remain explicit.

The recurring accidental request-burst 429s and capture-encoder busy 429 are the targets of this patch.

## Files changed

- `apps/para-home/src/services/para-api.js`
- `apps/para-home/src/screens/media.js`
- `services/api/server.py`
- `tests/test_api.py`
- `tests/test_repository.py`
- `PARA_RATE_LIMIT_CAPTURE_QUEUE_V54.md`

## Verification

- Python compile: passed.
- `node --check apps/para-home/src/services/para-api.js`: passed.
- `node --check apps/para-home/src/screens/media.js`: passed.
- Injected in-game runtime script extraction + `node --check`: passed.
- `git diff --check`: passed.
- API + repository suite: **93 passed, 0 failed**.
- Queue regression test verifies two capture jobs serialize instead of returning encoder-busy 429.
