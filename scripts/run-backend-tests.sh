#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required"
  exit 1
fi

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

. .venv/bin/activate
if ! python3 -m pip --version >/dev/null 2>&1; then
  python3 -m ensurepip --upgrade
fi
python3 -m pip install --upgrade pip
python3 -m pip install --no-build-isolation -e ".[test]"

python3 -m pytest -q
