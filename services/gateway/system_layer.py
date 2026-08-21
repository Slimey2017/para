from __future__ import annotations

from base64 import b64encode
import configparser
from datetime import datetime, timezone
import os
from pathlib import Path
import platform
import shutil
import subprocess
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
_launch_enabled = False


def configure(*, launch_enabled: bool) -> None:
    global _launch_enabled
    _launch_enabled = launch_enabled


def health() -> dict[str, Any]:
    return {
        "name": "para-gateway",
        "status": "ok",
        "version": (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip(),
        "time": datetime.now(timezone.utc).isoformat(),
    }


def system_information() -> dict[str, Any]:
    return {
        "os": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "hostname": platform.node(),
        "cpu_count": os.cpu_count(),
    }


def _gb(value: int) -> float:
    return round(value / 1_000_000_000, 1)


def _mounts() -> list[dict[str, Any]]:
    ignored = {"proc", "sysfs", "tmpfs", "devtmpfs", "devpts", "cgroup", "cgroup2", "overlay", "squashfs", "securityfs", "pstore", "debugfs", "tracefs", "configfs", "fusectl", "mqueue", "hugetlbfs", "rpc_pipefs", "autofs", "binfmt_misc"}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    source = Path("/proc/mounts")
    if not source.exists():
        return rows
    for line in source.read_text(encoding="utf-8", errors="replace").splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        device, raw_mount, filesystem = fields[:3]
        mount = raw_mount.replace("\\040", " ")
        if filesystem in ignored or mount in seen:
            continue
        path = Path(mount)
        try:
            usage = shutil.disk_usage(path)
        except (OSError, PermissionError):
            continue
        seen.add(mount)
        optical = device.startswith("/dev/sr") or filesystem in {"iso9660", "udf"}
        external = optical or mount.startswith(("/media/", "/run/media/", "/mnt/"))
        rows.append({
            "name": path.name or device,
            "device": device,
            "mount": mount,
            "filesystem": filesystem,
            "external": external,
            "optical": optical,
            "total_gb": _gb(usage.total),
            "used_gb": _gb(usage.used),
            "free_gb": _gb(usage.free),
        })
    return rows


def storage() -> dict[str, Any]:
    target = Path.home()
    usage = shutil.disk_usage(target)
    return {
        "primary": {
            "name": target.name or "Home",
            "total_gb": _gb(usage.total),
            "used_gb": _gb(usage.used),
            "free_gb": _gb(usage.free),
            "used_percent": round((usage.used / usage.total) * 100) if usage.total else 0,
        },
        "mounts": _mounts(),
    }


def network() -> dict[str, Any]:
    root = Path("/sys/class/net")
    interfaces: list[dict[str, Any]] = []
    if root.exists():
        for path in sorted(root.iterdir()):
            if path.name == "lo":
                continue
            try:
                state = (path / "operstate").read_text(encoding="utf-8").strip()
            except OSError:
                state = "unknown"
            kind = "wifi" if (path / "wireless").exists() else "ethernet"
            interfaces.append({"name": path.name, "kind": kind, "state": state, "connected": state == "up"})
    return {"connected": any(item["connected"] for item in interfaces), "interfaces": interfaces}


def _xdg_directories() -> dict[str, Path]:
    home = Path.home()
    result = {
        "videos": home / "Videos",
        "music": home / "Music",
        "documents": home / "Documents",
        "downloads": home / "Downloads",
    }
    config = home / ".config" / "user-dirs.dirs"
    if config.exists():
        mapping = {"XDG_VIDEOS_DIR": "videos", "XDG_MUSIC_DIR": "music", "XDG_DOCUMENTS_DIR": "documents", "XDG_DOWNLOAD_DIR": "downloads"}
        for line in config.read_text(encoding="utf-8", errors="replace").splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            collection = mapping.get(key.strip())
            if not collection:
                continue
            clean = value.strip().strip('"').replace("$HOME", str(home))
            candidate = Path(clean).expanduser()
            if candidate.is_absolute():
                result[collection] = candidate
    return result


def directories() -> dict[str, Any]:
    rows = []
    for identifier, path in _xdg_directories().items():
        rows.append({"id": identifier, "name": identifier.title(), "available": path.is_dir(), "readable": os.access(path, os.R_OK) if path.exists() else False})
    return {"directories": rows}


def _directory_items(path: Path) -> list[dict[str, Any]]:
    if not path.is_dir() or not os.access(path, os.R_OK):
        return []
    rows = []
    try:
        entries = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold()))[:200]
    except (OSError, PermissionError):
        return []
    for entry in entries:
        try:
            stat = entry.stat()
        except (OSError, PermissionError):
            continue
        rows.append({
            "name": entry.name,
            "kind": "folder" if entry.is_dir() else "file",
            "size": None if entry.is_dir() else stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })
    return rows


def collection(identifier: str) -> tuple[int, dict[str, Any]]:
    normalized = identifier.casefold()
    xdg = _xdg_directories()
    if normalized in xdg:
        path = xdg[normalized]
        return 200, {"id": normalized, "name": normalized.title(), "available": path.is_dir(), "items": _directory_items(path)}
    if normalized in {"external", "discs"}:
        want_optical = normalized == "discs"
        if want_optical:
            mounts = [item for item in _mounts() if item["optical"]]
        else:
            mounts = [item for item in _mounts() if item["external"] and not item["optical"]]
        return 200, {"id": normalized, "name": "Discs" if want_optical else "External Drives", "available": bool(mounts), "items": [{"name": item["name"], "kind": "drive", "size": None, "modified": None, "free_gb": item["free_gb"]} for item in mounts]}
    return 404, {"error": "collection_not_found"}


def _application_dirs() -> list[Path]:
    roots = [Path.home() / ".local/share/applications", Path("/usr/local/share/applications"), Path("/usr/share/applications")]
    for base in os.environ.get("XDG_DATA_DIRS", "").split(":"):
        if base:
            roots.append(Path(base) / "applications")
    unique: list[Path] = []
    for root in roots:
        if root not in unique:
            unique.append(root)
    return unique


def _icon_path(icon: str) -> Path | None:
    if not icon:
        return None
    direct = Path(icon)
    if direct.is_file():
        return direct
    names = [icon] if Path(icon).suffix else [f"{icon}.png", f"{icon}.svg", f"{icon}.xpm"]
    bases = [Path.home() / ".local/share/icons/hicolor", Path("/usr/share/icons/hicolor")]
    sizes = ["256x256", "128x128", "96x96", "64x64", "48x48", "scalable"]
    for base in bases:
        for size in sizes:
            for name in names:
                candidate = base / size / "apps" / name
                if candidate.is_file():
                    return candidate
    for base in [Path("/usr/share/pixmaps"), Path("/usr/local/share/pixmaps")]:
        for name in names:
            candidate = base / name
            if candidate.is_file():
                return candidate
    return None


def _icon_data(icon: str) -> str | None:
    path = _icon_path(icon)
    if not path:
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) > 1_000_000:
        return None
    mime = {".svg": "image/svg+xml", ".png": "image/png", ".xpm": "image/x-xpixmap"}.get(path.suffix.casefold())
    return f"data:{mime};base64,{b64encode(data).decode('ascii')}" if mime else None


def _category(raw: str) -> str:
    values = set(filter(None, raw.split(";")))
    if values & {"AudioVideo", "Audio", "Video", "Game"}:
        return "Entertainment"
    return "Tools"


def _desktop_entries() -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    if not _launch_enabled or not shutil.which("gio"):
        return entries
    for root in _application_dirs():
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.desktop")):
            identifier = f"linux:{path.name}"
            if identifier in entries:
                continue
            parser = configparser.ConfigParser(interpolation=None, strict=False)
            try:
                parser.read(path, encoding="utf-8")
                entry = parser["Desktop Entry"]
            except (OSError, KeyError, configparser.Error):
                continue
            if entry.get("Type", "Application") != "Application" or entry.getboolean("NoDisplay", fallback=False) or entry.getboolean("Hidden", fallback=False):
                continue
            name = entry.get("Name", "").strip()
            if not name:
                continue
            try_exec = entry.get("TryExec", "").strip()
            if try_exec and not shutil.which(try_exec):
                continue
            entries[identifier] = {
                "id": identifier,
                "name": name,
                "category": _category(entry.get("Categories", "")),
                "icon": _icon_data(entry.get("Icon", "").strip()),
                "launch": {"kind": "linux"},
                "_desktop_file": str(path),
            }
    return entries


def applications() -> dict[str, Any]:
    built_in = {"id": "para:bear-home", "name": "Bear Home", "category": "Tools", "icon": None, "launch": {"kind": "route", "route": "bear-home"}}
    linux = [{key: value for key, value in item.items() if not key.startswith("_")} for item in _desktop_entries().values()]
    apps = [built_in, *linux]
    categories = [name for name in ["All Apps", "Entertainment", "Tools"] if name == "All Apps" or any(item["category"] == name for item in apps)]
    return {"applications": apps, "categories": categories}


def launch_application(identifier: str) -> tuple[int, dict[str, Any]]:
    app = _desktop_entries().get(identifier)
    if not app:
        return 404, {"error": "application_not_available"}
    gio = shutil.which("gio")
    if not gio:
        return 503, {"error": "launcher_unavailable"}
    try:
        subprocess.Popen([gio, "launch", app["_desktop_file"]], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        return 503, {"error": "launch_failed"}
    return 202, {"accepted": True, "id": identifier}
