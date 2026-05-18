# Technical Debt Tracker

This file tracks known deferred work and maintenance liabilities. Items should stay concise and actionable.

| Item | Status | Notes |
| --- | --- | --- |
| Real-time progress | Deferred | MVP only needs a simple processing state. |
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
| Real faster-whisper and pyannote runtime verification | Open | Tests cover model registry, local model preparation, request construction, fallback speaker assignment, and processor boundaries with fakes; real model loading, Hugging Face downloads, diarization model access, and hardware behavior still need environment validation. |
