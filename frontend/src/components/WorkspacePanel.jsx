import React from "react";
import { Play, Trash2 } from "lucide-react";
import { API_BASE } from "../api.js";
import { TranscriptReview } from "./TranscriptReview.jsx";

export function WorkspacePanel({
  audioRef,
  jobs,
  onDeleteAudio,
  onOpenJob,
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
  return (
    <section className="workspace">
      {selectedAudio ? (
        <>
          <div className="audio-header">
            <div className="title-field">
              <span className="panel-kicker">Current file</span>
              <input
                aria-label="Current file title"
                value={selectedAudio.display_title}
                onChange={(event) => setSelectedAudio({ ...selectedAudio, display_title: event.target.value })}
                onBlur={(event) => onUpdateTitle(selectedAudio, event.target.value)}
              />
            </div>
            <div className="toolbar">
              <button type="button" onClick={() => onProcessAudio()}>
                <Play size={16} /> Process
              </button>
              <button type="button" onClick={() => onDeleteAudio(selectedAudio)}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>

          <audio ref={audioRef} controls src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />

          <div className="jobs-strip">
            {jobs.map((job) => (
              <button type="button" key={job.id} onClick={() => onOpenJob(job)}>
                {job.status} · {job.transcription_model}
              </button>
            ))}
          </div>

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
