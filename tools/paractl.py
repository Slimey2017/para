#!/usr/bin/env python3
"""Small unprivileged developer CLI for the PARA mock API."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def request(base: str, path: str) -> dict:
    with urllib.request.urlopen(f"{base.rstrip('/')}{path}", timeout=2) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(prog="paractl", description="Inspect a running PARA development session")
    parser.add_argument("--base", default="http://127.0.0.1:4173")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("status")
    subcommands.add_parser("services")
    component = subcommands.add_parser("component")
    component.add_argument("id")
    subcommands.add_parser("replay-first-boot")
    args = parser.parse_args()

    if args.command == "replay-first-boot":
        print(f"Open {args.base}/?reset=1 to clear browser-only prototype state.")
        return 0
    path = "/api/v1/status" if args.command == "status" else "/api/v1/services" if args.command == "services" else f"/api/v1/components/{args.id}"
    try:
        print(json.dumps(request(args.base, path), indent=2))
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"PARA development API is unavailable: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

