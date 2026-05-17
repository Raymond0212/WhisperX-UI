# Reliability Guidance

## Job State

Processing jobs should persist their status so the UI can display meaningful outcomes. MVP statuses are:

```text
uploaded
processing
completed
failed
deleted
```

On success, the app should persist speakers, transcript sentences, job settings, and completion time. On failure, it should persist `failed`, an error message, and enough metadata for the user to understand which audio and settings were involved.

## Processing Expectations

Real-time progress is not required for MVP. The UI may show a simple processing state while the backend runs transcription and diarization.

Processing should avoid partial success states that look completed. If transcript or speaker persistence fails, the job should be treated as failed unless the implementation has an explicit recovery path.

## Data Retention

Uploaded audio is retained by default. Deletion should use soft delete for MVP by setting `deleted_at` and hiding the item from normal library views.

Permanent deletion is deferred and should later be explicit because it removes user data from disk and SQLite.

## Playback And Export

Transcript playback depends on valid sentence timestamps. Editing transcript text must not alter timestamps. VTT export should always use current transcript text and current speaker display names.

## Filesystem Assumptions

The backend should expect local filesystem operations to fail because of permissions, missing directories, disk space, or moved files. Such failures should be captured as API errors or job failures rather than causing silent data loss.
