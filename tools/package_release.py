#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
OUTPUT = ROOT / "dist" / f"PARA-{VERSION}.zip"
SKIP_PARTS = {".git", ".para-dev", "dist", "build", "target", "__pycache__"}


def main() -> int:
    OUTPUT.parent.mkdir(exist_ok=True)
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or any(part in SKIP_PARTS for part in path.relative_to(ROOT).parts):
                continue
            archive.write(path, Path("PARA") / path.relative_to(ROOT))
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

