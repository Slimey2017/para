# PARA Steam OpenID Login Endpoint Fix V40

- Fixes Steam **Connect** downloading an XRDS/XML discovery document instead of opening the Steam sign-in page.
- Root cause: V39 manually appended OpenID authentication parameters to Steam's discovery URL, `https://steamcommunity.com/openid/`. That URL returns the OpenID XRDS service description.
- PARA now keeps the discovery URL documented separately but sends browser authentication requests directly to the advertised Steam OpenID service URI, `https://steamcommunity.com/openid/login`.
- Server-side OpenID signature verification continues to POST `openid.mode=check_authentication` to the same `/openid/login` endpoint.
- The Steam state cookie, exact PARA callback validation, SteamID64 extraction, Supabase account link storage, and disconnect/status flow are unchanged.
- Regression tests now require the browser-facing Steam URL to resolve to `/openid/login`, preventing PARA from accidentally redirecting users to the XRDS document again.
