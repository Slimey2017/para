# PARA Privacy Policy V42

V42 adds a real public privacy policy to PARA and exposes it at:

`https://para-wjvx.onrender.com/privacy`

## What changed

- Adds a standalone PARA-styled privacy page at `apps/para-home/privacy/index.html`.
- The policy describes current PARA Account handling, Steam OpenID linking, Google / YouTube OAuth data, optional diagnostics/personalization/location choices, service providers, security, retention, disconnect behavior, and privacy requests.
- The Google / YouTube section explicitly names the current V41 scope: `https://www.googleapis.com/auth/youtube.readonly`.
- The policy explains the current V41 token behavior: Google OAuth tokens are used during the callback and are not persisted in the public account metadata table.
- Includes the Google API Services User Data Policy / Limited Use disclosure.
- Adds a small public **Privacy** link to the root PARA page so the policy is reachable from the homepage.
- Adds contextual Privacy Policy links to both the **Other Accounts** and **Privacy** steps in first-time setup.
- The API server serves both `/privacy` and `/privacy/` directly as HTML.
- Adds a repository regression test so the public privacy policy and Google-data disclosures cannot disappear silently.

## Google Auth Platform

Set the OAuth privacy policy URL to:

`https://para-wjvx.onrender.com/privacy`

The current testing-phase policy tells users to use the support contact displayed on PARA's Google authorization screen for privacy/data requests, so no personal email address is hardcoded into the repository.

## Verification

- `python -m py_compile services/api/server.py` passes.
- `node --check apps/para-home/src/screens/boot.js` passes.
- `RepositoryTests.test_public_privacy_policy_covers_connected_accounts_and_google_data` passes.
