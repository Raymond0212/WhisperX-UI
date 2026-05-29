# WhisperX UI

Local-first app for uploading audio, downloading faster-whisper models, running local transcription + Hugging Face pyannote diarization, editing sentence-level transcripts, renaming speakers, and exporting VTT.

The backend supports upload, library listing, metadata fetch, title editing, soft deletion, browser audio streaming, model preparation, job creation, transcript sentence edits, speaker renaming, settings, model options, and VTT export. Transcription uses `faster-whisper` and diarization uses `pyannote/speaker-diarization-community-1`.

The default one-click path is zero basic configuration: upload audio and click Process. The frontend asks the backend to download `distil-large-v3` (`Systran/faster-distil-whisper-large-v3`) from Hugging Face into `app_data/models/` if missing, then runs transcription with fixed phase-2 engines. If no Hugging Face token is provided, the job still completes with a single-speaker fallback (`SPEAKER_00`). Supplying a token enables pyannote diarization speaker assignment.

## One-click run

macOS/Linux:

```bash
./scripts/one-click-dev.sh
```

Windows PowerShell, assuming `uv` and `npm` are installed:

```powershell
.\scripts\one-click-dev.ps1
```

The one-click scripts load `.env` when present, sync backend dependencies, install frontend dependencies, start the backend on `http://127.0.0.1:8000`, and start the frontend on `http://127.0.0.1:5173`.

## Backend

```bash
uv sync --extra test
uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload --reload-dir backend --reload-dir tests
```

The backend defaults to `app_data/` for SQLite, uploads, exports, logs, and models. Override with:

```bash
WHISPERX_UI_APP_DATA=./app_data uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
```

Enable verbose backend debugging (stack traces + transcription/diarization runtime context):

```bash
WHISPERX_UI_DEBUG=1 uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload --log-level debug
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
