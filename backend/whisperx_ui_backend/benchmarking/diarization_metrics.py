from __future__ import annotations

from itertools import permutations
from typing import Any


def validate_real_audio_manifest(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("Manifest must include a non-empty 'cases' list.")

    normalized: list[dict[str, Any]] = []
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("Each case must be an object.")
        required = ("id", "audio_path", "reference_path", "provenance")
        for key in required:
            if key not in case or not case[key]:
                raise ValueError(f"Case missing required field: {key}")
        normalized.append(case)
    return normalized


def best_label_mapping_accuracy(
    predicted: list[str], reference: list[str]
) -> tuple[float, dict[str, str]]:
    n = min(len(predicted), len(reference))
    if n == 0:
        return 0.0, {}
    predicted = predicted[:n]
    reference = reference[:n]

    pred_labels = sorted(set(predicted))
    ref_labels = sorted(set(reference))

    if not pred_labels or not ref_labels:
        return 0.0, {}

    best_acc = -1.0
    best_map: dict[str, str] = {}
    for perm in permutations(ref_labels, min(len(pred_labels), len(ref_labels))):
        mapping = {pred_labels[i]: perm[i] for i in range(len(perm))}
        correct = 0
        for pred, ref in zip(predicted, reference):
            mapped = mapping.get(pred, pred)
            if mapped == ref:
                correct += 1
        acc = correct / n
        if acc > best_acc:
            best_acc = acc
            best_map = mapping
    return best_acc, best_map


def speaker_change_metrics(predicted: list[str], reference: list[str]) -> tuple[float, float]:
    n = min(len(predicted), len(reference))
    if n <= 1:
        return 0.0, 0.0
    predicted = predicted[:n]
    reference = reference[:n]
    expected_changes = {i for i in range(1, n) if reference[i] != reference[i - 1]}
    predicted_changes = {i for i in range(1, n) if predicted[i] != predicted[i - 1]}
    tp = len(expected_changes & predicted_changes)
    fp = len(predicted_changes - expected_changes)
    fn = len(expected_changes - predicted_changes)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    return precision, recall


def speaker_change_metrics_with_collar(
    predicted_boundaries: list[float],
    reference_boundaries: list[float],
    collar_seconds: float = 0.5,
) -> tuple[float, float]:
    if collar_seconds < 0:
        raise ValueError("collar_seconds must be non-negative")

    pred = sorted(float(x) for x in predicted_boundaries)
    ref = sorted(float(x) for x in reference_boundaries)
    if not pred and not ref:
        return 1.0, 1.0
    if not pred:
        return 0.0, 0.0
    if not ref:
        return 0.0, 0.0

    used_ref: set[int] = set()
    tp = 0
    for p in pred:
        best_idx = None
        best_dist = None
        for idx, r in enumerate(ref):
            if idx in used_ref:
                continue
            dist = abs(p - r)
            if dist <= collar_seconds and (best_dist is None or dist < best_dist):
                best_dist = dist
                best_idx = idx
        if best_idx is not None:
            used_ref.add(best_idx)
            tp += 1

    fp = len(pred) - tp
    fn = len(ref) - tp
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    return precision, recall
