# PARA V59 — Local Music Player

V59 starts PARA's built-in Music system app using the latest V58 HUD Preservation Hotfix bundle as the base.

## Goal

Keep PARA Music deliberately local-only. The browser edition imports files from the user's computer. The future console edition can replace the browser picker with PARA Files and USB-drive browsing without redesigning the player.

## Browser build features

- New **Music** system app under the Media category.
- **Find Files** opens the browser's local multi-file picker.
- **Drag and drop** local audio files directly into the Music app.
- Imported files are stored in browser-local **IndexedDB** (`para-music-library-v1`).
- No music file, filename, metadata, or playback request is sent to PARA's server.
- Persistent local song library with duplicate prevention.
- Simple filename metadata: `Artist - Title.mp3` becomes Artist + Title automatically.
- Now Playing panel with previous, play/pause, next, seek, and volume.
- Local playback survives navigation between PARA Home screens because the audio element is owned by a persistent system service, not the Music screen.
- PARA's existing media-session bridge receives title, artist, playback state, and volume.
- Control Center Now Playing can play/pause/skip and change volume.
- Browser/OS media keys are wired through the Media Session API when available.
- PARA menu music automatically yields while a user track is playing through the existing media-session service.

## Local-only guarantee

`apps/para-home/src/services/local-music.js` contains no `fetch()`, XMLHttpRequest, PARA API route, upload endpoint, or network storage code. Audio bytes are read from browser-selected `File` objects and persisted only to IndexedDB.

## Supported-file behavior

The picker accepts browser audio files plus common local extensions such as MP3, M4A/AAC, FLAC, WAV, OGG/Opus, and WebM audio. Actual decoding remains dependent on the browser/runtime's audio codec support. A decode failure is shown inline instead of uploading or converting the file.

## Future console path

The UI intentionally separates **file acquisition** from **playback**. On the real PARA console:

1. Replace browser drag/drop and `<input type=file>` with PARA Files selection.
2. Add USB-drive locations to PARA Files.
3. Pass the selected local file/stream into the same Music playback service.
4. Move the audio service into the persistent system shell so playback continues across native game launches.

No streaming accounts, discovery feeds, social music layer, or online catalog were added.

## V59.1 browser game handoff

V59.1 adds a same-origin local playback handoff for published WEB games. Before PARA Home leaves for a game, the Music service writes only playback state (track id, position, play/pause state, and volume) to local storage. The injected PARA game runtime reads the same IndexedDB music library and resumes the local track inside the game document.

- In-game Control Center now shows the real PARA Music track and provides Previous, Play/Pause, Next, and volume controls.
- Suspending a game to PARA Home hands the current song position to the suspended Home shell, then syncs it back when the game resumes.
- The normal PARA menu soundtrack remains silent whenever PARA Music owns the background-music lane, including while the local track is paused.
- PARA Music is explicitly excluded from isolated gameplay audio capture. If the browser only offers a mixed tab-audio track while local music is active, PARA prefers video-only capture rather than baking the user's song into the recording.
- Browser autoplay policy can still refuse an automatic resume after a full document navigation. In that case, the in-game Music panel shows Play and one user press resumes the already-selected local song.

## Files added

- `apps/para-home/src/screens/music.js`
- `apps/para-home/src/services/local-music.js`

## Files updated

- `apps/para-home/src/app.js`
- `apps/para-home/src/screens/libraries.js`
- `apps/para-home/src/services/system-app-registry.js`
- `apps/para-home/src/ui/control-center.js`
- `apps/para-home/styles.css`
- `tests/test_repository.py`

The cumulative ZIP also retains the V58 capture/CSP files from the latest hotfix bundle.

## Validation

- JavaScript syntax checks passed for all V59-changed modules.
- Python compile check passed for the repository regression file.
- V58 HUD preservation regression passed.
- V58 blob-media CSP regression passed.
- V58 capture-fidelity regression passed.
- V59 local-only Music regression passed.
- V59.1 in-game Music handoff regression passed.
- V59 local-music service contains no network request path.
