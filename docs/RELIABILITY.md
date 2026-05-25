# Reliability Guidance

## Job State

Processing jobs should persist their status so the UI can display meaningful outcomes. MVP statuses are:

```text
uploaded
queued
processing
completed
failed
deleted
```

On success, the app should persist speakers, transcript sentences, job settings, and completion time. On failure, it should persist `failed`, an error message, and enough metadata for the user to understand which audio and settings were involved.

The backend enqueues jobs first, then a local scheduler starts supervised model workers. Worker metadata and heartbeat fields are persisted on the job row so the API can report what happened after crashes or OOM kills.

## Processing Expectations

The API now reports approximate stage-weighted progress while a job is `queued` or `processing`.
Progress data is persisted on each job row as `progress_stage`, `progress_percent`, `progress_message`, `progress_stage_started_at`, and `progress_updated_at`.
Percentages are intentionally approximate and bounded by stage ranges; they are not exact inference completion metrics.

Processing should avoid partial success states that look completed. If transcript or speaker persistence fails, the job should be treated as failed unless the implementation has an explicit recovery path.

The processing path uses faster-whisper for transcription and optionally pyannote diarization when a token is supplied. Without a token, processing should still complete through the single-speaker fallback path (`SPEAKER_00`). Real hardware/model execution remains only partially covered by automated tests.
Silent or near-silent audio may legitimately produce zero transcript sentences; this is treated as a valid completed job rather than a failure.
When diarization indicates speaker changes within an initial sentence window, persistence may split that window into speaker-consistent sub-sentence rows to avoid flattening mixed-speaker content.

The basic model preparation path downloads `Systran/faster-distil-whisper-large-v3` from Hugging Face into `app_data/models/` using `huggingface_hub.snapshot_download`. Download failures should surface as request failures instead of starting a processing job with a missing model.

## Data Retention

Uploaded audio is retained by default. Deletion should use soft delete for MVP by setting `deleted_at` and hiding the item from normal library views.

Current soft delete also marks related transcription jobs as `deleted`. Audio bytes are retained on disk.

Permanent deletion is deferred and should later be explicit because it removes user data from disk and SQLite.

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
- Deterministic diarization fixture benchmark: `./scripts/run-diarization-benchmark.sh`
- Real-audio benchmark data fetch/check: `./scripts/download-real-diarization-benchmark.sh` (auto-generates `benchmarks/real-audio/manifest.json` from a small public subset by default)
- Real-audio benchmark run: `HF_TOKEN=hf_xxx ./scripts/run-real-diarization-benchmark.sh`

The smoke script reports `[FAIL]` on failed prerequisites, model preparation, job completion, or transcript retrieval.
It runs in-process with FastAPI `TestClient`, so it does not depend on binding `127.0.0.1:8000`.
First run requires internet access for Python dependency installation and model download.
For silent audio samples, zero transcript sentences are accepted as long as the job completes and transcript endpoint returns a valid list.
The benchmark script computes word-level speaker accuracy and speaker-change precision/recall from deterministic local fixtures. It returns non-zero when quality metrics fall below configured thresholds (`MIN_WORD_SPEAKER_ACCURACY`, `MIN_SPEAKER_CHANGE_PRECISION`, `MIN_SPEAKER_CHANGE_RECALL`), whose defaults are `0.80`, `0.70`, and `0.70`.
For real-audio evaluation, `download-real-diarization-benchmark.sh` now bootstraps a manifest from `diarizers-community/voxconverse` by default (configurable via `BOOTSTRAP_DATASET`, `BOOTSTRAP_SPLIT`, and `BOOTSTRAP_CASES`) and verifies referenced files exist. You can still provide a curated manifest with provenance, local audio/reference paths, and optional download URLs plus checksums. Real benchmark requires `HF_TOKEN` unless explicitly evaluating the no-token fallback path. Speaker-change gating uses a boundary-time collar (`SPEAKER_CHANGE_COLLAR_SECONDS`, default `0.75`) to avoid false failures from near-boundary timestamp jitter.

The caveat-closure cycle achieved a network-enabled local runtime smoke pass with `./scripts/smoke-check-local-runtime.sh`: dependencies installed, the faster-whisper model downloaded into `app_data_smoke/models/`, the in-process job completed, and transcript retrieval returned a valid list payload.

The token-enabled pyannote benchmark verification cycle achieved a pass with `HF_TOKEN` loaded from local environment and `./scripts/run-real-diarization-benchmark.sh` against the bootstrapped real-audio case. The passing run reported word speaker accuracy `0.956`, sentence speaker accuracy `0.829`, collar speaker-change precision `0.857`, and collar speaker-change recall `0.600` against the default thresholds.
The scheduler should mark a job as `failed` when the worker exits unexpectedly. If exit signal is `SIGKILL`, the stored error should indicate likely out-of-memory termination.

On API startup, stale `processing` jobs with missing/expired heartbeat should be reconciled to `failed`.
