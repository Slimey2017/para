# PARA Achievement Runtime v22

Version: 0.9.14
Build: `v22-achievement-runtime`

## Added

- Public ParaStore achievement-definition endpoint backed by Supabase.
- Achievement icon proxy through PARA's existing developer-assets endpoint.
- Injected game SDK:
  - `PARA.achievements.unlock(key)`
  - `PARA.achievements.setProgress(key, value)`
  - `PARA.achievements.definitions()`
- Local-profile achievement ledger with points, progress, secret state, and unlock timestamps.
- Achievement notifications in the PARA profile runtime.
- Games > Achievements now renders real tracked achievements instead of a permanent zero/empty placeholder.
- Definition cache allows a previously loaded game's achievement definitions to remain available during the same browser session if the public catalog request briefly fails.

## Trust boundary

The browser preview does not receive Supabase service credentials and does not directly write cloud achievement progress. Cloud progress RPCs are restricted to the trusted backend. This prevents a normal game page from receiving a credential capable of granting arbitrary account achievements.

## Developer usage

```js
await PARA.achievements.unlock('first_win')
await PARA.achievements.setProgress('win_100_matches', 27)
```

The achievement key must exist and be Published in the PARA Developer Portal.
