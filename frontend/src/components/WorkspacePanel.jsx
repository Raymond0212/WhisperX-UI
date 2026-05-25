import React from "react";
import { ChevronDown, Pause, Play, RotateCcw, Volume2, Trash2 } from "lucide-react";
import { API_BASE } from "../api.js";
import { runtimeDeviceIndicator } from "../jobUtils.js";
import { TranscriptReview } from "./TranscriptReview.jsx";

export function WorkspacePanel({
  audioRef,
  onDeleteAudio,
  onDeleteTranscript,
  onPlay,
  onProcessAudio,
  onRenameSpeaker,
  onUpdateRecordingSettings,
  onUpdateSentence,
  onUpdateTitle,
  selectedAudio,
  selectedJob,
  sentences,
  setSelectedAudio,
  setViewMode,
  speakerTurns,
  speakers,
  viewMode,
}) {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [isSpeakerSettingsOpen, setIsSpeakerSettingsOpen] = React.useState(true);
  const titleInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  React.useEffect(() => {
    setIsEditingTitle(false);
  }, [selectedAudio?.id]);

  return (
    <section className="workspace">
      {selectedAudio ? (
        <div className="workspace-shell">
          <div className="audio-header">
            <div className="title-field">
              <span className="panel-kicker">Current file</span>
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  aria-label="Current file title"
                  title={selectedAudio.display_title}
                  value={selectedAudio.display_title}
                  onChange={(event) => setSelectedAudio({ ...selectedAudio, display_title: event.target.value })}
                  onBlur={(event) => {
                    setIsEditingTitle(false);
                    onUpdateTitle(selectedAudio, event.target.value);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="title-display"
                  aria-label="Current file title"
                  title={selectedAudio.display_title}
                  onClick={() => setIsEditingTitle(true)}
                >
                  {selectedAudio.display_title}
                </button>
              )}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className={selectedAudio.latest_job_status === "completed" ? "process-button process-button--reprocess" : "process-button"}
                onClick={() => onProcessAudio()}
                aria-label={selectedAudio.latest_job_status === "completed" ? "Reprocess" : "Process"}
              >
                {selectedAudio.latest_job_status === "completed" ? <RotateCcw size={16} /> : <Play size={16} />}
                <span className="toolbar-label">
                  {selectedAudio.latest_job_status === "completed" ? "Reprocess" : "Process"}
                </span>
              </button>
              {selectedJob ? (
                <button
                  type="button"
                  aria-label="Delete transcript"
                  onClick={() => {
                    if (!window.confirm("Delete this transcript? This cannot be undone.")) return;
                    onDeleteTranscript(selectedJob);
                  }}
                >
                  <Trash2 size={16} />
                  <span className="toolbar-label">Delete Transcript</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Delete audio"
                  onClick={() => {
                    if (!window.confirm("Delete this audio item? This cannot be undone.")) return;
                    onDeleteAudio(selectedAudio);
                  }}
                >
                  <Trash2 size={16} />
                  <span className="toolbar-label">Delete Audio</span>
                </button>
              )}
            </div>
          </div>

          {selectedJob && (
            <>
              <p className="active-model-subtitle">{selectedJob.transcription_model}</p>
              <JobProgress job={selectedJob} />
            </>
          )}

          <CustomAudioPlayer audioRef={audioRef} src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />
          {!selectedJob && (
            <StandaloneSpeakerSettings
              selectedAudio={selectedAudio}
              onUpdateRecordingSettings={onUpdateRecordingSettings}
              isOpen={isSpeakerSettingsOpen}
              onToggle={() => setIsSpeakerSettingsOpen((current) => !current)}
            />
          )}
          {selectedJob?.status === "failed" && <p className="error">{selectedJob.error_message}</p>}
          {selectedJob && (
            <TranscriptReview
              job={selectedJob}
              selectedAudio={selectedAudio}
              speakers={speakers}
              sentences={sentences}
              speakerTurns={speakerTurns}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onPlay={onPlay}
              onRenameSpeaker={onRenameSpeaker}
              onUpdateRecordingSettings={onUpdateRecordingSettings}
              onUpdateSentence={onUpdateSentence}
            />
          )}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Select an audio file to open the workspace.</strong>
          <span>The library expands first; choosing a file slides it into a compact sidebar.</span>
        </div>
      )}
    </section>
  );
}

function JobProgress({ job }) {
  const isActive = job?.status === "queued" || job?.status === "processing";
  if (!isActive) return null;
  const rawValue = Number(job.progress_percent);
  const value = Number.isFinite(rawValue) ? Math.max(0, Math.min(100, rawValue)) : 0;
  const label = job.progress_message || (job.status === "queued" ? "Queued" : "Processing");
  const deviceIndicator = runtimeDeviceIndicator(job);
  return (
    <div className="job-progress" aria-live="polite">
      <div
        className="job-progress__rail"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <span className="job-progress__fill" style={{ width: `${value}%` }} />
      </div>
      <p className="job-progress__label">
        <span>{label}</span>
        {deviceIndicator && <span className="runtime-device-pill">{deviceIndicator}</span>}
      </p>
    </div>
  );
}

function CustomAudioPlayer({ audioRef, src }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    onLoadedMetadata();
    onTimeUpdate();

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef, src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seekTo(value) {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(value);
    audio.currentTime = Number.isFinite(nextTime) ? nextTime : 0;
    setCurrentTime(audio.currentTime || 0);
  }

  return (
    <div className="custom-audio-player">
      <button type="button" className="audio-control audio-control--play" aria-label={isPlaying ? "Pause audio" : "Play audio"} onClick={togglePlay}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <span className="audio-time">{formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}</span>
      <input
        type="range"
        className="audio-seek"
        min="0"
        max={duration > 0 ? duration : 0}
        step="0.01"
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seekTo(event.target.value)}
        aria-label="Seek audio"
      />
      <span className="audio-control audio-control--volume" aria-hidden="true">
        <Volume2 size={16} />
      </span>
      <audio ref={audioRef} className="native-audio-element" src={src} />
    </div>
  );
}

function formatPlayerTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function StandaloneSpeakerSettings({ selectedAudio, onUpdateRecordingSettings, isOpen, onToggle }) {
  const [values, setValues] = React.useState({
    speaker_count: selectedAudio.speaker_count ?? "",
    min_speakers: selectedAudio.min_speakers ?? "",
    max_speakers: selectedAudio.max_speakers ?? "",
  });

  React.useEffect(() => {
    setValues({
      speaker_count: selectedAudio.speaker_count ?? "",
      min_speakers: selectedAudio.min_speakers ?? "",
      max_speakers: selectedAudio.max_speakers ?? "",
    });
  }, [selectedAudio.id, selectedAudio.speaker_count, selectedAudio.min_speakers, selectedAudio.max_speakers]);

  function handleBlur() {
    onUpdateRecordingSettings(selectedAudio, values);
  }

  return (
    <section className={`speaker-panel ${isOpen ? "open" : ""}`}>
      <button type="button" className="speaker-panel-toggle" aria-expanded={isOpen} onClick={onToggle}>
        <span>Speaker Settings</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="speaker-list">
          <div className="recording-settings" aria-label="Recording diarization settings">
            <label>
              <span>Speaker count</span>
              <input
                type="number"
                min="1"
                max="20"
                value={values.speaker_count}
                onChange={(event) => setValues((current) => ({ ...current, speaker_count: event.target.value }))}
                onBlur={handleBlur}
              />
            </label>
            <label>
              <span>Min speakers</span>
              <input
                type="number"
                min="1"
                max="20"
                value={values.min_speakers}
                onChange={(event) => setValues((current) => ({ ...current, min_speakers: event.target.value }))}
                onBlur={handleBlur}
              />
            </label>
            <label>
              <span>Max speakers</span>
              <input
                type="number"
                min="1"
                max="20"
                value={values.max_speakers}
                onChange={(event) => setValues((current) => ({ ...current, max_speakers: event.target.value }))}
                onBlur={handleBlur}
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
