#!/usr/bin/env python3
"""Local-only PARA development server and mock API.

It serves the PARA Home files and explicit mock JSON. It never runs privileged
commands, changes Linux configuration, or writes outside browser-local state.
"""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = REPO_ROOT / "apps" / "para-home"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from modules.endpoints import resolve  # noqa: E402


class ParaHandler(SimpleHTTPRequestHandler):
    server_version = "PARADev/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_ROOT), **kwargs)

    def log_message(self, format_string: str, *args) -> None:
        sys.stdout.write(f"[para-dev] {self.address_string()} {format_string % args}\n")

    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            status, payload = resolve(path.rstrip("/"))
            self._send_json(status, payload)
            return
        super().do_GET()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve PARA Home in safe development mode")
    parser.add_argument("--host", default="127.0.0.1", help="Loopback bind address only")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--allow-nonlocal", action="store_true", help="Explicitly permit a public bind for hosted demo deployment")
    return parser.parse_args()


def validate_bind(host: str, allow_nonlocal: bool = False) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    try:
        address = ipaddress.ip_address(host)
    except ValueError as error:
        raise ValueError(f"PARA server requires a numeric address: {error}") from error
    if not address.is_loopback and not allow_nonlocal:
        raise ValueError("Refusing a non-loopback bind without --allow-nonlocal")
    return address


def main() -> int:
    args = parse_args()
    try:
        validate_bind(args.host, args.allow_nonlocal)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    server = ThreadingHTTPServer((args.host, args.port), ParaHandler)
    mode = "public demo" if args.allow_nonlocal else "local development"
    print(f"PARA Home {mode} mode: http://{args.host}:{args.port}")
    print("Mock API active. No privileged Linux integration is enabled.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
