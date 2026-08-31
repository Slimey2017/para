# PARA Account Persistence Fix V34

- Supabase now mirrors every real Auth user into `public.profiles` and `public.profile_preferences`.
- Existing Auth users were backfilled into those tables.
- The profile mirror stays synced when Auth display-name metadata changes and is removed when the Auth user is deleted.
- PARA no longer treats Supabase duplicate-signup obfuscation (`identities: []`) as a newly created account.
- Duplicate signup now returns `account_exists` and PARA sends the user to Sign In with the email prefilled.
- A successful signup response now explicitly reports `account_created: true` and `persisted: true`.
