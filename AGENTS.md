# WhisperX UI Repository Guide

## Overview

WhisperX UI is a single-user, local-first desktop-style web application for uploading audio, running faster-whisper transcription and optional Hugging Face pyannote diarization, reviewing sentence-level transcripts, editing text, renaming speakers, playing timestamped audio, and exporting VTT.

The implementation target is:

- React browser UI, compatible with future Electron packaging
- Python local API backend
- SQLite persistence
- Local filesystem storage for uploads, exports, logs, and models

## Documentation Entry Points

- [ARCHITECTURE.md](ARCHITECTURE.md): top-level system architecture, subsystem boundaries, and dependency direction.
- [docs/product-specs/index.md](docs/product-specs/index.md): product behavior requirements.
- [docs/design-docs/index.md](docs/design-docs/index.md): design decisions, rationale, and implementation constraints.
- [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md): orchestration workflow for multi-agent implementation cycles.
- [docs/generated/db-schema.md](docs/generated/db-schema.md): code-derived SQLite schema reference.
- [docs/FRONTEND.md](docs/FRONTEND.md): frontend conventions and interaction expectations.
- [docs/SECURITY.md](docs/SECURITY.md): local-first security and credential handling guidance.
- [docs/RELIABILITY.md](docs/RELIABILITY.md): job, storage, deletion, and error-handling expectations.
- [docs/PLANS.md](docs/PLANS.md): planning and execution-plan conventions.
- [docs/REPOSITORY-KNOWLEDGE-POLICY.md](docs/REPOSITORY-KNOWLEDGE-POLICY.md): repository documentation policy.

## Agent Conventions

- Treat `docs/` as the primary system of record for durable project knowledge.
- Keep `AGENTS.md` short and navigational; add detailed guidance to the relevant document under `docs/`.
- Preserve local-first behavior as the default assumption unless a product spec or design doc says otherwise.
- Do not overwrite internal diarization speaker IDs when implementing speaker renaming.
- Treat transcript sentences as the canonical transcript unit; speaker-turn views are derived display groupings.
- Prefer updating existing docs over creating overlapping documents for the same concern.

## Project Initialization

Always load environment variables from the `.env` file before running any agent or script. This file may contain sensitive information and should not be shared. The `.env` file is included in `.gitignore` to prevent accidental commits of sensitive data.
