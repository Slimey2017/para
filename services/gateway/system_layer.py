from __future__ import annotations

from base64 import b64encode
import configparser
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import time
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
_launch_enabled = False
_controls_enabled = False
_power_enabled = False

BACKGROUND_SELECTIONS = {"para-default", "para-aurora", "para-horizon", "para-midnight", "solid-black", "custom"}
BACKGROUND_FITS = {"fill", "fit", "center", "stretch"}
HOME_WIDGETS = {"network", "storage", "system"}
CONTROL_CENTER_ITEMS = {"home", "switcher", "notifications", "network", "audio", "microphone", "controllers", "profile", "settings", "power"}


def configure(*, launch_enabled: bool, controls_enabled: bool = False, power_enabled: bool = False) -> None:
    global _launch_enabled, _controls_enabled, _power_enabled
    _launch_enabled = launch_enabled
    _controls_enabled = controls_enabled
    _power_enabled = power_enabled


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


def _profile_key(profile: str) -> str:
    return hashlib.sha256(profile.strip().encode("utf-8")).hexdigest()[:20]


def _config_root() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "para" / "profiles"


def _data_root() -> Path:
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "para" / "backgrounds"


def _preferences_path(profile: str) -> Path:
    return _config_root() / _profile_key(profile) / "personalization.json"


def _safe_profile(profile: str) -> bool:
    return 0 < len(profile.strip()) <= 80


def capabilities() -> dict[str, Any]:
    audio_state = audio()
    power_available = _power_enabled and shutil.which("systemctl") is not None
    return {
        "personalization": _controls_enabled,
        "custom_backgrounds": _controls_enabled,
        "audio": audio_state["available"],
        "microphone": audio_state["available"] and audio_state.get("microphone") is not None,
        "network": Path("/sys/class/net").exists(),
        "storage": True,
        "controllers": "browser-gamepad",
        "notifications": False,
        "switcher": False,
        "power": "system" if power_available else "session",
        "power_actions": ["suspend", "reboot", "poweroff"] if power_available else [],
    }


def request_power_action(action: str) -> tuple[int, dict[str, Any]]:
    operations = {
        "suspend": ["systemctl", "suspend"],
        "reboot": ["systemctl", "reboot"],
        "poweroff": ["systemctl", "poweroff"],
    }
    command = operations.get(action)
    executable = shutil.which("systemctl")
    if not _power_enabled or not executable:
        return 403, {"error": "power_unavailable"}
    if command is None:
        return 400, {"error": "invalid_power_action"}
    command[0] = executable
    try:
        subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError:
        return 503, {"error": "power_action_failed"}
    return 202, {"accepted": True, "action": action}


def personalization(profile: str) -> tuple[int, dict[str, Any]]:
    if not _safe_profile(profile):
        return 400, {"error": "invalid_profile"}
    path = _preferences_path(profile)
    if not path.is_file():
        return 200, {"writable": _controls_enabled, "preferences": None}
    try:
        preferences = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 503, {"error": "preferences_unavailable"}
    return 200, {"writable": _controls_enabled, "preferences": preferences}


def _string_list(value: Any, allowed: set[str], fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback
    result = []
    for item in value:
        if isinstance(item, str) and item in allowed and item not in result:
            result.append(item)
    return result


def _validated_preferences(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    background = value.get("background", {})
    home = value.get("home", {})
    control_center = value.get("controlCenter", {})
    if not all(isinstance(section, dict) for section in [background, home, control_center]):
        return None
    selection = background.get("selection", "para-aurora")
    fit = background.get("fit", "fill")
    if selection not in BACKGROUND_SELECTIONS or fit not in BACKGROUND_FITS:
        return None
    try:
        dim = max(0, min(80, int(background.get("dim", 42))))
        blur = max(0, min(24, int(background.get("blur", 18))))
        revision = max(0, int(background.get("revision", 0)))
    except (TypeError, ValueError):
        return None
    return {
        "background": {"selection": selection, "fit": fit, "dim": dim, "blur": blur, "revision": revision},
        "home": {
            "order": _string_list(home.get("order"), HOME_WIDGETS, ["network", "storage", "system"]),
            "hidden": _string_list(home.get("hidden"), HOME_WIDGETS, []),
        },
        "controlCenter": {
            "order": _string_list(control_center.get("order"), CONTROL_CENTER_ITEMS, ["home", "switcher", "notifications", "network", "audio", "microphone", "controllers", "profile", "settings", "power"]),
            "hidden": _string_list(control_center.get("hidden"), CONTROL_CENTER_ITEMS, []),
        },
    }


def save_personalization(profile: str, value: Any) -> tuple[int, dict[str, Any]]:
    if not _controls_enabled:
        return 403, {"error": "write_unavailable"}
    if not _safe_profile(profile):
        return 400, {"error": "invalid_profile"}
    preferences = _validated_preferences(value)
    if preferences is None:
        return 400, {"error": "invalid_preferences"}
    if preferences["background"]["selection"] == "custom" and custom_background_path(profile)[0] is None:
        return 409, {"error": "custom_background_missing"}
    path = _preferences_path(profile)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as target:
            json.dump(preferences, target, separators=(",", ":"))
            target.flush()
            os.fsync(target.fileno())
            temporary = Path(target.name)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except OSError:
        return 503, {"error": "preferences_unavailable"}
    return 200, {"saved": True, "preferences": preferences}


def _image_type(content_type: str, data: bytes) -> tuple[str, str] | None:
    if content_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png", "image/png"
    if content_type in {"image/jpeg", "image/jpg"} and data.startswith(b"\xff\xd8\xff"):
        return ".jpg", "image/jpeg"
    if content_type == "image/webp" and len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp", "image/webp"
    return None


def save_custom_background(profile: str, content_type: str, data: bytes) -> tuple[int, dict[str, Any]]:
    if not _controls_enabled:
        return 403, {"error": "write_unavailable"}
    if not _safe_profile(profile) or not data or len(data) > 12_000_000:
        return 400, {"error": "invalid_image"}
    image_type = _image_type(content_type, data)
    if image_type is None:
        return 415, {"error": "unsupported_image"}
    extension, mime = image_type
    root = _data_root()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = _profile_key(profile)
    destination = root / f"{key}{extension}"
    try:
        with tempfile.NamedTemporaryFile("wb", dir=root, delete=False) as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
            temporary = Path(target.name)
        os.chmod(temporary, 0o600)
        os.replace(temporary, destination)
        for suffix in [".png", ".jpg", ".webp"]:
            previous = root / f"{key}{suffix}"
            if previous != destination and previous.exists():
                previous.unlink()
    except OSError:
        return 503, {"error": "image_unavailable"}
    return 201, {"saved": True, "mime_type": mime, "revision": int(time.time() * 1000)}


def custom_background_path(profile: str) -> tuple[Path | None, str | None]:
    if not _safe_profile(profile):
        return None, None
    root = _data_root()
    key = _profile_key(profile)
    for suffix, mime in [(".png", "image/png"), (".jpg", "image/jpeg"), (".webp", "image/webp")]:
        path = root / f"{key}{suffix}"
        if path.is_file():
            return path, mime
    return None, None


def _wpctl_status(target: str) -> dict[str, Any] | None:
    executable = shutil.which("wpctl")
    if not _controls_enabled or not executable:
        return None
    try:
        result = subprocess.run([executable, "get-volume", target], capture_output=True, text=True, timeout=1, check=True)
    except (OSError, subprocess.SubprocessError):
        return None
    words = result.stdout.strip().split()
    try:
        volume = round(float(words[1]) * 100)
    except (IndexError, ValueError):
        return None
    return {"volume": max(0, min(100, volume)), "muted": "[MUTED]" in result.stdout}


def audio() -> dict[str, Any]:
    output = _wpctl_status("@DEFAULT_AUDIO_SINK@")
    microphone = _wpctl_status("@DEFAULT_AUDIO_SOURCE@")
    return {"available": output is not None or microphone is not None, "output": output, "microphone": microphone}


def set_audio(kind: str, *, volume: Any = None, muted: Any = None) -> tuple[int, dict[str, Any]]:
    executable = shutil.which("wpctl")
    targets = {"output": "@DEFAULT_AUDIO_SINK@", "microphone": "@DEFAULT_AUDIO_SOURCE@"}
    target = targets.get(kind)
    if not _controls_enabled or not executable or target is None:
        return 404, {"error": "audio_unavailable"}
    command: list[str] | None = None
    if volume is not None:
        try:
            level = max(0, min(100, int(volume)))
        except (TypeError, ValueError):
            return 400, {"error": "invalid_volume"}
        command = [executable, "set-volume", target, f"{level}%"]
    elif isinstance(muted, bool):
        command = [executable, "set-mute", target, "1" if muted else "0"]
    if command is None:
        return 400, {"error": "invalid_audio_action"}
    try:
        subprocess.run(command, capture_output=True, timeout=1, check=True)
    except (OSError, subprocess.SubprocessError):
        return 503, {"error": "audio_action_failed"}
    return 200, audio()


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


def _application_roles(raw: str, name: str) -> list[str]:
    categories = set(filter(None, raw.split(";")))
    normalized_name = name.casefold()
    creator_names = {
        "blender", "godot", "unity", "unreal", "krita", "gimp", "inkscape",
        "kdenlive", "davinci resolve", "openshot", "shotcut", "audacity", "ardour",
        "obs studio", "visual studio code", "vscodium", "kate", "geany",
    }
    roles: list[str] = []
    if "Game" in categories:
        roles.append("game")
    creator_category = bool(categories & {"Development", "IDE", "AudioVideoEditing", "2DGraphics", "3DGraphics", "VectorGraphics", "RasterGraphics"})
    creator_name = any(normalized_name == candidate or normalized_name.startswith(f"{candidate} ") for candidate in creator_names)
    if creator_category or creator_name:
        roles.append("creator")
    return roles


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
            raw_categories = entry.get("Categories", "")
            entries[identifier] = {
                "id": identifier,
                "name": name,
                "category": _category(raw_categories),
                "roles": _application_roles(raw_categories, name),
                "icon": _icon_data(entry.get("Icon", "").strip()),
                "launch": {"kind": "linux"},
                "_desktop_file": str(path),
            }
    return entries


def applications() -> dict[str, Any]:
    built_in = {"id": "para:bear-home", "name": "Bear Home", "category": "Tools", "roles": [], "icon": None, "launch": {"kind": "route", "route": "bear-home"}}
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
