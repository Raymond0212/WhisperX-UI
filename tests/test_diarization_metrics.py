from __future__ import annotations

from whisperx_ui_backend.benchmarking.diarization_metrics import (
    best_label_mapping_accuracy,
    speaker_change_metrics,
    speaker_change_metrics_with_collar,
    validate_real_audio_manifest,
)


def test_validate_real_audio_manifest_accepts_minimal_case():
    manifest = {
        "cases": [
            {
                "id": "c1",
                "audio_path": "benchmarks/real-audio/data/a.wav",
                "reference_path": "benchmarks/real-audio/data/a.reference.json",
                "provenance": {"source": "user"},
            }
        ]
    }
    cases = validate_real_audio_manifest(manifest)
    assert len(cases) == 1
    assert cases[0]["id"] == "c1"


def test_best_label_mapping_accuracy_handles_permuted_labels():
    predicted = ["A", "A", "B", "B", "A"]
    reference = ["S1", "S1", "S2", "S2", "S1"]
    accuracy, mapping = best_label_mapping_accuracy(predicted, reference)
    assert accuracy == 1.0
    assert mapping["A"] == "S1"
    assert mapping["B"] == "S2"


def test_speaker_change_metrics_basic():
    predicted = ["S1", "S1", "S2", "S2", "S1"]
    reference = ["S1", "S2", "S2", "S2", "S1"]
    precision, recall = speaker_change_metrics(predicted, reference)
    assert 0.0 <= precision <= 1.0
    assert 0.0 <= recall <= 1.0


def test_speaker_change_metrics_with_collar_exact_and_near_match():
    precision, recall = speaker_change_metrics_with_collar(
        predicted_boundaries=[1.0, 2.49],
        reference_boundaries=[1.0, 2.0],
        collar_seconds=0.5,
    )
    assert precision == 1.0
    assert recall == 1.0


def test_speaker_change_metrics_with_collar_outside_window():
    precision, recall = speaker_change_metrics_with_collar(
        predicted_boundaries=[1.7],
        reference_boundaries=[1.0],
        collar_seconds=0.5,
    )
    assert precision == 0.0
    assert recall == 0.0


def test_speaker_change_metrics_with_collar_deduplicates_close_predictions():
    precision, recall = speaker_change_metrics_with_collar(
        predicted_boundaries=[1.0, 1.1, 3.0],
        reference_boundaries=[1.05, 3.0],
        collar_seconds=0.2,
    )
    assert precision == 2 / 3
    assert recall == 1.0
