import React, { useEffect, useRef, useState } from "react";
import { Download, Play } from "lucide-react";
import { API_BASE } from "../api.js";
import { formatTime, runtimeDeviceIndicator } from "../jobUtils.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TranscriptReview({
  job,
  selectedAudio,
  speakers,
  sentences,
  speakerTurns,
  viewMode,
  setViewMode,
  onPlay,
  onRenameSpeaker,
  onUpdateRecordingSettings,
  onUpdateSentence,
}) {
  const isMobile = useIsMobile();
  const isProcessing = job?.status === "queued" || job?.status === "processing" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const notProcessedTitle = "Not Processed Yet";
  const progressPercent = getProgressPercent(job);
  const progressLabel = job?.progress_message || (job?.status === "queued" ? "Queued" : "Processing audio");
  const deviceIndicator = runtimeDeviceIndicator(job);
  const exportView = viewMode === "sentences" ? "sentences" : "speaker-turns";
  const exportLabel = viewMode === "sentences" ? "Download Sentence VTT" : "Download Speaker Turn VTT";
  const exportConfirmation =
    viewMode === "sentences"
      ? "Download the sentence based VTT export?"
      : "Download the speaker turn based VTT export?";
  const exportUrl = job ? `${API_BASE}/api/jobs/${job.id}/export.vtt?view=${exportView}` : "";
  const canExport = isCompleted && (viewMode === "sentences" || viewMode === "turns");

  return (
    <Card className="review-card">
      <Tabs value={viewMode} onValueChange={setViewMode} className="review-tabs">
        <CardHeader className="review-card-header">
          <CardTitle className="sr-only">Transcript workspace</CardTitle>
          <div className="review-tabs-scroll">
            <TabsList aria-label="Run workspace tabs" className="review-tabs-list">
              <TabsTrigger value="sentences" onClick={() => setViewMode("sentences")}>Sentences</TabsTrigger>
              <TabsTrigger value="turns" onClick={() => setViewMode("turns")}>Speaker turns</TabsTrigger>
              <TabsTrigger value="speakers" onClick={() => setViewMode("speakers")}>Speakers</TabsTrigger>
              <TabsTrigger value="settings" onClick={() => setViewMode("settings")}>Run settings</TabsTrigger>
            </TabsList>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={exportLabel}
              disabled={!canExport}
              data-export-url={exportUrl}
              data-export-view={exportView}
              onClick={() => {
                if (!canExport) return;
                if (window.confirm(exportConfirmation)) {
                  window.location.assign(exportUrl);
                }
              }}
            >
              <Download data-icon="inline-start" />
              {!isMobile && "VTT"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="review-card-content">
          <TabsContent value="sentences" className="review-body">
            {renderRunContent({
              isProcessing,
              isCompleted,
              progressLabel,
              progressPercent,
              deviceIndicator,
              emptyTitle: notProcessedTitle,
              completedContent: (
                <SentenceList
                  sentences={sentences}
                  speakers={speakers}
                  onPlay={onPlay}
                  onRenameSpeaker={onRenameSpeaker}
                  onUpdateSentence={onUpdateSentence}
                />
              ),
            })}
          </TabsContent>
          <TabsContent value="turns" className="review-body">
            {renderRunContent({
              isProcessing,
              isCompleted,
              progressLabel,
              progressPercent,
              deviceIndicator,
              emptyTitle: notProcessedTitle,
              completedContent: (
                <SpeakerTurnList
                  speakerTurns={speakerTurns}
                  speakers={speakers}
                  onPlay={onPlay}
                  onRenameSpeaker={onRenameSpeaker}
                  onUpdateSentence={onUpdateSentence}
                />
              ),
            })}
          </TabsContent>
          <TabsContent value="speakers" className="review-body">
            {renderRunContent({
              isProcessing,
              isCompleted,
              progressLabel,
              progressPercent,
              deviceIndicator,
              emptyTitle: "Speakers are not detected yet.",
              completedContent: <SpeakerList speakers={speakers} onPlay={onPlay} onRenameSpeaker={onRenameSpeaker} />,
            })}
          </TabsContent>
          <TabsContent value="settings" className="review-body">
            <div className="run-settings-tab">
              <div>
                <h3>Run settings</h3>
                <p>{job ? "Settings are locked for this run." : "Configure diarization before starting transcription."}</p>
              </div>
              <RecordingDiarizationSettings
                selectedAudio={selectedAudio}
                onUpdateRecordingSettings={onUpdateRecordingSettings}
                disabled={Boolean(job)}
              />
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

function renderRunContent({ isProcessing, isCompleted, progressLabel, progressPercent, deviceIndicator, emptyTitle, completedContent }) {
  if (isProcessing) {
    return <TranscriptionProgress progressLabel={progressLabel} progressPercent={progressPercent} deviceIndicator={deviceIndicator} />;
  }
  if (isCompleted) return completedContent;
  return <TabEmpty title={emptyTitle} />;
}

function TranscriptionProgress({ progressLabel, progressPercent, deviceIndicator }) {
  const value = progressPercent === null ? 0 : progressPercent;
  return (
    <section className="transcription-progress" aria-label="Transcription progress">
      <div className="transcription-progress-meta">
        <strong>{progressLabel}</strong>
        <span className="transcription-progress-status">
          {deviceIndicator && <Badge variant="outline">{deviceIndicator}</Badge>}
          <span>{progressPercent === null ? "" : `${Math.round(progressPercent)}%`}</span>
        </span>
      </div>
      <Progress value={value} />
    </section>
  );
}

function TabEmpty({ title }) {
  return (
    <div className="tab-empty">
      <strong>{title}</strong>
      <span>Start or select a run to populate this tab.</span>
    </div>
  );
}

function SpeakerList({ speakers, onPlay, onRenameSpeaker }) {
  if (speakers.length === 0) {
    return <TabEmpty title="No speakers detected." />;
  }
  return (
    <div className="speaker-list speaker-list--tab">
      {speakers.map((speaker) => (
        <SpeakerLabelRow key={speaker.id} speaker={speaker} onPlay={onPlay} onRenameSpeaker={onRenameSpeaker} />
      ))}
    </div>
  );
}

function getProgressPercent(job) {
  if (!job) return null;
  const progress = Number(job.progress_percent);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
}

function RecordingDiarizationSettings({ selectedAudio, onUpdateRecordingSettings, disabled = false }) {
  const [values, setValues] = useState({
    speaker_count: selectedAudio.speaker_count ?? "",
    min_speakers: selectedAudio.min_speakers ?? "",
    max_speakers: selectedAudio.max_speakers ?? "",
  });

  useEffect(() => {
    setValues({
      speaker_count: selectedAudio.speaker_count ?? "",
      min_speakers: selectedAudio.min_speakers ?? "",
      max_speakers: selectedAudio.max_speakers ?? "",
    });
  }, [selectedAudio.id, selectedAudio.speaker_count, selectedAudio.min_speakers, selectedAudio.max_speakers]);

  function handleBlur() {
    if (disabled) return;
    onUpdateRecordingSettings(selectedAudio, values);
  }

  return (
    <div className="recording-settings" aria-label="Recording diarization settings">
      <label>
        <span>Speaker count</span>
        <input
          type="number"
          min="1"
          max="20"
          disabled={disabled}
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
          disabled={disabled}
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
          disabled={disabled}
          value={values.max_speakers}
          onChange={(event) => setValues((current) => ({ ...current, max_speakers: event.target.value }))}
          onBlur={handleBlur}
        />
      </label>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 860px)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 860px)");
    const onChange = (event) => setIsMobile(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isMobile;
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
          className="speaker-name inline-editing"
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
                    onPlay={onPlay}
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

function EditableTurnSentence({ sentence, isEditing, onEdit, onPlay, onCancel, onUpdateSentence }) {
  const editorRef = useRef(null);
  const playsOnClick = typeof onPlay === "function";

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
        className="turn-sentence inline-editing"
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
      aria-label={`${playsOnClick ? "Play" : "Edit"} sentence ${sentence.sentence_index ?? sentence.id}`}
      title={`${formatTime(sentence.start_time)}-${formatTime(sentence.end_time)}`}
      onClick={() => {
        if (playsOnClick) {
          onPlay(sentence.start_time, sentence.end_time);
          return;
        }
        onEdit();
      }}
      onDoubleClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (playsOnClick) {
            onPlay(sentence.start_time, sentence.end_time);
            return;
          }
          onEdit();
        }
        if (event.key === "F2") {
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
        className="speaker-name inline-editing"
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
    <button
      type="button"
      className="speaker-name inline-speaker-name"
      aria-label={`Edit display name for ${speaker?.speaker_key || displayName}`}
      onClick={() => setIsEditing(true)}
    >
      {displayName}
    </button>
  );
}
