# PARA Game Transitions v16

PARA now has a system-level transition when entering and leaving ParaStore web games.

## Launch

- Selecting Play fades PARA Home into a near-black/violet launch screen.
- The current game title is shown when available.
- Menu music is suspended before the runtime loads.
- The game runtime continues the same transition and reveals gameplay smoothly instead of hard-cutting from Home.

## Return / close

- Leaving a game through Home, Hold PARA, Switcher, Notifications, Downloads, Network, Audio, Controller, Account, or Power first fades gameplay into a `Returning to PARA` transition.
- The destination PARA screen then reveals underneath the matching return transition.
- Tap PARA still opens/closes the in-game Control Center.
- Hold PARA still returns Home.

## Accessibility

Reduced-motion / OS reduced-motion settings shorten or remove movement-heavy animation while preserving the state transition.

## Build

- Version: 0.9.8
- Build: v16-game-transitions
- ParaStore game cache marker: v16
- Repository tests: 44 passed
