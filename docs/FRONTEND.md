# Frontend Guidance

## Scope

The frontend is a React browser UI designed for local use and future Electron packaging. It should communicate with the Python backend through HTTP APIs and should not access SQLite or local filesystem paths directly.

## Main Screens

- Library: uploaded audio list, editable title, upload date, duration, job status, delete action, and open action.
- Upload: file select or drag-and-drop, selected filename, title editing, model configuration, and one-click process.
- Processing: simple waiting state and final success or failure result.
- Transcript Review: audio player, speaker samples, speaker renaming, sentence view, speaker-turn view, transcript editing, sentence playback, and VTT export.
- Settings: default transcription model, diarization model, local model paths, optional online provider API keys, and storage location if supported.

## Interaction Rules

- Sentence-level transcript records are canonical and should stay individually clickable and editable in every transcript display mode.
- Speaker-turn view groups adjacent sentences from the same speaker but must preserve sentence click and edit interactions.
- Clicking a sentence should seek the audio player to `start_time`, play, and optionally pause at `end_time`.
- Speaker samples should use the same player and timestamp-seeking mechanism as sentence playback.
- Transcript edits should update `current_text` through the backend and should not modify timestamps or speaker assignment.
- Speaker renaming should update the speaker display name through the backend and rely on refreshed or locally updated speaker data for all transcript display.

## Form And State Expectations

- Use local models as defaults in model configuration.
- Treat online provider settings as optional.
- Mask API key inputs and avoid displaying secret values after save.
- Use save-on-blur or short debounce autosave for transcript sentence edits.
- Show failed job status and error messages in the UI.
- Hide soft-deleted audio from the normal library view.

## Electron Compatibility

- Avoid hard-coded hosted URLs.
- Keep API base URL configurable.
- Do not depend on browser access to arbitrary local file paths.
- Prefer backend streaming endpoints for audio playback.
