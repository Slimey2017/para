# PARA Game Mode v8

## Fix
PARA WEB games no longer run inside an iframe. The direct game URL was verified to work while the in-console iframe did not, so WEB titles now launch as the top-level document in the current PARA browser tab.

The API injects a small `PARA • Return to Library` control when a game is running as the top-level document. This returns to `/#/games`.

## Why
This removes iframe sandbox/frame-policy/layout interference and makes PARA use the exact runtime path already proven to load the published game.
