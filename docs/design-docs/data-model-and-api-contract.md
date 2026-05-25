# Data Model And API Contract

## Data Model

The MVP uses SQLite for structured persistence.

### Audio File

Represents one uploaded audio file.

| Field | Purpose |
| --- | --- |
| `id` | Unique audio ID. |
| `original_filename` | Filename provided by the upload. |
| `stored_filename` | Unique local filename. |
| `display_title` | User-editable title. |
| `file_path` | Local path to stored audio. |
| `mime_type` | Uploaded MIME type. |
| `duration_seconds` | Audio duration when known. |
| `size_bytes` | File size. |
| `created_at` | Upload timestamp. |
| `deleted_at` | Soft delete timestamp. |

### Transcription Job

Represents one processing run for an audio file.

| Field | Purpose |
| --- | --- |
| `id` | Unique job ID. |
| `audio_file_id` | Related audio file. |
| `status` | Job state. |
| `transcription_engine` | Engine used. |
| `transcription_model` | Model used. |
| `diarization_engine` | Engine used. |
| `diarization_model` | Model used. |
| `language` | Language config. |
| `device` | CPU, CUDA, or auto. |
| `compute_type` | `float16`, `int8`, or similar. |
| `batch_size` | Processing batch size. |
| `speaker_count` | Exact speaker count when provided. |
| `min_speakers` | Minimum speakers when provided. |
| `max_speakers` | Maximum speakers when provided. |
| `settings_json` | Serialized job settings after secret-like keys are stripped. |
| `error_message` | Failure reason. |
| `created_at` | Creation timestamp. |
| `queued_at` | Queue insertion timestamp. |
| `started_at` | Processing start timestamp. |
| `completed_at` | Processing completion timestamp. |
| `worker_pid` | Worker process ID when assigned. |
| `worker_started_at` | Worker launch timestamp. |
| `last_heartbeat_at` | Last worker heartbeat timestamp. |
| `worker_exit_code` | Worker exit code when known. |
| `worker_signal` | Worker signal when process was terminated by signal. |
| `progress_stage` | Current processing stage label. |
| `progress_percent` | Approximate stage-weighted completion percent (`0..100`). |
| `progress_message` | User-facing stage text for non-blocking UI progress display. |
| `progress_stage_started_at` | Timestamp when current stage started. |
| `progress_updated_at` | Timestamp for most recent progress update. |

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

| Field | Purpose |
| --- | --- |
| `id` | Unique speaker record ID. |
| `job_id` | Related job. |
| `speaker_key` | Stable diarization label such as `SPEAKER_00`. |
| `display_name` | User-facing name. |
| `sample_start` | Sample playback start timestamp. |
| `sample_end` | Sample playback end timestamp. |
| `created_at` | Creation timestamp. |
| `updated_at` | Last update timestamp. |

### Transcript Sentence

Represents the canonical transcript segment.

| Field | Purpose |
| --- | --- |
| `id` | Unique sentence ID. |
| `job_id` | Related job. |
| `speaker_id` | Related speaker. |
| `sentence_index` | Order in transcript. |
| `start_time` | Start timestamp. |
| `end_time` | End timestamp. |
| `original_text` | Original transcription text. |
| `current_text` | Edited or current text. |
| `confidence` | Optional confidence score. |
| `words_json` | Optional word-level timestamp data. |
| `created_at` | Creation timestamp. |
| `updated_at` | Last update timestamp. |

### App Setting

Stores preferences and default model choices.

| Field | Purpose |
| --- | --- |
| `key` | Setting name. |
| `value_json` | Serialized setting value. |
| `updated_at` | Last update timestamp. |

Credential persistence APIs are not part of the current phase-2 path.

## API Contract

### Audio APIs

```http
POST /api/audio
GET /api/audio
GET /api/audio/{audio_id}
PATCH /api/audio/{audio_id}
DELETE /api/audio/{audio_id}
GET /api/audio/{audio_id}/stream
```

Responsibilities:

- upload audio files
- list non-deleted audio files
- fetch audio metadata
- update display title
- soft delete audio
- stream local audio for browser playback

Current implementation notes:

- Supported extensions are `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, and `.aac`.
- Stored filenames use a UUID prefix plus a sanitized source filename.
- MIME type is normalized from the filename when the supplied content type is not audio.
- Streaming resolves the stored path and requires it to remain inside the configured uploads directory.

### Job APIs

```http
POST /api/jobs
GET /api/jobs/{job_id}
GET /api/audio/{audio_id}/jobs
```

Responsibilities:

- create and run a transcription job
- create and enqueue a transcription job
- return job status and metadata
- list jobs for an audio file
- persist failure messages when processing fails

Current implementation notes:

- Jobs use fixed engines: `transcription_engine: "faster-whisper"` and `diarization_engine: "huggingface-pyannote"`.
- `POST /api/jobs` returns immediately with a queued/processing job; completion is retrieved via `GET /api/jobs/{job_id}` polling.
- Job responses include progress metadata (`progress_stage`, `progress_percent`, `progress_message`, `progress_stage_started_at`, `progress_updated_at`) for stage-level UI feedback while polling.
- Progress percentages are approximate, stage-weighted estimates (not exact model inference completion).
- Request `settings` may carry transient runtime-only values such as `diarization_token` or `hf_token`; secret-like values are stripped from persisted `settings_json`.
- Token-enabled pyannote diarization passes a preloaded `{waveform, sample_rate}` input to the pipeline. Audio decoding tries torchaudio's soundfile backend, then torchaudio's default loader, then falls back to `faster_whisper.audio.decode_audio`; multi-channel input is averaged to mono float32.
- If a diarization token is present, pyannote diarization runs and its output is normalized into timestamped speaker intervals. The parser accepts the pyannote community wrapper's `exclusive_speaker_diarization`, falls back to `speaker_diarization`, then to raw `itertracks` annotations or interval dictionaries.
- Token-enabled speaker assignment first labels faster-whisper words by strongest diarization interval overlap. Boundary ties keep the first matching diarization interval, and non-overlapping gaps fall back to the nearest interval so assignment remains deterministic.
- Persistence preserves speaker changes inside faster-whisper sentence windows: when timed words in one sentence-sized window contain multiple speaker runs, the backend persists separate speaker-consistent sub-sentence rows rather than flattening the whole window to one speaker. If no word assignment is available for a segment, segment-level interval overlap is used.
- If a diarization token is missing, the job still completes with single-speaker fallback labels (`SPEAKER_00`).

### Local Model APIs

```http
GET /api/models
POST /api/models/prepare-basic
```

Responsibilities:

- report local Hugging Face model download status under the configured `app_data/models/` directory
- download the basic local transcription model when missing
- keep Hugging Face tokens transient and out of persisted settings

Current implementation notes:

- The basic profile downloads `Systran/faster-distil-whisper-large-v3` into `app_data/models/Systran--faster-distil-whisper-large-v3`.
- Download uses `huggingface_hub.snapshot_download` with a repository-local Hugging Face cache under `app_data/models/.hf-cache`.
- When the local model directory exists, the faster-whisper processor uses the local directory path; otherwise it falls back to model ID.
- The zero basic configuration path runs without token and still completes via single-speaker fallback. Supplying token enables pyannote diarization.

### Transcript APIs

```http
GET /api/jobs/{job_id}/transcript
PATCH /api/transcript-sentences/{sentence_id}
GET /api/jobs/{job_id}/export.vtt
```

Responsibilities:

- return sentence-level transcript records
- update `current_text` only for transcript edits
- export VTT using current text and current speaker display names

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
```

Responsibilities:

- read user preferences and default model settings
- update settings as JSON-backed values
- queue settings include `job_queue_mode` (`sequence` or `parallel`) and `max_parallel_jobs` (`1..4`, default `1`)
- avoid persisting plaintext API keys or token-like values

## Derived Views

Speaker-turn transcript view must be derived from ordered sentence records by grouping adjacent sentences with the same `speaker_id`. The derived view must not replace stored sentence boundaries.
