from __future__ import annotations

from dataclasses import dataclass


TRANSCRIPTION_ENGINE = "faster-whisper"
DIARIZATION_ENGINE = "huggingface-pyannote"

DEFAULT_TRANSCRIPTION_MODEL = "distil-large-v3"
DEFAULT_DIARIZATION_MODEL = "pyannote/speaker-diarization-community-1"

TRANSCRIPTION_MODEL_IDS = [
    "tiny",
    "tiny.en",
    "base",
    "base.en",
    "small",
    "small.en",
    "distil-small.en",
    "medium",
    "medium.en",
    "distil-medium.en",
    "large-v1",
    "large-v2",
    "large-v3",
    "large",
    "distil-large-v2",
    "distil-large-v3",
    "large-v3-turbo",
    "turbo",
]

DIARIZATION_MODEL_IDS = [DEFAULT_DIARIZATION_MODEL]


@dataclass(frozen=True)
class TranscriptionModelOption:
    id: str
    label: str
    hf_repo_id: str


@dataclass(frozen=True)
class DiarizationModelOption:
    id: str
    label: str
    requires_token: bool


TRANSCRIPTION_MODELS = [
    TranscriptionModelOption("tiny", "Tiny", "Systran/faster-whisper-tiny"),
    TranscriptionModelOption("tiny.en", "Tiny (English)", "Systran/faster-whisper-tiny.en"),
    TranscriptionModelOption("base", "Base", "Systran/faster-whisper-base"),
    TranscriptionModelOption("base.en", "Base (English)", "Systran/faster-whisper-base.en"),
    TranscriptionModelOption("small", "Small", "Systran/faster-whisper-small"),
    TranscriptionModelOption("small.en", "Small (English)", "Systran/faster-whisper-small.en"),
    TranscriptionModelOption(
        "distil-small.en", "Distil Small (English)", "Systran/faster-distil-whisper-small.en"
    ),
    TranscriptionModelOption("medium", "Medium", "Systran/faster-whisper-medium"),
    TranscriptionModelOption("medium.en", "Medium (English)", "Systran/faster-whisper-medium.en"),
    TranscriptionModelOption(
        "distil-medium.en",
        "Distil Medium (English)",
        "Systran/faster-distil-whisper-medium.en",
    ),
    TranscriptionModelOption("large-v1", "Large v1", "Systran/faster-whisper-large-v1"),
    TranscriptionModelOption("large-v2", "Large v2", "Systran/faster-whisper-large-v2"),
    TranscriptionModelOption("large-v3", "Large v3", "Systran/faster-whisper-large-v3"),
    TranscriptionModelOption("large", "Large", "Systran/faster-whisper-large-v3"),
    TranscriptionModelOption(
        "distil-large-v2", "Distil Large v2", "Systran/faster-distil-whisper-large-v2"
    ),
    TranscriptionModelOption(
        "distil-large-v3", "Distil Large v3", "Systran/faster-distil-whisper-large-v3"
    ),
    TranscriptionModelOption(
        "large-v3-turbo", "Large v3 Turbo", "Systran/faster-whisper-large-v3-turbo"
    ),
    TranscriptionModelOption("turbo", "Turbo", "Systran/faster-whisper-large-v3-turbo"),
]

DIARIZATION_MODELS = [
    DiarizationModelOption(
        id=DEFAULT_DIARIZATION_MODEL,
        label="Pyannote Speaker Diarization Community-1",
        requires_token=True,
    )
]

TRANSCRIPTION_MODELS_BY_ID = {option.id: option for option in TRANSCRIPTION_MODELS}
DIARIZATION_MODELS_BY_ID = {option.id: option for option in DIARIZATION_MODELS}


def validate_transcription_model(model_id: str) -> str:
    if model_id not in TRANSCRIPTION_MODELS_BY_ID:
        raise ValueError(f"Unsupported transcription model: {model_id}")
    return model_id


def validate_diarization_model(model_id: str) -> str:
    if model_id not in DIARIZATION_MODELS_BY_ID:
        raise ValueError(f"Unsupported diarization model: {model_id}")
    return model_id


def model_options_payload() -> dict[str, object]:
    return {
        "transcription_models": [
            {"id": option.id, "label": option.label} for option in TRANSCRIPTION_MODELS
        ],
        "diarization_models": [
            {
                "id": option.id,
                "label": option.label,
                "requires_token": option.requires_token,
            }
            for option in DIARIZATION_MODELS
        ],
        "defaults": {
            "transcription_engine": TRANSCRIPTION_ENGINE,
            "transcription_model": DEFAULT_TRANSCRIPTION_MODEL,
            "diarization_engine": DIARIZATION_ENGINE,
            "diarization_model": DEFAULT_DIARIZATION_MODEL,
            "device": "auto",
            "compute_type": "int8",
            "batch_size": 8,
        },
    }
