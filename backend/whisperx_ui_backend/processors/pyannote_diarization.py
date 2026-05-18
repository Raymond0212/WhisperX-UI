from __future__ import annotations

from typing import Any


def _extract_intervals(diarization: Any) -> list[dict[str, Any]]:
    intervals: list[dict[str, Any]] = []
    track_source = None
    if hasattr(diarization, "exclusive_speaker_diarization"):
        track_source = diarization.exclusive_speaker_diarization
    elif hasattr(diarization, "speaker_diarization"):
        track_source = diarization.speaker_diarization
    elif hasattr(diarization, "itertracks"):
        track_source = diarization

    if track_source is not None and hasattr(track_source, "itertracks"):
        for turn, _, speaker in track_source.itertracks(yield_label=True):
            intervals.append(
                {"start": float(turn.start), "end": float(turn.end), "speaker": str(speaker)}
            )
        return intervals

    if isinstance(diarization, list):
        for item in diarization:
            if {"start", "end", "speaker"} <= set(item):
                intervals.append(
                    {
                        "start": float(item["start"]),
                        "end": float(item["end"]),
                        "speaker": str(item["speaker"]),
                    }
                )
        return intervals

    raise RuntimeError("Unsupported pyannote diarization output format.")


def diarize_with_pyannote(
    *,
    audio_path: str,
    model_id: str,
    hf_token: str,
    speaker_count: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[dict[str, Any]]:
    if not hf_token:
        raise RuntimeError("Hugging Face token is required for pyannote diarization.")

    try:
        from pyannote.audio import Pipeline
    except ImportError as exc:
        raise RuntimeError(
            "pyannote.audio is not installed. Install dependencies before diarization."
        ) from exc

    try:
        pipeline = Pipeline.from_pretrained(model_id, token=hf_token)
    except TypeError:
        pipeline = Pipeline.from_pretrained(model_id, use_auth_token=hf_token)
    kwargs = {
        key: value
        for key, value in {
            "num_speakers": speaker_count,
            "min_speakers": min_speakers,
            "max_speakers": max_speakers,
        }.items()
        if value is not None
    }
    diarization = pipeline(audio_path, **kwargs)
    return _extract_intervals(diarization)
