from __future__ import annotations

from base64 import b64encode
import configparser
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tempfile
import time
from typing import Any
from urllib.parse import quote, unquote, urlparse
import xml.etree.ElementTree as ElementTree

REPO_ROOT = Path(__file__).resolve().parents[2]
_launch_enabled = False
_controls_enabled = False
_power_enabled = False
_file_operations_enabled = False

BACKGROUND_SELECTIONS = {"para-default", "para-aurora", "para-horizon", "para-midnight", "solid-black", "custom"}
BACKGROUND_FITS = {"fill", "fit", "center", "stretch"}
HOME_WIDGETS = {"network", "storage", "system"}
CONTROL_CENTER_ITEMS = {"home", "switcher", "notifications", "downloads", "captures", "music", "network", "audio", "microphone", "controllers", "profile", "power"}


def configure(*, launch_enabled: bool, controls_enabled: bool = False, power_enabled: bool = False, file_operations_enabled: bool = False) -> None:
    global _launch_enabled, _controls_enabled, _power_enabled, _file_operations_enabled
    _launch_enabled = launch_enabled
    _controls_enabled = controls_enabled
    _power_enabled = power_enabled
    _file_operations_enabled = file_operations_enabled


def health() -> dict[str, Any]:
    return {
        "name": "para-api",
        "status": "ok",
        "version": (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip(),
        "build": "v20-silent-game-recording",
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
    gio_available = shutil.which("gio") is not None
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
        "friends": False,
        "downloads": False,
        "music": False,
        "power": "system" if power_available else "session",
        "power_actions": ["suspend", "reboot", "poweroff"] if power_available else [],
        "files": _controls_enabled,
        "file_open": _file_operations_enabled and gio_available,
        "file_operations": _file_operations_enabled,
        "trash": _file_operations_enabled and gio_available,
        "volume_actions": _file_operations_enabled and shutil.which("udisksctl") is not None,
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
            "order": _string_list(control_center.get("order"), CONTROL_CENTER_ITEMS, ["home", "switcher", "notifications", "downloads", "captures", "music", "network", "audio", "microphone", "controllers", "profile", "power"]),
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
        "desktop": home / "Desktop",
        "documents": home / "Documents",
        "downloads": home / "Downloads",
        "pictures": home / "Pictures",
        "videos": home / "Videos",
        "music": home / "Music",
    }
    config = home / ".config" / "user-dirs.dirs"
    if config.exists():
        mapping = {
            "XDG_DESKTOP_DIR": "desktop",
            "XDG_VIDEOS_DIR": "videos",
            "XDG_MUSIC_DIR": "music",
            "XDG_DOCUMENTS_DIR": "documents",
            "XDG_DOWNLOAD_DIR": "downloads",
            "XDG_PICTURES_DIR": "pictures",
        }
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


def _display_path(path: Path) -> str:
    home = Path.home()
    try:
        relative = path.relative_to(home)
    except ValueError:
        return str(path)
    return "Home" if str(relative) == "." else f"Home/{relative}"


def _resolve_file_location(location: str) -> Path | str | None:
    value = unquote(str(location or "home")).strip()
    if not value or value == "home":
        return Path.home()
    if value in {"recent:", "trash:"}:
        return value
    if value == "internal":
        return Path("/")
    xdg = _xdg_directories()
    if value in xdg:
        return xdg[value]
    if value.startswith("~"):
        return Path(value).expanduser()
    candidate = Path(value)
    return candidate if candidate.is_absolute() else None


def _file_type(path: Path, is_directory: bool) -> str:
    if is_directory:
        return "Folder"
    mime = mimetypes.guess_type(path.name)[0]
    if mime:
        major, _, minor = mime.partition("/")
        labels = {"image": "Image", "video": "Video", "audio": "Audio", "text": "Text document", "application": minor.replace("-", " ").title()}
        return labels.get(major, mime)
    return "File"


def _file_row(path: Path, *, location: str | None = None, trash_uri: str | None = None) -> dict[str, Any] | None:
    try:
        stat = path.stat()
        is_directory = path.is_dir()
    except (OSError, PermissionError):
        return None
    return {
        "name": path.name or str(path),
        "path": str(path),
        "kind": "folder" if is_directory else "file",
        "type": _file_type(path, is_directory),
        "size": None if is_directory else stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "location": location or _display_path(path.parent),
        "hidden": path.name.startswith("."),
        "readable": os.access(path, os.R_OK),
        "writable": os.access(path, os.W_OK),
        "parent_writable": os.access(path.parent, os.W_OK),
        "trash_uri": trash_uri,
    }


def _browse_directory(path: Path) -> tuple[int, dict[str, Any]]:
    if not path.exists():
        return 404, {"error": "location_not_found"}
    if not path.is_dir() or not os.access(path, os.R_OK):
        return 403, {"error": "location_unavailable"}
    try:
        entries = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold()))[:1000]
    except (OSError, PermissionError):
        return 403, {"error": "location_unavailable"}
    items = [row for row in (_file_row(entry) for entry in entries) if row is not None]
    parent = str(path.parent) if path != path.parent else None
    return 200, {
        "location": {"id": str(path), "path": str(path), "display_path": _display_path(path), "name": path.name or "Internal Storage", "parent": parent, "kind": "folder", "writable": os.access(path, os.W_OK)},
        "items": items,
    }


def _recent_items() -> list[dict[str, Any]]:
    source = Path.home() / ".local" / "share" / "recently-used.xbel"
    if not source.is_file():
        return []
    try:
        root = ElementTree.parse(source).getroot()
    except (OSError, ElementTree.ParseError):
        return []
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for bookmark in root.iter():
        if not bookmark.tag.endswith("bookmark"):
            continue
        href = bookmark.attrib.get("href", "")
        parsed = urlparse(href)
        if parsed.scheme != "file":
            continue
        path = Path(unquote(parsed.path))
        if str(path) in seen or not path.exists():
            continue
        row = _file_row(path)
        if row:
            rows.append(row)
            seen.add(str(path))
        if len(rows) >= 200:
            break
    rows.sort(key=lambda item: item.get("modified") or "", reverse=True)
    return rows


def _trash_root() -> Path:
    return Path.home() / ".local" / "share" / "Trash"


def _trash_items() -> list[dict[str, Any]]:
    root = _trash_root()
    files = root / "files"
    info = root / "info"
    if not files.is_dir():
        return []
    rows = []
    try:
        entries = sorted(files.iterdir(), key=lambda item: item.name.casefold())[:1000]
    except (OSError, PermissionError):
        return []
    for path in entries:
        original = ""
        details = info / f"{path.name}.trashinfo"
        if details.is_file():
            parser = configparser.ConfigParser(interpolation=None)
            try:
                parser.read(details, encoding="utf-8")
                original = unquote(parser.get("Trash Info", "Path", fallback=""))
            except (OSError, configparser.Error):
                original = ""
        row = _file_row(path, location=original or "Trash", trash_uri=f"trash:///{quote(path.name)}")
        if row:
            rows.append(row)
    return rows


def _block_volumes() -> list[dict[str, Any]]:
    executable = shutil.which("lsblk")
    if not executable:
        return []
    try:
        result = subprocess.run(
            [executable, "-J", "-b", "-o", "NAME,PATH,LABEL,FSTYPE,SIZE,MOUNTPOINTS,RM,RO,TYPE,TRAN,MODEL"],
            capture_output=True,
            text=True,
            timeout=3,
            check=True,
        )
        document = json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return []
    rows: list[dict[str, Any]] = []

    def visit(node: dict[str, Any]) -> None:
        device_type = str(node.get("type") or "")
        removable = bool(node.get("rm")) or str(node.get("tran") or "").casefold() in {"usb", "mmc"}
        optical = device_type == "rom" or str(node.get("fstype") or "").casefold() in {"iso9660", "udf"}
        mountpoints = [value for value in (node.get("mountpoints") or []) if value]
        if device_type in {"part", "rom"} and (removable or optical):
            device = str(node.get("path") or "")
            label = str(node.get("label") or node.get("model") or Path(device).name or "Drive").strip()
            rows.append({
                "id": f"volume:{device}",
                "name": label,
                "device": device,
                "path": mountpoints[0] if mountpoints else None,
                "mounted": bool(mountpoints),
                "optical": optical,
                "removable": removable,
                "read_only": bool(node.get("ro")),
                "filesystem": str(node.get("fstype") or ""),
                "size": int(node.get("size") or 0),
            })
        for child in node.get("children") or []:
            if isinstance(child, dict):
                visit(child)

    for device in document.get("blockdevices") or []:
        if isinstance(device, dict):
            visit(device)
    return rows


def file_places() -> list[dict[str, Any]]:
    home = Path.home()
    rows = [{"id": "home", "name": "Home", "path": str(home), "kind": "home", "available": True}]
    labels = {"desktop": "Desktop", "documents": "Documents", "downloads": "Downloads", "pictures": "Pictures", "videos": "Videos", "music": "Music"}
    for identifier, path in _xdg_directories().items():
        if path.is_dir():
            rows.append({"id": identifier, "name": labels[identifier], "path": str(path), "kind": "folder", "available": True})
    recent_source = home / ".local" / "share" / "recently-used.xbel"
    if recent_source.is_file():
        rows.append({"id": "recent", "name": "Recent", "path": "recent:", "kind": "recent", "available": True})
    rows.append({"id": "trash", "name": "Trash", "path": "trash:", "kind": "trash", "available": True})
    rows.append({"id": "internal", "name": "Internal Storage", "path": "/", "kind": "storage", "available": True})
    volumes = _block_volumes()
    mounted_paths = {volume["path"] for volume in volumes if volume.get("path")}
    devices = {volume["device"] for volume in volumes}
    for volume in volumes:
        rows.append({**volume, "kind": "disc" if volume["optical"] else "drive", "available": volume["mounted"]})
    network_filesystems = {"nfs", "nfs4", "cifs", "smb3", "sshfs", "fuse.sshfs", "davfs", "davfs2", "fuse.rclone", "fuse.google-drive-ocamlfuse"}
    cloud_filesystems = {"davfs", "davfs2", "fuse.rclone", "fuse.google-drive-ocamlfuse"}
    for mount in _mounts():
        if mount["mount"] in mounted_paths or mount["device"] in devices:
            continue
        filesystem = mount["filesystem"].casefold()
        if filesystem in network_filesystems:
            rows.append({
                "id": f"network:{mount['mount']}",
                "name": mount["name"],
                "path": mount["mount"],
                "kind": "cloud" if filesystem in cloud_filesystems else "network",
                "available": True,
                "mounted": True,
                "device": None,
            })
        elif mount["external"]:
            rows.append({
                "id": f"mount:{mount['mount']}",
                "name": mount["name"],
                "path": mount["mount"],
                "kind": "disc" if mount["optical"] else "drive",
                "available": True,
                "mounted": True,
                "device": None,
            })
    return rows


def browse_files(location: str) -> tuple[int, dict[str, Any]]:
    if not _controls_enabled:
        return 403, {"error": "files_unavailable"}
    resolved = _resolve_file_location(location)
    if resolved is None:
        return 400, {"error": "invalid_location"}
    if resolved == "recent:":
        status, payload = 200, {"location": {"id": "recent:", "path": "recent:", "display_path": "Recent", "name": "Recent", "parent": None, "kind": "recent", "writable": False}, "items": _recent_items()}
    elif resolved == "trash:":
        status, payload = 200, {"location": {"id": "trash:", "path": "trash:", "display_path": "Trash", "name": "Trash", "parent": None, "kind": "trash", "writable": False}, "items": _trash_items()}
    else:
        status, payload = _browse_directory(resolved)
    if status == 200:
        payload["places"] = file_places()
        payload["capabilities"] = {
            "open": _file_operations_enabled and shutil.which("gio") is not None,
            "write": _file_operations_enabled,
            "trash": _file_operations_enabled and shutil.which("gio") is not None,
            "volumes": _file_operations_enabled and shutil.which("udisksctl") is not None,
        }
    return status, payload


def search_files(location: str, query: str) -> tuple[int, dict[str, Any]]:
    if not _controls_enabled:
        return 403, {"error": "files_unavailable"}
    term = str(query or "").strip().casefold()
    resolved = _resolve_file_location(location)
    if not term or not isinstance(resolved, Path) or not resolved.is_dir() or not os.access(resolved, os.R_OK):
        return 400, {"error": "invalid_search"}
    rows: list[dict[str, Any]] = []
    scanned = 0
    for root, directories, files in os.walk(resolved, followlinks=False):
        directories[:] = [name for name in directories if not name.startswith(".")]
        for name in [*directories, *files]:
            scanned += 1
            if term in name.casefold():
                row = _file_row(Path(root) / name)
                if row:
                    rows.append(row)
            if len(rows) >= 200 or scanned >= 20_000:
                break
        if len(rows) >= 200 or scanned >= 20_000:
            break
    return 200, {"query": query, "items": rows, "limited": len(rows) >= 200 or scanned >= 20_000}


def _requested_paths(value: Any) -> list[Path] | None:
    if not isinstance(value, list) or not 1 <= len(value) <= 100:
        return None
    paths = []
    for raw in value:
        if not isinstance(raw, str) or not raw or "\x00" in raw:
            return None
        path = Path(raw).expanduser()
        if not path.is_absolute():
            return None
        paths.append(path)
    return paths


def _safe_new_name(value: Any) -> str | None:
    name = str(value or "").strip()
    if not name or name in {".", ".."} or Path(name).name != name or "\x00" in name:
        return None
    return name


def file_action(action: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if not _file_operations_enabled:
        return 403, {"error": "file_actions_unavailable"}
    gio = shutil.which("gio")
    if action == "open":
        paths = _requested_paths(payload.get("paths"))
        if not gio or not paths or len(paths) != 1 or not paths[0].exists():
            return 400, {"error": "invalid_open_request"}
        try:
            subprocess.Popen([gio, "open", str(paths[0])], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            return 503, {"error": "open_failed"}
        return 202, {"accepted": True}
    if action in {"create-folder", "create-file"}:
        destination = Path(str(payload.get("destination") or "")).expanduser()
        name = _safe_new_name(payload.get("name"))
        if not destination.is_absolute() or not destination.is_dir() or not name:
            return 400, {"error": "invalid_create_request"}
        target = destination / name
        if target.exists():
            return 409, {"error": "name_exists"}
        try:
            target.mkdir() if action == "create-folder" else target.open("x", encoding="utf-8").close()
        except (OSError, PermissionError):
            return 403, {"error": "create_failed"}
        return 201, {"created": str(target)}
    if action == "rename":
        paths = _requested_paths(payload.get("paths"))
        name = _safe_new_name(payload.get("name"))
        if not paths or len(paths) != 1 or not paths[0].exists() or not name:
            return 400, {"error": "invalid_rename_request"}
        destination = paths[0].with_name(name)
        if destination.exists():
            return 409, {"error": "name_exists"}
        try:
            paths[0].rename(destination)
        except (OSError, PermissionError):
            return 403, {"error": "rename_failed"}
        return 200, {"renamed": str(destination)}
    if action in {"copy", "move"}:
        paths = _requested_paths(payload.get("paths"))
        destination = Path(str(payload.get("destination") or "")).expanduser()
        if not paths or not destination.is_absolute() or not destination.is_dir():
            return 400, {"error": "invalid_transfer_request"}
        targets = [destination / source.name for source in paths]
        if any(not source.exists() for source in paths) or any(target.exists() for target in targets):
            return 409, {"error": "transfer_conflict"}
        try:
            for source, target in zip(paths, targets):
                if action == "move":
                    shutil.move(str(source), str(target))
                elif source.is_dir():
                    shutil.copytree(source, target, symlinks=True)
                else:
                    shutil.copy2(source, target, follow_symlinks=False)
        except (OSError, PermissionError, shutil.Error):
            return 403, {"error": "transfer_failed"}
        return 200, {"completed": len(paths), "action": action}
    if action == "trash":
        paths = _requested_paths(payload.get("paths"))
        if not gio or not paths or any(not path.exists() for path in paths):
            return 400, {"error": "invalid_trash_request"}
        try:
            for path in paths:
                subprocess.run([gio, "trash", str(path)], capture_output=True, timeout=15, check=True)
        except (OSError, subprocess.SubprocessError):
            return 503, {"error": "trash_failed"}
        return 200, {"trashed": len(paths)}
    if action == "delete":
        paths = _requested_paths(payload.get("paths"))
        trash_root = _trash_root()
        trash_files = trash_root / "files"
        try:
            trash_parent = trash_files.resolve(strict=True)
        except OSError:
            return 400, {"error": "invalid_delete_request"}
        if not paths or any(not path.exists() or path.parent.resolve() != trash_parent for path in paths):
            return 400, {"error": "invalid_delete_request"}
        try:
            for path in paths:
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                (trash_root / "info" / f"{path.name}.trashinfo").unlink(missing_ok=True)
        except (OSError, PermissionError, shutil.Error):
            return 403, {"error": "delete_failed"}
        return 200, {"deleted": len(paths)}
    if action == "restore":
        uri = str(payload.get("trash_uri") or "")
        if not gio or not uri.startswith("trash:///"):
            return 400, {"error": "invalid_restore_request"}
        try:
            subprocess.run([gio, "trash", "--restore", uri], capture_output=True, timeout=15, check=True)
        except (OSError, subprocess.SubprocessError):
            return 503, {"error": "restore_failed"}
        return 200, {"restored": True}
    return 400, {"error": "unknown_file_action"}


def volume_action(action: str, device: str) -> tuple[int, dict[str, Any]]:
    if not _file_operations_enabled:
        return 403, {"error": "volume_actions_unavailable"}
    volume = next((item for item in _block_volumes() if item["device"] == device), None)
    udisksctl = shutil.which("udisksctl")
    if not volume or not udisksctl or action not in {"mount", "unmount", "eject"}:
        return 400, {"error": "invalid_volume_action"}
    try:
        if action == "mount":
            subprocess.run([udisksctl, "mount", "-b", device], capture_output=True, timeout=20, check=True)
        elif action == "unmount":
            subprocess.run([udisksctl, "unmount", "-b", device], capture_output=True, timeout=20, check=True)
        else:
            if volume["mounted"]:
                subprocess.run([udisksctl, "unmount", "-b", device], capture_output=True, timeout=20, check=True)
            if volume["optical"] and shutil.which("eject"):
                subprocess.run([shutil.which("eject"), device], capture_output=True, timeout=20, check=True)
            else:
                subprocess.run([udisksctl, "power-off", "-b", device], capture_output=True, timeout=20, check=True)
    except (OSError, subprocess.SubprocessError):
        return 503, {"error": "volume_action_failed"}
    return 200, {"completed": True, "action": action, "device": device}


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
    if not _launch_enabled or platform.system() != "Linux" or not shutil.which("gio"):
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


def _steam_library_roots() -> list[Path]:
    if platform.system() != "Windows":
        return []
    candidates: list[Path] = []
    for key in ["ProgramFiles(x86)", "ProgramFiles"]:
        raw = os.environ.get(key)
        if raw:
            candidates.append(Path(raw) / "Steam")
    roots: list[Path] = []
    for steam in candidates:
        if steam not in roots and steam.is_dir():
            roots.append(steam)
        libraries = steam / "steamapps" / "libraryfolders.vdf"
        if not libraries.is_file():
            continue
        try:
            text = libraries.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for raw_path in re.findall(r'"path"\s*"([^"]+)"', text):
            library = Path(raw_path.replace("\\\\", "\\"))
            if library not in roots and library.is_dir():
                roots.append(library)
    return roots


def _steam_entries() -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    if not _launch_enabled or platform.system() != "Windows":
        return entries
    for root in _steam_library_roots():
        steamapps = root / "steamapps"
        for manifest in sorted(steamapps.glob("appmanifest_*.acf")):
            try:
                text = manifest.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            appid_match = re.search(r'"appid"\s*"(\d+)"', text)
            name_match = re.search(r'"name"\s*"([^"]+)"', text)
            if not appid_match or not name_match:
                continue
            appid = appid_match.group(1)
            name = name_match.group(1).strip()
            if not name:
                continue
            identifier = f"windows:steam:{appid}"
            entries[identifier] = {
                "id": identifier,
                "name": name,
                "category": "Entertainment",
                "roles": ["game"],
                "icon": None,
                "launch": {"kind": "windows-steam", "store": "Steam"},
                "_target": f"steam://rungameid/{appid}",
            }
    return entries


def _windows_start_menu_entries() -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    if not _launch_enabled or platform.system() != "Windows":
        return entries
    roots = []
    if os.environ.get("ProgramData"):
        roots.append(Path(os.environ["ProgramData"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs")
    if os.environ.get("APPDATA"):
        roots.append(Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs")
    steam_names = {item["name"].casefold() for item in _steam_entries().values()}
    seen_names: set[str] = set()
    for root in roots:
        if not root.is_dir():
            continue
        for shortcut in sorted(root.rglob("*.lnk")):
            name = shortcut.stem.strip()
            folded = name.casefold()
            if not name or folded in seen_names or folded in steam_names:
                continue
            seen_names.add(folded)
            game_hint = any(part.casefold() in {"games", "steam", "epic games", "gog.com"} for part in shortcut.parts)
            identifier = f"windows:shortcut:{hashlib.sha256(str(shortcut).encode('utf-8')).hexdigest()[:20]}"
            entries[identifier] = {
                "id": identifier,
                "name": name,
                "category": "Entertainment" if game_hint else "Tools",
                "roles": ["game"] if game_hint else [],
                "icon": None,
                "launch": {"kind": "windows-shortcut"},
                "_target": str(shortcut),
            }
    return entries


def _system_entries() -> dict[str, dict[str, Any]]:
    if not _launch_enabled:
        return {}
    if platform.system() == "Windows":
        return {**_steam_entries(), **_windows_start_menu_entries()}
    return _desktop_entries()


def applications() -> dict[str, Any]:
    built_in = {"id": "para:files", "name": "Files", "category": "Tools", "roles": [], "icon": None, "launch": {"kind": "route", "route": "files"}}
    native = [{key: value for key, value in item.items() if not key.startswith("_")} for item in _system_entries().values()]
    apps = ([built_in] if _controls_enabled else []) + native
    categories = [name for name in ["All Apps", "Entertainment", "Tools"] if name == "All Apps" or any(item["category"] == name for item in apps)]
    return {"applications": apps, "categories": categories}


def launch_application(identifier: str) -> tuple[int, dict[str, Any]]:
    app = _system_entries().get(identifier)
    if not app:
        return 404, {"error": "application_not_available"}
    try:
        if identifier.startswith("linux:"):
            gio = shutil.which("gio")
            if not gio:
                return 503, {"error": "launcher_unavailable"}
            subprocess.Popen([gio, "launch", app["_desktop_file"]], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        elif identifier.startswith("windows:"):
            startfile = getattr(os, "startfile", None)
            if startfile is None:
                return 503, {"error": "launcher_unavailable"}
            startfile(app["_target"])
        else:
            return 400, {"error": "unsupported_launcher"}
    except OSError:
        return 503, {"error": "launch_failed"}
    return 202, {"accepted": True, "id": identifier}
