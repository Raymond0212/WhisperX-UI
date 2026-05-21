import React from "react";
import { Save, X } from "lucide-react";
import { mergeJobSettings } from "../jobUtils.js";

export function SettingsModal({ jobSettings, modelOptions, onChangeJobSetting, onClose, onSaveSettings, settings }) {
  return (
    <div className="modal-backdrop modal-backdrop--settings" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="panel-kicker">Defaults</div>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form onSubmit={onSaveSettings} key={JSON.stringify(settings)}>
          <label>
            Diarization/HF token
            <input
              name="diarization_token"
              type="password"
              value={jobSettings.diarization_token || ""}
              onChange={(event) => onChangeJobSetting("diarization_token", event.target.value)}
              placeholder="Optional (enables pyannote diarization)"
            />
          </label>
          <SettingsFields settings={mergeJobSettings(settings)} modelOptions={modelOptions} />
          <button type="submit">
            <Save size={16} /> Save
          </button>
        </form>
      </section>
    </div>
  );
}

function SettingsFields({ settings, modelOptions }) {
  return (
    <>
      <label>
        Transcription engine
        <input name="transcription_engine" defaultValue={settings.transcription_engine} readOnly />
      </label>
      <label>
        Transcription model
        <select name="transcription_model" defaultValue={settings.transcription_model}>
          {modelOptions.transcription_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Diarization engine
        <input name="diarization_engine" defaultValue={settings.diarization_engine} readOnly />
      </label>
      <label>
        Diarization model
        <select name="diarization_model" defaultValue={settings.diarization_model}>
          {modelOptions.diarization_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Language
        <input name="language" defaultValue={settings.language} placeholder="auto" />
      </label>
      <label>
        Device
        <select name="device" defaultValue={settings.device}>
          <option value="auto">auto</option>
          <option value="cpu">cpu</option>
          <option value="cuda">cuda</option>
        </select>
      </label>
      <label>
        Compute type
        <input name="compute_type" defaultValue={settings.compute_type} />
      </label>
      <label>
        Batch size
        <input name="batch_size" type="number" min="1" max="128" defaultValue={settings.batch_size} />
      </label>
      <label>
        Speaker count
        <input name="speaker_count" type="number" min="1" max="20" defaultValue={settings.speaker_count} />
      </label>
      <label>
        Min speakers
        <input name="min_speakers" type="number" min="1" max="20" defaultValue={settings.min_speakers} />
      </label>
      <label>
        Max speakers
        <input name="max_speakers" type="number" min="1" max="20" defaultValue={settings.max_speakers} />
      </label>
    </>
  );
}
