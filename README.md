# PARA Development Skeleton

PARA is an early, Linux-based home console/PC hybrid prototype. This repository
contains a safe boot-to-PARA-Home development experience, a full console-style
menu shell, a mock local API, native service probes, Linux user-service examples,
and documented boundaries for future hardware integration.

The prototype does **not** replace Linux, change a bootloader, install drivers,
enable system services, format storage, or modify a desktop session.

## Run it

```bash
make dev
```

Open <http://127.0.0.1:4173>. Add `?reset=1` to replay first boot. Use Arrow
keys, Enter, Escape, Tab, or a connected browser-compatible gamepad.

```bash
make check      # static, unit, and safety checks
make smoke      # start the local server and probe its health endpoint
make render-check # exercise the explicit public-demo bind and security headers
make native-check  # compile native stubs when compilers are present
```

## Deploy the public prototype on Render

The repository includes a root `render.yaml` Blueprint. After pushing PARA to
GitHub, connect that repository in Render and create a Blueprint. Render will
run the validation command, start the dependency-free Python service on its
provided `PORT`, and use `/api/v1/health` for health checks.

Public hosting enables only the same mock frontend and read-only mock API. It
does not enable accounts, purchases, hardware access, Linux services, power
controls, file access, or privileged system integration.

Start with [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) for the full architecture,
file-by-file status, limitations, safety notes, and next milestones.
