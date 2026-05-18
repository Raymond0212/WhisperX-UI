#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

cd "$ROOT_DIR"
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -e .
BACKEND_RUNNER=(python3 -m uvicorn whisperx_ui_backend.app:app --app-dir backend --reload)

cd "$ROOT_DIR/frontend"
npm install

cd "$ROOT_DIR"
echo "Starting backend on http://127.0.0.1:8000 and frontend on http://127.0.0.1:5173"
(
  "${BACKEND_RUNNER[@]}"
) &
BACKEND_PID=$!

(
  cd "$ROOT_DIR/frontend"
  npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
wait
