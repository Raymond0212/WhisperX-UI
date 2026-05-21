import React from "react";
import { Check, FileAudio, LoaderCircle, Play, Plus, Search } from "lucide-react";

export function LibraryPanel({
  audioItems,
  fileInputRef,
  filteredAudioItems,
  onFileInput,
  onProcessAudio,
  onSearch,
  onSelectAudio,
  searchQuery,
  selectedAudio,
}) {
  return (
    <aside className="sidebar">
      <section className="upload-panel" aria-label="Library controls">
        <label className="sr-only">
          Audio file
          <input
            ref={fileInputRef}
            name="file"
            type="file"
            accept=".mp3,.wav,.m4a,.flac,.ogg,.aac"
            onChange={onFileInput}
          />
        </label>
        <div className="library-search">
          <button
            type="button"
            className="icon-button add-audio-button"
            aria-label="Add audio file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
          </button>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search library"
            placeholder="Search audio files"
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </section>

      <div className="library">
        <h2>Library</h2>
        <div className="library-list">
          {filteredAudioItems.map((audio) => (
            <LibraryRow
              audio={audio}
              isActive={selectedAudio?.id === audio.id}
              key={audio.id}
              onProcessAudio={onProcessAudio}
              onSelectAudio={onSelectAudio}
            />
          ))}
          {audioItems.length > 0 && filteredAudioItems.length === 0 && (
            <p className="library-empty">No audio files match your search.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

function LibraryRow({ audio, isActive, onProcessAudio, onSelectAudio }) {
  const status = audio.latest_job_status || "uploaded";
  const isProcessing = status === "processing" || status === "queued" || status === "running";
  const isCompleted = status === "completed";

  return (
    <div className={`library-row ${isActive ? "active" : ""}`}>
      <button type="button" className="library-title-button" onClick={() => onSelectAudio(audio)}>
        <FileAudio size={17} aria-hidden="true" />
        <span>{audio.display_title}</span>
      </button>
      {isCompleted && (
        <span className="library-status-icon completed" aria-label="Completed" title="Completed">
          <Check size={16} />
        </span>
      )}
      {isProcessing && (
        <span className="library-status-icon processing" aria-label="Processing" title="Processing">
          <LoaderCircle size={16} />
        </span>
      )}
      {!isCompleted && !isProcessing && (
        <button
          type="button"
          className="library-status-icon process"
          aria-label={`Process ${audio.display_title}`}
          title="Process"
          onClick={() => onProcessAudio(audio)}
        >
          <Play size={15} />
        </button>
      )}
    </div>
  );
}
