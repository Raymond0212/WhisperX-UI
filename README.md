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
uv run pytest
```

Frontend tests are available when Node.js and npm are installed:

```bash
cd frontend
npm test
```
