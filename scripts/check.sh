#!/usr/bin/env bash
set -euo pipefail
PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$PARA_REPO_ROOT/scripts/stabilization-check.sh"
