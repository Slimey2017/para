# PARA Recovery Redirect Fix V37

- Password-recovery requests now explicitly send PARA's production URL as Supabase's `redirect_to` target: `https://para-wjvx.onrender.com/`.
- This prevents recovery emails from silently falling back to Supabase's project Site URL when that setting is still `http://localhost:3000`.
- The production URL still must be present in Supabase Authentication > URL Configuration > Redirect URLs. The recommended Site URL is also `https://para-wjvx.onrender.com/`.
- Adds a regression test that rejects any recovery request path containing `localhost`.
- V36 recovery-token handling remains unchanged: recovery URL fragments are captured, removed from browser history, and not persisted in browser storage.

Security note: any access or refresh token pasted into chat, logs, screenshots, or issue trackers should be treated as exposed. Request a fresh recovery link after fixing the redirect and complete the password reset; do not reuse an exposed recovery URL.
