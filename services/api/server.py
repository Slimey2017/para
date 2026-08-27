#!/usr/bin/env python3
"""PARA API server for the hosted console UI and local Linux system bridge."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
import os
import urllib.error
import urllib.parse
import urllib.request
import io
import zipfile
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
HOME_ROOT = REPO_ROOT / "apps" / "para-home"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import system_layer  # noqa: E402



def _attach_store_pricing(items: list[dict]) -> list[dict]:
    """Attach public pricing to published catalog entries.

    Pricing is read server-side from project_pricing so ParaStore never relies
    on a hardcoded/storefront copy of the developer's price.
    """
    project_ids = [str(item.get("project_id") or "") for item in items if item.get("project_id")]
    if not project_ids:
        return items
    encoded_ids = ",".join(urllib.parse.quote(value, safe="-") for value in project_ids)
    status, pricing = _supabase_get_json(
        f"/rest/v1/project_pricing?select=project_id,model,price,currency,updated_at&project_id=in.({encoded_ids})"
    )
    if status >= 400 or not isinstance(pricing, list):
        return items
    by_project = {str(row.get("project_id")): row for row in pricing if row.get("project_id")}
    for item in items:
        row = by_project.get(str(item.get("project_id") or ""))
        if row:
            item["pricing"] = {
                "model": row.get("model") or "FREE",
                "price": row.get("price") or 0,
                "currency": (row.get("currency") or "USD").upper(),
                "updated_at": row.get("updated_at"),
            }
    return items


def store_catalog() -> tuple[int, dict]:
    """Read the public ParaStore catalog from Supabase without exposing keys to the browser."""
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, {"error": "catalog_not_configured", "items": []}
    url = f"{base}/rest/v1/catalog_entries?select=id,project_id,current_release_id,package_id,title,project_type,runtime,architectures,store_metadata,asset_references,download_reference,release_notes,published_at,status&status=eq.PUBLISHED&order=published_at.desc"
    request = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            items = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        return 502, {"error": "catalog_unavailable", "detail": str(error), "items": []}
    items = items if isinstance(items, list) else []
    return 200, {"source": "parastore", "items": _attach_store_pricing(items)}



def _supabase_get_json(path: str) -> tuple[int, object]:
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, {"error": "catalog_not_configured"}
    request = urllib.request.Request(f"{base}{path}", headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, {"error": "supabase_error", "detail": error.read().decode("utf-8", "replace")}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        return 502, {"error": "catalog_unavailable", "detail": str(error)}


def store_product(item_id: str) -> tuple[int, dict]:
    quoted = urllib.parse.quote(item_id, safe="")
    status, payload = _supabase_get_json(f"/rest/v1/catalog_entries?select=id,project_id,current_release_id,package_id,title,project_type,runtime,architectures,store_metadata,asset_references,download_reference,release_notes,published_at,status&id=eq.{quoted}&status=eq.PUBLISHED&limit=1")
    if status >= 400:
        return status, payload if isinstance(payload, dict) else {"error": "product_unavailable"}
    if not isinstance(payload, list) or not payload:
        return 404, {"error": "product_not_found"}
    item = payload[0]
    return 200, _attach_store_pricing([item])[0]



def store_checkout_quote(ids: list[str]) -> tuple[int, dict]:
    """Build an authoritative cart quote from published server-side prices.

    This intentionally does not create a charge. It is the safety boundary used
    before Stripe test-mode checkout is enabled.
    """
    clean = []
    for value in ids[:50]:
        value = str(value or "").strip()
        if value and value not in clean:
            clean.append(value)
    if not clean:
        return 400, {"error": "cart_empty"}
    items = []
    currency = None
    total = 0.0
    for item_id in clean:
        status, item = store_product(item_id)
        if status != 200:
            return 409, {"error": "product_unavailable", "id": item_id}
        pricing = item.get("pricing") or {}
        if str(pricing.get("model") or "FREE").upper() == "FREE":
            continue
        item_currency = str(pricing.get("currency") or "USD").upper()
        if currency and item_currency != currency:
            return 409, {"error": "mixed_currency_cart"}
        currency = item_currency
        try:
            amount = round(float(pricing.get("price") or 0), 2)
        except (TypeError, ValueError):
            return 409, {"error": "invalid_server_price", "id": item_id}
        if amount <= 0:
            return 409, {"error": "invalid_server_price", "id": item_id}
        total += amount
        items.append({"id": item.get("id"), "project_id": item.get("project_id"), "title": item.get("title"), "price": amount, "currency": item_currency})
    if not items:
        return 400, {"error": "no_paid_items"}
    return 200, {"mode": "quote_only", "currency": currency or "USD", "total": round(total, 2), "items": items}

def _storage_fetch(bucket: str, path: str) -> tuple[int, bytes, str]:
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, b"", "application/octet-stream"
    safe_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/") if part)
    request = urllib.request.Request(f"{base}/storage/v1/object/{bucket}/{safe_path}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read(), response.headers.get_content_type()
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers.get_content_type()
    except (urllib.error.URLError, TimeoutError):
        return 502, b"", "application/octet-stream"


def store_download(item_id: str) -> tuple[int, bytes, str, str]:
    status, item = store_product(item_id)
    if status != 200:
        return status, json.dumps(item).encode(), "application/json", "parastore-error.json"
    release_id = str(item.get("current_release_id") or "")
    if not release_id:
        return 409, b'{"error":"release_missing"}', "application/json", "parastore-error.json"
    status, releases = _supabase_get_json(f"/rest/v1/releases?select=id,build_id,status&id=eq.{urllib.parse.quote(release_id, safe='')}&status=eq.PUBLISHED&limit=1")
    if status >= 400 or not isinstance(releases, list) or not releases:
        return 409, b'{"error":"release_unavailable"}', "application/json", "parastore-error.json"
    build_id = str(releases[0].get("build_id") or "")
    status, files = _supabase_get_json(f"/rest/v1/build_files?select=path,byte_size,checksum_sha256&build_id=eq.{urllib.parse.quote(build_id, safe='')}&order=path.asc")
    if status >= 400 or not isinstance(files, list) or not files:
        return 409, b'{"error":"build_files_missing"}', "application/json", "parastore-error.json"
    prefix = str(item.get("download_reference") or "")
    if prefix.endswith("/index.html"):
        prefix = prefix[:-len("/index.html")]
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in files:
            relative = str(entry.get("path") or "").lstrip("/")
            if not relative or ".." in Path(relative).parts:
                continue
            file_status, body, _ = _storage_fetch("developer-builds", f"{prefix}/{relative}")
            if file_status != 200:
                return 502, json.dumps({"error": "file_download_failed", "path": relative}).encode(), "application/json", "parastore-error.json"
            archive.writestr(relative, body)
    filename = f"{str(item.get('package_id') or item.get('title') or 'para-game').replace('/', '-')}.zip"
    return 200, memory.getvalue(), "application/zip", filename


def store_content(item_id: str, relative_path: str) -> tuple[int, bytes, str]:
    """Serve one file from a published WEB build for the sandboxed PARA web runtime."""
    status, item = store_product(item_id)
    if status != 200:
        return status, json.dumps(item).encode(), "application/json"
    if str(item.get("runtime") or "") not in {"WEB", "JAVASCRIPT", "UNITY_WEBGL"}:
        return 409, b'{"error":"runtime_not_web"}', "application/json"
    release_id = str(item.get("current_release_id") or "")
    if not release_id:
        return 409, b'{"error":"release_missing"}', "application/json"
    status, releases = _supabase_get_json(f"/rest/v1/releases?select=id,build_id,status&id=eq.{urllib.parse.quote(release_id, safe='')}&status=eq.PUBLISHED&limit=1")
    if status >= 400 or not isinstance(releases, list) or not releases:
        return 409, b'{"error":"release_unavailable"}', "application/json"
    build_id = str(releases[0].get("build_id") or "")
    relative = urllib.parse.unquote(relative_path or "index.html").lstrip("/")
    if not relative or ".." in Path(relative).parts:
        return 400, b'{"error":"invalid_path"}', "application/json"
    encoded = urllib.parse.quote(relative, safe="/")
    status, files = _supabase_get_json(f"/rest/v1/build_files?select=path&build_id=eq.{urllib.parse.quote(build_id, safe='')}&path=eq.{encoded}&limit=1")
    if status >= 400 or not isinstance(files, list) or not files:
        return 404, b'{"error":"file_not_found"}', "application/json"
    prefix = str(item.get("download_reference") or "")
    if prefix.endswith("/index.html"):
        prefix = prefix[:-len("/index.html")]
    file_status, body, storage_type = _storage_fetch("developer-builds", f"{prefix}/{relative}")
    if file_status != 200:
        return file_status, body or b'{"error":"file_unavailable"}', storage_type or "application/octet-stream"
    guessed = mimetypes.guess_type(relative)[0] or storage_type or "application/octet-stream"

    # Keep WEB titles inside their PARA virtual game root instead of letting
    # ordinary root-relative links/network requests fall through to PARA Home.
    if guessed.startswith("text/html"):
        try:
            text = body.decode("utf-8")
            runtime_base = f"/api/v1/store/content/{urllib.parse.quote(item_id, safe='')}/"
            runtime_id = json.dumps(item_id)
            runtime_base_json = json.dumps(runtime_base)
            injection = (
                f'<base href="{runtime_base}">\n'
                '<script data-para-runtime>\n'
                '(() => {\n'
                f'  const BASE = {runtime_base_json};\n'
                '  const map = (value) => {\n'
                "    if (typeof value !== 'string') return value;\n"
                "    if (value === '/') return BASE;\n"
                "    if (value.startsWith('/') && !value.startsWith('/api/')) return BASE + value.replace(/^\\/+/, '');\n"
                '    return value;\n'
                '  };\n'
                '  const nativeFetch = window.fetch?.bind(window);\n'
                "  if (nativeFetch) window.fetch = (input, init) => nativeFetch(typeof input === 'string' ? map(input) : input, init);\n"
                '  const nativeOpen = XMLHttpRequest.prototype.open;\n'
                '  XMLHttpRequest.prototype.open = function(method, url, ...rest) { return nativeOpen.call(this, method, map(url), ...rest); };\n'
                "  for (const method of ['pushState', 'replaceState']) {\n"
                '    const native = history[method].bind(history);\n'
                '    history[method] = (state, unused, url) => native(state, unused, map(url));\n'
                '  }\n'
                '  const nativeWindowOpen = window.open?.bind(window);\n'
                '  if (nativeWindowOpen) window.open = (url, ...rest) => nativeWindowOpen(map(url), ...rest);\n'
                "  document.addEventListener('click', (event) => {\n"
                "    const anchor = event.target.closest?.('a[href]');\n"
                "    if (!anchor) return;\n"
                "    const raw = anchor.getAttribute('href');\n"
                "    if (raw && raw.startsWith('/') && !raw.startsWith('/api/')) anchor.setAttribute('href', map(raw));\n"
                '  }, true);\n'
                "  document.addEventListener('submit', (event) => {\n"
                '    const form = event.target;\n'
                '    if (!(form instanceof HTMLFormElement)) return;\n'
                "    const raw = form.getAttribute('action');\n"
                "    if (raw && raw.startsWith('/') && !raw.startsWith('/api/')) form.setAttribute('action', map(raw));\n"
                '  }, true);\n'
                f"  try {{ parent.postMessage({{ type: 'para-game-runtime-ready', id: {runtime_id} }}, location.origin); }} catch (_) {{}}\n"
                '})();\n'
                '</script>'
            )
            # Rewrite the most common inline root navigations used by small
            # single-file web games. Without this, `location.href = "/"`
            # loads PARA Home inside the game frame. The runtime base keeps
            # restart/menu actions inside the published title.
            replacements = {
                'location.href = "/"': f'location.href = {runtime_base_json}',
                "location.href = '/'": f'location.href = {runtime_base_json}',
                'window.location.href = "/"': f'window.location.href = {runtime_base_json}',
                "window.location.href = '/'": f'window.location.href = {runtime_base_json}',
                'document.location.href = "/"': f'document.location.href = {runtime_base_json}',
                "document.location.href = '/'": f'document.location.href = {runtime_base_json}',
                'location.assign("/")': f'location.assign({runtime_base_json})',
                "location.assign('/')": f'location.assign({runtime_base_json})',
                'location.replace("/")': f'location.replace({runtime_base_json})',
                "location.replace('/')": f'location.replace({runtime_base_json})',
            }
            for old_nav, new_nav in replacements.items():
                text = text.replace(old_nav, new_nav)

            lower = text.lower()
            head_at = lower.find('<head')
            if head_at >= 0:
                close = text.find('>', head_at)
                if close >= 0:
                    text = text[:close + 1] + injection + text[close + 1:]
                else:
                    text = injection + text
            else:
                text = injection + text
            body = text.encode("utf-8")
            guessed = "text/html; charset=utf-8"
        except UnicodeDecodeError:
            pass

    return 200, body, guessed


def resolve(path: str, query: dict[str, list[str]] | None = None) -> tuple[int, dict]:
    routes = {
        "/api/v1/health": system_layer.health,
        "/api/v1/system": system_layer.system_information,
        "/api/v1/storage": system_layer.storage,
        "/api/v1/network": system_layer.network,
        "/api/v1/audio": system_layer.audio,
        "/api/v1/capabilities": system_layer.capabilities,
        "/api/v1/directories": system_layer.directories,
        "/api/v1/apps": system_layer.applications,
    }
    if path == "/api/v1/files/browse":
        location = (query or {}).get("path", ["home"])[0]
        return system_layer.browse_files(location)
    if path == "/api/v1/files/search":
        location = (query or {}).get("path", ["home"])[0]
        term = (query or {}).get("q", [""])[0]
        return system_layer.search_files(location, term)
    if path == "/api/v1/store/catalog":
        return store_catalog()
    if path == "/api/v1/store/product":
        return store_product((query or {}).get("id", [""])[0])
    if path == "/api/v1/personalization":
        profile = (query or {}).get("profile", [""])[0]
        return system_layer.personalization(profile)
    if path in routes:
        return 200, routes[path]()
    return 404, {"error": "not_found", "path": path}


class ParaHandler(SimpleHTTPRequestHandler):
    server_version = "PARA/0.7.2"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HOME_ROOT), **kwargs)

    def log_message(self, format_string: str, *args) -> None:
        sys.stdout.write(f"[para] {self.address_string()} {format_string % args}\n")

    def end_headers(self) -> None:
        is_store_game = self.path.startswith("/api/v1/store/content/")
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        if is_store_game:
            self.send_header("Content-Security-Policy", "sandbox allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
            self.send_header("X-Frame-Options", "SAMEORIGIN")
        else:
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(), usb=()")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str | None = None) -> None:
        try:
            body = path.read_bytes()
        except OSError:
            self._send_json(404, {"error": "not_found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self, maximum: int = 65_536) -> dict | None:
        if self.headers.get_content_type() != "application/json":
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length < 2 or length > maximum:
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def do_GET(self) -> None:  # noqa: N802
        request = urlparse(self.path)
        if request.path == "/api/v1/backgrounds/custom":
            profile = parse_qs(request.query).get("profile", [""])[0]
            path, content_type = system_layer.custom_background_path(profile)
            if path is None:
                self._send_json(404, {"error": "not_found"})
            else:
                self._send_file(path, content_type)
            return
        if request.path.startswith("/api/v1/store/content/"):
            rest = request.path[len("/api/v1/store/content/"):]
            item_id, _, relative = rest.partition("/")
            status, body, content_type = store_content(urllib.parse.unquote(item_id), relative or "index.html")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if request.path == "/api/v1/store/asset":
            path = parse_qs(request.query).get("path", [""])[0]
            status, body, content_type = _storage_fetch("developer-assets", path)
            if status != 200:
                self._send_json(status, {"error": "asset_unavailable"})
            else:
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=300")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        if request.path == "/api/v1/store/download":
            item_id = parse_qs(request.query).get("id", [""])[0]
            status, body, content_type, filename = store_download(item_id)
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if request.path.startswith("/api/"):
            status, payload = resolve(request.path.rstrip("/"), parse_qs(request.query))
            self._send_json(status, payload)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        request = urlparse(self.path)
        if request.path == "/api/v1/backgrounds/custom":
            profile = parse_qs(request.query).get("profile", [""])[0]
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length < 1 or length > 12_000_000:
                self._send_json(400, {"error": "invalid_image"})
                return
            status, result = system_layer.save_custom_background(profile, self.headers.get_content_type(), self.rfile.read(length))
            self._send_json(status, result)
            return

        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"error": "invalid_request"})
            return
        if request.path == "/api/v1/apps/launch":
            status, result = system_layer.launch_application(str(payload.get("id", "")))
        elif request.path == "/api/v1/store/checkout/quote":
            ids = payload.get("ids") if isinstance(payload.get("ids"), list) else []
            status, result = store_checkout_quote(ids)
        elif request.path == "/api/v1/audio":
            status, result = system_layer.set_audio(str(payload.get("kind", "")), volume=payload.get("volume"), muted=payload.get("muted"))
        elif request.path == "/api/v1/personalization":
            status, result = system_layer.save_personalization(str(payload.get("profile", "")), payload.get("preferences"))
        elif request.path == "/api/v1/power":
            status, result = system_layer.request_power_action(str(payload.get("action", "")))
        elif request.path == "/api/v1/files/action":
            status, result = system_layer.file_action(str(payload.get("action", "")), payload)
        elif request.path == "/api/v1/volumes/action":
            status, result = system_layer.volume_action(str(payload.get("action", "")), str(payload.get("device", "")))
        else:
            self._send_json(404, {"error": "not_found"})
            return
        self._send_json(status, result)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve PARA Home and the PARA API")
    parser.add_argument("--host", default="127.0.0.1", help="Numeric bind address")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--allow-nonlocal", action="store_true", help="Permit a hosted public bind")
    parser.add_argument("--enable-app-launch", action="store_true", help="Expose and launch discovered Linux desktop applications")
    parser.add_argument("--enable-power-actions", action="store_true", help="Permit fixed suspend, reboot, and poweroff requests on a local bind")
    parser.add_argument("--enable-file-operations", action="store_true", help="Permit file opening, file changes, Trash, and volume actions on a local bind")
    return parser.parse_args()


def validate_bind(host: str, allow_nonlocal: bool = False):
    try:
        address = ipaddress.ip_address(host)
    except ValueError as error:
        raise ValueError(f"PARA server requires a numeric address: {error}") from error
    if not address.is_loopback and not allow_nonlocal:
        raise ValueError("Refusing a non-loopback bind without --allow-nonlocal")
    return address


def main() -> int:
    args = parse_args()
    validate_bind(args.host, args.allow_nonlocal)
    launch_enabled = args.enable_app_launch and not args.allow_nonlocal
    power_enabled = args.enable_power_actions and not args.allow_nonlocal
    file_operations_enabled = args.enable_file_operations and not args.allow_nonlocal
    controls_enabled = not args.allow_nonlocal
    system_layer.configure(
        launch_enabled=launch_enabled,
        controls_enabled=controls_enabled,
        power_enabled=power_enabled,
        file_operations_enabled=file_operations_enabled,
    )
    server = ThreadingHTTPServer((args.host, args.port), ParaHandler)
    print(f"PARA API + Home: http://{args.host}:{args.port}")
    print("Linux application launch is enabled." if launch_enabled else "Linux application launch is off.")
    print("Linux power actions are enabled." if power_enabled else "Linux power actions are off.")
    print("Linux file operations are enabled." if file_operations_enabled else "Linux file operations are read-only.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
