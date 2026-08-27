# PARA Direct Game Launch v9

This build removes the SPA handoff from ParaStore WEB-game launches.

## What changed

- `Play` navigates directly to `/api/v1/store/content/<catalog-id>/index.html`.
- Switcher Resume and Game Options Play use the same direct path.
- The old `store-game` route is retained only as a compatibility fallback and immediately redirects.
- Health now reports `build: v9-direct-game-launch` so a local install can prove it is running the correct build.
- Version bumped to 0.9.1.

## Verification

After replacing the repo files and restarting the local API:

`Invoke-RestMethod http://127.0.0.1:4173/api/v1/health`

must report:

- `version: 0.9.1`
- `build: v9-direct-game-launch`

If it does not, the old server/repo copy is still running.
