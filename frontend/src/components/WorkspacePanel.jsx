import React from "react";
import { Play, Trash2 } from "lucide-react";
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

          <audio ref={audioRef} controls src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />

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
