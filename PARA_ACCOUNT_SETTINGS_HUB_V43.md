# PARA Account Settings Hub V43

- Rebuilds the Account screen from a sparse profile/password page into a full account settings hub.
- Keeps the PARA Account hero, but adds clear connection, verification, and current-local-profile status.
- Adds a real Profile section with display-name editing and email verification state.
- Expands Security with both in-session password changes and password-recovery email delivery.
- Adds Connected Services directly to Account settings. Steam and Google / YouTube status are loaded from the existing signed-in integration APIs and can be connected or disconnected in place.
- Google / YouTube cards show the linked channel and channel statistics when available.
- Adds shortcuts for PARA Marks, the public Privacy Policy, and local profile management.
- Gives sign-out its own clear session section instead of presenting it as an equal-sized random tile.
- Remembers when an integration was launched from Account settings so Steam/Google callbacks return to Account instead of dumping the user back into first-run setup.
- Adds responsive styling for desktop, tablet, and narrow screens.
- No new account secrets are stored in the browser and no new backend credential surface is introduced.
