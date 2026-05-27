# WhisperX Web UI MVP Product Specification

## Product Summary

WhisperX UI is a single-user, local-first desktop-style web application for faster-whisper transcription with optional Hugging Face pyannote diarization. A user can upload audio, configure transcription and diarization, run one-click processing, review a sentence-level transcript with speaker labels, edit transcript text, rename speakers, play audio from transcript sentences, and persist data locally using SQLite.

The frontend is React. The backend is Python. The app is initially a local web app and should remain suitable for future Electron packaging.

## Goals

- Provide an easy-to-use WhisperX web UI.
- Support one-click transcription and speaker labeling.
- Run locally by default without requiring API keys.
- Persist user data in SQLite and retained files on local disk.
- Support transcript review, text editing, speaker renaming, and timestamped playback.
- Support configurable engine/model settings for faster-whisper transcription and Hugging Face pyannote diarization.

## Non-Goals

- Multi-user accounts
- Authentication
- Exact real-time model progress updates
- Cloud sync
- Collaborative editing
- SaaS billing
- Role-based permissions

## Core Workflow

```text
User opens app
-> uploads audio file
-> optionally edits audio title
-> optionally configures transcription and diarization models
-> clicks one process button
-> app downloads the basic local transcription model if it is missing
-> waits while queued/processing status and approximate staged progress update
-> reviews sentence-level transcript with speaker labels
-> plays audio by clicking transcript sentences or speaker samples
-> edits transcript text
-> renames speakers
-> exports VTT or keeps results locally
```

## MVP Functional Requirements

### Audio Upload

| ID     | Requirement                                                |
| ------ | ---------------------------------------------------------- |
| AU-001 | User can upload an audio file from the browser.            |
| AU-002 | Uploaded audio files are retained locally by default.      |
| AU-003 | User can delete uploaded audio files.                      |
| AU-004 | User can upload the same source file multiple times.       |
| AU-005 | Duplicate uploaded filenames are automatically renamed.    |
| AU-006 | User can edit the display title of an uploaded audio file. |
| AU-007 | Each upload is treated as a separate audio item.           |
| AU-008 | Audio files are playable in the browser after upload.      |

Initial supported audio extensions: `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.aac`.

### Transcription

| ID     | Requirement                                                                      |
| ------ | -------------------------------------------------------------------------------- |
| TR-001 | User can run transcription on an uploaded audio file.                            |
| TR-002 | Default transcription uses local models.                                         |
| TR-003 | User can configure the transcription model.                                      |
| TR-004 | User can upload the same file multiple times for different model configurations. |
| TR-005 | Transcription output is chunked by sentence.                                     |
| TR-006 | Transcript is exportable or representable in VTT format.                         |
| TR-007 | Transcript sentences have timestamps.                                            |
| TR-008 | Transcript text is editable by the user.                                         |
| TR-009 | Original and edited transcript text are both preserved.                          |

Expected local processing pipeline:

```text
faster-whisper transcription
-> sentence chunking
-> optional Hugging Face pyannote diarization when a token is supplied
-> speaker assignment
-> VTT-compatible transcript generation
```

### Diarization And Speakers

| ID     | Requirement                                                                                 |
| ------ | ------------------------------------------------------------------------------------------- |
| SP-001 | App supports speaker diarization.                                                           |
| SP-002 | Hugging Face pyannote diarization is enabled when the user supplies a transient token or saves an encrypted local token. |
| SP-003 | App assigns speaker labels to transcript sentences.                                         |
| SP-004 | Initial labels may use names such as `SPEAKER_00`.                                          |
| SP-005 | User can rename each detected speaker.                                                      |
| SP-006 | Renaming a speaker updates all displayed transcript sentences for that speaker.             |
| SP-007 | Internal speaker IDs remain stable after display names change.                              |
| SP-008 | App provides a speaker sample section after diarization.                                    |
| SP-009 | User can play a sample audio clip for each detected speaker.                                |
| SP-010 | Speaker samples help users identify and rename speakers quickly.                            |
| SP-011 | If no Hugging Face token is supplied, processing still completes by assigning `SPEAKER_00`. |

Speaker identity uses stable internal keys and editable display names:

```text
speaker_key: SPEAKER_00
display_name: Alice
```

### Speaker Samples

| ID     | Requirement                                                    |
| ------ | -------------------------------------------------------------- |
| SS-001 | App generates or selects one sample clip per detected speaker. |
| SS-002 | User can play each speaker sample.                             |
| SS-003 | User can rename speakers from the speaker sample section.      |
| SS-004 | Speaker label edits update the transcript globally.            |
| SS-005 | Samples are short and useful for speaker identification.       |

Prefer 5 to 15 second samples. Store sample start and end timestamps unless separate clips are needed later.

### Transcript Views

Sentence-level view is canonical.

| ID     | Requirement                                            |
| ------ | ------------------------------------------------------ |
| TV-001 | Transcript is displayed as sentence-level chunks.      |
| TV-002 | Each sentence has start and end timestamps.            |
| TV-003 | Each sentence shows its assigned speaker.              |
| TV-004 | User can click a sentence to play corresponding audio. |
| TV-005 | User can edit sentence text.                           |
| TV-006 | Edited text is persisted.                              |
| TV-007 | Sentence-level transcript is VTT-compatible.           |

Speaker-turn view is derived from adjacent sentences.

| ID     | Requirement                                                              |
| ------ | ------------------------------------------------------------------------ |
| BV-001 | App can display transcript grouped by speaker turn.                      |
| BV-002 | Adjacent sentences from the same speaker are grouped into larger chunks. |
| BV-003 | Big chunks are display-only aggregations.                                |
| BV-004 | Underlying sentence boundaries remain preserved.                         |
| BV-005 | User can click individual sentences inside a big chunk to play audio.    |
| BV-006 | User can still edit transcript text at sentence level.                   |

### Playback

| ID     | Requirement                                                                         |
| ------ | ----------------------------------------------------------------------------------- |
| PB-001 | App includes an audio player.                                                       |
| PB-002 | User can play uploaded audio.                                                       |
| PB-003 | User can click a transcript sentence to play that sentence's audio.                 |
| PB-004 | Playback seeks to the sentence start timestamp.                                     |
| PB-005 | Playback can stop or pause at the sentence end timestamp.                           |
| PB-006 | Sentence playback works in sentence and speaker-turn views.                         |
| PB-007 | Speaker sample playback uses the same audio source and timestamp-seeking mechanism. |

### Editing

| ID     | Requirement                                                                           |
| ------ | ------------------------------------------------------------------------------------- |
| ED-001 | User can edit transcript sentence text.                                               |
| ED-002 | Edited transcript text is saved to SQLite.                                            |
| ED-003 | Original transcript text is preserved.                                                |
| ED-004 | Edited transcript text is used in display and exports.                                |
| ED-005 | Transcript edits do not modify timestamps.                                            |
| ED-006 | Transcript edits do not modify speaker assignments unless explicitly supported later. |

MVP save behavior should use save-on-blur or short debounce autosave.

### Model Configuration

| ID     | Requirement                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------- |
| MC-001 | User can configure transcription model before processing.                                          |
| MC-002 | User can configure diarization model before processing.                                            |
| MC-003 | Default models are local.                                                                          |
| MC-004 | Hugging Face pyannote diarization is optional for the zero-basic-config path.                      |
| MC-005 | User can provide a transient or saved encrypted Hugging Face token for model download or pyannote diarization. |
| MC-006 | Model settings used for a job are persisted.                                                       |
| MC-007 | Different uploads or jobs may use different model settings.                                        |
| MC-008 | The basic local transcription model can be downloaded automatically before first local processing. |

Transcription settings include `transcription_engine`, `transcription_model`, language, device, compute type, and batch size. Diarization settings include `diarization_engine`, `diarization_model`, speaker count, min speakers, max speakers, and a runtime-only token when pyannote diarization is enabled.
Implemented queue capacity is controlled by `max_parallel_jobs` (`1..4`) to limit local resource pressure. `job_queue_mode` is planned/deferred and is not currently read by the backend scheduler.

### API Keys

| ID     | Requirement                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------- |
| AK-001 | User can provide a Hugging Face token for model download or pyannote diarization.                 |
| AK-002 | API keys are optional.                                                                            |
| AK-003 | App works without tokens by using local faster-whisper transcription and single-speaker fallback. |
| AK-004 | API keys are masked in the UI.                                                                    |
| AK-005 | API keys are not logged.                                                                          |
| AK-006 | Planned/deferred: user can remove saved API keys.                                                 |
| AK-007 | Persisted Hugging Face tokens are stored encrypted locally.                                       |

Current implementation: `POST /api/secrets/hf-token` stores a Hugging Face token encrypted in local SQLite and no API returns the stored plaintext token. `GET /api/settings` exposes only `hf_token_stored`. Transient token fields sent inside job settings are currently preserved in job settings and may be echoed in job responses; this is a security debt item. AK-006 is planned/deferred; there is no delete-token endpoint yet.

### Persistence

SQLite stores audio metadata, jobs, speakers, transcript sentences, and app settings. Filesystem storage retains uploaded audio, downloaded model files, and generated artifacts.

Recommended layout:

```text
app_data/
  database.sqlite
  uploads/
  exports/
  logs/
  models/
```

### Job Status

Suggested MVP statuses:

```text
uploaded
queued
processing
completed
failed
deleted
```

| ID     | Requirement                                   |
| ------ | --------------------------------------------- |
| JS-001 | A job is queued when the user clicks process. |
| JS-002 | A job stores its current status.              |
| JS-003 | Successful jobs save transcript and speakers. |
| JS-004 | Failed jobs save error details.               |
| JS-005 | User can view failed job status.              |
| JS-006 | User can see approximate staged progress while polling a job. |

Progress is approximate and stage-weighted through fields such as `progress_stage`, `progress_percent`, and `progress_message`. It must not be presented as exact real-time model inference progress.

### VTT Export

| ID      | Requirement                                              |
| ------- | -------------------------------------------------------- |
| VTT-001 | Transcript is sentence-chunked in VTT-compatible format. |
| VTT-002 | Each VTT cue represents one sentence.                    |
| VTT-003 | Each cue includes start and end timestamps.              |
| VTT-004 | Each cue uses current edited transcript text.            |
| VTT-005 | Each cue uses current speaker display name.              |
| VTT-006 | User can export transcript as `.vtt`.                    |

Example:

```vtt
WEBVTT

00:00:12.420 --> 00:00:18.910
Alice: I think we should review the timeline again.
```

### Deletion

| ID     | Requirement                                               |
| ------ | --------------------------------------------------------- |
| DL-001 | User can delete uploaded audio.                           |
| DL-002 | Deleted audio does not appear in the normal library view. |
| DL-003 | Related jobs and transcripts are deleted or hidden.       |
| DL-004 | Deletion avoids accidental data loss where possible.      |

MVP policy: use soft delete by setting `deleted_at`.

Current implementation also supports deleting a specific job by marking its status `deleted`; per-audio job listings hide deleted jobs.

### Duplicate Filenames

| ID     | Requirement                                                    |
| ------ | -------------------------------------------------------------- |
| DF-001 | User can upload files with the same original filename.         |
| DF-002 | App automatically generates a unique stored filename.          |
| DF-003 | Display title may initially be based on the original filename. |
| DF-004 | Duplicate uploads do not overwrite previous uploads.           |

Recommended stored filename format:

```text
<uuid>-meeting.wav
```

## Main Screens

| Screen            | Requirements                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Library           | Show uploaded audio files, editable titles, upload date, duration, job status, delete action, and open action.                      |
| Upload            | Support file select or drag-and-drop, title editing, model configuration, and one-click process.                                    |
| Processing        | Show queued/processing state with approximate staged progress, final result, or failure error.                                      |
| Transcript Review | Show audio player, speaker labeling, speaker samples, sentence view, speaker-turn view, sentence playback, editing, and VTT export. |
| Settings          | Configure default transcription model, diarization model, runtime defaults, local model paths, and storage location if supported.   |

## Product Decisions

- User model: single-user.
- Authentication: not required.
- Runtime style: local desktop-style web app.
- Frontend: React.
- Backend: Python.
- Database: SQLite.
- Default processing: faster-whisper with downloaded local model files.
- Hugging Face pyannote diarization: optional through a transient token or saved encrypted token.
- Progress UI: approximate staged progress from polled job fields.
- Audio retention: retained by default.
- Duplicate uploads: allowed and auto-renamed.
- Transcript unit: sentence.
- Transcript format: VTT-style sentence chunks.
- Speaker labels: globally editable display names.
- Playback: timestamped sentence and speaker sample playback.
- Packaging target: Electron later.

## Post-MVP

Deferred features include manual speaker reassignment, transcript version history, word-level editing, waveform display, exact real-time model progress, job cancellation beyond delete/worker termination, batch uploads, extra exports, advanced model management, OS keychain integration, delete-token UI/API, permanent deletion, advanced diarization correction, transcript search, and tagging.
