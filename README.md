# PARA

PARA is a controller-first console/PC shell powered by Linux. This repository
contains a safe boot-to-PARA-Home experience, live read-only Linux information,
an installed-app launcher boundary, and Bear Home as a spatial 2D file explorer.

The consumer route graph contains only working destinations. Apps come from the
PARA/Linux application service; Bear Home is one built-in application. The room
art contains no baked interface—TV, shelves, record player, desk, door, storage
nook, and PARA bear are separate focusable controls.

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
- `M` / controller menu: quick menu
- Tab / Shift+Tab: focus cycle
- Mouse: hover and click

Prompts change for Xbox, PlayStation Mode, Nintendo, or PARA/generic controls.

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

- Build command: `python3 tools/validate_project.py`
- Start command: `./scripts/render-start.sh`
- Health path: `/api/v1/health`

No Supabase project, secret, or environment variable is required. Render
provides `PORT` automatically.

PARA does not modify the bootloader, partitions, firmware, kernel modules,
graphics drivers, desktop environment, or systemd configuration. Read
[PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the complete architecture, status,
safety policy, file inventory, and next milestones.
