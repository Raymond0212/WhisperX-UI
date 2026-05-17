# WhisperX UI

Local-first MVP scaffold for uploading audio, downloading the basic local Whisper model, running local or placeholder transcription, editing sentence-level transcripts, renaming speakers, and exporting VTT.

The current backend supports upload, library listing, metadata fetch, title editing, soft deletion, browser audio streaming, model preparation, job creation, transcript sentence edits, speaker renaming, settings, and VTT export. Local processing attempts to import and run WhisperX; if WhisperX is unavailable, the job fails with a clear message. Set the transcription provider to `placeholder` for deterministic demo transcript output.

The default one-click path is zero basic configuration: upload audio and click Process. The frontend asks the backend to download `Systran/faster-whisper-small` from Hugging Face into `app_data/models/` if it is missing, then starts the job with local transcription and diarization disabled. Speaker diarization remains optional and needs an explicit Diarization/HF token and compatible local runtime.

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
