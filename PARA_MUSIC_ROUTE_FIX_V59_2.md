# PARA V59.2 — Music Route Fix

V59.2 fixes the Music app being visible in Apps but refusing to open.

## Root cause

V59/V59.1 added the Music renderer and system-app registry entry, but the cumulative patch bundle did not update `apps/para-home/src/screen-manifest.js`.

PARA's Router imports `screenIds` from that manifest. Any route missing from the manifest is redirected to Home, so `#/music` could never resolve even though `app.js` already knew how to render and activate the Music screen.

## Fix

- Registers `{ id: "music", label: "Music", group: "library" }` in `screen-manifest.js`.
- Keeps the existing Music renderer, local-only library, Control Center integration, and V59.1 in-game handoff unchanged.
- Adds a regression test that requires all three sides to agree: router manifest, renderer, and system-app registry.

## Validation

- `screen-manifest.js` JavaScript syntax: passed.
- `app.js`, `music.js`, `local-music.js`, and `libraries.js` syntax: passed.
- `tests/test_repository.py` compile: passed.
- Static route check confirms `music` is in `screenIds`, `app.js` renders it, and the system registry points to it.

No recorder code changed in V59.2.
