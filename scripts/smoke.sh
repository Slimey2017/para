#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_SMOKE_PORT="${PARA_SMOKE_PORT:-4174}"
PARA_SMOKE_LOG="$(mktemp -t para-smoke.XXXXXX)"

cleanup() {
  if [[ -n "${PARA_SMOKE_PID:-}" ]]; then kill "$PARA_SMOKE_PID" 2>/dev/null || true; fi
  rm -f "$PARA_SMOKE_LOG"
}
trap cleanup EXIT

python3 "$PARA_REPO_ROOT/services/gateway/server.py" --host 127.0.0.1 --port "$PARA_SMOKE_PORT" >"$PARA_SMOKE_LOG" 2>&1 &
PARA_SMOKE_PID=$!

python3 - "$PARA_SMOKE_PORT" <<'PY'
import json
import sys
import time
import urllib.request

port = int(sys.argv[1])
for attempt in range(30):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/v1/health", timeout=1) as response:
            payload = json.load(response)
        assert payload["status"] == "ok"
        assert payload["name"] == "para-gateway"
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/v1/capabilities", timeout=1) as response:
            capabilities = json.load(response)
        assert capabilities["personalization"] is True
        assert capabilities["files"] is True
        assert capabilities["file_operations"] is False
        assert capabilities["notifications"] is False
        print("PARA smoke check passed")
        raise SystemExit(0)
    except Exception:
        time.sleep(0.1)
raise SystemExit("PARA smoke check failed: local server did not become healthy")
PY
