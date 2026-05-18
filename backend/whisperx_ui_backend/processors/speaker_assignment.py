from __future__ import annotations

from collections import defaultdict
from typing import Any


def _overlap(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))


def _pick_best_speaker(start: float, end: float, intervals: list[dict[str, Any]]) -> str | None:
    best_speaker = None
    best_overlap = 0.0
    for interval in intervals:
        overlap = _overlap(start, end, float(interval["start"]), float(interval["end"]))
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = str(interval["speaker"])
    return best_speaker


def assign_speakers(segments: list[dict[str, Any]], intervals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not intervals:
        raise RuntimeError("No diarization intervals available for speaker assignment.")

    for segment in segments:
        words = segment.get("words") or []
        word_totals: dict[str, float] = defaultdict(float)
        if words:
            for word in words:
                speaker = _pick_best_speaker(float(word["start"]), float(word["end"]), intervals)
                if speaker is None:
                    continue
                word["speaker"] = speaker
                word_totals[speaker] += max(0.0, float(word["end"]) - float(word["start"]))
        if word_totals:
            segment["speaker"] = max(word_totals, key=word_totals.get)
            continue

        speaker = _pick_best_speaker(float(segment["start"]), float(segment["end"]), intervals)
        if speaker is None:
            raise RuntimeError("Could not assign speaker label from diarization intervals.")
        segment["speaker"] = speaker

    return segments
