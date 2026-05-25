from __future__ import annotations

import gc
import logging
from dataclasses import dataclass
from typing import Any

from ..model_registry import (
    DEFAULT_DIARIZATION_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DIARIZATION_ENGINE,
    TRANSCRIPTION_ENGINE,
)

logger = logging.getLogger(__name__)


def _cleanup_model_memory(step: str) -> None:
    gc.collect()
    try:
        import torch
    except ImportError:
        return
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        if hasattr(torch.cuda, "ipc_collect"):
            torch.cuda.ipc_collect()
    logger.debug("faster-whisper memory cleanup step=%s", step)


@dataclass
class TranscriptWord:
    word: str
    start: float
    end: float
    score: float | None = None
    speaker: str | None = None


def resolve_transcription_device(device: str) -> str:
    if device == "auto":
        return "cpu"
    if device != "cuda":
        return device
    try:
        import torch
    except ImportError:
        logger.warning("Requested CUDA transcription but torch is unavailable; falling back to CPU.")
        return "cpu"
    if not torch.cuda.is_available():
        logger.warning("Requested CUDA transcription but CUDA is unavailable; falling back to CPU.")
        return "cpu"
    return "cuda"


def _resolve_device(device: str) -> str:
    return resolve_transcription_device(device)


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

    resolved_device = _resolve_device(device)
    logger.debug(
        "faster-whisper transcribe start audio_path=%s model_id=%s device=%s compute_type=%s download_root=%s language=%s",
        audio_path,
        model_id,
        resolved_device,
        compute_type,
        download_root,
        language,
    )
    model = None
    segments = None
    info = None
    try:
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

        payload = {
            "transcription_engine": TRANSCRIPTION_ENGINE,
            "transcription_model": model_id or DEFAULT_TRANSCRIPTION_MODEL,
            "diarization_engine": DIARIZATION_ENGINE,
            "diarization_model": DEFAULT_DIARIZATION_MODEL,
            "language": getattr(info, "language", language),
            "segments": normalized_segments,
        }
        logger.debug(
            "faster-whisper transcribe done model_id=%s language=%s segment_count=%s",
            payload["transcription_model"],
            payload["language"],
            len(normalized_segments),
        )
        return payload
    finally:
        model = None
        segments = None
        info = None
        _cleanup_model_memory("transcription")
