import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppHeader } from "./components/AppHeader.jsx";
import { LibraryPanel } from "./components/LibraryPanel.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";
import { ToastViewport } from "./components/ToastViewport.jsx";
import { UploadModal } from "./components/UploadModal.jsx";
import { WorkspacePanel } from "./components/WorkspacePanel.jsx";
import { api } from "./api.js";
import {
  DEFAULT_JOB_SETTINGS,
  applySentenceUpdate,
  applySpeakerRename,
  buildModelPrepareRequest,
  buildJobRequest,
  createRangePlaybackController,
  groupSpeakerTurns,
  mergeJobSettings,
  normalizeJobSettings,
} from "./jobUtils.js";
import "./styles.css";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false);
  const [viewMode, setViewMode] = useState("sentences");
  const [toasts, setToasts] = useState([]);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const audioRef = useRef(null);
  const playbackControllerRef = useRef(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map());

  useEffect(() => {
    notify("Ready");
    refreshLibrary();
    loadSettings();
    loadModels();
    loadModelOptions();
  }, []);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
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

  function removeToast(id) {
    const timer = toastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function scheduleToastRemoval(id, duration) {
    if (!duration) return;
    const timer = window.setTimeout(() => removeToast(id), duration);
    toastTimersRef.current.set(id, timer);
  }

  function notify(text, options = {}) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    const duration = options.duration === undefined ? 2800 : options.duration;
    setToasts((current) => [...current.slice(-2), { id, text }]);
    scheduleToastRemoval(id, duration);
    return id;
  }

  function updateToast(id, text, options = {}) {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) window.clearTimeout(existingTimer);
    toastTimersRef.current.delete(id);
    const duration = options.duration === undefined ? 2800 : options.duration;
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, text } : toast)));
    scheduleToastRemoval(id, duration);
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
    setIsMobileLibraryOpen(false);
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
    const file = event.currentTarget.files[0] || null;
    setSelectedFile(file);
    setIsUploadModalOpen(Boolean(file));
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingUpload(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    setSelectedFile(file);
    setIsUploadModalOpen(true);
  }

  function handlePageDragEnter(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingUpload(true);
  }

  function handlePageDragOver(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
  }

  function handlePageDragLeave(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingUpload(false);
  }

  function closeUploadModal() {
    setIsUploadModalOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadAudio(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = selectedFile;
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("display_title", form.elements.display_title.value || file.name.replace(/\.[^.]+$/, ""));
    const audio = await api("/api/audio", { method: "POST", body });
    form.reset();
    setSelectedFile(null);
    setIsUploadModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    notify("Upload saved locally.");
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

  async function deleteTranscript(job) {
    await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    setSelectedJob(null);
    setSpeakers([]);
    setSentences([]);
    if (!selectedAudio) return;
    const nextJobs = await api(`/api/audio/${selectedAudio.id}/jobs`);
    setJobs(nextJobs);
    const completed = nextJobs.find((item) => item.status === "completed");
    if (completed) {
      await openJob(completed);
    }
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

  async function updateRecordingSettings(audio, values) {
    const normalizeOptionalInt = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      return Number(value);
    };
    const updated = await api(`/api/audio/${audio.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker_count: normalizeOptionalInt(values.speaker_count),
        min_speakers: normalizeOptionalInt(values.min_speakers),
        max_speakers: normalizeOptionalInt(values.max_speakers),
      }),
    });
    setSelectedAudio(updated);
    await refreshLibrary();
  }

  async function processSelectedAudio(audioOverride = selectedAudio) {
    if (!audioOverride) return;
    setSelectedAudio(audioOverride);
    setSelectedJob(null);
    setSpeakers([]);
    setSentences([]);
    const modelToastId = notify("Preparing local model...", { duration: null });
    const prepared = await api("/api/models/prepare-basic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildModelPrepareRequest(jobSettings)),
    });
    setLocalModels(prepared.models);
    const preparedModel = prepared.models.find((model) => model.key === jobSettings.transcription_model);
    updateToast(modelToastId, `Local model ready · ${preparedModel?.display_name || jobSettings.transcription_model}`);
    const processToastId = notify("Processing audio...", { duration: null });
    const job = await api("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildJobRequest(audioOverride.id, jobSettings, {
          speaker_count: audioOverride.speaker_count,
          min_speakers: audioOverride.min_speakers,
          max_speakers: audioOverride.max_speakers,
        }),
      ),
    });
    setJobs(await api(`/api/audio/${audioOverride.id}/jobs`));
    await openJob(job);
    await refreshLibrary();
    updateToast(processToastId, job.status === "completed" ? "Processing complete." : job.error_message || job.status);
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
    setJobSettings((current) => mergeJobSettings({ ...saved, diarization_token: current.diarization_token || "" }));
    notify("Settings saved.");
    setIsSettingsOpen(false);
  }

  function playRange(start, end) {
    const player = audioRef.current;
    if (!playbackControllerRef.current && player) {
      playbackControllerRef.current = createRangePlaybackController(player);
    }
    playbackControllerRef.current?.playRange(start, end);
  }

  const speakerTurns = useMemo(() => groupSpeakerTurns(sentences), [sentences]);
  const layoutMode = selectedAudio ? "layout layout--active" : "layout layout--library";
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredAudioItems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLocaleLowerCase();
    if (!query) return audioItems;
    return audioItems.filter((audio) => audio.display_title.toLocaleLowerCase().includes(query));
  }, [audioItems, deferredSearchQuery]);

  return (
    <main
      className={`app-shell ${isDraggingUpload ? "is-page-dragging" : ""} ${isMobileLibraryOpen ? "mobile-library-open" : ""}`}
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handleDrop}
    >
      <AppHeader
        isLibraryOpen={isMobileLibraryOpen}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleLibrary={() => setIsMobileLibraryOpen((current) => !current)}
      />
      <ToastViewport toasts={toasts} />

      <section className={layoutMode}>
        <LibraryPanel
          audioItems={audioItems}
          fileInputRef={fileInputRef}
          filteredAudioItems={filteredAudioItems}
          jobs={jobs}
          onFileInput={handleFileInput}
          onOpenJob={openJob}
          onProcessAudio={processSelectedAudio}
          onSearch={setSearchQuery}
          onSelectAudio={selectAudio}
          searchQuery={searchQuery}
          selectedAudio={selectedAudio}
        />
        <WorkspacePanel
          audioRef={audioRef}
          onDeleteAudio={deleteAudio}
          onDeleteTranscript={deleteTranscript}
          onPlay={playRange}
          onProcessAudio={processSelectedAudio}
          onUpdateRecordingSettings={updateRecordingSettings}
          onRenameSpeaker={renameSpeaker}
          onUpdateSentence={updateSentence}
          onUpdateTitle={updateTitle}
          selectedAudio={selectedAudio}
          selectedJob={selectedJob}
          sentences={sentences}
          setSelectedAudio={setSelectedAudio}
          setViewMode={setViewMode}
          speakerTurns={speakerTurns}
          speakers={speakers}
          viewMode={viewMode}
        />
      </section>
      {isMobileLibraryOpen && <button type="button" className="mobile-library-backdrop" aria-label="Close library panel" onClick={() => setIsMobileLibraryOpen(false)} />}

      {isDraggingUpload && (
        <div className="page-drop-overlay" aria-hidden="true">
          <div>Drop audio to import</div>
        </div>
      )}

      {isUploadModalOpen && <UploadModal onClose={closeUploadModal} onUpload={uploadAudio} selectedFile={selectedFile} />}
      {isSettingsOpen && (
        <SettingsModal
          jobSettings={jobSettings}
          modelOptions={modelOptions}
          onChangeJobSetting={updateJobSetting}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={saveSettings}
          settings={settings}
        />
      )}
    </main>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
