import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_JOB_SETTINGS,
  formatTime,
  groupSpeakerTurns,
  mergeJobSettings,
  normalizeJobSettings,
} from "./jobUtils.js";

test("formatTime floors seconds and clamps negative values", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(-12), "0:00");
  assert.equal(formatTime(undefined), "0:00");
});

test("groupSpeakerTurns groups adjacent sentences for the same speaker only", () => {
  const sentences = [
    { id: "1", speaker_id: "a", speaker_display_name: "Alice", start_time: 0, end_time: 1 },
    { id: "2", speaker_id: "a", speaker_display_name: "Alice", start_time: 1, end_time: 2 },
    { id: "3", speaker_id: "b", speaker_display_name: "Bob", start_time: 2, end_time: 3 },
    { id: "4", speaker_id: "a", speaker_display_name: "Alice", start_time: 3, end_time: 4 },
  ];

  const turns = groupSpeakerTurns(sentences);

  assert.equal(turns.length, 3);
  assert.deepEqual(
    turns.map((turn) => turn.speaker_id),
    ["a", "b", "a"],
  );
  assert.deepEqual(
    turns.map((turn) => turn.sentences.map((sentence) => sentence.id)),
    [["1", "2"], ["3"], ["4"]],
  );
  assert.equal(turns[0].start_time, 0);
  assert.equal(turns[0].end_time, 2);
});

test("mergeJobSettings preserves defaults while normalizing empty optional fields for forms", () => {
  assert.deepEqual(mergeJobSettings({}), DEFAULT_JOB_SETTINGS);
  assert.deepEqual(mergeJobSettings({ transcription_model: "custom", language: null }), {
    ...DEFAULT_JOB_SETTINGS,
    transcription_model: "custom",
    language: "",
  });
  assert.deepEqual(mergeJobSettings({ speaker_count: null, min_speakers: 2, max_speakers: 4 }), {
    ...DEFAULT_JOB_SETTINGS,
    speaker_count: "",
    min_speakers: 2,
    max_speakers: 4,
  });
});

test("normalizeJobSettings converts form settings into backend request values", () => {
  assert.deepEqual(normalizeJobSettings({}), {
    transcription_provider: "local",
    transcription_model: "whisperx-small",
    diarization_provider: "local",
    diarization_model: "pyannote-local",
    language: null,
    device: "auto",
    compute_type: "int8",
    batch_size: 8,
    speaker_count: null,
    min_speakers: null,
    max_speakers: null,
  });
  assert.deepEqual(
    normalizeJobSettings({
      transcription_provider: "placeholder",
      transcription_model: "demo",
      diarization_provider: "none",
      diarization_model: "none",
      language: "en",
      device: "cpu",
      compute_type: "float32",
      batch_size: "16",
      speaker_count: "2",
      min_speakers: "",
      max_speakers: "4",
    }),
    {
      transcription_provider: "placeholder",
      transcription_model: "demo",
      diarization_provider: "none",
      diarization_model: "none",
      language: "en",
      device: "cpu",
      compute_type: "float32",
      batch_size: 16,
      speaker_count: 2,
      min_speakers: null,
      max_speakers: 4,
    },
  );
});
