from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..model_registry import (
    DEFAULT_DIARIZATION_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DIARIZATION_ENGINE,
    TRANSCRIPTION_ENGINE,
)


@dataclass
class TranscriptWord:
    word: str
    start: float
    end: float
    score: float | None = None
    speaker: str | None = None


def transcribe_with_faster_whisper(
    *,
    audio_path: str,
    model_id: str = DEFAULT_TRANSCRIPTION_MODEL,
    device: str = "auto",
    compute_type: str = "int8",
    language: str | None = None,
    download_root: str,
) -> dict[str, Any]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Install dependencies before transcription."
        ) from exc

    resolved_device = "cpu" if device == "auto" else device
    model = WhisperModel(
        model_id,
        device=resolved_device,
        compute_type=compute_type,
        download_root=download_root,
    )
    segments, info = model.transcribe(audio_path, language=language, word_timestamps=True)

    normalized_segments: list[dict[str, Any]] = []
    for segment in segments:
        words = []
        for word in segment.words or []:
            words.append(
                {
                    "word": word.word,
                    "start": float(word.start),
                    "end": float(word.end),
                    "score": float(word.probability) if word.probability is not None else None,
                }
            )
        normalized_segments.append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": segment.text.strip(),
                "confidence": float(segment.avg_logprob) if segment.avg_logprob is not None else None,
                "words": words,
            }
        )

    return {
        "transcription_engine": TRANSCRIPTION_ENGINE,
        "transcription_model": model_id or DEFAULT_TRANSCRIPTION_MODEL,
        "diarization_engine": DIARIZATION_ENGINE,
        "diarization_model": DEFAULT_DIARIZATION_MODEL,
        "language": getattr(info, "language", language),
        "segments": normalized_segments,
    }
