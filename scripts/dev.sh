#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_DEV_HOST="${PARA_DEV_HOST:-127.0.0.1}"
PARA_DEV_PORT="${PARA_DEV_PORT:-4173}"

exec python3 "$PARA_REPO_ROOT/services/mock-api/server.py" --host "$PARA_DEV_HOST" --port "$PARA_DEV_PORT"

