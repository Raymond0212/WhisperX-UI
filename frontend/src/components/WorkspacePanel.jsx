import React from "react";
import { Pause, Play, Volume2, Trash2 } from "lucide-react";
import { API_BASE } from "../api.js";
import { TranscriptReview } from "./TranscriptReview.jsx";

export function WorkspacePanel({
  audioRef,
  onDeleteAudio,
  onPlay,
  onProcessAudio,
  onRenameSpeaker,
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
        <>
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
              <button type="button" onClick={() => onProcessAudio()}>
                <Play size={16} /> {selectedAudio.latest_job_status === "completed" ? "Reprocess" : "Process"}
              </button>
              <button type="button" onClick={() => onDeleteAudio(selectedAudio)}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>

          {selectedJob && (
            <p className="active-model-subtitle">
              {selectedJob.transcription_model}
            </p>
          )}

          <CustomAudioPlayer audioRef={audioRef} src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />

          {selectedJob?.status === "failed" && <p className="error">{selectedJob.error_message}</p>}
          {selectedJob?.status === "completed" && (
            <TranscriptReview
              job={selectedJob}
              speakers={speakers}
              sentences={sentences}
              speakerTurns={speakerTurns}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onPlay={onPlay}
              onRenameSpeaker={onRenameSpeaker}
              onUpdateSentence={onUpdateSentence}
            />
          )}
        </>
      ) : (
        <div className="empty-state">
          <strong>Select an audio file to open the workspace.</strong>
          <span>The library expands first; choosing a file slides it into a compact sidebar.</span>
        </div>
      )}
    </section>
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
