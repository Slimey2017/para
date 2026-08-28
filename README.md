# PARA

PARA is a controller-first console/PC shell powered by Linux. This repository
contains a safe boot-to-PARA-Home experience, live Linux information, an
overlay Control Center, per-profile continuity, three installable browser demos,
Creator Playground, an installed-application launcher boundary, and PARA Files.

Startup now uses PARA's eight-second ignition signature: pure black, a violet
point, the console-button ring, the official P forming inside it, then the PARA
wordmark and “Play. Create. Connect.” First-time setup continues through all 14
chapters from Controller to Ready; configured profiles transition from the same
startup directly into their session.

PARA Home is wallpaper-first. Its only permanent navigation is Continue,
Explore, Create, and Community in one horizontal row below the branding.
Moving focus replaces the single contextual strip beneath that row. Continue
is populated only after the current profile opens a real PARA route or detected
application. It keeps the current Resume feature at the top and then shows up
to ten installed or recently used experiences in a centered vertical queue.
Successful installs enter automatically, launches move to the top without
duplicates, and removing an installed demo removes its Continue entry.
Explore, Create, and Community use the same downward content rhythm without
filling the wallpaper with permanent dashboards. System functions remain in
the Control Center and Settings instead of occupying a fifth Home section.

PARA Files is the normal file manager. A local run reads the actual home
directory, existing XDG user folders, Recent, Trash, and removable or optical
volumes reported by Linux. Its compact Details, List, Large Icons, and Small
Icons views work with controller, keyboard, and mouse. Bear Home is preserved
separately for a future direct-character exploration game and is not a file
manager route or installed app in this release.

## Run

```bash
make dev
```

Open <http://127.0.0.1:4173>. Add `?reset=1` to replay first boot.

The default local run can browse real files but cannot alter or open them.
Enable actual file opening, creation, rename, copy, move, Trash, restore, and
removable-volume actions only on a machine where you want those operations:

```bash
PARA_ENABLE_FILE_OPERATIONS=1 make dev
```

To list and launch actual Linux desktop applications on the same loopback
session:

```bash
PARA_ENABLE_APP_LAUNCH=1 make dev
```

These flags are never enabled by the Render launcher.

## Controls

- Arrow keys / D-pad / left stick: spatial navigation
- Page Up / Page Down or LB / RB: change Home section
- Enter / controller primary: select or open
- Escape / controller back: back
- Shift+F10 / controller secondary: context menu in Files
- Y / controller options: additional file options
- Tap `P` / PARA-mapped controller button: Control Center overlay
- Hold `P` / PARA-mapped controller button: suspend the current game and return to PARA Home
- Tab / Shift+Tab: focus cycle
- Mouse: select, double-click, right-click, multi-select, and drag/drop

PARA Files also supports Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A, Delete, F2, Enter,
Backspace, and address-bar input. Prompts adapt to the identified controller;
generic PARA controls remain Blue, Red, Green, and Yellow.

The Control Center is a compact bottom strip over the current experience.
Switcher reads the profile's running PARA experiences, Downloads reads actual
demo-install tasks, Sound controls PipeWire when exposed and PARA interface
audio otherwise, and Microphone uses the browser permission and media APIs.
Focusing a control reveals only its useful live context above the strip.

Published web games now use a persistent suspended-session path. Returning Home
from a running game does not unload the game document. PARA keeps that game
session alive, masks game input, pauses media, gates the normal animation-frame
game loop, and places PARA Home above it. Switcher or Continue resumes the same
JavaScript/DOM session instead of launching a fresh copy. Closing the game is a
separate action and actually removes it from the running list. This browser
prototype currently guarantees one persistent top-level web-game session at a
time; native Linux process suspension remains a later host-runtime feature.

ParaStore contains three included free demos: Pulse Pong, Neon Lane, and Violet
Step. Installing a demo persists it for that profile, reports progress through
Control Center, updates PARA demo storage, and makes the game available to
Games, Continue, Switcher, notifications, and Marks. Creator Playground saves
its sketch and notes to the same profile continuity store.

Backgrounds are configured under Settings → Personalization → Background and
saved separately for each local PARA profile. The included choices are Aurora
Current, Violet Horizon, Midnight Flow, and Matte Black. The system chooser can
also apply a PNG, JPEG, or WebP image; hosted builds retain it in IndexedDB and
local Linux sessions can retain it through the PARA API.

Power includes Return Home, Sleep, Restart PARA, Turn Off PARA, Sign Out, and
Recovery. Real Linux suspend, reboot, and poweroff calls remain off unless a
local operator deliberately starts PARA with:

```bash
PARA_ENABLE_POWER_ACTIONS=1 make dev
```

## Check and package

```bash
make check
make smoke
make render-check
make native-check
make package
```

## Render

The repository includes `render.yaml`.

- Build command: `./scripts/check.sh`
- Start command: `./scripts/render-start.sh`
- Health path: `/api/v1/health`

No Supabase project, secret, or environment variable is required. Render
provides `PORT` automatically. A hosted browser cannot access files on the
viewer’s computer, so PARA Files is available only through the local Linux
PARA API.

PARA does not modify the bootloader, partitions, firmware, kernel modules,
graphics drivers, desktop environment, or systemd configuration. Read
[PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the architecture, status, safety
policy, file inventory, and next milestones.

### PARA system input prototypes

- **ParaBoard** is PARA's controller-first on-screen keyboard. Selecting a text field with a controller opens it automatically; it supports letters, symbols, shift, space, backspace, Done, and Cancel.
- **ParaPoint** is PARA's browser pointer mode. In PARA Browser the right stick moves a system cursor, A clicks, X opens the page context action where supported, and L3 toggles pointer mode. Browser security prevents a web-hosted shell from injecting clicks into unrelated cross-origin frames; the native PARA browser runtime will remove that web-edition limitation.
