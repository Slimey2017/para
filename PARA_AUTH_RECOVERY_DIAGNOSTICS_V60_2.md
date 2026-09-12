# PARA V60.2 — Account Recovery Diagnostics

This patch layers on top of V60.1 and targets the observed `POST /api/v1/auth/recovery/request` 502.

## What the 502 actually meant
The existing `_supabase_auth_request()` already caught `URLError`, `TimeoutError`, and bad JSON and collapsed all three into HTTP 502. So the 502 did **not** prove the PARA process crashed; it meant the PARA API itself could not complete the Supabase Auth request (or could not parse its response).

## Changes
- DNS / connection / TLS-style `URLError` failures now return HTTP **503** with `account_service_unreachable`.
- Auth timeouts now return HTTP **504** with `account_service_timeout`.
- Invalid JSON from an otherwise successful Supabase response remains HTTP **502**, but is now distinguished as `account_bad_response`.
- Supabase HTTP 5xx responses are logged distinctly.
- Exact server-side failure reasons are printed to Render logs with a `[para-account]` prefix, while the browser still receives a safe message.
- Added `GET /api/v1/auth/health`, which probes Supabase Auth `/auth/v1/settings` without exposing keys or user data.
- Password recovery remains enumeration-safe.

## After deployment
1. Visit `/api/v1/auth/health` on the deployed PARA host.
2. If it returns 200 / `ok: true`, retry password recovery.
3. If it returns 503/504, inspect Render logs for the `[para-account]` line. That line will reveal whether the failure is DNS, connection, TLS, timeout, or a Supabase-side HTTP error.

No PMENU, recorder, music, capture, or game-runtime behavior is changed by this patch.
