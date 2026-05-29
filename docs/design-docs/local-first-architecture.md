# Local-First Architecture

## Runtime Model

The app runs as a local web application:

```text
React frontend in browser
-> local Python API server
-> SQLite and local filesystem
-> faster-whisper and optional Hugging Face pyannote processors
```

The initial user entry point is `http://localhost:<port>`. Electron packaging should later wrap the same UI and launch or supervise the Python backend.

## Storage Model

Application data should live under a configurable app data directory. The default layout is:

```text
app_data/
  database.sqlite
  uploads/
  exports/
  logs/
  models/
```

SQLite stores metadata and structured records. The filesystem stores uploaded audio and generated files. Database rows should reference stored filenames and paths rather than embedding audio data.

## Upload Handling

Each upload creates a new audio record, even when the source file has already been uploaded. Duplicate source filenames must not overwrite existing files. Stored filenames should include a unique prefix such as a UUID.

Display titles are user-editable and may initially derive from the original filename without extension.

## Processing Model

Processing is asynchronous after job creation. The API persists a `queued` job, and a local scheduler starts supervised worker processes up to the configured `max_parallel_jobs` capacity. The UI polls job status and approximate staged progress fields rather than relying on exact real-time inference progress.

The local pipeline is:

```text
transcription
-> sentence chunking
-> optional diarization when a transient or saved encrypted Hugging Face token is supplied
-> speaker assignment
-> speaker sample selection
-> persistence
```

Processor-specific implementations should sit behind service boundaries so engine/model details share the same job, transcript, speaker, and export contracts. The zero basic configuration path still completes without a token by assigning `SPEAKER_00`.

## Speaker Samples

Speaker samples should use the uploaded audio source and timestamp ranges when possible. The system should store `sample_start` and `sample_end` for each speaker rather than generating separate clip files. When selecting from sentence ranges, it should pick the longest sample sentence by default.
