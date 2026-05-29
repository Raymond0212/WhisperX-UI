# Data Model And API Contract

## Data Model

Uses SQLite for structured persistence.

### Audio File

Represents one uploaded audio file.

| Field               | Purpose                                 |
| ------------------- | --------------------------------------- |
| `id`                | Unique audio ID.                        |
| `original_filename` | Filename provided by the upload.        |
| `stored_filename`   | Unique local filename.                  |
| `display_title`     | User-editable title.                    |
| `file_path`         | Local path to stored audio.             |
| `mime_type`         | Uploaded MIME type.                     |
| `duration_seconds`  | Audio duration when known.              |
| `size_bytes`        | File size.                              |
| `created_at`        | Upload timestamp.                       |
| `deleted_at`        | Soft delete timestamp.                  |
| `speaker_count`     | Exact speaker count hint when provided. |
| `min_speakers`      | Minimum speaker hint when provided.     |
| `max_speakers`      | Maximum speaker hint when provided.     |

### Transcription Job

Represents one processing run for an audio file.

| Field                       | Purpose                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | Unique job ID.                                                                                                                                                                   |
| `audio_file_id`             | Related audio file.                                                                                                                                                              |
| `status`                    | Job state.                                                                                                                                                                       |
| `transcription_engine`      | Engine used.                                                                                                                                                                     |
| `transcription_model`       | Model used.                                                                                                                                                                      |
| `diarization_engine`        | Engine used.                                                                                                                                                                     |
| `diarization_model`         | Model used.                                                                                                                                                                      |
| `language`                  | Language config.                                                                                                                                                                 |
| `device`                    | CPU, CUDA, or auto.                                                                                                                                                              |
| `compute_type`              | `float16`, `int8`, or similar.                                                                                                                                                   |
| `batch_size`                | Processing batch size.                                                                                                                                                           |
| `speaker_count`             | Exact speaker count when provided.                                                                                                                                               |
| `min_speakers`              | Minimum speakers when provided.                                                                                                                                                  |
| `max_speakers`              | Maximum speakers when provided.                                                                                                                                                  |
| `settings_json`             | Serialized job settings after broad secret-like keys are stripped; exact `diarization_token` and `hf_token` keys are currently preserved and should be treated as security debt. |
| `error_message`             | Failure reason.                                                                                                                                                                  |
| `created_at`                | Creation timestamp.                                                                                                                                                              |
| `queued_at`                 | Queue insertion timestamp.                                                                                                                                                       |
| `started_at`                | Processing start timestamp.                                                                                                                                                      |
| `completed_at`              | Processing completion timestamp.                                                                                                                                                 |
| `worker_pid`                | Worker process ID when assigned.                                                                                                                                                 |
| `worker_started_at`         | Worker launch timestamp.                                                                                                                                                         |
| `last_heartbeat_at`         | Last worker heartbeat timestamp.                                                                                                                                                 |
| `worker_exit_code`          | Worker exit code when known.                                                                                                                                                     |
| `worker_signal`             | Worker signal when process was terminated by signal.                                                                                                                             |
| `runtime_device`            | Device actually used by processing when known.                                                                                                                                   |
| `runtime_device_note`       | Runtime device fallback or selection note when known.                                                                                                                            |
| `progress_stage`            | Current processing stage label.                                                                                                                                                  |
| `progress_percent`          | Approximate stage-weighted completion percent (`0..100`).                                                                                                                        |
| `progress_message`          | User-facing stage text for non-blocking UI progress display.                                                                                                                     |
| `progress_stage_started_at` | Timestamp when current stage started.                                                                                                                                            |
| `progress_updated_at`       | Timestamp for most recent progress update.                                                                                                                                       |

Suggested statuses:

```text
uploaded
queued
processing
completed
failed
deleted
```

### Speaker

Represents one detected speaker in one job.

| Field          | Purpose                                        |
| -------------- | ---------------------------------------------- |
| `id`           | Unique speaker record ID.                      |
| `job_id`       | Related job.                                   |
| `speaker_key`  | Stable diarization label such as `SPEAKER_00`. |
| `display_name` | User-facing name.                              |
| `sample_start` | Sample playback start timestamp.               |
| `sample_end`   | Sample playback end timestamp.                 |
| `created_at`   | Creation timestamp.                            |
| `updated_at`   | Last update timestamp.                         |

### Transcript Sentence

Represents the canonical transcript segment.

| Field            | Purpose                             |
| ---------------- | ----------------------------------- |
| `id`             | Unique sentence ID.                 |
| `job_id`         | Related job.                        |
| `speaker_id`     | Related speaker.                    |
| `sentence_index` | Order in transcript.                |
| `start_time`     | Start timestamp.                    |
| `end_time`       | End timestamp.                      |
| `original_text`  | Original transcription text.        |
| `current_text`   | Edited or current text.             |
| `confidence`     | Optional confidence score.          |
| `words_json`     | Optional word-level timestamp data. |
| `created_at`     | Creation timestamp.                 |
| `updated_at`     | Last update timestamp.              |

### App Setting

Stores preferences and default model choices.

| Field        | Purpose                   |
| ------------ | ------------------------- |
| `key`        | Setting name.             |
| `value_json` | Serialized setting value. |
| `updated_at` | Last update timestamp.    |

### Provider Credential

Stores encrypted local provider credentials.

| Field               | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `id`                | Unique credential record ID.                          |
| `provider`          | Provider key, currently `huggingface`.                |
| `display_name`      | User-facing provider name.                            |
| `encrypted_api_key` | Encrypted token payload; never returned as plaintext. |
| `created_at`        | Creation timestamp.                                   |
| `updated_at`        | Last update timestamp.                                |

## API Contract

### Audio APIs

```http
POST /api/audio
GET /api/audio
GET /api/audio/{audio_id}
PATCH /api/audio/{audio_id}
DELETE /api/audio/{audio_id}
GET /api/audio/{audio_id}/stream
GET /api/audio/{audio_id}/download
```

Responsibilities:

- upload audio files
- list non-deleted audio files
- fetch audio metadata
- update display title
- soft delete audio
- stream local audio for browser playback
- download the uploaded audio using the original filename

Current implementation notes:

- Supported extensions are `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, and `.aac`.
- Stored filenames use a UUID prefix plus a sanitized source filename.
- MIME type is normalized from the filename when the supplied content type is not audio.
- Streaming and download resolve the stored path and require it to remain inside the configured uploads directory.
- `DELETE /api/audio/{audio_id}` sets `deleted_at`, hides the audio from normal listings, marks related jobs `deleted`, and terminates active local workers for those jobs; backend startup and the daily local-midnight retention task purge deleted audio, related rows, and per-job log files after the 30-day retention window.

### Job APIs

```http
POST /api/jobs
GET /api/jobs/{job_id}
DELETE /api/jobs/{job_id}
GET /api/audio/{audio_id}/jobs
```

Responsibilities:

- create and enqueue a transcription job
- return job status and metadata
- soft delete a job by marking its status `deleted`
- list jobs for an audio file
- persist failure messages when processing fails

Current implementation notes:

- Jobs use fixed engines: `transcription_engine: "faster-whisper"` and `diarization_engine: "huggingface-pyannote"`.
- `POST /api/jobs` returns immediately with a queued/processing job; completion is retrieved via `GET /api/jobs/{job_id}` polling.
- Jobs are first persisted as `queued` with `queued_at`; a local queue service starts supervised worker processes up to `max_parallel_jobs`.
- Worker supervision persists `worker_pid`, `worker_started_at`, `last_heartbeat_at`, `worker_exit_code`, and `worker_signal` when available.
- Worker heartbeats update `last_heartbeat_at` and may advance approximate stage progress while the worker remains alive.
- Stale `processing` jobs with missing or expired heartbeats are reconciled to `failed`.
- Job responses include progress metadata (`progress_stage`, `progress_percent`, `progress_message`, `progress_stage_started_at`, `progress_updated_at`) for stage-level UI feedback while polling.
- Progress percentages are approximate, stage-weighted estimates (not exact model inference completion).
- `DELETE /api/jobs/{job_id}` marks the job `deleted`, sets `completed_at`, clears `error_message`, and asks the queue service to terminate an active local worker for that job only.
- After targeted termination, that queue capacity slot remains occupied until the terminated worker exits and the scheduler reaps its handle.
- `GET /api/audio/{audio_id}/jobs` omits jobs whose status is `deleted`.
- Request `settings` may carry transient runtime-only values such as `diarization_token` or `hf_token`. Broad secret-like setting keys are stripped, but exact `diarization_token` and `hf_token` keys are currently preserved in persisted `settings_json` and can appear in job response `settings`; this is a documented security debt item, not desired long-term behavior.
- Token-enabled pyannote diarization passes a preloaded `{waveform, sample_rate}` input to the pipeline. Audio decoding tries torchaudio's soundfile backend, then torchaudio's default loader, then falls back to `faster_whisper.audio.decode_audio`; multi-channel input is averaged to mono float32.
- If a diarization token is present, pyannote diarization runs and its output is normalized into timestamped speaker intervals. The parser accepts the pyannote community wrapper's `exclusive_speaker_diarization`, falls back to `speaker_diarization`, then to raw `itertracks` annotations or interval dictionaries.
- Token-enabled speaker assignment first labels faster-whisper words by strongest diarization interval overlap. Boundary ties keep the first matching diarization interval, and non-overlapping gaps fall back to the nearest interval so assignment remains deterministic.
- Persistence preserves speaker changes inside faster-whisper sentence windows: when timed words in one sentence-sized window contain multiple speaker runs, the backend persists separate speaker-consistent sub-sentence rows rather than flattening the whole window to one speaker. If no word assignment is available for a segment, segment-level interval overlap is used.
- Speaker sample timestamps are selected from the longest persisted sentence for each speaker, preserving the earliest sentence when durations tie.
- If a diarization token is missing, the job still completes with single-speaker fallback labels (`SPEAKER_00`).

### Local Model APIs

```http
GET /api/models
GET /api/model-options
POST /api/models/prepare-basic
```

Responsibilities:

- report local Hugging Face model download status under the configured `app_data/models/` directory
- report supported transcription/diarization model options and backend defaults
- download the basic local transcription model when missing
- keep Hugging Face tokens out of plaintext API responses

Current implementation notes:

- `GET /api/model-options` returns `transcription_models`, `diarization_models`, and `defaults`.
- The basic profile downloads `Systran/faster-distil-whisper-large-v3` into `app_data/models/Systran--faster-distil-whisper-large-v3`.
- Download uses `huggingface_hub.snapshot_download` with a repository-local Hugging Face cache under `app_data/models/.hf-cache`.
- `POST /api/models/prepare-basic` accepts an optional request `hf_token`; if omitted, it uses the stored Hugging Face token when present.
- When the local model directory exists, the faster-whisper processor uses the local directory path; otherwise it falls back to model ID.
- The zero basic configuration path runs without token and still completes via single-speaker fallback. Supplying token enables pyannote diarization.

### Transcript APIs

```http
GET /api/jobs/{job_id}/transcript
PATCH /api/transcript-sentences/{sentence_id}
GET /api/jobs/{job_id}/export.vtt?view=sentences
GET /api/jobs/{job_id}/export.vtt?view=speaker-turns
```

Responsibilities:

- return sentence-level transcript records
- update `current_text` only for transcript edits
- export sentence-based VTT using current text and current speaker display names
- export speaker-turn-based VTT by grouping adjacent sentences with the same speaker while preserving stored sentence records

### Speaker APIs

```http
GET /api/jobs/{job_id}/speakers
PATCH /api/speakers/{speaker_id}
```

Responsibilities:

- list speakers and sample timestamp ranges for a job
- update speaker display names without changing internal speaker keys

### Settings APIs

```http
GET /api/settings
PATCH /api/settings
POST /api/secrets/hf-token
```

Responsibilities:

- read user preferences and default model settings
- update settings as JSON-backed values
- queue settings include implemented `max_parallel_jobs` (`1..4`, default `1`)
- store a Hugging Face token through a write-only endpoint
- avoid persisting plaintext API keys or token-like values

Current implementation notes:

- `GET /api/settings` returns `hf_token_stored` as a boolean and never returns `hf_token` or `diarization_token`.
- `POST /api/secrets/hf-token` stores an encrypted token for provider `huggingface` and returns `204 No Content`.
- There is no plaintext token read endpoint and no delete-token endpoint.
- `job_queue_mode` is not currently read by the backend scheduler; only `max_parallel_jobs` affects worker capacity.

## Derived Views

Speaker-turn transcript view must be derived from ordered sentence records by grouping adjacent sentences with the same `speaker_id`. The derived view must not replace stored sentence boundaries.
