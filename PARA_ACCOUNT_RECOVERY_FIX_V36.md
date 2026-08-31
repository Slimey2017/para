# PARA Account Recovery Fix V36

- Adds a Forgot Password path to PARA Account Sign In.
- Password recovery uses the pinned production Supabase Auth project and the standard `/auth/v1/recover` flow.
- Recovery requests use enumeration-safe copy: PARA does not reveal whether a typed email exists.
- PARA detects Supabase recovery sessions returned in the recovery-link URL, immediately removes the token-bearing fragment from browser history, and opens a dedicated new-password screen.
- The recovery access token is kept only in memory long enough to update the password; it is not written to localStorage or sessionStorage.
- Successful password recovery restores PARA HttpOnly auth cookies and connects the recovered account to the console.
- Sign-in errors no longer display the Supabase project ref to players. The ref remains available only in browser diagnostics.
- Failed sign-ins now point directly to password recovery instead of trapping existing accounts between Sign Up and Sign In.
- Adds API and repository coverage for recovery request/completion and the recovery UI.

Deployment note: Supabase Auth must have the PARA production site URL configured correctly so the recovery email returns to PARA. The production console is `https://para-wjvx.onrender.com/`.
