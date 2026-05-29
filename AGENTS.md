# WhisperX UI Repository Guide

Change of this file requires explicit approval from a human maintainer. Follow the conventions and rules outlined in this file to ensure consistency and maintainability of the repository. When in doubt, consult the relevant documentation or ask for clarification before making changes.

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
- [docs/CODE-DEV-REVIEW-ORCHESTRATION.md](docs/CODE-DEV-REVIEW-ORCHESTRATION.md): orchestration workflow for multi-agent implementation cycles.
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

## Operating model

1. Use repository-local knowledge before guessing.
2. Prefer small, targeted changes over broad rewrites.
3. Preserve existing architecture, style, and conventions unless the task explicitly changes them.
4. Validate behavior with the narrowest relevant checks before reporting completion.
5. Update documentation only when the change creates or invalidates durable repository knowledge.

## Documentation size rule

Markdown files must stay small enough for humans and agents to use.

- Hard limit: **500 lines per Markdown file**.
- Target size: **about 200 lines**.
- Split files by concern before they become long.
- Use indexes and links instead of duplicating content.

## Repository knowledge map

Use these files only when relevant:

- `docs/REPOSITORY-KNOWLEDGE-POLICY.md` — repository documentation rules and conventions.
- `docs/CODE-DEV-REVIEW-ORCHESTRATION.md` — multi-agent orchestration workflow and conventions.

If a listed file or folder does not exist, do not assume it is required. Create it only when the current task needs it.

## Completion standard

Before declaring work complete, agents should be able to state:

- what changed;
- why it changed;
- what validation was run;
- what was not validated;
- whether documentation or tests need follow-up.

Do not claim validation that was not performed.
