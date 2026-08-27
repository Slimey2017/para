# PARA Windows Game Launch v6

This build adds local Windows game/application launching to PARA.

## What changed

- `PARA_ENABLE_APP_LAUNCH=1` is now honored directly by `services/api/server.py`.
- On Windows, PARA scans installed Steam app manifests and exposes installed Steam titles as `game` applications.
- On Windows, PARA scans Start Menu `.lnk` shortcuts and exposes local applications.
- Steam games launch through the registered `steam://rungameid/<appid>` URI.
- Windows shortcuts launch through Windows `os.startfile` handling.
- The Games screen now loads native/local applications whose role is `game`, so installed PC games can appear beside ParaStore games and PARA demos.
- Launching a native game records it as a Game in the Continue/runtime queue rather than as an App.
- Linux `.desktop` + `gio launch` support remains intact.
- Hosted Render deployments still refuse local application launch because public/non-local binds disable host launch capability.

## Windows local command

PowerShell:

```powershell
$env:PARA_ENABLE_APP_LAUNCH="1"
python services/api/server.py --host 127.0.0.1 --port 4173
```

or explicitly:

```powershell
python services/api/server.py --host 127.0.0.1 --port 4173 --enable-app-launch
```

Expected startup message:

```text
Windows application/game launch is enabled.
```

Open `http://127.0.0.1:4173`, then go to Games.
