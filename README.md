# PARA

PARA is a controller-first console/PC shell powered by Linux. This repository
contains a safe boot-to-PARA-Home experience, live Linux information, a true
overlay Control Center, per-profile backgrounds, an installed-app launcher
boundary, and Bear Home as a spatial 2D file explorer.

PARA Home is wallpaper-first: its only permanent navigation is Continue,
Explore, Create, Community, and System in one horizontal row. Moving focus
replaces the single contextual strip beneath that row. It never fills Home with
permanent dashboards, fictional activity, or invented system readings.

The consumer route graph contains only working destinations. Apps come from the
PARA/Linux application service; Bear Home is one built-in application. The room
art contains no baked interface. Room objects become focusable only when the
corresponding Linux directory or mounted device is available.

## Run

```bash
make dev
```

Open <http://127.0.0.1:4173>. Add `?reset=1` to replay first boot.

To list and launch actual Linux desktop applications on a local loopback run:

```bash
PARA_ENABLE_APP_LAUNCH=1 make dev
```

Application launch is off by default and always off on Render.

## Controls

- Arrow keys / D-pad / left stick: spatial navigation
- Enter / controller primary: select
- Escape / controller back: back
- Tap `M` / PARA-mapped controller button: Control Center overlay
- Hold `M` / PARA-mapped controller button: return to PARA Home
- Tab / Shift+Tab: focus cycle
- Mouse: hover and click

Prompts change for Xbox, PlayStation Mode, Nintendo, or PARA/generic controls.
Backgrounds are configured under Settings → Personalization → Background and
are saved separately for each local PARA profile. The built-in choices are
Aurora Current, Violet Horizon, Midnight Flow, and Matte Black. Focusing a
choice previews its supplied artwork live; Apply commits it, while Cancel
returns to the profile's saved choice. A writable local Linux session also
offers the system file chooser for a PNG, JPEG, or WebP custom background.

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
provides `PORT` automatically.

PARA does not modify the bootloader, partitions, firmware, kernel modules,
graphics drivers, desktop environment, or systemd configuration. Read
[PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the complete architecture, status,
safety policy, file inventory, and next milestones.
