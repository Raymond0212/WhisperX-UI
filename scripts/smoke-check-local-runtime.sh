#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_DATA_DIR="${APP_DATA_DIR:-$ROOT_DIR/app_data_smoke}"
HF_TOKEN="${HF_TOKEN:-}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[smoke][FAIL] python3 is required" >&2
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
python3 -m pip install --no-build-isolation -e .

mkdir -p "$APP_DATA_DIR/tmp"
export APP_DATA_DIR HF_TOKEN

python3 - <<'PY'
import json
import os
import wave
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["WHISPERX_UI_APP_DATA"] = os.environ["APP_DATA_DIR"]

from whisperx_ui_backend.app import app  # noqa: E402

sample_wav = Path(os.environ["APP_DATA_DIR"]) / "tmp" / "smoke.wav"
with wave.open(str(sample_wav), "wb") as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(16000)
    wav_file.writeframes(b"\x00\x00" * 16000)

def fail(message: str) -> None:
    print(f"[smoke][FAIL] {message}")
    raise SystemExit(1)

with TestClient(app) as client:
    health = client.get("/api/health")
    if health.status_code != 200:
        fail(f"health failed: {health.status_code} {health.text}")
    print("[smoke] Health check passed")

    with sample_wav.open("rb") as handle:
        upload = client.post(
            "/api/audio",
            files={"file": ("smoke.wav", handle, "audio/wav")},
            data={"display_title": "smoke"},
        )
    if upload.status_code != 200:
        fail(f"upload failed: {upload.status_code} {upload.text}")
    audio_id = upload.json()["id"]
    print(f"[smoke] Upload passed: {audio_id}")

    prep = client.post(
        "/api/models/prepare-basic",
        json={"profile": "basic", "transcription_model": "distil-large-v3"},
    )
    if prep.status_code != 200:
        fail(f"model prepare failed: {prep.status_code} {prep.text}")
    if prep.json().get("ready") is not True:
        fail(f"model prepare not ready: {prep.text}")
    print("[smoke] Model preparation passed")

    payload = {"audio_file_id": audio_id}
    if os.environ.get("HF_TOKEN"):
        payload["settings"] = {"diarization_token": os.environ["HF_TOKEN"]}

    job_create = client.post("/api/jobs", json=payload)
    if job_create.status_code != 200:
        fail(f"job create failed: {job_create.status_code} {job_create.text}")
    job_id = job_create.json()["id"]

    job_state = client.get(f"/api/jobs/{job_id}")
    if job_state.status_code != 200:
        fail(f"job status failed: {job_state.status_code} {job_state.text}")
    status = job_state.json().get("status")
    if status != "completed":
        fail(f"job did not complete: {job_state.text}")
    print("[smoke] Job completed")

    transcript = client.get(f"/api/jobs/{job_id}/transcript")
    if transcript.status_code != 200:
        fail(f"transcript fetch failed: {transcript.status_code} {transcript.text}")
    if not isinstance(transcript.json(), list):
        fail("transcript payload is not a list")

    print("[smoke] PASS: local runtime smoke check succeeded")
PY
