export const DEFAULT_JOB_SETTINGS = {
  transcription_engine: "faster-whisper",
  transcription_model: "distil-large-v3",
  diarization_engine: "huggingface-pyannote",
  diarization_model: "pyannote/speaker-diarization-community-1",
  language: "",
  device: "auto",
  compute_type: "int8",
  batch_size: 8,
  max_parallel_jobs: 1,
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
  };
}

export function normalizeJobSettings(settings) {
  return {
    transcription_engine: settings.transcription_engine || "faster-whisper",
    transcription_model: settings.transcription_model || "distil-large-v3",
    diarization_engine: settings.diarization_engine || "huggingface-pyannote",
    diarization_model:
      settings.diarization_model || "pyannote/speaker-diarization-community-1",
    language: settings.language || null,
    device: settings.device || "auto",
    compute_type: settings.compute_type || "int8",
    batch_size: Number(settings.batch_size || 8),
    max_parallel_jobs: Math.min(4, Math.max(1, Number(settings.max_parallel_jobs || 1))),
  };
}

export function buildModelPrepareRequest(settings) {
  const request = {
    profile: "basic",
    transcription_model: settings.transcription_model || "distil-large-v3",
  };
  const hfToken = settings.diarization_token?.trim();
  if (hfToken) {
    request.hf_token = hfToken;
  }
  return request;
}

export function buildJobRequest(audioFileId, settings, perRecording = {}) {
  const numberOrNull = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    return Number(value);
  };
  const request = {
    audio_file_id: audioFileId,
    ...normalizeJobSettings(settings),
    speaker_count: numberOrNull(perRecording.speaker_count),
    min_speakers: numberOrNull(perRecording.min_speakers),
    max_speakers: numberOrNull(perRecording.max_speakers),
  };
  const diarizationToken = settings.diarization_token?.trim();
  if (diarizationToken) {
    request.settings = { diarization_token: diarizationToken };
  }
  return request;
}

export function runtimeDeviceIndicator(job) {
  if (!job) return "";
  const runtimeDevice = String(job.runtime_device || "").toLowerCase();
  const requestedDevice = String(job.device || "auto").toLowerCase();
  const note = String(job.runtime_device_note || "").toLowerCase();
  if (note === "fell_back_to_cpu" || (requestedDevice === "cuda" && runtimeDevice === "cpu")) {
    return "Fell back to CPU";
  }
  const device = runtimeDevice || (requestedDevice === "cuda" ? "cuda" : "cpu");
  if (device === "cuda") return "CUDA";
  if (device === "cpu" || device === "auto") return "CPU";
  return device.toUpperCase();
}

export function applySpeakerRename(speakers, sentences, updatedSpeaker) {
  return {
    speakers: speakers.map((speaker) =>
      speaker.id === updatedSpeaker.id ? updatedSpeaker : speaker,
    ),
    sentences: sentences.map((sentence) =>
      sentence.speaker_id === updatedSpeaker.id
        ? { ...sentence, speaker_display_name: updatedSpeaker.display_name }
        : sentence,
    ),
  };
}

export function applySentenceUpdate(sentences, updatedSentence) {
  return sentences.map((sentence) =>
    sentence.id === updatedSentence.id ? updatedSentence : sentence,
  );
}

export function createRangePlaybackController(player) {
  let stopAt = null;
  return {
    playRange(start, end) {
      if (!player) return;
      player.currentTime = start;
      stopAt = end;
      player.play();
    },
    handleTimeUpdate() {
      if (!player || stopAt === null) return;
      if (player.currentTime >= stopAt) {
        player.pause();
        stopAt = null;
      }
    },
    getStopAt() {
      return stopAt;
    },
  };
}
