#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_RENDER_TEST_PORT="${PARA_RENDER_TEST_PORT:-4175}"
PARA_RENDER_TEST_LOG="$(mktemp -t para-render-smoke.XXXXXX)"

cleanup() {
  if [[ -n "${PARA_RENDER_TEST_PID:-}" ]]; then kill "$PARA_RENDER_TEST_PID" 2>/dev/null || true; fi
  rm -f "$PARA_RENDER_TEST_LOG"
}
trap cleanup EXIT

PORT="$PARA_RENDER_TEST_PORT" "$PARA_REPO_ROOT/scripts/render-start.sh" >"$PARA_RENDER_TEST_LOG" 2>&1 &
PARA_RENDER_TEST_PID=$!

python3 - "$PARA_RENDER_TEST_PORT" <<'PY'
import json
import sys
import time
import urllib.request

port = int(sys.argv[1])
for attempt in range(30):
    try:
        request = urllib.request.Request(f"http://127.0.0.1:{port}/api/v1/health")
        with urllib.request.urlopen(request, timeout=1) as response:
            payload = json.load(response)
            headers = response.headers
        assert payload["status"] == "ok"
        assert payload["mode"] == "public-demo"
        assert headers["X-Content-Type-Options"] == "nosniff"
        assert headers["X-Frame-Options"] == "DENY"
        print("PARA Render-mode smoke check passed")
        raise SystemExit(0)
    except Exception:
        time.sleep(0.1)
raise SystemExit("PARA Render-mode smoke check failed")
PY

