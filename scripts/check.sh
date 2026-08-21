#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PARA_REPO_ROOT"

python3 tools/validate_project.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
bash -n scripts/*.sh recovery/*.sh platform/linux/session/*.sh
python3 -m compileall -q services tools tests

