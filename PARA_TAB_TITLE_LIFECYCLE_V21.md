# PARA Tab Title Lifecycle v21

Version: 0.9.13  
Build: `v21-tab-title-lifecycle`

## Fix

The top-level game page remains alive while PARA Home is shown during web-game suspension. Because the browser tab belongs to that top-level page, the tab title previously continued showing the game title (for example, Slimey Battle Royale) even while the user was back in PARA Home.

V21 gives the tab title an explicit lifecycle:

- Game active: preserve/restore the game's own title.
- Game suspended and PARA Home visible: `PARA Home`.
- Game actually closed: set `PARA Home` before navigating away.
- Switching to another game: temporary `PARA` title until the next title loads.
- Resume: restore the exact title captured from the game document.

The game JavaScript/DOM session is still kept alive during suspension; only the browser-tab title changes.
