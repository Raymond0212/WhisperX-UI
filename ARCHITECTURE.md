# Architecture

## System Shape

WhisperX UI is a local-first web application with a React frontend and Python backend. The backend runs on the user's machine, stores metadata in SQLite, stores files on the local filesystem, and coordinates faster-whisper transcription, optional Hugging Face pyannote diarization, speaker assignment, speaker samples, and VTT export.

Processing is decoupled from the API process. The FastAPI service remains the API/DB control plane, while model execution runs in supervised worker processes managed by a local SQLite-backed scheduler.

```text
React Frontend
    -> Python API Backend
    -> Application Services
    -> faster-whisper / Hugging Face pyannote processors
    -> SQLite + Local File Storage
```

The app is initially accessed through `http://localhost:<port>`. The architecture should remain compatible with a future Electron package that launches the same React UI and bundled Python backend.

## Major Subsystems

### Frontend

The frontend owns browser interaction:

- audio upload and title editing
- model configuration controls
- library, upload, processing, transcript, and settings screens
- audio playback and timestamp seeking
- sentence-level transcript editing
- speaker sample playback and speaker renaming
- VTT export initiation

The frontend should call backend APIs rather than reading local files or SQLite directly.

### Backend API

The backend exposes local HTTP APIs for:

- audio upload, metadata, streaming, title editing, and soft deletion
- transcription job creation and status retrieval
- sentence transcript retrieval and editing
- speaker retrieval and renaming
- settings retrieval and updates
- VTT export

The API layer should validate requests, map HTTP behavior to service calls, and avoid embedding inference orchestration directly in route handlers.

### Application Services

Services hold reusable domain behavior:

- storage service for local file placement, duplicate filename handling, and stream paths
- transcription service for faster-whisper orchestration
- diarization service for Hugging Face pyannote speaker labeling when a token is supplied
- sentence chunking service for canonical sentence segments
- speaker sample service for selecting useful sample timestamp ranges
- VTT service for export formatting

### Persistence

SQLite is the metadata store. Local filesystem storage keeps uploaded audio and generated artifacts.

Recommended local data layout:

```text
app_data/
  database.sqlite
  uploads/
  exports/
  logs/
  models/
```

SQLite stores metadata, settings, job state, transcript sentences, speaker records, and optional credentials. Audio binaries should remain on disk and be referenced by database records.

## Dependency Direction

Dependencies should flow inward:

- UI depends on API contracts.
- API routes depend on services.
- Services depend on repositories, storage adapters, and processor interfaces.
- Processor implementations depend on faster-whisper, pyannote, Hugging Face Hub, and local runtime libraries.
- Persistence adapters depend on SQLite and filesystem APIs.

Processor-specific code should not leak into UI components or database models except through explicit engine/model setting fields.

## Core Constraints

- Local faster-whisper transcription is the default path; Hugging Face pyannote diarization is enabled by a transient token, and the no-token path falls back to `SPEAKER_00`.
- The canonical transcript unit is a sentence with stable ID, timestamps, speaker ID, original text, and current text.
- Speaker display names are user-editable, but internal diarization labels remain stable.
- Original transcription output is preserved even when current transcript text changes.
- Speaker-turn transcript chunks are display-only aggregations over adjacent sentence records.
- Processing does not require real-time progress for MVP; a simple `processing` state is sufficient.
- Soft delete is the MVP deletion behavior for uploaded audio and related UI visibility.
