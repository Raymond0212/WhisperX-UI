// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./main.jsx";

const API_BASE = "http://127.0.0.1:8000";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createApiMock() {
  const requests = [];
  const uploadedAudio = {
    id: "audio-uploaded",
    display_title: "Demo upload",
    latest_job_status: "uploaded",
  };
  const failedAudio = {
    id: "audio-failed",
    display_title: "Broken clip",
    latest_job_status: "failed",
  };
  const completedJob = {
    id: "job-complete",
    status: "completed",
    transcription_model: "distil-large-v3",
    error_message: null,
  };
  const failedJob = {
    id: "job-failed",
    status: "failed",
    transcription_model: "distil-large-v3",
    error_message: "Model crashed",
  };
  const uploadedJobs = [];
  const audioItems = [failedAudio];
  let speakers = [
    {
      id: "speaker-1",
      speaker_key: "SPEAKER_00",
      display_name: "SPEAKER_00",
      sample_start: 0,
      sample_end: 5,
    },
  ];
  let sentences = [
    {
      id: "sentence-1",
      speaker_id: "speaker-1",
      speaker_display_name: "SPEAKER_00",
      start_time: 1,
      end_time: 3,
      current_text: "Hello world.",
    },
  ];

  const fetchMock = vi.fn(async (url, options = {}) => {
    const requestUrl = new URL(url, API_BASE);
    const method = options.method || "GET";
    const path = requestUrl.pathname;
    requests.push({ path, method, options });

    if (method === "GET" && path === "/api/audio") {
      return jsonResponse(audioItems);
    }

    if (method === "GET" && path === "/api/settings") {
      return jsonResponse({
        transcription_engine: "faster-whisper",
        transcription_model: "distil-large-v3",
        diarization_engine: "huggingface-pyannote",
        diarization_model: "pyannote/speaker-diarization-community-1",
        batch_size: 8,
      });
    }

    if (method === "GET" && path === "/api/models") {
      return jsonResponse([
        {
          key: "distil-large-v3",
          display_name: "Distil Large v3",
          repo_id: "Systran/faster-distil-whisper-large-v3",
          local_path: "/tmp/app_data/models/Systran--faster-distil-whisper-large-v3",
          downloaded: false,
          required_for_basic: true,
        },
      ]);
    }
    if (method === "GET" && path === "/api/model-options") {
      return jsonResponse({
        transcription_models: [{ id: "distil-large-v3", label: "Distil Large v3" }],
        diarization_models: [
          {
            id: "pyannote/speaker-diarization-community-1",
            label: "Pyannote Speaker Diarization Community-1",
            requires_token: true,
          },
        ],
        defaults: {
          transcription_engine: "faster-whisper",
          transcription_model: "distil-large-v3",
          diarization_engine: "huggingface-pyannote",
          diarization_model: "pyannote/speaker-diarization-community-1",
          device: "auto",
          compute_type: "int8",
          batch_size: 8,
        },
      });
    }

    if (method === "POST" && path === "/api/audio") {
      audioItems.unshift(uploadedAudio);
      return jsonResponse(uploadedAudio);
    }

    if (method === "GET" && path === "/api/audio/audio-uploaded/jobs") {
      return jsonResponse(uploadedJobs);
    }

    if (method === "GET" && path === "/api/audio/audio-failed/jobs") {
      return jsonResponse([failedJob]);
    }

    if (method === "POST" && path === "/api/jobs") {
      uploadedJobs.unshift(completedJob);
      uploadedAudio.latest_job_status = "completed";
      return jsonResponse(completedJob);
    }

    if (method === "POST" && path === "/api/models/prepare-basic") {
      return jsonResponse({
        profile: "basic",
        ready: true,
        models: [
          {
            key: "distil-large-v3",
            display_name: "Distil Large v3",
            repo_id: "Systran/faster-distil-whisper-large-v3",
            local_path: "/tmp/app_data/models/Systran--faster-distil-whisper-large-v3",
            downloaded: true,
            required_for_basic: true,
          },
        ],
      });
    }

    if (method === "GET" && path === "/api/jobs/job-complete/speakers") {
      return jsonResponse(speakers);
    }

    if (method === "GET" && path === "/api/jobs/job-complete/transcript") {
      return jsonResponse(sentences);
    }

    if (method === "GET" && path === "/api/jobs/job-failed/speakers") {
      return jsonResponse([]);
    }

    if (method === "GET" && path === "/api/jobs/job-failed/transcript") {
      return jsonResponse([]);
    }

    if (method === "PATCH" && path === "/api/speakers/speaker-1") {
      const body = JSON.parse(options.body);
      speakers = [{ ...speakers[0], display_name: body.display_name }];
      sentences = sentences.map((sentence) => ({
        ...sentence,
        speaker_display_name: body.display_name,
      }));
      return jsonResponse(speakers[0]);
    }

    if (method === "PATCH" && path === "/api/transcript-sentences/sentence-1") {
      const body = JSON.parse(options.body);
      sentences = [{ ...sentences[0], current_text: body.current_text }];
      return jsonResponse(sentences[0]);
    }

    if (method === "DELETE" && path === "/api/audio/audio-uploaded") {
      audioItems.splice(
        audioItems.findIndex((audio) => audio.id === "audio-uploaded"),
        1,
      );
      return new Response(null, { status: 204 });
    }

    if (method === "DELETE" && path === "/api/jobs/job-complete") {
      uploadedJobs.splice(
        uploadedJobs.findIndex((job) => job.id === "job-complete"),
        1,
      );
      uploadedAudio.latest_job_status = "uploaded";
      speakers = [];
      sentences = [];
      return new Response(null, { status: 204 });
    }

    return jsonResponse({ detail: `Unhandled ${method} ${path}` }, 500);
  });

  return { fetchMock, requests };
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

test("drives the MVP upload, process, review, edit, export, failed job, and delete workflow", async () => {
  const { fetchMock, requests } = createApiMock();
  vi.stubGlobal("fetch", fetchMock);
  const play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => {});
  const pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

  render(<App />);

  expect(await screen.findByText("Broken clip")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
  expect(screen.getByDisplayValue("distil-large-v3")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /close settings/i }));

  const file = new File(["demo audio"], "meeting.wav", { type: "audio/wav" });
  fireEvent.change(screen.getByLabelText("Audio file"), { target: { files: [file] } });
  fireEvent.change(screen.getByPlaceholderText("Optional display title"), {
    target: { value: "Demo upload" },
  });
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));

  await screen.findByDisplayValue("Demo upload");
  const uploadRequest = requests.find((request) => request.method === "POST" && request.path === "/api/audio");
  expect(uploadRequest.options.body.get("file").name).toBe("meeting.wav");
  expect(uploadRequest.options.body.get("display_title")).toBe("Demo upload");

  fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
  fireEvent.change(screen.getByLabelText("Diarization/HF token"), {
    target: { value: "  hf-secret  " },
  });
  fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
  fireEvent.click(screen.getByRole("button", { name: /^process$/i }));

  await screen.findByText("Processing complete.");
  const modelRequest = requests.find(
    (request) => request.method === "POST" && request.path === "/api/models/prepare-basic",
  );
  expect(JSON.parse(modelRequest.options.body)).toEqual({
    profile: "basic",
    transcription_model: "distil-large-v3",
    hf_token: "hf-secret",
  });
  const jobRequest = requests.find((request) => request.method === "POST" && request.path === "/api/jobs");
  expect(JSON.parse(jobRequest.options.body)).toMatchObject({
    audio_file_id: "audio-uploaded",
    transcription_engine: "faster-whisper",
    transcription_model: "distil-large-v3",
    diarization_engine: "huggingface-pyannote",
    diarization_model: "pyannote/speaker-diarization-community-1",
    settings: { diarization_token: "hf-secret" },
  });
  expect(screen.getByText(/Local model ready/)).not.toBeNull();

  expect(await screen.findByText("Hello world.")).not.toBeNull();
  expect(screen.getByRole("button", { name: /export vtt/i }).dataset.exportUrl).toBe(
    `${API_BASE}/api/jobs/job-complete/export.vtt`,
  );
  const player = document.querySelector("audio");
  fireEvent.click(screen.getByRole("button", { name: /play sample for speaker_00/i }));
  expect(player.currentTime).toBe(0);
  expect(play).toHaveBeenCalledTimes(1);
  player.currentTime = 5;
  fireEvent.timeUpdate(player);
  expect(pause).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: /play sentence sentence-1/i }));
  expect(player.currentTime).toBe(1);
  expect(play).toHaveBeenCalledTimes(2);
  player.currentTime = 3;
  fireEvent.timeUpdate(player);
  expect(pause).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: /edit display name for speaker_00/i }));
  const speakerNameInput = screen.getByRole("textbox", { name: /display name for speaker_00/i });
  speakerNameInput.textContent = "Alice";
  fireEvent.blur(speakerNameInput);

  await waitFor(() => expect(screen.getAllByText("Alice").length).toBeGreaterThan(0));
  const speakerPatch = requests.find((request) => request.method === "PATCH" && request.path === "/api/speakers/speaker-1");
  expect(JSON.parse(speakerPatch.options.body)).toEqual({ display_name: "Alice" });

  fireEvent.click(screen.getByRole("button", { name: /edit sentence sentence-1/i }));
  const sentenceText = screen.getByRole("textbox", { name: /transcript sentence sentence-1/i });
  sentenceText.textContent = "Hello edited.";
  fireEvent.blur(sentenceText);

  await waitFor(() => {
    const sentencePatch = requests.find(
      (request) => request.method === "PATCH" && request.path === "/api/transcript-sentences/sentence-1",
    );
    expect(JSON.parse(sentencePatch.options.body)).toEqual({ current_text: "Hello edited." });
  });

  fireEvent.click(screen.getByRole("button", { name: /speaker turns/i }));
  await screen.findByRole("button", { name: /edit sentence sentence-1/i });
  fireEvent.click(screen.getByRole("button", { name: /edit sentence sentence-1/i }));
  const turnSentenceText = screen.getByRole("textbox", { name: /transcript sentence sentence-1/i });
  turnSentenceText.textContent = "Hello turn edit.";
  fireEvent.blur(turnSentenceText);

  await waitFor(() => {
    const sentencePatches = requests.filter(
      (request) => request.method === "PATCH" && request.path === "/api/transcript-sentences/sentence-1",
    );
    expect(JSON.parse(sentencePatches.at(-1).options.body)).toEqual({ current_text: "Hello turn edit." });
  });

  const failedRow = screen.getByRole("button", { name: /^broken clip$/i });
  fireEvent.click(failedRow);
  const failedJobButton = await screen.findByRole("button", { name: /run 1 .* distil-large-v3/i });
  fireEvent.click(failedJobButton);
  await waitFor(() => {
    const openedFailedTranscript = requests.find(
      (request) => request.method === "GET" && request.path === "/api/jobs/job-failed/transcript",
    );
    expect(openedFailedTranscript).toBeDefined();
  });

  fireEvent.click(screen.getByRole("button", { name: /^demo upload$/i }));
  await screen.findByRole("button", { name: /^demo upload$/i });
  fireEvent.click(screen.getByRole("button", { name: /delete transcript/i }));
  await waitFor(() => {
    expect(screen.queryByText("Hello turn edit.")).toBeNull();
  });
  expect(await screen.findByRole("button", { name: /delete audio/i })).not.toBeNull();
  expect(screen.getAllByText("Demo upload").length).toBeGreaterThan(0);
});
