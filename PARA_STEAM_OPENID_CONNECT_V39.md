# PARA Steam OpenID Connect V39

- Makes the Steam **Connect** button in first-run Gaming Accounts actually work.
- Uses Valve's documented Steam OpenID 2.0 endpoint at `https://steamcommunity.com/openid/`.
- PARA redirects the signed-in user to Steam, receives the OpenID callback, verifies the signed response server-side with Steam using `check_authentication`, and extracts the verified SteamID64.
- PARA never receives or stores the user's Steam password.
- Adds a one-time HttpOnly `SameSite=Lax` Steam state cookie and validates the exact OpenID `return_to` value before accepting the callback.
- PARA Account session cookies are now `SameSite=Lax` so they survive a top-level return from Steam; they remain HttpOnly and Secure on HTTPS.
- Stores the Steam link in `public.gaming_accounts` using the signed-in user's Supabase JWT and Row Level Security, not a service-role key.
- Adds Steam connection status and disconnect endpoints.
- The setup screen now shows **Connected / Disconnect** for Steam when linked, **Sign in first** when the PARA Account is offline, and **Coming soon** for PlayStation, Xbox, Nintendo, and other unsupported providers.
- Adds regression tests for the Steam OpenID URL, Steam signature verification, SteamID64 extraction, account upsert behavior, UI wiring, secure cookies, and RLS migration.

## API routes

- `GET /api/v1/integrations/steam/connect`
- `GET /api/v1/integrations/steam/callback`
- `GET /api/v1/integrations/steam/status`
- `POST /api/v1/integrations/steam/disconnect`

## Supabase

The production PARA project already had `public.gaming_accounts`, but it had RLS enabled with no policies. V39's `secure_gaming_account_links` migration adds the `auth.users` foreign key, removes anonymous table access, grants authenticated CRUD, and restricts every operation to `auth.uid() = para_user_id`.

The migration was applied to production project `fqkbvxutsijruyawzxxo` while V39 was prepared. The SQL file remains in the patch for source control and future environments.

## Verification

- `python -m py_compile services/api/server.py`
- `node --check apps/para-home/src/app.js`
- `node --check apps/para-home/src/screens/boot.js`
- `node --check apps/para-home/src/services/para-api.js`
- `python -m unittest tests.test_api` -> 35 passed
- V39 repository regression test passes.
- The repository's older full `tests.test_repository` suite still contains its pre-existing assertion that `apps/para-home/src/mock-data.js` must not exist; the uploaded repository still contains that file, so that unrelated legacy test remains outside V39.
