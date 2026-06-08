import React from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UploadModal({ isUploading, onClose, onUpload, progressPercent, selectedFile }) {
  if (!selectedFile) return null;
  const clampedProgress = Number.isFinite(progressPercent)
    ? Math.max(0, Math.min(100, progressPercent))
    : 0;

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
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close import dialog" onClick={onClose}>
            <X size={18} />
          </Button>
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
              disabled={isUploading}
            />
          </label>
          {isUploading && (
            <div className="upload-progress" aria-live="polite">
              <div
                className="upload-progress__rail"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(clampedProgress)}
              >
                <span className="upload-progress__fill" style={{ width: `${clampedProgress}%` }} />
              </div>
              <p className="upload-progress__label">Uploading {Math.round(clampedProgress)}%</p>
            </div>
          )}
          <Button type="submit" size="sm" disabled={isUploading}>
            <Upload size={16} /> {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </section>
    </div>
  );
}
