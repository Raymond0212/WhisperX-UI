from __future__ import annotations

import gc
import logging
from typing import Any

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
    logger.debug("pyannote memory cleanup step=%s", step)


def _load_waveform_for_pyannote(audio_path: str) -> dict[str, Any]:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("torch is required for pyannote diarization audio loading.") from exc

    waveform = None
    sample_rate = None

    # Prefer faster-whisper decoding first: it is already required for the
    # transcription path and avoids OS/runtime-specific torchcodec coupling.
    try:
        from faster_whisper.audio import decode_audio

        decoded = decode_audio(audio_path)
        waveform = torch.tensor(decoded, dtype=torch.float32).unsqueeze(0)
        sample_rate = 16000
    except Exception:
        logger.debug("faster-whisper decode failed for %s; trying torchaudio fallback", audio_path)
        try:
            import torchaudio

            try:
                waveform, sample_rate = torchaudio.load(audio_path, backend="soundfile")
            except Exception:
                waveform, sample_rate = torchaudio.load(audio_path)
        except Exception as exc:
            raise RuntimeError(
                "Unable to decode audio for pyannote diarization with torchaudio or faster-whisper."
            ) from exc

    if waveform.ndim != 2:
        raise RuntimeError(f"Unexpected waveform shape for diarization input: {tuple(waveform.shape)}")
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    waveform = waveform.to(dtype=torch.float32)
    return {"waveform": waveform, "sample_rate": int(sample_rate)}


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


def _resolve_pipeline_device(device: str) -> str:
    try:
        import torch
    except ImportError:
        logger.warning("Torch is unavailable for pyannote; falling back to CPU.")
        return "cpu"

    if device == "cpu":
        return "cpu"
    if device == "cuda":
        if torch.cuda.is_available():
            return "cuda"
        logger.warning("Requested CUDA diarization but CUDA is unavailable; falling back to CPU.")
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def diarize_with_pyannote(
    *,
    audio_path: str,
    model_id: str,
    hf_token: str,
    device: str = "auto",
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

    pipeline = None
    diarization_input = None
    diarization = None
    try:
        try:
            pipeline = Pipeline.from_pretrained(model_id, token=hf_token)
        except TypeError:
            pipeline = Pipeline.from_pretrained(model_id, use_auth_token=hf_token)

        if hasattr(pipeline, "to"):
            pipeline_device = _resolve_pipeline_device(device)
            if pipeline_device == "cuda":
                import torch
                pipeline.to(torch.device("cuda"))
            else:
                try:
                    import torch
                    pipeline.to(torch.device("cpu"))
                except ImportError:
                    # Pipeline execution can still proceed on CPU-only setups.
                    pass

        kwargs = {
            key: value
            for key, value in {
                "num_speakers": speaker_count,
                "min_speakers": min_speakers,
                "max_speakers": max_speakers,
            }.items()
            if value is not None
        }
        diarization_input = _load_waveform_for_pyannote(audio_path)
        logger.debug(
            "pyannote diarization start audio_path=%s model_id=%s kwargs=%s",
            audio_path,
            model_id,
            kwargs,
        )
        diarization = pipeline(diarization_input, **kwargs)
        intervals = _extract_intervals(diarization)
        logger.debug("pyannote diarization done interval_count=%s", len(intervals))
        return intervals
    finally:
        pipeline = None
        diarization_input = None
        diarization = None
        _cleanup_model_memory("diarization")
