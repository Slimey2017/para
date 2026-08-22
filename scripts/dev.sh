#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_DEV_HOST="${PARA_DEV_HOST:-127.0.0.1}"
PARA_DEV_PORT="${PARA_DEV_PORT:-4173}"

PARA_LAUNCH_ARGS=()
if [[ "${PARA_ENABLE_APP_LAUNCH:-0}" == "1" ]]; then
  PARA_LAUNCH_ARGS+=(--enable-app-launch)
fi

PARA_POWER_ARGS=()
if [[ "${PARA_ENABLE_POWER_ACTIONS:-0}" == "1" ]]; then
  PARA_POWER_ARGS+=(--enable-power-actions)
fi

exec python3 "$PARA_REPO_ROOT/services/gateway/server.py" \
  --host "$PARA_DEV_HOST" \
  --port "$PARA_DEV_PORT" \
  "${PARA_LAUNCH_ARGS[@]}" \
  "${PARA_POWER_ARGS[@]}"
