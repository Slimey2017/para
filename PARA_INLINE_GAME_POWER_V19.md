# PARA Inline Game Power v19

Version: 0.9.11
Build: `v19-inline-game-power`

## Fix
The in-game Control Center Power context no longer shows a single `Open Power Menu` launcher.

It now mirrors PARA Home with three direct power actions:

- Sleep
- Restart PARA
- Shut Down

Selecting one hands control to the suspended PARA shell so the running game is preserved while the existing PARA power experience handles the action. Restart and shutdown continue to use the system-level confirmation/sequence behavior rather than directly terminating the game.

## Related fixes
- Game launch cache marker updated to v19.
- Suspended shell accepts trusted same-origin power commands only.
- Hosted restart completion returns the top-level PARA runtime to the intro instead of restarting only the embedded shell frame.
- Poweroff completion closes the game runtime record while leaving the shutdown screen in control.
- Regression coverage verifies the three in-game power buttons and removal of the obsolete `Open Power Menu` button.

## Validation
- Project validation passed.
- Consumer UI audit passed.
- 44/44 tests passed.
