# Frontend Guidance

## Scope

The frontend is a React browser UI designed for local use and future Electron packaging. It should communicate with the Python backend through HTTP APIs and should not access SQLite or local filesystem paths directly.

## Main Screens

- Library: uploaded audio list, editable title, upload date, duration, job status, delete action, and open action.
- Upload: file select or drag-and-drop, selected filename, title editing, model configuration, and one-click process.
- Processing: non-blocking progress state with subtle stage text/progress strip plus final success or failure result.
- Transcript Review: audio player, speaker samples, speaker renaming, sentence view, speaker-turn view, transcript editing, sentence playback, and VTT export.
- Settings: default transcription model, diarization model, and runtime defaults for local processing.

Current implementation covers the core upload/library/workspace/settings flow with drag-and-drop upload, title editing, model config controls, one-click basic local model preparation, audio playback through the backend stream endpoint, sentence and speaker-turn review, speaker renaming, sentence edit-on-blur, and sentence-based or speaker-turn-based VTT export. It does not yet include all metadata display details such as duration or storage-location controls.

## Interaction Rules

- Sentence-level transcript records are canonical and should stay individually clickable and editable in every transcript display mode.
- Speaker-turn view groups adjacent sentences from the same speaker but must preserve sentence click and edit interactions.
- Clicking a sentence should seek the audio player to `start_time`, play, and optionally pause at `end_time`.
- Speaker samples should use the same player and timestamp-seeking mechanism as sentence playback.
- Transcript edits should update `current_text` through the backend and should not modify timestamps or speaker assignment.
- Speaker renaming should update the speaker display name through the backend and rely on refreshed or locally updated speaker data for all transcript display.

## Form And State Expectations

- Use `transcription_engine: "faster-whisper"` and `diarization_engine: "huggingface-pyannote"` as fixed defaults.
- The zero basic configuration path should complete without a token by falling back to single-speaker assignment (`SPEAKER_00`).
- Before processing, call the backend basic model preparation endpoint so the required Hugging Face model is downloaded into local app storage if missing.
- Treat per-job Diarization/HF token input as runtime-only request data. Saved Hugging Face tokens must go through the backend secret endpoint and should be represented in UI only by masked state such as `hf_token_stored`.
- Use save-on-blur or short debounce autosave for transcript sentence edits.
- Show only the active transcript view's VTT download action and confirm whether the user is downloading the sentence-based or speaker-turn-based export.
- Show failed job status and error messages in the UI.
- While polling `GET /api/jobs/{job_id}`, render progress from `progress_stage`, `progress_percent`, and `progress_message` in a non-blocking way that blends into the workspace (no modal/overlay).
- Hide soft-deleted audio from the normal library view.

## Electron Compatibility

- Avoid hard-coded hosted URLs.
- Keep API base URL configurable.
- Do not depend on browser access to arbitrary local file paths.
- Prefer backend streaming endpoints for audio playback.

## Frontend Tests

`frontend/package.json` defines `npm test`, which runs Node.js utility tests for extracted helpers in `frontend/src/jobUtils.js` and mounted Vitest/JSDOM workflow tests for the MVP upload, process, review, edit, export, failed-job, delete, and stored-token flows.

Current frontend coverage includes:

- 10 Node utility tests for time formatting, speaker-turn grouping, settings merge/normalization, basic model preparation request construction, transient token request construction, local speaker/sentence updates, and range playback.
- 2 mounted React workflow tests using Vitest, JSDOM, and Testing Library.
