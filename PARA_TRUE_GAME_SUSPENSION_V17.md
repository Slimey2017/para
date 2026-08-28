# PARA True Game Suspension v17

Version: 0.9.9  
Build: `v17-true-game-suspension`

## What changed

v16 visually returned from a game to PARA Home, but the top-level game document
was destroyed during navigation. Resume therefore relaunched the title.

v17 changes the web-game runtime so Home is a real suspend operation:

1. The published game remains the top-level document and its JavaScript/DOM heap stays alive.
2. PARA records the title as `Suspended` in the active profile runtime.
3. Game input is neutralized while suspended.
4. Audio/video playback is paused.
5. `requestAnimationFrame` callbacks are held so the ordinary browser game loop stops advancing.
6. PARA Home opens above the game in a same-origin system shell.
7. Selecting the suspended title from Continue or Switcher removes the shell and resumes the same game session.
8. Closing the title is a separate action that removes it from the running list and unloads the game.

## Transitions

- Launching: `Launching`
- Home/route from game: `Suspending`
- Resume: `Resuming`
- Explicit close: `Closing Game`
- Launching another title while one is suspended: `Switching Games`

## Input behavior

- Tap `P` / PARA button: open or close Control Center.
- Hold `P` / PARA button: suspend the current game and show PARA Home.
- While suspended, the parent game receives neutral gamepad state; the PARA Home shell receives the controller normally.

## Current scope

This is true persistent session suspension for one top-level published **web game**
in the browser prototype. It preserves the actual page/JavaScript state instead
of reconstructing a save snapshot.

Native Linux games need host-level process/session suspension in the future.
Multiple simultaneously suspended top-level web games also require a dedicated
multi-runtime compositor rather than a normal browser navigation model.

## Verification

`bash scripts/stabilization-check.sh`

Expected result: project validation, consumer UI audit, and all 44 repository/API tests pass.
