import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_JOB_SETTINGS,
  applySentenceUpdate,
  applySpeakerRename,
  buildModelPrepareRequest,
  buildJobRequest,
  createRangePlaybackController,
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
    {
      id: "1",
      speaker_id: "a",
      speaker_display_name: "Alice",
      start_time: 0,
      end_time: 1,
    },
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
    diarization_provider: "none",
    diarization_model: "none",
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

test("buildModelPrepareRequest prepares the basic local model without persisting secrets", () => {
  assert.deepEqual(buildModelPrepareRequest({}), {
    profile: "basic",
    transcription_model: "whisperx-small",
  });
  assert.deepEqual(
    buildModelPrepareRequest({
      transcription_model: "custom-model",
      diarization_token: "  hf-secret  ",
    }),
    {
      profile: "basic",
      transcription_model: "custom-model",
      hf_token: "hf-secret",
    },
  );
});

test("buildJobRequest sends transient diarization token only when provided", () => {
  assert.deepEqual(buildJobRequest("audio-1", {}), {
    audio_file_id: "audio-1",
    transcription_provider: "local",
    transcription_model: "whisperx-small",
    diarization_provider: "none",
    diarization_model: "none",
    language: null,
    device: "auto",
    compute_type: "int8",
    batch_size: 8,
    speaker_count: null,
    min_speakers: null,
    max_speakers: null,
  });

  assert.deepEqual(buildJobRequest("audio-2", { diarization_token: "  hf-secret  " }), {
    audio_file_id: "audio-2",
    transcription_provider: "local",
    transcription_model: "whisperx-small",
    diarization_provider: "none",
    diarization_model: "none",
    language: null,
    device: "auto",
    compute_type: "int8",
    batch_size: 8,
    speaker_count: null,
    min_speakers: null,
    max_speakers: null,
    settings: { diarization_token: "hf-secret" },
  });

  assert.equal("settings" in buildJobRequest("audio-3", { diarization_token: "   " }), false);
});

test("applySpeakerRename updates speaker list and all matching transcript display labels", () => {
  const speakers = [
    { id: "spk-1", speaker_key: "SPEAKER_00", display_name: "SPEAKER_00" },
    { id: "spk-2", speaker_key: "SPEAKER_01", display_name: "SPEAKER_01" },
  ];
  const sentences = [
    { id: "s1", speaker_id: "spk-1", speaker_display_name: "SPEAKER_00", current_text: "Hi." },
    { id: "s2", speaker_id: "spk-2", speaker_display_name: "SPEAKER_01", current_text: "Hello." },
    { id: "s3", speaker_id: "spk-1", speaker_display_name: "SPEAKER_00", current_text: "Back." },
  ];

  const result = applySpeakerRename(speakers, sentences, {
    id: "spk-1",
    speaker_key: "SPEAKER_00",
    display_name: "Alice",
  });

  assert.deepEqual(
    result.speakers.map((speaker) => speaker.display_name),
    ["Alice", "SPEAKER_01"],
  );
  assert.deepEqual(
    result.sentences.map((sentence) => sentence.speaker_display_name),
    ["Alice", "SPEAKER_01", "Alice"],
  );
});

test("applySentenceUpdate replaces edited sentence while preserving list order", () => {
  const sentences = [
    { id: "s1", current_text: "Original one.", start_time: 0, end_time: 1 },
    { id: "s2", current_text: "Original two.", start_time: 2, end_time: 3 },
  ];

  const updated = { id: "s1", current_text: "Edited one.", start_time: 0, end_time: 1 };

  assert.deepEqual(applySentenceUpdate(sentences, updated), [updated, sentences[1]]);
});

test("createRangePlaybackController seeks, plays, and pauses at range end", () => {
  const calls = [];
  const player = {
    currentTime: 0,
    play: () => calls.push("play"),
    pause: () => calls.push("pause"),
  };
  const controller = createRangePlaybackController(player);

  controller.playRange(2.5, 4.75);
  assert.equal(player.currentTime, 2.5);
  assert.equal(controller.getStopAt(), 4.75);
  assert.deepEqual(calls, ["play"]);

  player.currentTime = 4.5;
  controller.handleTimeUpdate();
  assert.equal(controller.getStopAt(), 4.75);
  assert.deepEqual(calls, ["play"]);

  player.currentTime = 4.75;
  controller.handleTimeUpdate();
  assert.equal(controller.getStopAt(), null);
  assert.deepEqual(calls, ["play", "pause"]);
});
