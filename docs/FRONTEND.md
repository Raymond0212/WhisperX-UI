# Frontend Guidance

## Scope

The frontend is a React browser UI designed for local use and future Electron packaging. It should communicate with the Python backend through HTTP APIs and should not access SQLite or local filesystem paths directly.

## Main Screens

- Library: uploaded audio list, editable title, upload date, duration, job status, delete action, and open action.
- Upload: file select or drag-and-drop, selected filename, title editing, model configuration, and one-click process.
- Processing: simple waiting state and final success or failure result.
- Transcript Review: audio player, speaker samples, speaker renaming, sentence view, speaker-turn view, transcript editing, sentence playback, and VTT export.
- Settings: default transcription model, diarization model, local model paths, optional online provider API keys, and storage location if supported.

Current implementation covers the core upload/library/workspace/settings flow with drag-and-drop upload, title editing, model config controls, one-click basic local model preparation, audio playback through the backend stream endpoint, sentence and speaker-turn review, speaker renaming, sentence edit-on-blur, and VTT export. It does not yet include all metadata display details such as duration or storage-location controls.

## Interaction Rules

- Sentence-level transcript records are canonical and should stay individually clickable and editable in every transcript display mode.
- Speaker-turn view groups adjacent sentences from the same speaker but must preserve sentence click and edit interactions.
- Clicking a sentence should seek the audio player to `start_time`, play, and optionally pause at `end_time`.
- Speaker samples should use the same player and timestamp-seeking mechanism as sentence playback.
- Transcript edits should update `current_text` through the backend and should not modify timestamps or speaker assignment.
- Speaker renaming should update the speaker display name through the backend and rely on refreshed or locally updated speaker data for all transcript display.

## Form And State Expectations

- Use local transcription as the default. The zero basic configuration path uses `diarization_provider: "none"` so the first run does not require a gated diarization token.
- Before processing with the local provider, call the backend basic model preparation endpoint so the required Hugging Face model is downloaded into local app storage if missing.
- Treat online provider settings as optional.
- Treat Diarization/HF token input as transient per-job data. Send it only in job request `settings`; do not persist it as a saved default.
- Mask API key inputs and avoid displaying secret values after save.
- Use save-on-blur or short debounce autosave for transcript sentence edits.
- Show failed job status and error messages in the UI.
- Hide soft-deleted audio from the normal library view.

## Electron Compatibility

- Avoid hard-coded hosted URLs.
- Keep API base URL configurable.
- Do not depend on browser access to arbitrary local file paths.
- Prefer backend streaming endpoints for audio playback.

## Frontend Tests

`frontend/package.json` defines `npm test`, which runs Node.js utility tests for extracted helpers in `frontend/src/jobUtils.js` and a mounted Vitest/JSDOM workflow test for the MVP upload, process, review, edit, export, failed-job, and delete flow.

Current frontend coverage includes:

- 9 Node utility tests for time formatting, speaker-turn grouping, settings merge/normalization, basic model preparation request construction, transient token request construction, local speaker/sentence updates, and range playback.
- 1 mounted React workflow test using Vitest, JSDOM, and Testing Library.
