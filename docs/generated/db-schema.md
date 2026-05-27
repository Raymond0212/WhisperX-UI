# Generated Database Schema

This reference is generated from `backend/whisperx_ui_backend/database.py`.

Regenerate it after schema changes with:

```bash
python3 scripts/generate-db-schema-doc.py > docs/generated/db-schema.md
```

## Tables

### `audio_files`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `original_filename` | `TEXT` | Not null |
| `stored_filename` | `TEXT` | Not null, unique |
| `display_title` | `TEXT` | Not null |
| `file_path` | `TEXT` | Not null |
| `mime_type` | `TEXT` | Nullable |
| `duration_seconds` | `REAL` | Nullable |
| `size_bytes` | `INTEGER` | Not null |
| `speaker_count` | `INTEGER` | Nullable |
| `min_speakers` | `INTEGER` | Nullable |
| `max_speakers` | `INTEGER` | Nullable |
| `created_at` | `TEXT` | Not null |
| `deleted_at` | `TEXT` | Nullable soft-delete timestamp |

### `transcription_jobs`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `audio_file_id` | `TEXT` | Not null, references `audio_files(id)` |
| `status` | `TEXT` | Not null |
| `transcription_engine` | `TEXT` | Not null |
| `transcription_model` | `TEXT` | Not null |
| `diarization_engine` | `TEXT` | Not null |
| `diarization_model` | `TEXT` | Not null |
| `language` | `TEXT` | Nullable |
| `device` | `TEXT` | Nullable |
| `compute_type` | `TEXT` | Nullable |
| `batch_size` | `INTEGER` | Nullable |
| `speaker_count` | `INTEGER` | Nullable |
| `min_speakers` | `INTEGER` | Nullable |
| `max_speakers` | `INTEGER` | Nullable |
| `settings_json` | `TEXT` | Not null |
| `error_message` | `TEXT` | Nullable |
| `created_at` | `TEXT` | Not null |
| `queued_at` | `TEXT` | Nullable |
| `started_at` | `TEXT` | Nullable |
| `completed_at` | `TEXT` | Nullable |
| `worker_pid` | `INTEGER` | Nullable |
| `worker_started_at` | `TEXT` | Nullable |
| `last_heartbeat_at` | `TEXT` | Nullable |
| `worker_exit_code` | `INTEGER` | Nullable |
| `worker_signal` | `INTEGER` | Nullable |
| `runtime_device` | `TEXT` | Nullable |
| `runtime_device_note` | `TEXT` | Nullable |
| `progress_stage` | `TEXT` | Nullable |
| `progress_percent` | `REAL` | Nullable |
| `progress_message` | `TEXT` | Nullable |
| `progress_stage_started_at` | `TEXT` | Nullable |
| `progress_updated_at` | `TEXT` | Nullable |

### `speakers`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `job_id` | `TEXT` | Not null, references `transcription_jobs(id)` on delete cascade |
| `speaker_key` | `TEXT` | Not null |
| `display_name` | `TEXT` | Not null |
| `sample_start` | `REAL` | Not null |
| `sample_end` | `REAL` | Not null |
| `created_at` | `TEXT` | Not null |
| `updated_at` | `TEXT` | Not null |

Unique constraint: `(job_id, speaker_key)`.

### `transcript_sentences`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `job_id` | `TEXT` | Not null, references `transcription_jobs(id)` on delete cascade |
| `speaker_id` | `TEXT` | Not null, references `speakers(id)` |
| `sentence_index` | `INTEGER` | Not null |
| `start_time` | `REAL` | Not null |
| `end_time` | `REAL` | Not null |
| `original_text` | `TEXT` | Not null |
| `current_text` | `TEXT` | Not null |
| `confidence` | `REAL` | Nullable |
| `words_json` | `TEXT` | Nullable |
| `created_at` | `TEXT` | Not null |
| `updated_at` | `TEXT` | Not null |

Unique constraint: `(job_id, sentence_index)`.

### `app_settings`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `key` | `TEXT` | Primary key |
| `value_json` | `TEXT` | Not null |
| `updated_at` | `TEXT` | Not null |

### `provider_credentials`

| Column | Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `TEXT` | Primary key |
| `provider` | `TEXT` | Not null, unique by index |
| `display_name` | `TEXT` | Nullable |
| `encrypted_api_key` | `TEXT` | Not null |
| `created_at` | `TEXT` | Not null |
| `updated_at` | `TEXT` | Not null |

## Indexes

| Index | Definition |
| --- | --- |
| `idx_audio_files_deleted_at` | CREATE INDEX idx_audio_files_deleted_at ON audio_files(deleted_at) |
| `idx_jobs_audio_file_id` | CREATE INDEX idx_jobs_audio_file_id ON transcription_jobs(audio_file_id) |
| `idx_provider_credentials_provider` | CREATE UNIQUE INDEX idx_provider_credentials_provider ON provider_credentials(provider) |
| `idx_sentences_job_id_index` | CREATE INDEX idx_sentences_job_id_index ON transcript_sentences(job_id, sentence_index) |
| `idx_speakers_job_id` | CREATE INDEX idx_speakers_job_id ON speakers(job_id) |
