# PARA Google + YouTube Connect V41

V41 turns the **Other Accounts** Google placeholder into a real Google OAuth connection with YouTube read-only access.

## What works

- **Google / YouTube → Connect** is enabled for users signed into a PARA Account.
- PARA sends the browser to Google's OAuth 2.0 authorization endpoint.
- The callback uses a one-time HttpOnly `SameSite=Lax` state cookie and requires an exact state match before accepting the response.
- Requested scopes are intentionally limited to:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/youtube.readonly`
- PARA exchanges the authorization code server-side. The Google client secret never goes to PARA Home.
- During the callback, PARA reads the connected Google identity and calls YouTube Data API `channels.list` with `mine=true` to identify the user's YouTube channel.
- PARA stores account/channel metadata in `public.external_accounts`, including the YouTube channel ID, channel title, custom URL/handle, and a snapshot of subscriber, view, and video counts.
- OAuth access and refresh tokens are **not stored** in `public.external_accounts` and are never returned to the browser. V41 uses the temporary access token only during the callback.
- The setup screen changes to **Connected / Disconnect** after a successful link.
- If the Google account does not have a YouTube channel, the Google account can still be linked and PARA reports that no YouTube channel was found.
- Steam V40 behavior remains intact. PlayStation, Xbox, and Nintendo remain **Coming soon**.

## Production Supabase

The `secure_external_account_links_v41` migration was applied to PARA's production Supabase project. It creates `public.external_accounts`, enables RLS, removes anonymous table access, and adds owner-only SELECT, INSERT, UPDATE, and DELETE policies using `auth.uid() = para_user_id`.

No Google OAuth token is stored in that public table.

## Google Cloud setup required before Connect can succeed

1. Open Google Cloud Console and choose/create the project that will represent PARA.
2. Enable **YouTube Data API v3**.
3. Configure the Google OAuth consent screen / Google Auth Platform branding and audience.
4. While the app is in Testing, add the Google accounts that should be allowed to test PARA.
5. Create an OAuth client of type **Web application**.
6. Add this exact authorized redirect URI:

   `https://para-wjvx.onrender.com/api/v1/integrations/google/callback`

7. In Render, set:
   - `PARA_GOOGLE_CLIENT_ID`
   - `PARA_GOOGLE_CLIENT_SECRET`
8. Redeploy PARA and press **Connect** on Google / YouTube.

If either Render variable is missing, PARA returns to setup with a **Google setup required** message rather than exposing an empty/broken OAuth URL.

For a public production launch, Google's verification requirements may apply because PARA requests YouTube account data. Keep the app in Testing while developing and add tester accounts until the consent configuration is ready for production.

## V41 API routes

- `GET /api/v1/integrations/google/connect`
- `GET /api/v1/integrations/google/callback`
- `GET /api/v1/integrations/google/status`
- `POST /api/v1/integrations/google/disconnect`

## Creator groundwork

V41 stores a YouTube channel statistics snapshot so PARA Creator can later build milestone UI, including the proposed $5K Creator milestone. V41 does **not** implement payout eligibility or promise a payment. Those rules should be a separate Creator feature with verification, anti-fraud checks, eligibility terms, and payout administration.

## Verification

- `python -m py_compile services/api/server.py`
- `node --check apps/para-home/src/app.js`
- `node --check apps/para-home/src/screens/boot.js`
- `node --check apps/para-home/src/services/para-api.js`
- `python -m unittest tests.test_api` → 37 passed
- V41 Google/YouTube repository regression test passes.
- V40 Steam repository regression test passes.
- Full `tests.test_repository` has one older unrelated failure: the uploaded repository still contains `apps/para-home/src/mock-data.js` while the legacy cleanup test expects it to have already been removed.
