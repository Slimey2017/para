# PARA Live QA Repairs v23

Version: 0.9.15  
Build: `v23-live-qa-repairs`

This build repairs the defects confirmed by the August 28, 2026 live-site QA
pass and adds regression coverage for the repaired behavior.

## High-priority repairs

1. **Game Library empty state** now keys off the combined installed ParaStore
   titles, demos, and discovered PC games. Hidden loading/empty blocks also have
   an explicit CSS hidden rule so component display styles cannot resurrect
   them.
2. **Larger Text** now wins over Desk display scaling and changes the actual root
   typography scale.
3. **Hosted infrastructure sanitization** adds a Web Edition adapter. Consumer
   surfaces see `PARA Cloud Session`, `PARA Web Storage`, and `Browser
   connection`, never Render hostnames, container mounts, or raw interface
   names. Hosted PARA Files remains read-protected from the server filesystem.

## Medium/low repairs

- ParaStore product Back is a dedicated action and returns to the previous store
  route. Store type, genre, runtime, search, and scroll state persist during the
  product round trip.
- Settings home summaries read the active wallpaper, current gamepads, menu
  music setting/volume, profile, and online state instead of stale constants.
- Home Explore caches the last known-good published catalog and distinguishes a
  loading/unavailable state from a confirmed empty catalog.
- Store installs write completed download records. Downloads & Updates shows
  active and completed sections, completion time, Play, and View in Library.
- Setup Privacy now exposes toggle buttons for Diagnostics, Personalization, and
  Location and persists their state.
- App, Media Gallery, setup choice, and ParaStore filters expose appropriate
  `aria-pressed` or `aria-selected` state. Search and repeated show/hide/skip
  controls have meaningful accessible names.
- Notifications now persist `readAt`, support Mark all as read, and calculate
  Home and Control Center badges from unread items rather than total history.

## Current PARA specification gaps repaired

- Power context: Return Home, Sleep, Restart PARA, Shut Down, Sign Out, Recovery.
- Control Center customization: Notifications is available even when there are
  currently no new notifications.
- PARA Files: visible in Apps and Settings in every build. Web Edition keeps the
  route safe/read-protected instead of exposing host files.

## Verification

- Project validation: passed.
- Consumer UI audit: passed, 52 rendered states.
- Automated tests: 48 / 48 passed.
- Hosted-mode API smoke test: health, system, storage, network, and apps passed.
- Hosted-mode identity verified as `PARA OS Web`, `PARA Cloud Session`, and
  `v23-live-qa-repairs`.
