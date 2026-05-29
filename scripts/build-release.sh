#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="whisperx-ui"

cd "$ROOT_DIR"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

uv sync --extra build

cd "$ROOT_DIR/frontend"
npm ci
npm run build

cd "$ROOT_DIR"

rm -rf "backend/whisperx_ui_backend/frontend_dist"
mkdir -p "backend/whisperx_ui_backend/frontend_dist"
cp -R frontend/dist/. backend/whisperx_ui_backend/frontend_dist/

uv run pyinstaller \
  --noconfirm \
  --clean \
  --name "$APP_NAME" \
  --collect-all faster_whisper \
  --collect-all pyannote.audio \
  --collect-all pyannote.core \
  --collect-all pyannote.database \
  --collect-all pyannote.metrics \
  --collect-all torch \
  --collect-all torchaudio \
  --collect-all transformers \
  --collect-all huggingface_hub \
  --add-data "backend/whisperx_ui_backend/frontend_dist:whisperx_ui_backend/frontend_dist" \
  --paths backend \
  backend/whisperx_ui_backend/__main__.py

echo "Release build is in dist/$APP_NAME"
