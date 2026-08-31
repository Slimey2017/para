# PARA Auth Project Pin V35

PARA Account authentication is now pinned to the live production PARA Supabase project `fqkbvxutsijruyawzxxo`.

Why: the account exists and is healthy in the production Supabase Auth database, while PARA was still returning `Invalid login credentials`. V34 relied entirely on Render environment variables for the Auth target, allowing a stale project URL/key pair to produce a misleading password failure.

Changes:
- Auth signup/signin/session/password/profile calls use the known PARA production Supabase URL and publishable key.
- `render.yaml` now declares the same public project URL/key.
- Sign-in failures expose only the safe project ref so a deployment mismatch is visible immediately.
- Password text remains untouched end-to-end; PARA does not trim or rewrite it.

No service-role or secret Supabase key is embedded. The pinned credential is a Supabase publishable client key.
