#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate

python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

from whisperx_ui_backend.processors.speaker_assignment import assign_speakers

root = Path.cwd()
manifest_path = root / "benchmarks" / "diarization-fixtures" / "manifest.json"
manifest = json.loads(manifest_path.read_text())

total_words = 0
correct_words = 0
change_tp = 0
change_fp = 0
change_fn = 0

for item in manifest["fixtures"]:
    fixture = json.loads((manifest_path.parent / item["file"]).read_text())
    result = assign_speakers(fixture["segments"], fixture["intervals"])
    predicted = [word.get("speaker") for word in result[0].get("words", [])]
    expected = fixture.get("expected_word_speakers", [])
    n = min(len(predicted), len(expected))
    total_words += n
    correct_words += sum(1 for i in range(n) if predicted[i] == expected[i])

    expected_changes = {i for i in range(1, n) if expected[i] != expected[i - 1]}
    predicted_changes = {i for i in range(1, n) if predicted[i] != predicted[i - 1]}
    change_tp += len(expected_changes & predicted_changes)
    change_fp += len(predicted_changes - expected_changes)
    change_fn += len(expected_changes - predicted_changes)

word_acc = (correct_words / total_words) if total_words else 0.0
change_precision = change_tp / (change_tp + change_fp) if (change_tp + change_fp) else 0.0
change_recall = change_tp / (change_tp + change_fn) if (change_tp + change_fn) else 0.0

min_word_acc = float(os.environ.get("MIN_WORD_SPEAKER_ACCURACY", "0.80"))
min_change_precision = float(os.environ.get("MIN_SPEAKER_CHANGE_PRECISION", "0.70"))
min_change_recall = float(os.environ.get("MIN_SPEAKER_CHANGE_RECALL", "0.70"))

print("[benchmark] word_speaker_accuracy:", f"{word_acc:.3f}")
print("[benchmark] speaker_change_precision:", f"{change_precision:.3f}")
print("[benchmark] speaker_change_recall:", f"{change_recall:.3f}")
print("[benchmark] fixtures:", len(manifest["fixtures"]))
print("[benchmark] thresholds:",
      f"word_acc>={min_word_acc:.2f},",
      f"change_precision>={min_change_precision:.2f},",
      f"change_recall>={min_change_recall:.2f}")

errors = []
if word_acc < min_word_acc:
    errors.append(
        f"word speaker accuracy {word_acc:.3f} is below threshold {min_word_acc:.3f}"
    )
if change_precision < min_change_precision:
    errors.append(
        f"speaker-change precision {change_precision:.3f} is below threshold {min_change_precision:.3f}"
    )
if change_recall < min_change_recall:
    errors.append(
        f"speaker-change recall {change_recall:.3f} is below threshold {min_change_recall:.3f}"
    )

if errors:
    print("[benchmark][FAIL] quality threshold check failed:")
    for err in errors:
        print("[benchmark][FAIL]", err)
    sys.exit(1)

print("[benchmark] PASS: thresholds satisfied")
PY
