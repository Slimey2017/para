# PARA V59.3 — Music Menu Soundtrack Mute Fix

V59.3 fixes PARA's normal menu/background soundtrack continuing to play underneath PARA Music.

## Root cause

PARA Music already called `suspendMenuMusic()`, but the menu-music service did not remember that suspension. `app.js` calls `syncMenuMusic()` whenever PARA renders a route. A later route render, unlock event, or menu-music volume update could therefore start the normal soundtrack again even though PARA Music still owned the background-music lane.

## Fix

- `menu-music.js` now keeps an explicit `suspended` lock.
- `suspendMenuMusic()` sets the lock before fading/pause.
- `syncMenuMusic()` refuses to play while the lock is active.
- `unlockMenuMusic()` cannot restart menu music while suspended because it routes through the locked sync path.
- Menu-music volume changes cannot wake the soundtrack while suspended.
- Ducking cannot wake or modify the soundtrack while suspended.
- `resumeMenuMusic()` is the only normal release path and clears the lock.
- PARA Music's media session now requests a short 100 ms shutdown so the two tracks do not audibly overlap.
- The cumulative patch now ships `apps/para-home/src/services/menu-music.js`; V59/V59.1/V59.2 previously relied on the base repository copy.

## Expected behavior

1. Normal PARA menu music is playing.
2. Open PARA Music and start a local song.
3. The normal PARA soundtrack fades out immediately and pauses.
4. Navigate around PARA while the local song plays: the menu soundtrack stays silent.
5. Pause the local song: the menu soundtrack stays silent because PARA Music still owns the music lane.
6. Stop/clear the PARA Music session: normal menu music may resume according to the user's menu-music setting.

## Unchanged

- Local music remains browser-local only.
- In-game music handoff remains intact.
- Gameplay recordings still exclude PARA Music.
- V58 capture/CSP/HUD fixes are untouched.

## Validation

- `node --check` passed for `menu-music.js` and `media-session.js`.
- Python repository test file compiles.
- 7 targeted V58/V59/V59.1/V59.2/V59.3 regressions passed.
