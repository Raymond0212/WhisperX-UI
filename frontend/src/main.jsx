import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell.jsx";
import { LibraryPanel } from "./components/LibraryPanel.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";
import { ToastViewport } from "./components/ToastViewport.jsx";
import { UploadModal } from "./components/UploadModal.jsx";
import { WorkspacePanel } from "./components/WorkspacePanel.jsx";
import { API_BASE, api } from "./api.js";
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
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/left-panel.css";
import "./styles/header.css";
import "./styles/right-panel.css";
import "./styles/transcript.css";
import "./styles/modals.css";
import "./styles/notifications.css";
import "./styles/page.css";
import "./styles/responsive.css";

const THEME_STORAGE_KEY = "whisperx-ui-theme";
const VALID_THEME_PREFERENCES = new Set(["system", "light", "dark"]);

export function App() {
  const [audioItems, setAudioItems] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobsByAudioId, setJobsByAudioId] = useState({});
  const [speakerDirectory, setSpeakerDirectory] = useState([]);
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
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("library");
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)").matches
      : false,
  );
  const [viewMode, setViewMode] = useState("sentences");
  const [themePreference, setThemePreference] = useState(() => getStoredThemePreference());
  const [toasts, setToasts] = useState([]);
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const audioRef = useRef(null);
  const selectedAudioRef = useRef(null);
  const playbackControllerRef = useRef(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map());
  const stoppedJobIdsRef = useRef(new Set());
  const mobilePaneHistoryRef = useRef(false);

  useEffect(() => {
    const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

    applyThemePreference(themePreference);
    if (!media || themePreference !== "system") return undefined;

    const handleChange = () => applyThemePreference("system");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const handleChange = (event) => {
      setIsMobileViewport(event.matches);
      if (!event.matches) {
        setIsMobileLibraryOpen(false);
        mobilePaneHistoryRef.current = false;
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isMobileViewport) return undefined;
    const handlePopState = () => {
      if (mobilePaneHistoryRef.current) {
        mobilePaneHistoryRef.current = false;
        setIsMobileLibraryOpen(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isMobileViewport]);

  useEffect(() => {
    if (typeof window === "undefined" || !isMobileViewport) return;
    if (isMobileLibraryOpen && !mobilePaneHistoryRef.current) {
      window.history.pushState({ whisperxMobilePane: true }, "");
      mobilePaneHistoryRef.current = true;
      return;
    }
    if (!isMobileLibraryOpen) {
      mobilePaneHistoryRef.current = false;
    }
  }, [isMobileLibraryOpen, isMobileViewport]);

  useEffect(() => {
    if (!selectedAudio) {
      setIsMobileLibraryOpen(false);
    }
  }, [selectedAudio]);

  useEffect(() => {
    if (activeSection !== "speakers" || audioItems.length === 0) return;
    let cancelled = false;

    async function hydrateSpeakerDirectory() {
      const directory = await buildSpeakerDirectory(audioItems, jobsByAudioId);
      if (!cancelled) {
        setSpeakerDirectory(directory);
      }
    }

    void hydrateSpeakerDirectory();
    return () => {
      cancelled = true;
    };
  }, [activeSection, audioItems, jobsByAudioId]);

  useEffect(() => {
    notify("Ready");
    async function bootstrap() {
      try {
        await Promise.all([refreshLibrary(), loadSettings(), loadModels(), loadModelOptions()]);
        setIsBackendAvailable(true);
      } catch {
        setIsBackendAvailable(false);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!cancelled) setIsBackendAvailable(response.ok);
      } catch {
        if (!cancelled) setIsBackendAvailable(false);
      }
    }
    void checkHealth();
    const timer = window.setInterval(() => {
      void checkHealth();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    selectedAudioRef.current = selectedAudio;
  }, [selectedAudio]);

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
    const nextAudioItems = await api("/api/audio");
    setAudioItems(nextAudioItems);
    void refreshJobsForAudioItems(nextAudioItems);
    return nextAudioItems;
  }

  async function refreshJobsForAudioItems(audioList) {
    const entries = await Promise.all(
      audioList.map(async (audio) => {
        try {
          return [audio.id, await api(`/api/audio/${audio.id}/jobs`)];
        } catch {
          return [audio.id, []];
        }
      }),
    );
    setJobsByAudioId(Object.fromEntries(entries));
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

  function updateThemePreference(nextPreference) {
    if (!VALID_THEME_PREFERENCES.has(nextPreference)) return;
    setThemePreference(nextPreference);
    if (typeof window === "undefined") return;
    if (nextPreference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  }

  function toggleThemePreference() {
    updateThemePreference(resolveThemeMode(themePreference) === "dark" ? "light" : "dark");
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

  async function selectAudio(audio, preferredJob = null) {
    if (isMobileViewport) {
      setIsMobileLibraryOpen(true);
    }
    setSelectedAudio(audio);
    setSelectedJob(null);
    setSpeakers([]);
    setSentences([]);
    const nextJobs = jobsByAudioId[audio.id] || (await api(`/api/audio/${audio.id}/jobs`));
    setJobs(nextJobs);
    setJobsByAudioId((current) => ({ ...current, [audio.id]: nextJobs }));
    const nextJob = preferredJob || nextJobs[0];
    if (nextJob) await openJob(nextJob);
  }

  async function openJob(job) {
    setSelectedJob(job);
    if (job.status !== "completed") {
      setSpeakers([]);
      setSentences([]);
      return;
    }
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

  function closeSettings() {
    setIsSettingsOpen(false);
    if (activeSection === "settings") {
      setActiveSection("library");
    }
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
    if (isUploadingAudio) return;
    setIsUploadModalOpen(false);
    setSelectedFile(null);
    setUploadProgressPercent(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function uploadAudioWithProgress(body) {
    if (import.meta.env.MODE === "test" || typeof window.XMLHttpRequest === "undefined") {
      return api("/api/audio", { method: "POST", body });
    }
    return new Promise((resolve, reject) => {
      const xhr = new window.XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/audio`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(0, Math.min(100, (event.loaded / event.total) * 100));
        setUploadProgressPercent(percent);
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          const detail = xhr.response?.detail || xhr.statusText || "Upload failed";
          reject(new Error(detail));
          return;
        }
        resolve(xhr.response);
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(body);
    });
  }

  async function uploadAudio(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = selectedFile;
    if (!file) return;
    setIsUploadingAudio(true);
    setUploadProgressPercent(0);
    const body = new FormData();
    body.append("file", file);
    body.append("display_title", form.elements.display_title.value || file.name.replace(/\.[^.]+$/, ""));
    try {
      const audio = await uploadAudioWithProgress(body);
      form.reset();
      setSelectedFile(null);
      setIsUploadModalOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      notify("Upload saved locally.");
      await refreshLibrary();
      await selectAudio(audio);
    } finally {
      setIsUploadingAudio(false);
      setUploadProgressPercent(0);
    }
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
    setSpeakerDirectory((items) => items.filter((entry) => entry.jobId !== job.id));
    if (!selectedAudio) return;
    const nextJobs = await api(`/api/audio/${selectedAudio.id}/jobs`);
    setJobs(nextJobs);
    setJobsByAudioId((current) => ({ ...current, [selectedAudio.id]: nextJobs }));
    if (nextJobs[0]) {
      await openJob(nextJobs[0]);
    }
    await refreshLibrary();
  }

  async function stopJob(job) {
    if (!job || (job.status !== "queued" && job.status !== "processing")) return;
    stoppedJobIdsRef.current.add(job.id);
    await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    notify("Stopping job...");
    if (!selectedAudio) return;
    const nextJobs = await api(`/api/audio/${selectedAudio.id}/jobs`);
    setJobs(nextJobs);
    setJobsByAudioId((current) => ({ ...current, [selectedAudio.id]: nextJobs }));
    if (nextJobs[0]) {
      await openJob(nextJobs[0]);
    } else if (selectedJob?.id === job.id) {
      setSelectedJob(null);
      setSpeakers([]);
      setSentences([]);
    }
    await refreshLibrary();
  }

  async function deleteAudio(audio) {
    await api(`/api/audio/${audio.id}`, { method: "DELETE" });
    setSelectedAudio(null);
    setSelectedJob(null);
    setJobs([]);
    setJobsByAudioId((current) => {
      const next = { ...current };
      delete next[audio.id];
      return next;
    });
    setSpeakers([]);
    setSentences([]);
    setSpeakerDirectory((items) => items.filter((entry) => entry.audioId !== audio.id));
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
    if (selectedAudioRef.current?.id === audioOverride.id) {
      setSelectedJob(job);
    }
    let resolvedJob = job;
    const startedAt = Date.now();
    while (resolvedJob.status === "queued" || resolvedJob.status === "processing") {
      if (stoppedJobIdsRef.current.has(resolvedJob.id)) {
        resolvedJob = { ...resolvedJob, status: "deleted" };
        break;
      }
      if (Date.now() - startedAt > 30 * 60 * 1000) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (stoppedJobIdsRef.current.has(resolvedJob.id)) {
        resolvedJob = { ...resolvedJob, status: "deleted" };
        break;
      }
      try {
        resolvedJob = await api(`/api/jobs/${resolvedJob.id}`);
      } catch (error) {
        if (!stoppedJobIdsRef.current.has(resolvedJob.id)) {
          throw error;
        }
        resolvedJob = { ...resolvedJob, status: "deleted" };
        break;
      }
      if (selectedAudioRef.current?.id === audioOverride.id) {
        setSelectedJob(resolvedJob);
      }
      updateToast(
        processToastId,
        resolvedJob.progress_message || (resolvedJob.status === "queued" ? "Queued..." : "Processing audio..."),
        { duration: null },
      );
    }
    const nextJobs = await api(`/api/audio/${audioOverride.id}/jobs`);
    setJobs(nextJobs);
    setJobsByAudioId((current) => ({ ...current, [audioOverride.id]: nextJobs }));
    const wasStopped = stoppedJobIdsRef.current.has(resolvedJob.id) || resolvedJob.status === "deleted";
    if (wasStopped) {
      stoppedJobIdsRef.current.delete(resolvedJob.id);
      if (selectedAudioRef.current?.id === audioOverride.id) {
        setSelectedJob(null);
        setSpeakers([]);
        setSentences([]);
      }
    } else if (selectedAudioRef.current?.id === audioOverride.id && resolvedJob.status === "completed") {
      await openJob(resolvedJob);
    } else if (selectedAudioRef.current?.id === audioOverride.id) {
      setSelectedJob(resolvedJob);
      setSpeakers([]);
      setSentences([]);
    }
    await refreshLibrary();
    updateToast(
      processToastId,
      wasStopped
        ? "Processing stopped."
        : resolvedJob.status === "completed"
          ? "Processing complete."
          : resolvedJob.error_message || resolvedJob.status,
    );
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
    setSpeakerDirectory((items) =>
      items.map((entry) => (entry.id === updated.id ? { ...entry, displayName: updated.display_name } : entry)),
    );
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const nextSettings = Object.fromEntries(new FormData(form).entries());
    const hfToken = String(nextSettings.diarization_token || "").trim();
    if (hfToken) {
      await api("/api/secrets/hf-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hf_token: hfToken }),
      });
    }
    const normalized = normalizeJobSettings(nextSettings);
    const saved = await api("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: normalized }),
    });
    setSettings(saved);
    setJobSettings((current) =>
      mergeJobSettings({
        ...saved,
        diarization_token: hfToken ? "" : current.diarization_token || "",
      }),
    );
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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const resolvedTheme = resolveThemeMode(themePreference);
  const filteredAudioItems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLocaleLowerCase();
    if (!query) return audioItems;
    return audioItems.filter((audio) => audio.display_title.toLocaleLowerCase().includes(query));
  }, [audioItems, deferredSearchQuery]);
  const handleSelectSection = React.useCallback((sectionId) => {
    setActiveSection(sectionId);
    if (isMobileViewport) {
      setIsMobileLibraryOpen(false);
    }
  }, [isMobileViewport]);

  return (
    <main
      className={`app-shell ${isDraggingUpload ? "is-page-dragging" : ""} ${isMobileLibraryOpen ? "mobile-library-open" : ""}`}
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handleDrop}
    >
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
      <AppShell
        activeSection={activeSection}
        isBackendAvailable={isBackendAvailable}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectSection={handleSelectSection}
        onToggleTheme={toggleThemePreference}
        resolvedTheme={resolvedTheme}
        sidebar={(
          <LibraryPanel
            activeSection={activeSection}
            audioItems={audioItems}
            fileInputRef={fileInputRef}
            filteredAudioItems={filteredAudioItems}
            jobsByAudioId={jobsByAudioId}
            selectedJob={selectedJob}
            onFileInput={handleFileInput}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSearch={setSearchQuery}
            onSelectAudio={selectAudio}
            searchQuery={searchQuery}
            selectedAudio={selectedAudio}
            speakerDirectory={speakerDirectory}
            speakers={speakers}
          />
        )}
      >
        <WorkspacePanel
          audioRef={audioRef}
          onDeleteAudio={deleteAudio}
          onDeleteTranscript={deleteTranscript}
          onPlay={playRange}
          onProcessAudio={processSelectedAudio}
          onStopJob={stopJob}
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
      </AppShell>
      {isDraggingUpload && (
        <div className="page-drop-overlay" aria-hidden="true">
          <div>Drop audio to import</div>
        </div>
      )}

      {isUploadModalOpen && (
        <UploadModal
          isUploading={isUploadingAudio}
          onClose={closeUploadModal}
          onUpload={uploadAudio}
          progressPercent={uploadProgressPercent}
          selectedFile={selectedFile}
        />
      )}
      {isSettingsOpen && (
        <SettingsModal
          jobSettings={jobSettings}
          modelOptions={modelOptions}
          onChangeJobSetting={updateJobSetting}
          onClose={closeSettings}
          onSaveSettings={saveSettings}
          settings={settings}
        />
      )}
    </main>
  );
}

function getStoredThemePreference() {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return VALID_THEME_PREFERENCES.has(stored) ? stored : "system";
}

function resolveThemeMode(preference) {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemePreference(preference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveThemeMode(preference);
  root.dataset.theme = preference;
  root.style.colorScheme = resolved;
  root.classList.toggle("dark", resolved === "dark");
}

async function buildSpeakerDirectory(audioItems, jobsByAudioId) {
  const completedJobs = audioItems.flatMap((audio) =>
    (jobsByAudioId[audio.id] || [])
      .filter((job) => job.status === "completed")
      .map((job) => ({ audio, job })),
  );

  const speakerLists = await Promise.all(
    completedJobs.map(async ({ audio, job }) => {
      try {
        const jobSpeakers = await api(`/api/jobs/${job.id}/speakers`);
        return jobSpeakers.map((speaker) => ({
          id: speaker.id,
          audioId: audio.id,
          audioTitle: audio.display_title,
          displayName: speaker.display_name,
          jobId: job.id,
          sampleEnd: speaker.sample_end,
          sampleStart: speaker.sample_start,
          speakerKey: speaker.speaker_key,
        }));
      } catch {
        return [];
      }
    }),
  );

  return speakerLists
    .flat()
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" })
      || left.audioTitle.localeCompare(right.audioTitle, undefined, { sensitivity: "base" }),
    );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
