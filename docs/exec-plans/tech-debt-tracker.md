# Technical Debt Tracker

This file tracks known deferred work and maintenance liabilities. Items should stay concise and actionable.

| Item | Status | Notes |
| --- | --- | --- |
| Exact real-time model progress | Deferred | Current implementation has queued jobs and approximate staged progress for polling UI; exact inference progress remains deferred. |
| Job cancellation | Deferred | Add after processing orchestration is stable. |
| Permanent deletion | Deferred | MVP uses soft delete to avoid accidental data loss. |
| Manual speaker reassignment | Deferred | Speaker renaming is MVP; sentence-level reassignment comes later. |
| Advanced diarization correction | Deferred | Merge/split speaker workflows are post-MVP. |
| Word-level editing | Deferred | Store `words_json` when available, but edit at sentence level for MVP. |
| Transcript version history | Deferred | Preserve original/current text first. |
| Waveform display | Deferred | Timestamped audio playback is sufficient for MVP. |
| Batch uploads | Deferred | Single-file upload first. |
| Extra export formats | Deferred | VTT export first; TXT, JSON, SRT, CSV, DOCX later. |
| OS keychain integration | Deferred | Relevant when Electron packaging begins. |
| Transient job token redaction | Open | Exact `diarization_token` and `hf_token` job setting keys are currently preserved in `settings_json` and may be returned in job responses; stored-token UI flows avoid sending them. |
| Real faster-whisper and pyannote runtime verification | Partially closed | Local smoke validation and token-enabled real-audio benchmark verification have passed on the default path; broader coverage across datasets, platforms, hardware, and gated model-access states remains deferred. |
