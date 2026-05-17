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
| `transcription_provider` | Provider used. |
| `transcription_model` | Model used. |
| `diarization_provider` | Provider used. |
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
| `started_at` | Processing start timestamp. |
| `completed_at` | Processing completion timestamp. |

Suggested statuses:

```text
uploaded
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

### Provider Credential

Optional storage for online provider credentials.

| Field | Purpose |
| --- | --- |
| `id` | Credential ID. |
| `provider` | Provider name. |
| `display_name` | Optional user-facing label. |
| `encrypted_api_key` | Encrypted API key. |
| `created_at` | Creation timestamp. |
| `updated_at` | Last update timestamp. |

MVP default is no API key persistence unless encrypted storage is deliberately implemented. The current implementation creates the credential table but does not expose credential APIs; settings persistence strips secret-like keys and returns `online_api_keys` as an empty object.

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
- return job status and metadata
- list jobs for an audio file
- persist failure messages when processing fails

Current implementation notes:

- `transcription_provider: "placeholder"` produces deterministic demo transcript rows.
- Other providers currently use the local WhisperX path, which imports WhisperX at runtime and fails the job clearly if unavailable.
- Request `settings` may carry transient runtime-only values such as `diarization_token` or `hf_token`; secret-like values are used for the current job when needed but stripped from persisted `settings_json`.
- When diarization is enabled, the WhisperX path fails the job if the final segments do not contain speaker labels.
- `diarization_provider: "none"` disables diarization pipeline setup and allows speakerless WhisperX output to persist under the fallback `SPEAKER_00`, even if a transient token is present.
- The tested WhisperX path chunks returned segments into sentence records and covers fake alignment and diarization assignment. Real WhisperX, pyannote, model loading, and hardware execution still need validation outside the fake module tests.

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

- The basic profile downloads `Systran/faster-whisper-small` into `app_data/models/Systran--faster-whisper-small`.
- Download uses `huggingface_hub.snapshot_download` with a repository-local Hugging Face cache under `app_data/models/.hf-cache`.
- When the local model directory exists, the WhisperX processor passes the local directory path to `whisperx.load_model`; otherwise it falls back to the configured model key.
- The zero basic configuration path defaults diarization to `"none"` so users can run first local transcription without a gated diarization model or token.

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
- avoid persisting plaintext API keys or token-like values

## Derived Views

Speaker-turn transcript view must be derived from ordered sentence records by grouping adjacent sentences with the same `speaker_id`. The derived view must not replace stored sentence boundaries.
