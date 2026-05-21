import React from "react";
import { Settings } from "lucide-react";

export function AppHeader({ onOpenSettings }) {
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
