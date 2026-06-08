import React from "react";
import { Check, ChevronRight, Circle, FileAudio, Folder, LoaderCircle, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUPPORTED_AUDIO_ACCEPT = ".aac,.aif,.aifc,.aiff,.amr,.caf,.flac,.m4a,.mka,.mp3,.mpga,.mpeg,.oga,.ogg,.opus,.wav,.wave,.webm";

export function LibraryPanel({
  activeSection = "library",
  audioItems,
  fileInputRef,
  filteredAudioItems,
  jobsByAudioId = {},
  selectedJob,
  onFileInput,
  onSearch,
  onSelectAudio,
  searchQuery,
  selectedAudio,
  speakerDirectory = [],
}) {
  const [speakerSearchQuery, setSpeakerSearchQuery] = React.useState("");

  if (activeSection === "jobs") {
    const notStartedCount = audioItems.filter((audio) => !audio.latest_job_status || audio.latest_job_status === "uploaded").length;
    return (
      <TreeFrame title="Jobs" subtitle="Runs and status">
        <TreeGroup label="Smart views">
          <TreeNode icon={<Circle />} name="Not started" meta={String(notStartedCount)} />
          <TreeNode icon={<LoaderCircle />} name="Processing" meta={String(audioItems.filter(isProcessingAudio).length)} />
          <TreeNode icon={<Check />} name="Completed" meta={String(audioItems.filter((audio) => audio.latest_job_status === "completed").length)} />
          <TreeNode icon={<Folder />} name="Failed" meta={String(audioItems.filter((audio) => audio.latest_job_status === "failed").length)} />
        </TreeGroup>
      </TreeFrame>
    );
  }

  if (activeSection === "speakers") {
    const normalizedQuery = speakerSearchQuery.trim().toLocaleLowerCase();
    const filteredSpeakers = speakerDirectory.filter((speaker) =>
      !normalizedQuery || speaker.displayName.toLocaleLowerCase().includes(normalizedQuery),
    );

    return (
      <TreeFrame title="Speakers" subtitle="Search all detected speakers">
        <section className="upload-panel" aria-label="Speaker search">
          <div className="library-search library-search--single">
            <Search aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search speakers"
              placeholder="Search speaker names"
              value={speakerSearchQuery}
              onChange={(event) => setSpeakerSearchQuery(event.target.value)}
            />
          </div>
        </section>
        <TreeGroup label="Speaker directory">
          {filteredSpeakers.length > 0 ? filteredSpeakers.map((speaker) => {
            const isActive = selectedJob?.id === speaker.jobId;
            return (
              <button
                type="button"
                key={speaker.id}
                className={`tree-node tree-node--speaker ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  const audio = audioItems.find((item) => item.id === speaker.audioId);
                  const job = (jobsByAudioId[speaker.audioId] || []).find((item) => item.id === speaker.jobId);
                  if (!audio || !job) return;
                  onSelectAudio(audio, job);
                }}
              >
                <span className="tree-node-name">{speaker.displayName}</span>
                <span className="tree-node-subtitle">{speaker.audioTitle}</span>
              </button>
            );
          }) : <p className="tree-empty">No detected speakers match your search.</p>}
        </TreeGroup>
      </TreeFrame>
    );
  }

  return (
    <TreeFrame title="Library" subtitle="Audio, runs, exports">
      <section className="upload-panel" aria-label="Library controls">
        <label className="sr-only">
          Audio file
          <input
            ref={fileInputRef}
            name="file"
            type="file"
            accept={SUPPORTED_AUDIO_ACCEPT}
            onChange={onFileInput}
          />
        </label>
        <div className="library-search">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="add-audio-button"
            aria-label="Add audio file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus data-icon="inline-start" />
          </Button>
          <Search aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search library"
            placeholder="Search audio files"
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </section>

      <div className="library">
        <TreeGroup label="Audio items" />
        <div className="library-list">
          {filteredAudioItems.map((audio) => (
            <LibraryRow
              audio={audio}
              isActive={selectedAudio?.id === audio.id}
              key={audio.id}
              jobs={jobsByAudioId[audio.id] || []}
              selectedJob={selectedJob}
              onSelectAudio={onSelectAudio}
            />
          ))}
          {audioItems.length > 0 && filteredAudioItems.length === 0 && (
            <p className="library-empty">No audio files match your search.</p>
          )}
        </div>
      </div>
    </TreeFrame>
  );
}

function LibraryRow({ audio, isActive, jobs, selectedJob, onSelectAudio }) {
  const activeJobStatus = isActive && selectedJob?.audio_file_id === audio.id ? selectedJob.status : null;
  const latestSubJobStatus = isActive && jobs.length > 0 ? jobs[0].status : null;
  const status = activeJobStatus || latestSubJobStatus || audio.latest_job_status || "uploaded";
  const isProcessing = status === "processing" || status === "queued" || status === "running";
  const isCompleted = status === "completed";
  const isExpanded = isActive || jobs.length > 0;
  const selectedRunId = isActive ? selectedJob?.id || jobs[0]?.id : null;

  return (
    <div className={`library-tree-item ${isActive ? "active" : ""}`}>
      <button
        type="button"
        className="library-parent-node"
        aria-expanded={isExpanded}
        aria-current={isActive ? "page" : undefined}
        aria-label={audio.display_title}
        onClick={() => onSelectAudio(audio)}
      >
        <ChevronRight className={`library-disclosure ${isExpanded ? "open" : ""}`} aria-hidden="true" />
        <FileAudio aria-hidden="true" />
        <span>{audio.display_title}</span>
        <Badge variant="outline">{jobs.length || runCountFromAudio(audio)}</Badge>
      </button>
      {isExpanded && jobs.length > 0 && (
        <div className="library-run-list" aria-label={`Processing history for ${audio.display_title}`}>
          {jobs.map((job, index) => (
            <button
              type="button"
              key={job.id}
              className={`library-run-node ${selectedRunId === job.id ? "active" : ""}`}
              aria-current={selectedRunId === job.id ? "page" : undefined}
              aria-label={`${audio.display_title} ${runLabel(job, index, jobs.length)}`}
              onClick={() => {
                if (isActive) {
                  onSelectAudio(audio, job);
                  return;
                }
                onSelectAudio(audio, job);
              }}
            >
              <span className="library-run-bullet" aria-hidden="true">•</span>
              <span>{runLabel(job, index, jobs.length)}</span>
              <Badge variant="outline">{runStatusLabel(job.status, index)}</Badge>
            </button>
          ))}
        </div>
      )}
      {isExpanded && jobs.length === 0 && (
        <div className="library-run-list">
          <button
            type="button"
            className="library-run-node library-run-node--raw"
            aria-label={`${audio.display_title} not started`}
            aria-current={isActive && !selectedJob ? "page" : undefined}
            onClick={() => onSelectAudio(audio)}
          >
            <span className="library-run-bullet" aria-hidden="true">•</span>
            <span>Not started</span>
            <Badge variant="outline">raw</Badge>
          </button>
        </div>
      )}
    </div>
  );
}

function runCountFromAudio(audio) {
  if (Number.isFinite(Number(audio.job_count))) return Number(audio.job_count);
  return audio.latest_job_status && audio.latest_job_status !== "uploaded" ? 1 : 0;
}

function runLabel(job, index, total) {
  if (index === 0) return "Latest transcript";
  return `${job.transcription_model || "Transcript"} run ${total - index}`;
}

function runStatusLabel(status, index) {
  if (status === "completed") return index === 0 ? "done" : "old";
  if (status === "queued") return "queued";
  if (status === "processing" || status === "running") return "active";
  if (status === "failed") return "failed";
  return status || "raw";
}

function TreeFrame({ children, subtitle, title }) {
  return (
    <aside className="tree-sidebar">
      <header className="tree-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="tree-scroll">{children}</div>
    </aside>
  );
}

function TreeGroup({ children, label }) {
  return (
    <section className="tree-group">
      <div className="tree-group-label">{label}</div>
      {children}
    </section>
  );
}

function TreeNode({ icon, meta, name }) {
  return (
    <div className="tree-node">
      <span className="tree-node-icon">{icon}</span>
      <span className="tree-node-name">{name}</span>
      {meta ? <Badge variant="outline">{meta}</Badge> : null}
    </div>
  );
}

function isProcessingAudio(audio) {
  return audio.latest_job_status === "processing" || audio.latest_job_status === "queued";
}
