#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_RENDER_PORT="${PORT:-10000}"

exec python3 "$PARA_REPO_ROOT/services/api/server.py" \
  --host 0.0.0.0 \
  --port "$PARA_RENDER_PORT" \
  --allow-nonlocal
