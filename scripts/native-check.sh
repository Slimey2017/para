#!/usr/bin/env bash
set -euo pipefail

PARA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARA_NATIVE_BUILD="$PARA_REPO_ROOT/.para-dev/native"
mkdir -p "$PARA_NATIVE_BUILD"

if command -v cargo >/dev/null 2>&1; then
  CARGO_TARGET_DIR="$PARA_NATIVE_BUILD/cargo" cargo check --manifest-path "$PARA_REPO_ROOT/services/native/para-hardwared/Cargo.toml"
else
  printf '%s\n' "cargo not installed; Rust probe skipped"
fi

if command -v c++ >/dev/null 2>&1; then
  c++ -std=c++17 -Wall -Wextra -Wpedantic "$PARA_REPO_ROOT/services/native/pulsewave-controller/src/main.cpp" -o "$PARA_NATIVE_BUILD/pulsewave-controller-stub"
  "$PARA_NATIVE_BUILD/pulsewave-controller-stub" --describe
else
  printf '%s\n' "C++ compiler not installed; PulseWave stub skipped"
fi

if command -v cc >/dev/null 2>&1; then
  cc -std=c11 -Wall -Wextra -Wpedantic "$PARA_REPO_ROOT/services/native/optical-disc/src/main.c" -o "$PARA_NATIVE_BUILD/para-optical-stub"
  "$PARA_NATIVE_BUILD/para-optical-stub" --describe
else
  printf '%s\n' "C compiler not installed; optical stub skipped"
fi

