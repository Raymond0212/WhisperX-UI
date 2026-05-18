#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/benchmarks/diarization-fixtures"
MANIFEST="$FIXTURE_DIR/manifest.json"

echo "[benchmark] using local fixture manifest: $MANIFEST"
if [ -f "$MANIFEST" ]; then
  echo "[benchmark] PASS: local fixtures available"
  exit 0
fi

echo "[benchmark] FAIL: fixture manifest missing at $MANIFEST" >&2
exit 1
