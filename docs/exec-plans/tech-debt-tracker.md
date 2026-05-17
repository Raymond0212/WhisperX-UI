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
| Real WhisperX runtime verification | Open | Tests cover the provider boundary with a fake WhisperX module and local model path resolution; real model loading, alignment, diarization, and hardware behavior still need environment validation. |
