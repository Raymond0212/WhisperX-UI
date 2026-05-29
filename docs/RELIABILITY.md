# Reliability Guidance

## Job State

Processing jobs should persist their status so the UI can display meaningful outcomes. Statuses are:

```text
uploaded
queued
processing
completed
failed
deleted
```

On success, the app should persist speakers, transcript sentences, job settings, and completion time. On failure, it should persist `failed`, an error message, and enough metadata for the user to understand which audio and settings were involved. Deleting a job marks it `deleted`; normal per-audio job listings omit deleted jobs.

The backend enqueues jobs first by creating `queued` job rows with `queued_at`, then a local scheduler starts supervised model workers up to configured capacity. Worker metadata (`worker_pid`, `worker_started_at`, `worker_exit_code`, `worker_signal`) and heartbeat fields (`last_heartbeat_at`) are persisted on the job row so the API can report what happened after crashes or OOM kills.

`max_parallel_jobs` is the implemented queue capacity setting. The scheduler reads it from app settings, coerces it to an integer, and clamps it to `1..4`. `job_queue_mode` may appear in frontend defaults or older docs, but it is not read by the backend scheduler and should not be documented as implemented queue behavior.

Deleting a queued or processing job is targeted. The API marks only that job `deleted` and asks the scheduler to terminate only that job's active worker handle. The scheduler must not start another queued job in that worker slot until the terminated worker has fully exited and been reaped.

## Processing Expectations

The API reports approximate stage-weighted progress while a job is `queued` or `processing`.
Progress data is persisted on each job row as `progress_stage`, `progress_percent`, `progress_message`, `progress_stage_started_at`, and `progress_updated_at`.
Percentages are intentionally approximate and bounded by stage ranges; they are not exact real-time model inference completion metrics. Heartbeat updates may advance the displayed percentage within the current stage so polling UI remains active, but stage changes come from the processing pipeline.

Processing should avoid partial success states that look completed. If transcript or speaker persistence fails, the job should be treated as failed unless the implementation has an explicit recovery path.

The processing path uses faster-whisper for transcription and optionally pyannote diarization when a token is supplied. Without a token, processing should still complete through the single-speaker fallback path (`SPEAKER_00`). Real hardware/model execution remains only partially covered by automated tests.
Silent or near-silent audio may legitimately produce zero transcript sentences; this is treated as a valid completed job rather than a failure.
When diarization indicates speaker changes within an initial sentence window, persistence may split that window into speaker-consistent sub-sentence rows to avoid flattening mixed-speaker content.

The basic model preparation path downloads `Systran/faster-distil-whisper-large-v3` from Hugging Face into `app_data/models/` using `huggingface_hub.snapshot_download`. Download failures should surface as request failures instead of starting a processing job with a missing model.

## Data Retention

Uploaded audio is retained by default. Deletion first marks an audio item with `deleted_at`, hides it from normal library views, marks related transcription jobs as `deleted`, and terminates active local workers for those jobs.

Deleted audio bytes remain on disk during the retention window so accidental deletion is recoverable from local storage.

On backend startup and daily at local midnight, deleted audio older than 30 days is permanently purged from SQLite, the uploads directory, and related per-job log files. A separate delete-token endpoint is not implemented.

## Playback And Export

Transcript playback depends on valid sentence timestamps. Editing transcript text must not alter timestamps. VTT export should always use current transcript text and current speaker display names.

## Filesystem Assumptions

The backend should expect local filesystem operations to fail because of permissions, missing directories, disk space, or moved files. Such failures should be captured as API errors or job failures rather than causing silent data loss.

The audio stream endpoint validates that the stored path resolves inside the configured uploads directory and reports missing files as API errors.

## Verification Workflow

Use these repository scripts for reproducible local validation:

- Backend tests: `./scripts/run-backend-tests.sh`
- Runtime smoke validation: `./scripts/smoke-check-local-runtime.sh`
- Token-enabled diarization smoke validation: `HF_TOKEN=hf_xxx ./scripts/smoke-check-local-runtime.sh`

The smoke script reports `[FAIL]` on failed prerequisites, model preparation, job completion, or transcript retrieval.
It runs in-process with FastAPI `TestClient`, so it does not depend on binding `127.0.0.1:8000`.
First run requires internet access for Python dependency installation and model download.
For silent audio samples, zero transcript sentences are accepted as long as the job completes and transcript endpoint returns a valid list.

The caveat-closure cycle achieved a network-enabled local runtime smoke pass with `./scripts/smoke-check-local-runtime.sh`: dependencies installed, the faster-whisper model downloaded into `app_data_smoke/models/`, the in-process job completed, and transcript retrieval returned a valid list payload.

The scheduler should mark a job as `failed` when the worker exits unexpectedly. If exit signal is `SIGKILL`, the stored error should indicate likely out-of-memory termination.

On API startup and during scheduler polling, stale `processing` jobs with missing/expired heartbeat should be reconciled to `failed`. If the scheduler still has a local worker handle for that job, it should terminate and unregister the unresponsive handle so queued work is not blocked behind a silent worker.
