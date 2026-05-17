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
| `settings_json` | Full serialized job settings. |
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

MVP default is no API key persistence unless encrypted storage is deliberately implemented.

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

## Derived Views

Speaker-turn transcript view must be derived from ordered sentence records by grouping adjacent sentences with the same `speaker_id`. The derived view must not replace stored sentence boundaries.
