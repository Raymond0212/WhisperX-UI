# Core Beliefs

## Local-First By Default

The app should work on the user's machine without accounts, cloud sync, or online API keys. Local WhisperX and local diarization are the default path. Online providers are optional extensions and must not become required for the base workflow.

## Sentence Is The Canonical Transcript Unit

All transcript behavior should be grounded in sentence-level records:

```text
sentence ID
start time
end time
speaker ID
original text
current text
```

Speaker-turn chunks, VTT cues, search results, and review UI should be derived from sentence records rather than replacing them.

## Preserve Model Output

Users can edit transcript text, but the system should preserve original model output. This enables comparison, re-export, debugging, and future review features without rerunning transcription.

## Separate Speaker Identity From Display Name

Internal diarization labels such as `SPEAKER_00` should remain stable. User-facing display names such as `Alice` can change at any time and should update all views and exports globally.

## Keep Provider Choices Explicit

Every processing job should persist the model settings that produced it. A transcript should remain explainable later, even if defaults change.

## Prefer Recoverable Local Operations

The MVP should favor soft deletion, persisted failure messages, and retained uploads. Permanent data removal can be added later as an explicit destructive action.
