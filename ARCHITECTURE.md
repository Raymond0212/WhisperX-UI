# Architecture

This document is the top-level architecture map for WhisperX UI. It is intended for rapid codebase comprehension and should point to deeper source-of-truth documents rather than duplicate detailed product, security, reliability, or API rules.

## 1. Project Structure

```text
WhisperX-UI/
├── backend/whisperx_ui_backend/  # FastAPI app, services, scheduler, workers, database, and static file serving
├── frontend/               # React UI source, Vite config, and tests
├── docs/                   # Design docs, product specs, security and reliability details, generated schema
├── scripts/                # Development, smoke, schema, and release helper scripts
├── tests/                  # Backend, queue, retention, static file, and docs tests
└── .github/workflows/      # GitHub Actions release workflow
```

## 2. High-Level System Diagram

```text
User Browser
  <-> React Frontend
      <-> FastAPI API Process
          -> Application Services
          -> SQLite database
          -> Local filesystem app_data/
          -> JobQueueService scheduler
              -> worker process
                  -> faster-whisper processor
                  -> optional pyannote diarization
                  -> speaker assignment and transcript persistence

External network use is limited to explicit model/token-dependent flows such as
Hugging Face model downloads and pyannote access.
```

In development, Vite serves the React UI and the browser calls the local FastAPI backend. In release mode, the bundled backend serves both `/api/*` routes and the built React frontend from one local process.

## 3. Core Components

### React Frontend

The frontend owns browser interaction: upload, library navigation, settings, processing controls, audio playback, transcript review, speaker renaming, and VTT export initiation. It communicates through backend HTTP APIs and does not read SQLite or local filesystem paths directly.

Detailed frontend behavior and test coverage live in [docs/FRONTEND.md](docs/FRONTEND.md).

### FastAPI API Process

`backend/whisperx_ui_backend/app.py` is the local HTTP control plane. Its lifespan startup loads runtime config, initializes SQLite, runs deleted-audio purge, starts the scheduler, and stores shared state for route dependencies. Shutdown stops the retention task, scheduler, and SQLite connection.

The API routes own request/response boundaries and delegate domain work to services. They cover audio, jobs, models, transcript sentences, speakers, settings, stored Hugging Face token writes, VTT export, health, and bundled frontend serving.

### Application Services

`services.py` contains the main domain services for audio storage, job creation, model preparation, transcript and speaker persistence, settings, secrets, and VTT rendering. Processor-specific behavior is kept behind service/processor boundaries so UI and API contracts do not depend on faster-whisper or pyannote internals.

Detailed data model and API contract guidance lives in [docs/design-docs/data-model-and-api-contract.md](docs/design-docs/data-model-and-api-contract.md).

### Scheduler And Workers

`JobQueueService` keeps model execution out of the API process. The API creates queued jobs in SQLite, then the scheduler starts supervised workers up to configured capacity. Worker metadata and heartbeat fields are persisted on job rows so crashes, termination, and stale processing states can be reconciled.

In source development, workers run as `python -m whisperx_ui_backend.worker`. In the PyInstaller bundle, the main executable spawns the internal `whisperx-ui worker` command. That command is implementation-only and should not be treated as a user-facing interface.

Reliability details for status transitions, heartbeats, deletion, retention, and smoke validation live in [docs/RELIABILITY.md](docs/RELIABILITY.md).

### Processing Adapters

Processing uses faster-whisper for transcription and optional Hugging Face pyannote diarization when a transient or saved encrypted token is available. Speaker assignment, sentence chunking, sample timestamp selection, and transcript persistence convert processor output into repository data contracts.

Product-level processing expectations live in [docs/product-specs/whisperx-web-ui.md](docs/product-specs/whisperx-web-ui.md).

### Bundled Static Serving

`static_files.py` locates the built React frontend in source or PyInstaller layouts. When frontend assets are present, FastAPI mounts `/assets`, serves `/`, and falls back to `index.html` for non-API frontend routes. Unknown `/api/*` paths remain API errors rather than SPA fallbacks.

Release packaging details live in [docs/design-docs/release-packaging.md](docs/design-docs/release-packaging.md).

## 4. Data Stores

### SQLite

SQLite is the metadata store. `database.py` enables foreign keys, WAL journal mode, and a busy timeout, then initializes or updates the app-managed schema on startup.

Important tables include:

- `audio_files`
- `transcription_jobs`
- `speakers`
- `transcript_sentences`
- `app_settings`
- `provider_credentials`

Generated schema reference lives in [docs/generated/db-schema.md](docs/generated/db-schema.md).

### Local Filesystem

Runtime data lives under `WHISPERX_UI_APP_DATA`, defaulting to `app_data/` relative to the launch directory:

```text
app_data/
  database.sqlite
  uploads/
  exports/
  logs/
  models/
  .secrets.key
```

The filesystem stores uploaded audio, generated/exported artifacts, job logs, downloaded model snapshots, and local secret key material. Database rows reference local files rather than embedding audio bytes.

## 5. External Integrations

- Browser: user interface for the local web app.
- Hugging Face Hub: model downloads and gated pyannote access when a token is supplied or saved.
- faster-whisper: local transcription runtime.
- pyannote.audio: optional diarization runtime.
- PyInstaller: platform-specific executable packaging.
- GitHub Actions: manual release artifact builds. There is no GitLab CI release configuration in the current repository.

## 6. Glossary

- API process: The FastAPI server that handles HTTP routes, SQLite control-plane work, scheduler lifecycle, and frontend serving.
- App data: The local directory containing SQLite, uploads, exports, logs, models, and secret key material.
- Diarization: Assigning speaker labels to audio time ranges.
- Processor: Adapter code that invokes transcription, diarization, speaker assignment, or related model runtime behavior.
- Scheduler: The local `JobQueueService` that starts and supervises worker processes.
- Sentence: The canonical persisted transcript unit.
- Worker: A child process that runs one transcription job outside the API process.
