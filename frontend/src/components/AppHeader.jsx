import React from "react";
import { PanelLeft, Settings } from "lucide-react";

export function AppHeader({ isLibraryOpen, onOpenSettings, onToggleLibrary }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          WX
        </span>
        <h1>WhisperX UI</h1>
        <p>Local faster-whisper transcription with optional Hugging Face speaker diarization.</p>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="icon-button library-toggle"
          aria-label="Toggle library panel"
          aria-pressed={isLibraryOpen}
          onClick={onToggleLibrary}
        >
          <PanelLeft size={18} />
        </button>
        <button
          type="button"
          className="icon-button settings-trigger"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
