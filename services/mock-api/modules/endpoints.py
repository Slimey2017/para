from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import platform

REPO_ROOT = Path(__file__).resolve().parents[3]


def runtime_mode() -> str:
    requested = os.environ.get("PARA_RUNTIME_MODE", "development-mock")
    return requested if requested in {"development-mock", "public-demo"} else "development-mock"


def _services() -> list[dict]:
    with (REPO_ROOT / "config" / "services.json").open(encoding="utf-8") as source:
        return json.load(source)["services"]


def health() -> dict:
    return {
        "name": "para-mock-api",
        "status": "ok",
        "mode": runtime_mode(),
        "version": (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip(),
        "time": datetime.now(timezone.utc).isoformat(),
    }


def system_status() -> dict:
    return {
        "mode": runtime_mode(),
        "linux": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
        "safe_mode": True,
        "privileged_actions_enabled": False,
        "temperature_c": None,
        "storage": {"source": "mock", "total_gb": 1000, "used_gb": 140},
    }


def services() -> dict:
    rows = _services()
    return {"source": "config/services.json", "count": len(rows), "services": rows}


def hardware() -> dict:
    return {
        "source": "read-only-development-probe",
        "hostname": platform.node(),
        "cpu_count": os.cpu_count(),
        "pulsewave": {"status": "browser-prototype", "native_pairing": False},
        "optical": {"status": "not-probed-by-mock-api"},
        "vrus": {"status": "stub", "connected": False},
    }


def bear_home() -> dict:
    names = ["Videos", "Photos", "Music", "Documents", "Downloads", "Games / UGC", "Discs", "External Drives", "Cloud", "Trash"]
    return {"source": "mock", "write_operations": False, "collections": [{"name": name, "items": 0} for name in names]}


def accounts() -> dict:
    return {"source": "mock", "authenticated": False, "profiles": [{"id": "local-dev", "display_name": "Player One", "security": "none-development-only"}]}


def store() -> dict:
    return {"source": "mock", "commerce_enabled": False, "catalog": ["Drift Signal", "Hollow Circuit", "Wildlight"]}


def component(name: str) -> dict:
    match = next((item for item in _services() if item["id"] == name), None)
    if match is None:
        return {"id": name, "status": "unknown", "source": runtime_mode()}
    return {**match, "source": runtime_mode(), "operational": match["status"] in {"working-prototype", "mock", "browser-prototype", "read-only-probe"}}


ROUTES = {
    "/api/v1/health": health,
    "/api/v1/status": system_status,
    "/api/v1/services": services,
    "/api/v1/hardware": hardware,
    "/api/v1/bear-home": bear_home,
    "/api/v1/accounts": accounts,
    "/api/v1/store": store,
}


def resolve(path: str) -> tuple[int, dict]:
    if path in ROUTES:
        return 200, ROUTES[path]()
    prefix = "/api/v1/components/"
    if path.startswith(prefix):
        return 200, component(path.removeprefix(prefix))
    return 404, {"error": "not_found", "path": path, "mode": runtime_mode()}
