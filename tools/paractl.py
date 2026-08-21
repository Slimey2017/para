#!/usr/bin/env python3
"""Small unprivileged CLI for inspecting the PARA Linux gateway."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def request(base: str, path: str) -> dict:
    with urllib.request.urlopen(f"{base.rstrip('/')}{path}", timeout=2) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(prog="paractl", description="Inspect a running PARA session")
    parser.add_argument("--base", default="http://127.0.0.1:4173")
    parser.add_argument("command", choices=["health", "system", "storage", "network", "apps", "directories", "replay-first-boot"])
    args = parser.parse_args()

    if args.command == "replay-first-boot":
        print(f"Open {args.base}/?reset=1 to clear PARA interface preferences.")
        return 0
    try:
        print(json.dumps(request(args.base, f"/api/v1/{args.command}"), indent=2))
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"PARA gateway is unavailable: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
