# PARA V59.4 — Music Continuity + Living Player UI

V59.4 fixes two problems reported after the first local Music builds: audio could hiccup when moving between a running WEB game and PARA Home, and the Music screen felt visually empty and generic.

## 1. One music owner while a game is running

The previous suspended-game flow paused the game's PARA Music `<audio>` element, restored a second local player inside the suspended PARA Home iframe, then destroyed that player and restored the game player again on resume. Even when the saved timestamp was correct, that architecture could create audible gaps, repeats, or double-start behavior.

V59.4 changes the contract:

- The running game runtime remains the **single PARA Music audio host** while its suspended Home shell is open.
- `window.PARA.localMusicHost` exposes same-origin state and transport controls to the suspended Home shell.
- Suspended PARA Home reads and controls that exact parent player instead of creating another `<audio>` element.
- Opening Home over a game no longer pauses PARA Music.
- Resuming the game no longer reloads or reseeks PARA Music.
- PARA's own menu soundtrack sees the parent Music host and stays muted while that local session is active.
- Gameplay recording still excludes the PARA Music element from the game's isolated audio capture path.

## 2. Cleaner top-level WEB-game handoff

A first launch from normal PARA Home into a WEB game still replaces the browser document, so a literal DOM audio node cannot survive that one boundary. V59.4 reduces the audible jump by:

- forcing a Music handoff at the last moment before game navigation;
- saving handoff state more frequently;
- compensating the resume timestamp for elapsed transition/load time;
- doing the same compensation when a new document restores the local song.

This prevents the common "repeat the last half-second" effect. A short browser-navigation gap can still exist on the initial top-level launch because the old document is destroyed before the new one can create its audio element. The game ↔ suspended Home path no longer has that architectural gap.

## 3. Music screen redesign

The Music app now treats the current song as the hero instead of a small utility card:

- large Now Playing presentation;
- animated vinyl and equalizer while playing;
- generated per-track visual identity when artwork is unavailable;
- ambient background color derived from the current track;
- stronger title/artist hierarchy and transport controls;
- larger local-library rows with cover thumbnails;
- a two-column library on wide displays;
- cleaner local/offline messaging;
- responsive TV/monitor/mobile layouts;
- reduced-motion fallback.

## 4. Embedded MP3 metadata and artwork

PARA now reads common ID3v2 metadata locally from MP3 files:

- title (`TIT2`)
- artist (`TPE1`)
- album (`TALB`)
- embedded cover art (`APIC`)

This parsing happens entirely in the browser. Existing V59 library entries are lazily upgraded the next time the library is read, so already-imported MP3s can gain metadata/artwork without being uploaded or re-added. Filename parsing remains the fallback.

## Local-only guarantee

`apps/para-home/src/services/local-music.js` still contains no `fetch()`, XMLHttpRequest, PARA API upload path, or online music service. Music bytes and embedded artwork stay in local IndexedDB.

## Validation performed

- Frontend JavaScript syntax checks: passed for V59.4-changed modules.
- Python compile checks: passed for API, gateway, and repository tests.
- Extracted injected game-runtime JavaScript: passed `node --check`.
- Targeted V58/V59 regression group: **8 tests passed**.
- V58 HUD-preservation, blob CSP, and capture-fidelity guards remain green.
- V59 local-only, route, in-game handoff, menu-mute, and V59.4 single-host/UI guards remain green.

No claim is made that the entire repository test suite was run for this patch.
