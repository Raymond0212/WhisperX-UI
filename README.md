# WhisperX UI

Local-first MVP scaffold for uploading audio, running placeholder transcription/diarization, editing sentence-level transcripts, renaming speakers, and exporting VTT.

## Backend

```bash
uv sync --extra test
uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
```

The backend defaults to `app_data/` for SQLite, uploads, exports, logs, and models. Override with:

```bash
WHISPERX_UI_APP_DATA=/path/to/app_data uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
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

