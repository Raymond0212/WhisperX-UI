import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Play } from "lucide-react";
import { API_BASE } from "../api.js";
import { formatTime } from "../jobUtils.js";

export function TranscriptReview({
  job,
  speakers,
  sentences,
  speakerTurns,
  viewMode,
  setViewMode,
  onPlay,
  onRenameSpeaker,
  onUpdateSentence,
}) {
  const [isSpeakerPanelOpen, setIsSpeakerPanelOpen] = useState(true);
  return (
    <div className="review">
      <section className={`speaker-panel ${isSpeakerPanelOpen ? "open" : ""}`}>
        <button
          type="button"
          className="speaker-panel-toggle"
          aria-expanded={isSpeakerPanelOpen}
          onClick={() => setIsSpeakerPanelOpen((current) => !current)}
        >
          <span>Speaker labels</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {isSpeakerPanelOpen && (
          <div className="speaker-list">
            {speakers.map((speaker) => (
              <SpeakerLabelRow key={speaker.id} speaker={speaker} onPlay={onPlay} onRenameSpeaker={onRenameSpeaker} />
            ))}
          </div>
        )}
      </section>

      <div className="review-header">
        <div className="segmented" role="group" aria-label="Transcript view">
          <button
            className={viewMode === "sentences" ? "active" : ""}
            aria-pressed={viewMode === "sentences"}
            onClick={() => setViewMode("sentences")}
          >
            Sentences
          </button>
          <button
            className={viewMode === "turns" ? "active" : ""}
            aria-pressed={viewMode === "turns"}
            onClick={() => setViewMode("turns")}
          >
            Speaker turns
          </button>
        </div>
        <button
          type="button"
          className="export-link"
          data-export-url={`${API_BASE}/api/jobs/${job.id}/export.vtt`}
          onClick={() => {
            window.location.assign(`${API_BASE}/api/jobs/${job.id}/export.vtt`);
          }}
        >
          <Download size={16} /> Export VTT
        </button>
      </div>

      {viewMode === "sentences" ? (
        <SentenceList
          sentences={sentences}
          speakers={speakers}
          onPlay={onPlay}
          onRenameSpeaker={onRenameSpeaker}
          onUpdateSentence={onUpdateSentence}
        />
      ) : (
        <SpeakerTurnList
          speakerTurns={speakerTurns}
          speakers={speakers}
          onPlay={onPlay}
          onRenameSpeaker={onRenameSpeaker}
          onUpdateSentence={onUpdateSentence}
        />
      )}
    </div>
  );
}

function SpeakerLabelRow({ speaker, onPlay, onRenameSpeaker }) {
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    if (!isEditing) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [isEditing]);

  async function saveSpeakerName(event) {
    const nextName = event.currentTarget.textContent.trim() || speaker.speaker_key;
    setIsEditing(false);
    if (nextName !== speaker.display_name) {
      await onRenameSpeaker(speaker, nextName);
    }
  }

  return (
    <div className="speaker-row">
      <button
        type="button"
        className="round-play-button"
        aria-label={`Play sample for ${speaker.display_name}`}
        onClick={() => onPlay(speaker.sample_start, speaker.sample_end)}
      >
        <Play size={15} />
      </button>
      <code>{speaker.speaker_key}</code>
      {isEditing ? (
        <span
          ref={editorRef}
          className="speaker-name speaker-name--editing"
          role="textbox"
          contentEditable
          suppressContentEditableWarning
          aria-label={`Display name for ${speaker.speaker_key}`}
          onBlur={saveSpeakerName}
        >
          {speaker.display_name}
        </span>
      ) : (
        <button
          type="button"
          className="speaker-name"
          aria-label={`Edit display name for ${speaker.speaker_key}`}
          onClick={() => setIsEditing(true)}
        >
          {speaker.display_name}
        </button>
      )}
    </div>
  );
}

function SpeakerTurnList({ speakerTurns, speakers, onPlay, onRenameSpeaker, onUpdateSentence }) {
  const [editingSentenceId, setEditingSentenceId] = useState(null);
  const speakersById = React.useMemo(() => new Map(speakers.map((speaker) => [speaker.id, speaker])), [speakers]);
  return (
    <div className="turn-list">
      {speakerTurns.map((turn) => (
        <section className="turn" key={`${turn.speaker_id}-${turn.start_time}`}>
          <button
            type="button"
            className="round-play-button"
            aria-label={`Play turn ${turn.speaker_display_name} ${formatTime(turn.start_time)}-${formatTime(turn.end_time)}`}
            onClick={() => onPlay(turn.start_time, turn.end_time)}
          >
            <Play size={15} />
          </button>
          <div className="turn-meta">
            <InlineSpeakerName speaker={speakersById.get(turn.speaker_id)} fallbackName={turn.speaker_display_name} onRenameSpeaker={onRenameSpeaker} />
            <span className="timestamp">
              {formatTime(turn.start_time)}-{formatTime(turn.end_time)}
            </span>
          </div>
          <div className="turn-textbox" aria-label={`${turn.speaker_display_name} transcript turn`}>
            <p>
              {turn.sentences.map((sentence) => (
                <React.Fragment key={sentence.id}>
                  <EditableTurnSentence
                    sentence={sentence}
                    isEditing={editingSentenceId === sentence.id}
                    onEdit={() => setEditingSentenceId(sentence.id)}
                    onCancel={() => setEditingSentenceId(null)}
                    onUpdateSentence={onUpdateSentence}
                  />
                </React.Fragment>
              ))}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}

function EditableTurnSentence({ sentence, isEditing, onEdit, onCancel, onUpdateSentence }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!isEditing) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [isEditing]);

  async function saveTurnSentence(event) {
    const nextText = event.currentTarget.textContent;
    onCancel();
    if (nextText !== sentence.current_text) {
      await onUpdateSentence(sentence, nextText);
    }
  }

  if (isEditing) {
    return (
      <span
        ref={editorRef}
        className="turn-sentence turn-sentence--editing"
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        aria-label={`Transcript sentence ${sentence.sentence_index ?? sentence.id}`}
        onBlur={saveTurnSentence}
      >
        {sentence.current_text}
      </span>
    );
  }

  return (
    <span
      className="turn-sentence"
      role="button"
      tabIndex={0}
      aria-label={`Edit sentence ${sentence.sentence_index ?? sentence.id}`}
      title={`${formatTime(sentence.start_time)}-${formatTime(sentence.end_time)}`}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
    >
      {sentence.current_text}
    </span>
  );
}

function SentenceList({ sentences, speakers, onPlay, onRenameSpeaker, onUpdateSentence }) {
  const [editingSentenceId, setEditingSentenceId] = useState(null);
  const speakersById = React.useMemo(() => new Map(speakers.map((speaker) => [speaker.id, speaker])), [speakers]);

  return (
    <div className="sentence-list">
      {sentences.map((sentence) => (
        <article className="sentence-row" key={sentence.id}>
          <button
            type="button"
            className="round-play-button"
            aria-label={`Play sentence ${sentence.sentence_index ?? sentence.id}`}
            onClick={() => onPlay(sentence.start_time, sentence.end_time)}
          >
            <Play size={15} />
          </button>
          <div className="sentence-meta">
            <InlineSpeakerName
              speaker={speakersById.get(sentence.speaker_id)}
              fallbackName={sentence.speaker_display_name}
              onRenameSpeaker={onRenameSpeaker}
            />
            <span className="timestamp">
              {formatTime(sentence.start_time)}-{formatTime(sentence.end_time)}
            </span>
          </div>
          <EditableTurnSentence
            sentence={sentence}
            isEditing={editingSentenceId === sentence.id}
            onEdit={() => setEditingSentenceId(sentence.id)}
            onCancel={() => setEditingSentenceId(null)}
            onUpdateSentence={onUpdateSentence}
          />
        </article>
      ))}
    </div>
  );
}

function InlineSpeakerName({ speaker, fallbackName, onRenameSpeaker }) {
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef(null);
  const displayName = speaker?.display_name || fallbackName;

  useEffect(() => {
    if (!isEditing) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [isEditing]);

  async function saveName(event) {
    setIsEditing(false);
    if (!speaker) return;
    const nextName = event.currentTarget.textContent.trim() || speaker.speaker_key;
    if (nextName !== speaker.display_name) {
      await onRenameSpeaker(speaker, nextName);
    }
  }

  if (isEditing) {
    return (
      <span
        ref={editorRef}
        className="speaker-name speaker-name--editing"
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        aria-label={`Display name for ${speaker?.speaker_key || displayName}`}
        onBlur={saveName}
      >
        {displayName}
      </span>
    );
  }

  return (
    <button type="button" className="speaker-name inline-speaker-name" onClick={() => setIsEditing(true)}>
      {displayName}
    </button>
  );
}
