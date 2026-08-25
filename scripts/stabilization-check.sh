#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "[PARA] stabilization gate"
python3 tools/validate_project.py
if command -v node >/dev/null 2>&1; then
  node tools/audit_consumer_ui.mjs
  node --input-type=module --check < apps/para-home/src/app.js
  node --input-type=module --check < apps/para-home/src/ui/paraboard.js
  node --input-type=module --check < apps/para-home/src/ui/parapoint.js
  node --input-type=module --check < apps/para-home/src/ui/overlay-manager.js
fi
python3 -m unittest discover -s tests -p 'test_*.py' -v
bash -n scripts/*.sh recovery/*.sh platform/linux/session/*.sh
python3 -m compileall -q services tools tests
echo "[PARA] stabilization gate passed"
