# PARA

PARA is a controller-first console/PC shell powered by Linux. This repository
contains a safe boot-to-PARA-Home experience, live Linux information, an
overlay Control Center, per-profile backgrounds, an installed-application
launcher boundary, and PARA Files.

PARA Home is wallpaper-first. Its only permanent navigation is Continue,
Explore, Create, Community, and System in one horizontal row. Moving focus
replaces the single contextual strip beneath that row; Home does not invent
activity or fill the wallpaper with permanent dashboards.

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
- Enter / controller primary: select or open
- Escape / controller back: back
- Shift+F10 / controller secondary: context menu in Files
- Y / controller options: additional file options
- Tap `M` / PARA-mapped controller button: Control Center overlay
- Hold `M` / PARA-mapped controller button: return to PARA Home
- Tab / Shift+Tab: focus cycle
- Mouse: select, double-click, right-click, multi-select, and drag/drop

PARA Files also supports Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A, Delete, F2, Enter,
Backspace, and address-bar input. Prompts adapt to the identified controller;
generic PARA controls remain Blue, Red, Green, and Yellow.

Backgrounds are configured under Settings → Personalization → Background and
saved separately for each local PARA profile. The included choices are Aurora
Current, Violet Horizon, Midnight Flow, and Matte Black. A writable local
session can also use the system chooser for a PNG, JPEG, or WebP image.

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
gateway.

PARA does not modify the bootloader, partitions, firmware, kernel modules,
graphics drivers, desktop environment, or systemd configuration. Read
[PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the architecture, status, safety
policy, file inventory, and next milestones.
