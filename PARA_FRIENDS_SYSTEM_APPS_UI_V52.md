# PARA Friends + System Apps + UI Cleanup V52

V52 turns the social, trophy, media, store-artwork, Switcher, and Files areas into a more console-like PARA experience while preserving the existing vanilla-JS shell, router, controller/focus system, V51 capture path, Python API, and Supabase integrations.

## Friends replaces Messages

- Adds a dedicated **Friends** system app and makes `#/friends` the canonical route.
- Keeps the old `#/messages` route as a compatibility alias so existing links do not break.
- Friends has a PARA friends list, presence/status, recent conversations, a conversation panel, and a working local message composer for the current PARA profile/browser.
- Existing `para.messages.v1` local data is reused so this rename does not throw away current conversations.
- The app visibly reserves future network bridges for Steam, PlayStation, Discord, Xbox, and Nintendo without pretending those network chats are already implemented.

## System apps are first-class apps

Adds a small system-app registry for:

- Friends
- Achievements
- Media Gallery
- Files
- ParaStore
- Settings

The Apps library always exposes these PARA system apps, even when the hosted web edition cannot scan native applications. Achievements and Media Gallery are no longer shortcut buttons inside the Games screen.

## Achievements are grouped by game

- The Achievements app opens to game folders/cards instead of one scattered trophy list.
- Each folder shows game art when ParaStore art is available, unlocked/total count, PARA points, and completion percentage.
- Opening a folder shows only that game's trophies.
- `All games` returns to the folder view.
- Existing local/cloud achievement progress from V49 is preserved.

## ParaStore artwork and slideshows

- Store cards prefer real developer-uploaded hero, cover, screenshot, and icon assets.
- Featured ParaStore art rotates as a slideshow when multiple assets exist.
- Product hero art also rotates as a slideshow.
- Installed ParaStore games use their real artwork in Games instead of a giant title letter.
- Home ParaStore shelves and the cart use real artwork and fall back to the PARA logo instead of a title letter.
- Store artwork is cached in `sessionStorage` for the launch transition.

## Game loading slideshow

- Shell launch transitions can show the selected game's ParaStore artwork as a slideshow.
- If launch art was not previously cached, PARA makes a short best-effort product lookup before launch and then continues even if artwork cannot be fetched.
- WEB game pages receive the published artwork list from the server and use it in their injected launch/suspend/resume/close transitions.
- Runtime activity records keep project ID and artwork so Switcher and achievement grouping can display better game identity.

## Switcher cleanup

- Running/suspended experiences are compact cards instead of long horizontal buttons.
- Resume and Close are separate controls.
- The full Switcher has a labeled Close control for each experience.
- The in-game Control Center Switcher also exposes a dedicated close button.
- Closing the currently suspended store game continues to use the existing suspended-game command bridge so the runtime can actually close, not merely disappear from UI state.

## Files no longer looks empty on the hosted web build

The native/local Files API intentionally blocks filesystem browsing when host controls are disabled. On the hosted web edition that previously looked like an empty/broken Files app.

V52 keeps native/local filesystem browsing unchanged, but when that API is unavailable the web edition now shows PARA-managed collections:

- Media Gallery
- Downloads
- Saved Data
- ParaStore content

This does **not** expose the Render server filesystem to browser users.

## Text/layout collision pass

V52 adds shared layout hardening across console screens:

- `min-width: 0` on important grid/flex copy regions;
- long text wrapping instead of escaping containers;
- action rows/buttons may wrap rather than overlap neighboring content;
- responsive Friends, Switcher, trophy-folder, Files, and store layouts;
- store/product/capture action rows can wrap on narrower windows.

## Capture status

V51 direct-renderer capture and long-error wrapping remain intact. V52 does not hide or fake a fix for any remaining game-specific blank renderer issue; capture/runtime compatibility remains a separate investigation when a renderer cannot expose usable frames.

## Verification

- `node --check` passes for every V52-changed frontend JavaScript module.
- `python -m py_compile services/api/server.py` passes.
- The server-injected WEB game runtime was extracted with V52 placeholders substituted and passes `node --check`.
- `python -m unittest tests.test_api` -> **44 passed**.
- Combined API + repository suite -> **90 passed, 1 known unrelated legacy failure**.
- The remaining failure is the pre-existing assertion that `apps/para-home/src/mock-data.js` must already have been removed from the uploaded base repository.

## Files changed by V52

- `apps/para-home/src/app.js`
- `apps/para-home/src/screen-manifest.js`
- `apps/para-home/src/screens/experiences.js`
- `apps/para-home/src/screens/files.js`
- `apps/para-home/src/screens/friends.js` (new)
- `apps/para-home/src/screens/home.js`
- `apps/para-home/src/screens/libraries.js`
- `apps/para-home/src/screens/media.js`
- `apps/para-home/src/screens/social.js`
- `apps/para-home/src/services/system-app-registry.js` (new)
- `apps/para-home/src/ui/control-center.js`
- `apps/para-home/styles.css`
- `services/api/server.py`
- `tests/test_repository.py`
