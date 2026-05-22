# WhisperX UI

Local-first app for uploading audio, downloading faster-whisper models, running local transcription + Hugging Face pyannote diarization, editing sentence-level transcripts, renaming speakers, and exporting VTT.

The backend supports upload, library listing, metadata fetch, title editing, soft deletion, browser audio streaming, model preparation, job creation, transcript sentence edits, speaker renaming, settings, model options, and VTT export. Transcription uses `faster-whisper` and diarization uses `pyannote/speaker-diarization-community-1`.

The default one-click path is zero basic configuration: upload audio and click Process. The frontend asks the backend to download `distil-large-v3` (`Systran/faster-distil-whisper-large-v3`) from Hugging Face into `app_data/models/` if missing, then runs transcription with fixed phase-2 engines. If no Hugging Face token is provided, the job still completes with a single-speaker fallback (`SPEAKER_00`). Supplying a token enables pyannote diarization speaker assignment.

## One-click run

```bash
./scripts/one-click-dev.sh
```

This is the canonical zero-basic-config baseline path. It uses `python3 -m venv`, installs backend deps via `pip install -e .`, starts backend on `http://127.0.0.1:8000`, and starts frontend on `http://127.0.0.1:5173`.

## Backend

```bash
uv sync --extra test
uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
```

The backend defaults to `app_data/` for SQLite, uploads, exports, logs, and models. Override with:

```bash
WHISPERX_UI_APP_DATA=./app_data uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE_URL` when the backend is not running on `http://127.0.0.1:8000`.

## Tests

```bash
./scripts/run-backend-tests.sh
```

Note: first run needs internet access to install Python dependencies into `.venv`.

Frontend tests are available when Node.js and npm are installed:

```bash
cd frontend
npm test
```

## Runtime Smoke Check

Run a local runtime smoke validation (health, upload, model prep, job run, transcript fetch):

```bash
./scripts/smoke-check-local-runtime.sh
```

Optional token-enabled diarization check:

```bash
HF_TOKEN=hf_xxx ./scripts/smoke-check-local-runtime.sh
```

The script runs in-process via FastAPI `TestClient` (no local socket bind required).
If the model-prep step fails, the script prints the backend response and exits with `[FAIL]`.
For silent/near-silent audio, the smoke check accepts zero transcript sentences as long as the job completes and transcript endpoint returns a valid list payload.
First run also needs internet access to install Python dependencies and download models.

Backend behavior also treats silent-audio zero-segment transcription as a valid completed job with an empty transcript.

## Diarization Benchmark

Offline-friendly local fixtures:

```bash
./scripts/run-diarization-benchmark.sh
```

The benchmark reports simple proxy metrics: word-level speaker accuracy and speaker-change precision/recall.
It enforces pass/fail thresholds (defaults: `MIN_WORD_SPEAKER_ACCURACY=0.80`, `MIN_SPEAKER_CHANGE_PRECISION=0.70`, `MIN_SPEAKER_CHANGE_RECALL=0.70`), overridable via environment variables.

Opt-in real-audio evaluation:

```bash
# Auto-bootstrap from diarizers-community/voxconverse (default 1 case),
# or set BOOTSTRAP_* env vars to customize source/split/count.
./scripts/download-real-diarization-benchmark.sh
HF_TOKEN=hf_xxx ./scripts/run-real-diarization-benchmark.sh
```

`run-real-diarization-benchmark.sh` uses the real pipeline path (transcription + diarization + assignment), computes word/sentence speaker accuracy proxies, and gates speaker-change precision/recall with a time collar (default `SPEAKER_CHANGE_COLLAR_SECONDS=0.75`) to tolerate near-boundary alignment jitter.
