# PARA Music V59.5 — Cold Boot Guard

## Bug
V59.4 restored the saved local-music handoff on every PARA Home boot. Because `restoreLocalMusicSession()` defaults to `attemptPlayback: true`, a track that had last been playing could immediately start when PARA was opened or reloaded.

## Fix
- Cold PARA Home boot/reload restores the selected track, timestamp, and saved volume in a **paused** state.
- PARA Music only auto-continues when the current tab is performing an intentional Home -> game or game -> document handoff.
- Intentional continuity uses a short-lived `sessionStorage` marker: `para.music.continue.v1`.
- The marker is consumed once and expires after 12 seconds, so stale sessions cannot trigger surprise playback later.
- Suspended Home over a living game still controls the game runtime's single persistent music player and does not create another player.
- Recorder isolation and the V59.3 normal-menu soundtrack mute lock are unchanged.

## Expected behavior
1. Play `All Of The Lights` in PARA Music.
2. Close/reload/open PARA normally: the track is remembered, but it does **not** start playing by itself.
3. Press Play: playback starts normally from the remembered position.
4. While playing, launch a WEB game from PARA Home: the song continues through the intentional handoff.
5. Open suspended PARA Home over the game and return to the game: the same runtime player continues without clone/restart behavior.

## Validation
Targeted V59–V59.5 repository checks: 6/6 passed.
`services/api/server.py` also passes Python syntax compilation.
