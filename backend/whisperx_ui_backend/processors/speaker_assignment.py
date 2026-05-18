from __future__ import annotations

from collections import defaultdict
from typing import Any


GAP_TOLERANCE_SECONDS = 0.08


def _overlap(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))


def _distance_to_interval(point: float, start: float, end: float) -> float:
    if start <= point <= end:
        return 0.0
    if point < start:
        return start - point
    return point - end


def _pick_best_speaker(start: float, end: float, intervals: list[dict[str, Any]]) -> str | None:
    if not intervals:
        return None
    best_speaker = None
    best_overlap = 0.0
    for index, interval in enumerate(intervals):
        overlap = _overlap(start, end, float(interval["start"]), float(interval["end"]))
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = str(interval["speaker"])
    if best_speaker is not None:
        return best_speaker

    # Gap handling: pick nearest interval to word/segment midpoint for deterministic fallback.
    midpoint = (start + end) / 2
    nearest_index = None
    nearest_distance = None
    nearest_speaker = None
    for index, interval in enumerate(intervals):
        distance = _distance_to_interval(midpoint, float(interval["start"]), float(interval["end"]))
        if nearest_distance is None or distance < nearest_distance - 1e-9:
            nearest_distance = distance
            nearest_index = index
            nearest_speaker = str(interval["speaker"])
        elif nearest_distance is not None and abs(distance - nearest_distance) <= 1e-9:
            if nearest_index is not None and index < nearest_index:
                nearest_index = index
                nearest_speaker = str(interval["speaker"])
    if nearest_distance is not None and nearest_distance <= GAP_TOLERANCE_SECONDS:
        return nearest_speaker
    # Last fallback keeps behavior deterministic for larger gaps.
    return nearest_speaker


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
            best_duration = max(word_totals.values())
            candidates = sorted(
                speaker for speaker, duration in word_totals.items() if duration == best_duration
            )
            segment["speaker"] = candidates[0]
            continue

        speaker = _pick_best_speaker(float(segment["start"]), float(segment["end"]), intervals)
        if speaker is None:
            raise RuntimeError("Could not assign speaker label from diarization intervals.")
        segment["speaker"] = speaker

    return segments
