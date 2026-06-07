import React from "react";
import { Download, Pause, Play, RotateCcw, Square, Trash2, Volume2 } from "lucide-react";
import { API_BASE } from "../api.js";
import { TranscriptReview } from "./TranscriptReview.jsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function WorkspacePanel({
  audioRef,
  onDeleteAudio,
  onDeleteTranscript,
  onPlay,
  onProcessAudio,
  onStopJob,
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
  const titleInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  React.useEffect(() => {
    setIsEditingTitle(false);
  }, [selectedAudio?.id]);

  const isActiveJob = selectedJob?.status === "queued" || selectedJob?.status === "processing";
  const hasCompletedLatestJob = selectedJob?.status === "completed" || selectedAudio?.latest_job_status === "completed";
  const processButtonVariant = isActiveJob ? "destructive" : hasCompletedLatestJob ? "secondary" : "default";
  const processButtonLabel = isActiveJob
    ? "Stop"
    : hasCompletedLatestJob
      ? "Reprocess"
      : "Process";
  const ProcessButtonIcon = isActiveJob ? Square : hasCompletedLatestJob ? RotateCcw : Play;

  return (
    <section className="workspace">
      {selectedAudio ? (
        <div className="workspace-shell">
          <div className="audio-header">
            <div className="title-field">
              <span className="workspace-breadcrumb">Library <span>/</span></span>
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  className="title-display title-edit-input inline-editing"
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
                  className="title-button"
                  aria-label="Current file title"
                  title={selectedAudio.display_title}
                  onClick={() => setIsEditingTitle(true)}
                >
                  <span className="title-display">{selectedAudio.display_title}</span>
                </button>
              )}
            </div>
            <div className="toolbar">
              <Button
                type="button"
                variant={processButtonVariant}
                size="sm"
                className="process-button"
                onClick={() => {
                  if (isActiveJob) {
                    onStopJob(selectedJob);
                    return;
                  }
                  onProcessAudio();
                }}
                aria-label={processButtonLabel}
              >
                <ProcessButtonIcon data-icon="inline-start" />
                <span className="toolbar-label">{processButtonLabel}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Download audio"
                data-download-url={`${API_BASE}/api/audio/${selectedAudio.id}/download`}
                onClick={() => {
                  window.location.assign(`${API_BASE}/api/audio/${selectedAudio.id}/download`);
                }}
              >
                <Download data-icon="inline-start" />
                <span className="toolbar-label">Download Audio</span>
              </Button>
              {selectedJob ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Delete transcript"
                  onClick={() => {
                    if (!window.confirm("Delete this transcript? This cannot be undone.")) return;
                    onDeleteTranscript(selectedJob);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  <span className="toolbar-label">Delete Transcript</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Delete audio"
                  onClick={() => {
                    if (!window.confirm("Delete this audio item? This cannot be undone.")) return;
                    onDeleteAudio(selectedAudio);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  <span className="toolbar-label">Delete Audio</span>
                </Button>
              )}
            </div>
          </div>

          <div className="workspace-content">
            <Card className="player-card">
              <CardContent>
                <CustomAudioPlayer audioRef={audioRef} src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />
              </CardContent>
            </Card>
            <RunSummaryCards job={selectedJob} sentences={sentences} speakers={speakers} />
            {selectedJob?.status === "failed" && <p className="error">{selectedJob.error_message}</p>}
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
          </div>
        </div>
      ) : (
        <div className="journey-empty">
          <span>Select Something to Begin Your Journey</span>
          <span className="sr-only">Select an audio file to open the workspace.</span>
        </div>
      )}
    </section>
  );
}

function RunSummaryCards({ job, sentences, speakers }) {
  const statusLabel = job?.status ? sentenceCase(job.status) : "Not started";
  const modelLabel = job?.transcription_model || "No run selected";
  const speakerLabel = job?.status === "completed" ? `${speakers.length} detected` : "Pending";
  const transcriptLabel = job?.status === "completed" ? `${sentences.length} sentences` : "Pending";

  return (
    <div className="run-summary-grid" aria-label="Run summary">
      <SummaryCard label="Status" value={statusLabel} />
      <SummaryCard label="Model" value={modelLabel} />
      <SummaryCard label="Speakers" value={speakerLabel} />
      <SummaryCard label="Transcript" value={transcriptLabel} />
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card size="sm" className="summary-card">
      <CardContent>
        <span>{label}</span>
        <strong>{value}</strong>
      </CardContent>
    </Card>
  );
}

function sentenceCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
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
