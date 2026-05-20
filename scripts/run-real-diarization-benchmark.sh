#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST_PATH="${MANIFEST_PATH:-$ROOT_DIR/benchmarks/real-audio/manifest.json}"
APP_DATA_DIR="${APP_DATA_DIR:-$ROOT_DIR/app_data_benchmark}"
HF_TOKEN="${HF_TOKEN:-}"
ALLOW_NO_TOKEN="${ALLOW_NO_TOKEN:-0}"

if [ ! -f "$MANIFEST_PATH" ]; then
  echo "[real-benchmark][FAIL] missing manifest: $MANIFEST_PATH"
  exit 1
fi

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install --no-build-isolation -e .

if [ "$ALLOW_NO_TOKEN" != "1" ] && [ -z "$HF_TOKEN" ]; then
  echo "[real-benchmark][FAIL] HF_TOKEN is required for real diarization benchmark (or set ALLOW_NO_TOKEN=1 to benchmark fallback path)."
  exit 1
fi

export MANIFEST_PATH APP_DATA_DIR HF_TOKEN ALLOW_NO_TOKEN
python3 - <<'PY'
import json
import os
from pathlib import Path

from whisperx_ui_backend.benchmarking.diarization_metrics import (
    best_label_mapping_accuracy,
    speaker_change_metrics_with_collar,
    speaker_change_metrics,
    validate_real_audio_manifest,
)
from whisperx_ui_backend.processors.faster_whisper_processor import transcribe_with_faster_whisper
from whisperx_ui_backend.processors.pyannote_diarization import diarize_with_pyannote
from whisperx_ui_backend.processors.speaker_assignment import assign_speakers
from whisperx_ui_backend.services import _assign_single_speaker, segment_to_sentences

manifest_path = Path(os.environ["MANIFEST_PATH"])
manifest = json.loads(manifest_path.read_text())
cases = validate_real_audio_manifest(manifest)
app_data_dir = Path(os.environ["APP_DATA_DIR"])
app_data_dir.mkdir(parents=True, exist_ok=True)

min_word_acc = float(os.environ.get("MIN_WORD_SPEAKER_ACCURACY", "0.65"))
min_sentence_acc = float(os.environ.get("MIN_SENTENCE_SPEAKER_ACCURACY", "0.60"))
min_change_precision = float(os.environ.get("MIN_SPEAKER_CHANGE_PRECISION", "0.55"))
min_change_recall = float(os.environ.get("MIN_SPEAKER_CHANGE_RECALL", "0.55"))
change_collar_seconds = float(os.environ.get("SPEAKER_CHANGE_COLLAR_SECONDS", "0.75"))

def pick_turn_speaker(start: float, end: float, turns: list[dict]) -> str | None:
    midpoint = (start + end) / 2
    best = None
    best_overlap = 0.0
    for turn in turns:
        overlap = max(0.0, min(end, float(turn["end"])) - max(start, float(turn["start"])))
        if overlap > best_overlap:
            best_overlap = overlap
            best = str(turn["speaker"])
    if best is not None:
        return best
    nearest = None
    nearest_dist = None
    for turn in turns:
        ts, te = float(turn["start"]), float(turn["end"])
        if ts <= midpoint <= te:
            return str(turn["speaker"])
        dist = min(abs(midpoint - ts), abs(midpoint - te))
        if nearest_dist is None or dist < nearest_dist:
            nearest_dist = dist
            nearest = str(turn["speaker"])
    return nearest

word_pred_all: list[str] = []
word_ref_all: list[str] = []
word_midpoints_all: list[float] = []
sent_pred_all: list[str] = []
sent_ref_all: list[str] = []

for case in cases:
    audio_path = Path(case["audio_path"])
    ref = json.loads(Path(case["reference_path"]).read_text())
    turns = ref.get("speaker_turns")
    if not isinstance(turns, list) or not turns:
        raise RuntimeError(f"reference must include non-empty speaker_turns: {case['reference_path']}")

    result = transcribe_with_faster_whisper(
        audio_path=str(audio_path),
        model_id="distil-large-v3",
        device="auto",
        compute_type="int8",
        language=None,
        download_root=str(app_data_dir / "models"),
    )
    segments = result.get("segments", [])
    if os.environ.get("HF_TOKEN"):
        intervals = diarize_with_pyannote(
            audio_path=str(audio_path),
            model_id="pyannote/speaker-diarization-community-1",
            hf_token=os.environ["HF_TOKEN"],
        )
        segments = assign_speakers(segments, intervals)
    else:
        segments = _assign_single_speaker(segments)

    for segment in segments:
        for word in segment.get("words") or []:
            if "speaker" not in word:
                continue
            ref_speaker = pick_turn_speaker(float(word["start"]), float(word["end"]), turns)
            if ref_speaker is None:
                continue
            word_pred_all.append(str(word["speaker"]))
            word_ref_all.append(ref_speaker)
            word_midpoints_all.append((float(word["start"]) + float(word["end"])) / 2)

    sentence_rows = []
    for segment in segments:
        sentence_rows.extend(segment_to_sentences(segment))
    for row in sentence_rows:
        ref_speaker = pick_turn_speaker(float(row.start_time), float(row.end_time), turns)
        if ref_speaker is None:
            continue
        sent_pred_all.append(row.speaker_key)
        sent_ref_all.append(ref_speaker)

word_acc, word_map = best_label_mapping_accuracy(word_pred_all, word_ref_all)
mapped_word_pred = [word_map.get(label, label) for label in word_pred_all]
change_precision, change_recall = speaker_change_metrics(mapped_word_pred, word_ref_all)

pred_change_boundaries = [
    word_midpoints_all[i]
    for i in range(1, len(mapped_word_pred))
    if mapped_word_pred[i] != mapped_word_pred[i - 1]
]
ref_change_boundaries = [
    word_midpoints_all[i]
    for i in range(1, len(word_ref_all))
    if word_ref_all[i] != word_ref_all[i - 1]
]
tolerant_change_precision, tolerant_change_recall = speaker_change_metrics_with_collar(
    pred_change_boundaries,
    ref_change_boundaries,
    collar_seconds=change_collar_seconds,
)
sentence_acc, _ = best_label_mapping_accuracy(sent_pred_all, sent_ref_all)

print("[real-benchmark] cases:", len(cases))
print("[real-benchmark] word_speaker_accuracy:", f"{word_acc:.3f}")
print("[real-benchmark] sentence_speaker_accuracy:", f"{sentence_acc:.3f}")
print("[real-benchmark] speaker_change_precision:", f"{change_precision:.3f}")
print("[real-benchmark] speaker_change_recall:", f"{change_recall:.3f}")
print(
    "[real-benchmark] speaker_change_precision_collar:",
    f"{tolerant_change_precision:.3f}",
)
print(
    "[real-benchmark] speaker_change_recall_collar:",
    f"{tolerant_change_recall:.3f}",
)
print(
    "[real-benchmark] thresholds:",
    f"word>={min_word_acc:.2f}, sentence>={min_sentence_acc:.2f},",
    f"change_precision(collar={change_collar_seconds:.2f}s)>={min_change_precision:.2f},",
    f"change_recall(collar={change_collar_seconds:.2f}s)>={min_change_recall:.2f}",
)

errors = []
if word_acc < min_word_acc:
    errors.append(f"word speaker accuracy {word_acc:.3f} below threshold {min_word_acc:.3f}")
if sentence_acc < min_sentence_acc:
    errors.append(f"sentence speaker accuracy {sentence_acc:.3f} below threshold {min_sentence_acc:.3f}")
if tolerant_change_precision < min_change_precision:
    errors.append(
        f"speaker-change precision (collar) {tolerant_change_precision:.3f} below threshold {min_change_precision:.3f}"
    )
if tolerant_change_recall < min_change_recall:
    errors.append(
        f"speaker-change recall (collar) {tolerant_change_recall:.3f} below threshold {min_change_recall:.3f}"
    )

if errors:
    print("[real-benchmark][FAIL] threshold check failed:")
    for err in errors:
        print("[real-benchmark][FAIL]", err)
    raise SystemExit(1)
print("[real-benchmark] PASS: thresholds satisfied")
PY
