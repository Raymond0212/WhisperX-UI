#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

cd "$ROOT_DIR"
if [ -f ".env" ]; then
  set -a
  . ".env"
  set +a
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required."
  exit 1
fi
uv sync
BACKEND_RUNNER=(uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload)

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
  npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
wait
