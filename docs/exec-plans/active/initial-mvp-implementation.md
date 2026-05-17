# Initial MVP Implementation Plan

## Summary

Build the first working local WhisperX UI from the documented MVP requirements: React frontend, Python backend, SQLite persistence, local file storage, audio upload, one-click processing, transcript review, speaker renaming, timestamped playback, and VTT export.

## Implementation Phases

### 1. Project Scaffold

- Add backend Python project structure with API routes, services, persistence, and provider boundaries.
- Add frontend React project structure with library, upload, processing, transcript, and settings screens.
- Add shared development commands and environment documentation.
- Configure local app data defaults and ensure generated runtime data is ignored by git.

### 2. Persistence And Storage

- Create SQLite schema for audio files, jobs, speakers, transcript sentences, app settings, and optional credentials.
- Implement local storage service for uploads, duplicate filename handling, stream paths, and soft delete metadata.
- Add repository or data-access layer so route handlers do not directly embed SQL behavior.

### 3. Audio Library And Upload

- Implement audio upload API and frontend upload flow.
- Support editable display titles.
- List retained audio files in the library.
- Stream uploaded audio to the browser player.
- Soft delete audio and hide deleted items from normal library view.

### 4. Processing Pipeline

- Implement job creation and status persistence.
- Add local WhisperX transcription provider boundary.
- Add alignment, sentence chunking, diarization, speaker assignment, and speaker sample selection services.
- Persist original/current transcript text, timestamps, speakers, and job settings.
- Save failure messages for failed jobs.

### 5. Transcript Review

- Implement transcript review screen with audio player.
- Add sentence-level view with timestamp, speaker, click-to-play, and editable text.
- Add speaker-turn view as a derived grouping over sentence records.
- Add speaker sample panel with sample playback and speaker renaming.
- Ensure speaker renaming updates display globally without changing internal speaker keys.

### 6. Export And Settings

- Implement VTT export using current transcript text and current speaker display names.
- Add settings screen for default transcription and diarization model choices.
- Support optional online provider fields without requiring API keys for local usage.
- Mask API key fields and avoid logging secrets.

## Acceptance Criteria

- User can upload a supported audio file and play it in the browser.
- Duplicate original filenames do not overwrite existing uploads.
- User can create a processing job and see `processing`, `completed`, or `failed`.
- Completed jobs show sentence-level transcript records with timestamps and speaker labels.
- User can edit transcript text and edits persist.
- User can rename speakers and see updated labels across transcript views and VTT export.
- User can play an individual sentence range and a speaker sample range.
- User can switch between sentence and speaker-turn transcript views.
- User can export a VTT file.
- App works locally without online API keys.

## Current Implementation Status

- Backend API implements upload/list/get/title edit/soft delete/stream, job create/get/list, transcript edit, speaker rename, settings, and VTT export.
- Uploads normalize MIME type from supported audio extensions when needed and stream only stored paths contained under the configured uploads directory.
- Job settings and failure messages are persisted. Secret-like keys and `online_api_keys` are stripped from persisted settings.
- The default `local` provider attempts WhisperX and records a clear failed job if WhisperX cannot be imported. The explicit `placeholder` provider creates deterministic demo transcript, speaker, and VTT data.
- The tested WhisperX path uses a fake WhisperX module to verify segment-to-sentence chunking and persistence. Real WhisperX runtime and model execution remain unverified in this repository state.
- Transcript sentence edits update `current_text` while preserving `original_text`, timestamps, and speaker assignment. Speaker rename updates `display_name` while preserving `speaker_key`.
- Frontend includes drag/drop upload, title editing, model config controls, audio playback, speaker and sentence review, speaker-turn grouping, settings, and VTT export links.
- Python tests currently pass: `uv run pytest` collected 19 tests and all passed. Frontend test script exists, but Node.js/npm were not available in this environment, so frontend tests were not run here.

## Deferred Work

- Real-time progress
- Job cancellation
- Permanent deletion
- Manual sentence speaker reassignment
- Advanced diarization correction
- Word-level editing
- Transcript version history
- Waveform display
- Batch uploads
- Extra export formats
- Model download manager
- Electron OS keychain integration
