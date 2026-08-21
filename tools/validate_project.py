#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_SCREENS = {
    "startup", "intro", "setup", "login", "profiles", "home", "games", "apps", "store",
    "bear-home", "creator", "calls", "social", "notifications", "downloads", "quick", "controller",
    "storage", "settings", "accessibility", "network", "account", "subscription", "power", "recovery",
}
REQUIRED_SERVICES = {"accounts", "bear-home", "hardware", "network", "optical", "parastore", "pulsewave", "recovery", "security", "updates", "vrus"}


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    raise SystemExit(1)


def main() -> int:
    manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
    screen_ids = set(re.findall(r'id:\s*"([^"]+)"', manifest))
    if REQUIRED_SCREENS - screen_ids:
        fail(f"missing screens: {sorted(REQUIRED_SCREENS - screen_ids)}")

    services = json.loads((ROOT / "config/services.json").read_text(encoding="utf-8"))["services"]
    service_ids = {item["id"] for item in services}
    if REQUIRED_SERVICES - service_ids:
        fail(f"missing services: {sorted(REQUIRED_SERVICES - service_ids)}")

    specs = {path.stem for path in (ROOT / "services/specs").glob("*.toml")}
    if REQUIRED_SERVICES - specs:
        fail(f"missing service specs: {sorted(REQUIRED_SERVICES - specs)}")
    for path in (ROOT / "services/specs").glob("*.toml"):
        with path.open("rb") as source:
            document = tomllib.load(source)
        if document.get("id") != path.stem:
            fail(f"service id mismatch in {path}")

    script_text = "\n".join(path.read_text(encoding="utf-8") for directory in [ROOT / "scripts", ROOT / "recovery"] for path in directory.glob("*.sh"))
    forbidden = [r"rm\s+-rf", r"mkfs\.", r"dd\s+if=", r"systemctl\s+enable", r"/boot/"]
    for pattern in forbidden:
        if re.search(pattern, script_text):
            fail(f"unsafe executable pattern found: {pattern}")

    required_files = [
        ROOT / "PROJECT_GUIDE.md",
        ROOT / "apps/para-home/index.html",
        ROOT / "apps/para-home/assets/bear-home-room.png",
        ROOT / "apps/para-home/assets/para-home-dashboard.png",
        ROOT / "services/mock-api/server.py",
        ROOT / "interfaces/openapi.yaml",
        ROOT / "render.yaml",
        ROOT / "scripts/render-start.sh",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required_files if not path.exists()]
    if missing:
        fail(f"missing required files: {missing}")
    print(f"PARA project validation passed: {len(screen_ids)} screens, {len(service_ids)} services")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
