import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileAudio, Play, Save, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_JOB_SETTINGS,
  applySentenceUpdate,
  applySpeakerRename,
  buildModelPrepareRequest,
  buildJobRequest,
  createRangePlaybackController,
  formatTime,
  groupSpeakerTurns,
  mergeJobSettings,
  normalizeJobSettings,
} from "./jobUtils.js";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || response.statusText);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

export function App() {
  const [audioItems, setAudioItems] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [settings, setSettings] = useState({});
  const [jobSettings, setJobSettings] = useState(DEFAULT_JOB_SETTINGS);
  const [localModels, setLocalModels] = useState([]);
  const [modelOptions, setModelOptions] = useState({
    transcription_models: [],
    diarization_models: [],
    defaults: {},
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [viewMode, setViewMode] = useState("sentences");
  const [message, setMessage] = useState("");
  const audioRef = useRef(null);
  const playbackControllerRef = useRef(null);

  useEffect(() => {
    refreshLibrary();
    loadSettings();
    loadModels();
    loadModelOptions();
  }, []);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return undefined;
    playbackControllerRef.current = createRangePlaybackController(player);
    const onTimeUpdate = () => playbackControllerRef.current?.handleTimeUpdate();
    player.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      player.removeEventListener("timeupdate", onTimeUpdate);
      playbackControllerRef.current = null;
    };
  }, [selectedAudio?.id]);

  async function refreshLibrary() {
    setAudioItems(await api("/api/audio"));
  }

  async function loadSettings() {
    const loaded = await api("/api/settings");
    setSettings(loaded);
    setJobSettings(mergeJobSettings(loaded));
  }

  async function loadModels() {
    setLocalModels(await api("/api/models"));
  }

  async function loadModelOptions() {
    const options = await api("/api/model-options");
    setModelOptions(options);
    setJobSettings((current) => mergeJobSettings({ ...options.defaults, ...current }));
  }

  async function selectAudio(audio) {
    setSelectedAudio(audio);
    setSelectedJob(null);
    setSpeakers([]);
    setSentences([]);
    const nextJobs = await api(`/api/audio/${audio.id}/jobs`);
    setJobs(nextJobs);
    const completed = nextJobs.find((job) => job.status === "completed");
    if (completed) await openJob(completed);
  }

  async function openJob(job) {
    setSelectedJob(job);
    const [nextSpeakers, nextSentences] = await Promise.all([
      api(`/api/jobs/${job.id}/speakers`),
      api(`/api/jobs/${job.id}/transcript`),
    ]);
    setSpeakers(nextSpeakers);
    setSentences(nextSentences);
  }

  function updateJobSetting(name, value) {
    setJobSettings((current) => ({ ...current, [name]: value }));
  }

  function handleFileInput(event) {
    setSelectedFile(event.currentTarget.files[0] || null);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDraggingUpload(false);
    const file = event.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  async function uploadAudio(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = selectedFile || form.elements.file.files[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("display_title", form.elements.display_title.value || file.name.replace(/\.[^.]+$/, ""));
    const audio = await api("/api/audio", { method: "POST", body });
    form.reset();
    setSelectedFile(null);
    setMessage("Upload saved locally.");
    await refreshLibrary();
    await selectAudio(audio);
  }

  async function updateTitle(audio, displayTitle) {
    const updated = await api(`/api/audio/${audio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_title: displayTitle }),
    });
    setSelectedAudio(updated);
    await refreshLibrary();
  }

  async function deleteAudio(audio) {
    await api(`/api/audio/${audio.id}`, { method: "DELETE" });
    setSelectedAudio(null);
    setSelectedJob(null);
    setJobs([]);
    setSpeakers([]);
    setSentences([]);
    await refreshLibrary();
  }

  async function processSelectedAudio() {
    if (!selectedAudio) return;
    setMessage("Preparing local model...");
    const prepared = await api("/api/models/prepare-basic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildModelPrepareRequest(jobSettings)),
    });
    setLocalModels(prepared.models);
    setMessage("Processing audio...");
    const job = await api("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildJobRequest(selectedAudio.id, jobSettings)),
    });
    setJobs(await api(`/api/audio/${selectedAudio.id}/jobs`));
    await openJob(job);
    setMessage(job.status === "completed" ? "Processing complete." : job.error_message || job.status);
  }

  async function updateSentence(sentence, currentText) {
    const updated = await api(`/api/transcript-sentences/${sentence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_text: currentText }),
    });
    setSentences((items) => applySentenceUpdate(items, updated));
  }

  async function renameSpeaker(speaker, displayName) {
    const updated = await api(`/api/speakers/${speaker.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });
    setSpeakers((items) => applySpeakerRename(items, [], updated).speakers);
    setSentences((items) => applySpeakerRename([], items, updated).sentences);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const nextSettings = Object.fromEntries(new FormData(form).entries());
    const normalized = normalizeJobSettings(nextSettings);
    const saved = await api("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: normalized }),
    });
    setSettings(saved);
    setJobSettings(mergeJobSettings(saved));
    setMessage("Settings saved.");
  }

  function playRange(start, end) {
    const player = audioRef.current;
    if (!playbackControllerRef.current && player) {
      playbackControllerRef.current = createRangePlaybackController(player);
    }
    playbackControllerRef.current?.playRange(start, end);
  }

  const speakerTurns = useMemo(() => groupSpeakerTurns(sentences), [sentences]);
  const basicModel = localModels.find((model) => model.key === jobSettings.transcription_model);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>WhisperX UI</h1>
          <p>Local faster-whisper transcription with optional Hugging Face speaker diarization.</p>
        </div>
        <span className="status-pill">{message || "Ready"}</span>
      </header>

      <section className="layout">
        <aside className="sidebar">
          <form className="upload-panel" onSubmit={uploadAudio}>
            <label>
              Audio file
              <input name="file" type="file" accept=".mp3,.wav,.m4a,.flac,.ogg,.aac" onChange={handleFileInput} />
            </label>
            <div
              className={`drop-zone ${isDraggingUpload ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingUpload(true);
              }}
              onDragLeave={() => setIsDraggingUpload(false)}
              onDrop={handleDrop}
            >
              {selectedFile ? selectedFile.name : "Drop audio file here"}
            </div>
            <label>
              Title
              <input name="display_title" type="text" placeholder="Optional display title" />
            </label>
            <button type="submit">
              <Upload size={16} /> Upload
            </button>
          </form>

          <div className="library">
            <h2>Library</h2>
            {audioItems.map((audio) => (
              <button
                type="button"
                className={`library-row ${selectedAudio?.id === audio.id ? "active" : ""}`}
                key={audio.id}
                onClick={() => selectAudio(audio)}
              >
                <FileAudio size={17} />
                <span>{audio.display_title}</span>
                <small>{audio.latest_job_status || "uploaded"}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          {selectedAudio ? (
            <>
              <div className="audio-header">
                <input
                  value={selectedAudio.display_title}
                  onChange={(event) => setSelectedAudio({ ...selectedAudio, display_title: event.target.value })}
                  onBlur={(event) => updateTitle(selectedAudio, event.target.value)}
                />
                <div className="toolbar">
                  <button type="button" onClick={processSelectedAudio}>
                    <Play size={16} /> Process
                  </button>
                  <button type="button" onClick={() => deleteAudio(selectedAudio)}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>

              <audio ref={audioRef} controls src={`${API_BASE}/api/audio/${selectedAudio.id}/stream`} />

              <ModelConfig settings={jobSettings} onChange={updateJobSetting} modelOptions={modelOptions} />
              <div className="model-status">
                <strong>{basicModel?.downloaded ? "Local model ready" : "Local model will download on process"}</strong>
                <span>{basicModel?.display_name || "Model will download on first run"}</span>
              </div>

              <div className="jobs-strip">
                {jobs.map((job) => (
                  <button type="button" key={job.id} onClick={() => openJob(job)}>
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
                  onPlay={playRange}
                  onRenameSpeaker={renameSpeaker}
                  onUpdateSentence={updateSentence}
                />
              )}
            </>
          ) : (
            <div className="empty-state">Upload or select local audio to begin.</div>
          )}
        </section>

        <aside className="settings">
          <h2>Settings</h2>
          <form onSubmit={saveSettings} key={JSON.stringify(settings)}>
            <SettingsFields settings={mergeJobSettings(settings)} modelOptions={modelOptions} />
            <button type="submit">
              <Save size={16} /> Save
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}

function ProviderModelFields({ settings, onChange, modelOptions }) {
  const inputProps = (name) => ({
    name,
    value: settings[name] ?? "",
    onChange: (event) => onChange(name, event.target.value),
  });
  return (
    <>
      <label>
        Transcription engine
        <input value="faster-whisper" readOnly />
      </label>
      <label>
        Transcription model
        <select {...inputProps("transcription_model")}>
          {modelOptions.transcription_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Diarization engine
        <input value="huggingface-pyannote" readOnly />
      </label>
      <label>
        Diarization model
        <select {...inputProps("diarization_model")}>
          {modelOptions.diarization_models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Diarization/HF token
        <input {...inputProps("diarization_token")} type="password" placeholder="Optional (enables pyannote diarization)" />
      </label>
    </>
  );
}

function RuntimeFields({ settings, onChange }) {
  const inputProps = (name) => ({
    name,
    value: settings[name] ?? "",
    onChange: (event) => onChange(name, event.target.value),
  });
  return (
    <>
      <label>
        Language
        <input {...inputProps("language")} placeholder="auto" />
      </label>
      <label>
        Device
        <select {...inputProps("device")}>
          <option value="auto">auto</option>
          <option value="cpu">cpu</option>
          <option value="cuda">cuda</option>
        </select>
      </label>
      <label>
        Compute type
        <input {...inputProps("compute_type")} />
      </label>
      <label>
        Batch size
        <input {...inputProps("batch_size")} type="number" min="1" max="128" />
      </label>
      <label>
        Speaker count
        <input {...inputProps("speaker_count")} type="number" min="1" max="20" placeholder="auto" />
      </label>
      <label>
        Min speakers
        <input {...inputProps("min_speakers")} type="number" min="1" max="20" placeholder="auto" />
      </label>
      <label>
        Max speakers
        <input {...inputProps("max_speakers")} type="number" min="1" max="20" placeholder="auto" />
      </label>
    </>
  );
}

function ModelConfig({ settings, onChange, modelOptions }) {
  return (
    <section className="model-config">
      <h2>Model Configuration</h2>
      <div className="model-grid">
        <ProviderModelFields settings={settings} onChange={onChange} modelOptions={modelOptions} />
        <RuntimeFields settings={settings} onChange={onChange} />
      </div>
    </section>
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

function TranscriptReview({
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
  return (
    <div className="review">
      <div className="review-header">
        <div className="segmented">
          <button className={viewMode === "sentences" ? "active" : ""} onClick={() => setViewMode("sentences")}>
            Sentences
          </button>
          <button className={viewMode === "turns" ? "active" : ""} onClick={() => setViewMode("turns")}>
            Speaker turns
          </button>
        </div>
        <a className="export-link" href={`${API_BASE}/api/jobs/${job.id}/export.vtt`}>
          <Download size={16} /> Export VTT
        </a>
      </div>

      <section className="speaker-list">
        {speakers.map((speaker) => (
          <div className="speaker-row" key={speaker.id}>
            <button
              type="button"
              aria-label={`Play sample for ${speaker.display_name}`}
              onClick={() => onPlay(speaker.sample_start, speaker.sample_end)}
            >
              <Play size={15} />
            </button>
            <code>{speaker.speaker_key}</code>
            <input
              defaultValue={speaker.display_name}
              onBlur={(event) => onRenameSpeaker(speaker, event.target.value)}
            />
            <small>
              {formatTime(speaker.sample_start)}-{formatTime(speaker.sample_end)}
            </small>
          </div>
        ))}
      </section>

      {viewMode === "sentences" ? (
        <SentenceList sentences={sentences} onPlay={onPlay} onUpdateSentence={onUpdateSentence} />
      ) : (
        <div className="turn-list">
          {speakerTurns.map((turn) => (
            <section className="turn" key={`${turn.speaker_id}-${turn.start_time}`}>
              <header>
                <strong>{turn.speaker_display_name}</strong>
                <span>
                  {formatTime(turn.start_time)}-{formatTime(turn.end_time)}
                </span>
              </header>
              <SentenceList sentences={turn.sentences} onPlay={onPlay} onUpdateSentence={onUpdateSentence} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SentenceList({ sentences, onPlay, onUpdateSentence }) {
  return (
    <div className="sentence-list">
      {sentences.map((sentence) => (
        <article className="sentence-row" key={sentence.id}>
          <button
            type="button"
            aria-label={`Play sentence ${sentence.sentence_index ?? sentence.id}`}
            onClick={() => onPlay(sentence.start_time, sentence.end_time)}
          >
            <Play size={15} />
          </button>
          <span className="timestamp">
            {formatTime(sentence.start_time)}-{formatTime(sentence.end_time)}
          </span>
          <strong>{sentence.speaker_display_name}</strong>
          <textarea
            defaultValue={sentence.current_text}
            onBlur={(event) => onUpdateSentence(sentence, event.target.value)}
          />
        </article>
      ))}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
