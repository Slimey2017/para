# PARA Achievement Tracking + Notifications v24

Version: 0.9.16  
Build: `v24-achievement-tracking-notifications`

## Fixed

- Published achievement definitions are seeded into the active PARA profile as locked records when a game launches, so Games > Achievements can show the full achievement list before the player earns anything.
- Achievement progress continues to update the same records instead of creating an invisible partial ledger.
- Newly unlocked achievements now show an in-game PARA trophy card with icon/trophy, achievement name, description, and points.
- Unlocks remain in Notifications and persist to the active PARA profile.
- Achievement events are emitted on document/window and posted to a same-origin parent when one exists.
- Cached definitions also seed the local catalog during a temporary catalog outage.

## Security

The browser game still cannot grant arbitrary cloud account achievements. The web preview records local profile progress while cloud-account writes remain a trusted-backend responsibility.
