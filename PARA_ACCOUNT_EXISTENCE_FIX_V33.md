# PARA Account Existence Fix V33

PARA now distinguishes between an account existing and a console session being signed in.

## Fixed
- Successful sign-up immediately remembers only non-sensitive identity metadata (email/display name), never the password.
- Successful PARA Protection Services verification marks the local account record as verified.
- If verification finishes without an active Supabase session, PARA says the account was created and verified, then routes to Sign In with the email prefilled.
- Account Settings no longer says "Not signed in" in a way that implies the account does not exist. It shows "Account created" and the verification state when a known account is simply disconnected.
- First-time setup can show Created / Verified / Connected as distinct states.
- PARA checks `/api/v1/auth/session` during boot and restores the connected-account state when valid HttpOnly auth cookies exist.
- Signing out disconnects the console session without forgetting that the PARA Account exists.

No passwords, access tokens, refresh tokens, or verification codes are stored in localStorage.
