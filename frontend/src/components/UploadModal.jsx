import React from "react";
import { Upload, X } from "lucide-react";

export function UploadModal({ onClose, onUpload, selectedFile }) {
  if (!selectedFile) return null;

  return (
    <div className="modal-backdrop modal-backdrop--center" role="presentation" onMouseDown={onClose}>
      <section
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="panel-kicker">New audio</div>
            <h2 id="upload-title">Review upload</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close import dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p className="selected-file-name">{selectedFile.name}</p>
        <form onSubmit={onUpload}>
          <label>
            Title
            <input
              name="display_title"
              type="text"
              placeholder="Optional display title"
              defaultValue={selectedFile.name.replace(/\.[^.]+$/, "")}
            />
          </label>
          <button type="submit">
            <Upload size={16} /> Upload
          </button>
        </form>
      </section>
    </div>
  );
}
