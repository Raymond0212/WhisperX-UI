// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

let currentService;

vi.mock("./features/hidock/device-service.js", () => ({
  createDeviceService: () => currentService,
  formatBytes: (value) => `${value} B`,
  normalizeImportFilename: (filename) => filename.replace(/\.hda$/i, ".wav"),
}));

import { App } from "./main.jsx";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createApiMock() {
  const requests = [];
  const importedAudio = {
    id: "audio-hidock-import",
    display_title: "meeting-room",
    latest_job_status: "uploaded",
  };
  const audioItems = [];

  const fetchMock = vi.fn(async (url, options = {}) => {
    const requestUrl = new URL(url, "http://127.0.0.1:8000");
    const method = options.method || "GET";
    requests.push({ method, path: requestUrl.pathname, options });

    if (method === "GET" && requestUrl.pathname === "/api/audio") return jsonResponse(audioItems);
    if (method === "GET" && requestUrl.pathname === "/api/settings") return jsonResponse({});
    if (method === "GET" && requestUrl.pathname === "/api/models") return jsonResponse([]);
    if (method === "GET" && requestUrl.pathname === "/api/model-options") {
      return jsonResponse({ transcription_models: [], diarization_models: [], defaults: {} });
    }
    if (method === "GET" && requestUrl.pathname === "/api/health") return jsonResponse({ ok: true });
    if (method === "POST" && requestUrl.pathname === "/api/audio") {
      audioItems.unshift(importedAudio);
      return jsonResponse(importedAudio);
    }
    if (method === "GET" && requestUrl.pathname === "/api/audio/audio-hidock-import/jobs") return jsonResponse([]);

    return jsonResponse({ detail: `Unhandled ${method} ${requestUrl.pathname}` }, 500);
  });

  return { fetchMock, requests };
}

function createFakeService({ canUsbOperate = true, files = [] } = {}) {
  let connected = false;

  return {
    getCapability: () => ({
      canUsbOperate,
      canPickFolder: false,
      runtime: "browser",
      transport: canUsbOperate ? "webusb" : "ui-only",
      reason: canUsbOperate ? undefined : "WebUSB is unavailable in this browser runtime. Use Chrome or Edge desktop over localhost or HTTPS.",
    }),
    connect: vi.fn(async () => {
      connected = true;
      return { connected: true, model: "hidock-h1" };
    }),
    disconnect: vi.fn(async () => {
      connected = false;
    }),
    getDeviceInfo: vi.fn(async () => ({ connected, model: "hidock-h1" })),
    getFileCount: vi.fn(async () => files.length),
    listFiles: vi.fn(async (onPartial) => {
      onPartial?.(files);
      return files;
    }),
    readFileBlob: vi.fn(async (file, onProgress) => {
      const blob = new Blob(["fake wav bytes"], { type: "audio/wav" });
      onProgress?.({ filename: file.filename, done: blob.size, total: blob.size, aggregateDone: blob.size, aggregateTotal: blob.size });
      return { blob, bytesRead: blob.size, filename: file.filename };
    }),
    downloadFiles: vi.fn(async () => ({ files: [], totalBytesWritten: 0 })),
    deleteFile: vi.fn(async () => ({ result: "success" })),
    getCardInfo: vi.fn(async () => ({ free: 1, used: 1, capacity: 2 })),
    formatCard: vi.fn(async () => ({ result: "success" })),
    getRecordingFile: vi.fn(async () => ({ name: "meeting-room.hda", status: "recording_active_or_last" })),
    getBatteryStatus: vi.fn(async () => ({ status: "idle", battery: 88, voltage: 0 })),
    getDeviceTime: vi.fn(async () => ({ time: "2026-06-08 09:00:00" })),
    setDeviceTime: vi.fn(async () => ({ result: "success" })),
    getSettings: vi.fn(async () => ({ autoRecord: false, autoPlay: false, notificationSound: true, bluetoothTone: true })),
    setSettings: vi.fn(async () => ({ result: "success" })),
    setNotification: vi.fn(async () => ({ result: "success" })),
    beginBncDemo: vi.fn(async () => ({ result: "success" })),
    endBncDemo: vi.fn(async () => ({ result: "success" })),
    startBluetoothScan: vi.fn(async () => ({ result: "success" })),
    stopBluetoothScan: vi.fn(async () => ({ result: "success" })),
    getBluetoothScanResults: vi.fn(async () => []),
    getPairedBluetoothDevices: vi.fn(async () => []),
    clearPairedBluetoothDevices: vi.fn(async () => ({ result: "success" })),
    getBluetoothStatus: vi.fn(async () => null),
    disconnectBluetoothDevice: vi.fn(async () => ({ result: "success" })),
    connectBluetoothDevice: vi.fn(async () => ({ result: "success" })),
    reconnectBluetoothDevice: vi.fn(async () => ({ result: "success" })),
    getWebUsbTimeout: vi.fn(async () => ({ timeout: 10000 })),
    setWebUsbTimeout: vi.fn(async () => ({ result: "success" })),
    sendKeyCode: vi.fn(async () => ({ result: "success" })),
    enterMassStorageMode: vi.fn(async () => ({ result: "success" })),
    getRecordingStatus: vi.fn(async () => ({ recording: null, duration: 0, samples: [], type: null })),
    getRecordingQuality: vi.fn(async () => ({ quality: "normal" })),
    setRecordingQuality: vi.fn(async () => ({ result: "success" })),
    getAudioInputDevice: vi.fn(async () => ({ device: "mic" })),
    setAudioInputDevice: vi.fn(async () => ({ result: "success" })),
    startRealtime: vi.fn(async () => ({ result: "success" })),
    stopRealtime: vi.fn(async () => ({ result: "success" })),
    getRealtime: vi.fn(async () => ({ rest: 0, muted: false, dataLength: 0 })),
  };
}

beforeEach(() => {
  cleanup();
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })));
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  });
  currentService = createFakeService({
    canUsbOperate: true,
    files: [
      {
        filename: "meeting-room.hda",
        fileLength: 8192,
        createdAtRaw: "2026-06-08 08:30:00",
        durationSec: 120,
        durationLabel: "02:00",
      },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

test("switches to HiDock, imports a selected device file, and reuses the upload modal", async () => {
  const { fetchMock, requests } = createApiMock();
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /hidock/i }));
  expect(await screen.findByText("HiDock Manager")).not.toBeNull();

  fireEvent.click(screen.getAllByRole("button", { name: /^connect$/i })[0]);
  await waitFor(() => expect(currentService.connect).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
  await waitFor(() => expect(currentService.listFiles).toHaveBeenCalled());

  fireEvent.click(screen.getByLabelText("Select meeting-room.hda"));
  expect(screen.getByLabelText("Select meeting-room.hda").checked).toBe(true);
  expect(screen.getByRole("button", { name: /import selected/i }).disabled).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: /import selected/i }));

  expect(await screen.findByText("Review upload")).not.toBeNull();
  expect(screen.getByText("meeting-room.wav")).not.toBeNull();
  expect(screen.getByDisplayValue("meeting-room")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

  await waitFor(() => {
    const request = requests.find((entry) => entry.method === "POST" && entry.path === "/api/audio");
    expect(request).toBeTruthy();
    expect(request.options.body.get("file").name).toBe("meeting-room.wav");
    expect(request.options.body.get("display_title")).toBe("meeting-room");
  });
  expect(await screen.findByText("Upload saved locally.")).not.toBeNull();
});

test("shows capability warning and disables connect when WebUSB is unavailable", async () => {
  const { fetchMock } = createApiMock();
  vi.stubGlobal("fetch", fetchMock);
  currentService = createFakeService({ canUsbOperate: false, files: [] });

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /hidock/i }));

  expect(await screen.findByText("WebUSB unavailable")).not.toBeNull();
  expect(screen.getByText(/Use Chrome or Edge desktop/)).not.toBeNull();
  screen.getAllByRole("button", { name: /^connect$/i }).forEach((button) => {
    expect(button.disabled).toBe(true);
  });
});
