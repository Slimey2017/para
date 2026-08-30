# PARA Account System V27

PARA Home now has a real console-account path backed by Supabase Auth.

## Added
- First-boot **Log In** and **Create Account** buttons are active.
- Dedicated controller-friendly sign-in and sign-up screens.
- Email/password account creation and sign-in through the PARA API bridge.
- Auth tokens are kept in `HttpOnly` same-site cookies instead of browser JavaScript storage.
- Sessions automatically attempt a refresh through the refresh-token cookie.
- Account Settings shows connected identity, email verification state, local profile, display-name editing, password change, and cloud-account sign-out.
- Local/offline profiles remain available when the account service is unavailable.

## Runtime configuration
The existing Render variables are reused:
- `PARA_SUPABASE_URL`
- `PARA_SUPABASE_PUBLISHABLE_KEY`

No Supabase secret/service-role key is placed in PARA Home.

## Console architecture
The browser build uses secure server-managed cookies. A native PARA image can replace the cookie store with the OS credential/keyring service while keeping the `/api/v1/auth/*` interface unchanged.

## Native console service
The Linux user service now starts `services/api/server.py` (the same real API used by hosted PARA) and optionally reads `%h/.config/para/account.env`. A console image can provision that file with:

```text
PARA_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
PARA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The service does not need a Supabase service-role key.
