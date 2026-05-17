export const DEFAULT_JOB_SETTINGS = {
  transcription_provider: "local",
  transcription_model: "whisperx-small",
  diarization_provider: "local",
  diarization_model: "pyannote-local",
  language: "",
  device: "auto",
  compute_type: "int8",
  batch_size: 8,
  speaker_count: "",
  min_speakers: "",
  max_speakers: "",
};

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function groupSpeakerTurns(sentences) {
  return sentences.reduce((groups, sentence) => {
    const last = groups[groups.length - 1];
    if (last && last.speaker_id === sentence.speaker_id) {
      last.sentences.push(sentence);
      last.end_time = sentence.end_time;
      return groups;
    }
    groups.push({
      speaker_id: sentence.speaker_id,
      speaker_display_name: sentence.speaker_display_name,
      start_time: sentence.start_time,
      end_time: sentence.end_time,
      sentences: [sentence],
    });
    return groups;
  }, []);
}

export function mergeJobSettings(settings) {
  return {
    ...DEFAULT_JOB_SETTINGS,
    ...settings,
    language: settings.language || "",
    speaker_count: settings.speaker_count ?? "",
    min_speakers: settings.min_speakers ?? "",
    max_speakers: settings.max_speakers ?? "",
  };
}

export function normalizeJobSettings(settings) {
  const numberOrNull = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    return Number(value);
  };
  return {
    transcription_provider: settings.transcription_provider || "local",
    transcription_model: settings.transcription_model || "whisperx-small",
    diarization_provider: settings.diarization_provider || "local",
    diarization_model: settings.diarization_model || "pyannote-local",
    language: settings.language || null,
    device: settings.device || "auto",
    compute_type: settings.compute_type || "int8",
    batch_size: Number(settings.batch_size || 8),
    speaker_count: numberOrNull(settings.speaker_count),
    min_speakers: numberOrNull(settings.min_speakers),
    max_speakers: numberOrNull(settings.max_speakers),
  };
}
