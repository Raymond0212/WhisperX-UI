# Phase 2 major refactor to faster-whisper and Hugging Face pyannote diarization community model

## Goal

Refactor `WhisperX-UI` from an MVP scaffold into a real local inference app using:

- **Transcription:** `faster-whisper`
- **Main backend model loader:** direct `WhisperModel` usage
- **Default Whisper model:** `distil-large-v3`
- **Diarization:** Hugging Face-loaded pyannote model
- **Initial diarization model:** `pyannote/speaker-diarization-community-1`

This update is a **major refactor with no backward compatibility guarantee**. Codex should not preserve legacy placeholder behavior, legacy provider names, or old persisted settings unless doing so is trivial.

The implemented frontend and backend defaults should use the phase-2 engine/model contract rather than legacy `whisperx-small`, `local`, or `none` values.

---

## Non-negotiable product changes

### 1. Remove placeholder-oriented flow

Remove or isolate these concepts from the main path:

- `placeholder` transcription provider
- `online` transcription provider
- `whisperx-small` as the default model
- free-text model entry fields
- generic `local` provider wording

The main path should be production-oriented:

```text
Transcription engine: faster-whisper
Diarization engine: huggingface-pyannote
```

---

## Transcription dropdown

Replace free-text transcription model inputs with a dropdown.

Keep this exact list:

```text
tiny
tiny.en
base
base.en
small
small.en
distil-small.en
medium
medium.en
distil-medium.en
large-v1
large-v2
large-v3
large
distil-large-v2
distil-large-v3
large-v3-turbo
turbo
```

Default selected value:

```text
distil-large-v3
```

Backend should validate the submitted model against this registry.

---

## Diarization dropdown

Replace free-text diarization model inputs with a dropdown.

Use this list for now:

```text
pyannote/speaker-diarization-community-1
```

Do **not** include `none` in the diarization model dropdown.

Diarization should be part of this major update’s intended path. The user should select the pyannote model from the dropdown, and the backend should load it from Hugging Face.

---

## Backend refactor tasks

### 1. Add dependencies

Update backend dependencies to support:

- `faster-whisper`
- `pyannote.audio`
- `torch`
- `torchaudio`
- `transformers`
- `huggingface-hub`

Keep existing FastAPI dependencies.

### Local verification commands

Use repository scripts for repeatable checks:

- `./scripts/run-backend-tests.sh`
- `./scripts/smoke-check-local-runtime.sh`
- `HF_TOKEN=hf_xxx ./scripts/smoke-check-local-runtime.sh` for token-enabled diarization path
- `./scripts/download-diarization-benchmark.sh`
- `./scripts/run-diarization-benchmark.sh`
- `./scripts/download-real-diarization-benchmark.sh` (auto-bootstraps `benchmarks/real-audio/manifest.json` from a small public subset by default)
- `HF_TOKEN=hf_xxx ./scripts/run-real-diarization-benchmark.sh`

Caveat-closure verification achieved a network-enabled no-token smoke pass with `./scripts/smoke-check-local-runtime.sh`, including dependency installation, Hugging Face model download, in-process FastAPI job completion, and transcript-list retrieval.

---

### 2. Add a model registry module

Create a dedicated backend registry for:

- faster-whisper transcription models
- Hugging Face diarization models
- default model IDs
- labels for frontend dropdowns
- token requirements

Suggested file:

```text
backend/whisperx_ui_backend/model_registry.py
```

It should expose:

- transcription model options
- diarization model options
- default transcription model: `distil-large-v3`
- default diarization model: `pyannote/speaker-diarization-community-1`

---

### 3. Replace WhisperX backend processor

Replace the current WhisperX processor path with a new faster-whisper processor.

Suggested new files:

```text
backend/whisperx_ui_backend/processors/faster_whisper_processor.py
backend/whisperx_ui_backend/processors/pyannote_diarization.py
backend/whisperx_ui_backend/processors/speaker_assignment.py
```

The faster-whisper processor should:

- load the selected model through `WhisperModel`
- use `distil-large-v3` by default
- use `app_data/models` as the local model/cache root
- support `device`
- support `compute_type`
- support `language`
- request word timestamps
- convert faster-whisper output into the app’s transcript persistence format
- fail jobs cleanly with explicit error messages

---

### 4. Add Hugging Face pyannote diarization

Implement diarization using the selected Hugging Face model:

```text
pyannote/speaker-diarization-community-1
```

Expected behavior:

- use a Hugging Face token when pyannote diarization is enabled
- allow the zero-basic-config path to complete without a token by assigning a single `SPEAKER_00` label
- load the model through the pyannote pipeline interface
- support speaker controls:
  - speaker count
  - min speakers
  - max speakers

- convert pyannote outputs into timestamped speaker intervals, including the community model wrapper's `exclusive_speaker_diarization` annotation
- assign speakers to faster-whisper words or segments by timestamp overlap

Do not describe this as a generic `transformers.pipeline` implementation. It is a Hugging Face-hosted pyannote diarization pipeline. `transformers` can be included as a dependency where required by the runtime stack.

---

### 5. Speaker assignment logic

Because faster-whisper and pyannote run separately, implement deterministic reconciliation.

Rules:

- Prefer word-level speaker assignment when word timestamps exist.
- Assign each word to the diarization speaker interval with the strongest timestamp overlap.
- Resolve overlap ties deterministically by keeping the first matching diarization interval.
- Assign words in diarization gaps to the nearest interval so rapid speaker-change behavior stays deterministic.
- Persist speaker changes inside a faster-whisper sentence window as separate speaker-consistent sub-sentence rows instead of flattening mixed-speaker content to a single speaker.
- Assign single-speaker transcript sentence rows to the speaker with the strongest accumulated assigned word duration.
- If word timestamps are unavailable, use segment-level overlap.
- If token-enabled diarization runs but no speaker can be assigned, fail clearly instead of silently producing fake labels. The explicit no-token path is a documented single-speaker fallback.

---

## API/schema refactor

### Replace legacy fields

Move away from:

```text
transcription_provider
diarization_provider
```

Use clearer names:

```text
transcription_engine
diarization_engine
```

Recommended values:

```text
transcription_engine: faster-whisper
diarization_engine: huggingface-pyannote
```

### Update defaults

Use:

```text
transcription_model: distil-large-v3
diarization_model: pyannote/speaker-diarization-community-1
```

### Add model-options endpoint

Add or repurpose an endpoint for frontend dropdowns:

```text
GET /api/model-options
```

Expected response sections:

```text
transcription_models
diarization_models
defaults
```

This lets the frontend avoid hardcoding model options.

---

## Frontend refactor tasks

### 1. Replace text inputs with dropdowns

In the model configuration UI:

- transcription model: dropdown
- diarization model: dropdown
- no free-text model entry
- no `none` option in diarization model dropdown

### 2. Replace old provider controls

Remove old provider dropdown options:

```text
local
placeholder
online
none
```

Use fixed or hidden engine values:

```text
faster-whisper
huggingface-pyannote
```

The UI can display these as read-only labels rather than dropdowns.

### 3. Update frontend defaults

Replace current defaults with:

```text
transcription_engine: faster-whisper
transcription_model: distil-large-v3
diarization_engine: huggingface-pyannote
diarization_model: pyannote/speaker-diarization-community-1
device: auto
compute_type: int8
batch_size: 8
```

### 4. Update copy

Replace MVP wording such as:

```text
placeholder processing
```

With:

```text
local faster-whisper transcription and Hugging Face speaker diarization
```

---

## Data and migration stance

This phase has **no backward compatibility requirement**.

Codex can:

- reset old app settings
- invalidate old job records
- drop old provider/model values
- rewrite schema columns
- remove placeholder job paths
- update tests to match the new contract

Preferred preservation:

- keep uploaded audio files if practical
- allow old transcripts/jobs to be discarded during local development

---

## Acceptance criteria

Codex should consider the phase complete when:

- Frontend shows a transcription model dropdown with the full faster-whisper list.
- Default transcription model is `distil-large-v3`.
- Frontend shows a diarization model dropdown with `pyannote/speaker-diarization-community-1`.
- Diarization dropdown does not include `none`.
- Backend validates model IDs against the registry.
- Backend loads transcription through `faster_whisper.WhisperModel`.
- Backend loads diarization from Hugging Face using the pyannote model.
- HF token is passed safely at job runtime and not persisted in plaintext settings.
- Job output persists speakers and editable transcript sentences.
- VTT export still works.
- README clearly states this is a major refactor with no backward compatibility guarantee.
- Placeholder is removed from the main processing path.
