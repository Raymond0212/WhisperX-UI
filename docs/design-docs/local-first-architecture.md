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

The MVP can run processing synchronously from the user's perspective after job creation. The UI only needs `processing`, `completed`, and `failed` feedback; detailed progress streaming is deferred.

The local pipeline is:

```text
transcription
-> sentence chunking
-> optional diarization when a Hugging Face token is supplied
-> speaker assignment
-> speaker sample selection
-> persistence
```

Processor-specific implementations should sit behind service boundaries so engine/model details share the same job, transcript, speaker, and export contracts. The zero basic configuration path still completes without a token by assigning `SPEAKER_00`.

## Speaker Samples

Speaker samples should use the uploaded audio source and timestamp ranges when possible. The system should store `sample_start` and `sample_end` for each speaker rather than generating separate clip files for MVP.

## Electron Compatibility

Avoid assumptions that only work in a hosted SaaS environment. The frontend should communicate through local HTTP APIs and should not require browser access to arbitrary local file paths. Future Electron work can add backend process lifecycle management and OS keychain credential storage.
