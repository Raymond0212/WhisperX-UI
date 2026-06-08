import React from "react";
import { createDeviceService, formatBytes, normalizeImportFilename } from "./device-service.js";

export function useHiDockManager() {
  const service = React.useMemo(() => createDeviceService(), []);
  const capability = service.getCapability();
  const [connected, setConnected] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [selectedFilename, setSelectedFilename] = React.useState(null);
  const [status, setStatus] = React.useState("Ready");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ current: "-", aggregate: "-" });

  const selectedFile = React.useMemo(
    () => files.find((file) => file.filename === selectedFilename) ?? null,
    [files, selectedFilename],
  );

  async function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out")), ms);
      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  const refreshAfterSuccess = React.useCallback(async () => {
    const [infoResult, countResult, listResult, timeResult, settingsResult] = await Promise.allSettled([
      withTimeout(service.getDeviceInfo(), 5000),
      withTimeout(service.getFileCount(), 5000),
      withTimeout(service.listFiles(), 12000),
      withTimeout(service.getDeviceTime(), 5000),
      withTimeout(service.getSettings(), 5000),
    ]);

    const nextFiles = listResult.status === "fulfilled" ? listResult.value : null;
    if (nextFiles) {
      setFiles(nextFiles);
      setSelectedFilename((current) => (nextFiles.some((file) => file.filename === current) ? current : null));
    }
    setDetails(JSON.stringify({
      device: infoResult.status === "fulfilled" ? infoResult.value : null,
      fileCount: countResult.status === "fulfilled" ? countResult.value : null,
      deviceTime: timeResult.status === "fulfilled" ? timeResult.value : null,
      settings: settingsResult.status === "fulfilled" ? settingsResult.value : null,
    }, null, 2));
  }, [service]);

  const run = React.useCallback(async (label, fn) => {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
    } catch (error) {
      setStatus(error?.message ?? String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const selectFile = React.useCallback((filename, checked = true) => {
    if (!checked) {
      setSelectedFilename(null);
      return;
    }
    setSelectedFilename(filename);
  }, []);

  const connect = React.useCallback(async () => {
    await run("Connecting to device...", async () => {
      const info = await service.connect();
      setConnected(true);
      setStatus(`Connected${info.model ? ` (${info.model})` : ""}`);
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, service]);

  const disconnect = React.useCallback(async () => {
    await run("Disconnecting...", async () => {
      await service.disconnect();
      setConnected(false);
      setFiles([]);
      setSelectedFilename(null);
      setProgress({ current: "-", aggregate: "-" });
      setDetails("");
      setStatus("Disconnected");
    });
  }, [run, service]);

  const listFiles = React.useCallback(async () => {
    await run("Loading file list...", async () => {
      const list = await service.listFiles((partial) => {
        setFiles(partial);
        setSelectedFilename((current) => (partial.some((file) => file.filename === current) ? current : null));
        setStatus(`Streaming file list... ${partial.length} parsed`);
      });
      setFiles(list);
      setSelectedFilename((current) => (list.some((file) => file.filename === current) ? current : null));
      setStatus(`Loaded ${list.length} files`);
      setDetails(JSON.stringify({ files: list.length }, null, 2));
    });
  }, [run, service]);

  const downloadSelected = React.useCallback(async () => {
    if (!selectedFile) {
      setStatus("Select one HiDock file first.");
      return;
    }
    await run("Downloading selected file...", async () => {
      const report = await service.downloadFiles([selectedFile], "", (nextProgress) => {
        setProgress({
          current: `${nextProgress.filename}: ${formatBytes(nextProgress.done)} / ${formatBytes(nextProgress.total)}`,
          aggregate: `${formatBytes(nextProgress.aggregateDone)} / ${formatBytes(nextProgress.aggregateTotal)}`,
        });
      });
      await refreshAfterSuccess();
      setStatus(report.files[0]?.status === "success" ? `Downloaded ${selectedFile.filename}` : "Download failed");
      setDetails(JSON.stringify(report, null, 2));
    });
  }, [refreshAfterSuccess, run, selectedFile, service]);

  const importSelectedFile = React.useCallback(async () => {
    if (!selectedFile) {
      setStatus("Select one HiDock file first.");
      return null;
    }

    let importedFile = null;
    await run("Preparing file for WhisperX import...", async () => {
      const result = await service.readFileBlob(selectedFile, (nextProgress) => {
        setProgress({
          current: `${nextProgress.filename}: ${formatBytes(nextProgress.done)} / ${formatBytes(nextProgress.total)}`,
          aggregate: `${formatBytes(nextProgress.aggregateDone)} / ${formatBytes(nextProgress.aggregateTotal)}`,
        });
      });
      const filename = normalizeImportFilename(selectedFile.filename);
      importedFile = new File([result.blob], filename, {
        type: /\.wav$/i.test(filename) ? "audio/wav" : result.blob.type || "application/octet-stream",
        lastModified: Date.now(),
      });
      setStatus(`Prepared ${filename} for import`);
      setDetails(JSON.stringify({
        source: selectedFile.filename,
        importFilename: filename,
        bytesRead: result.bytesRead,
      }, null, 2));
    });
    return importedFile;
  }, [run, selectedFile, service]);

  function promptNumber(label, fallback) {
    const raw = window.prompt(label, String(fallback));
    if (raw == null) return null;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a positive number.");
      return null;
    }
    return value;
  }

  function promptBluetoothMac() {
    const value = window.prompt("Bluetooth MAC address (AA-BB-CC-DD-EE-FF)", "");
    return value?.trim() || null;
  }

  function confirmAction(title, description) {
    return window.confirm(`${title}\n\n${description}`);
  }

  const runAndSetDetails = React.useCallback(async (label, getter) => {
    await run(label, async () => {
      setDetails(JSON.stringify(await getter(), null, 2));
    });
  }, [run]);

  const deleteSelected = React.useCallback(async () => {
    if (!selectedFile) {
      setStatus("Select one HiDock file to delete.");
      return;
    }
    if (!confirmAction("Delete selected recording?", `This will permanently delete "${selectedFile.filename}" from the connected HiDock device.`)) return;
    await run("Deleting file...", async () => {
      setDetails(JSON.stringify(await service.deleteFile(selectedFile.filename), null, 2));
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, selectedFile, service]);

  const formatCard = React.useCallback(async () => {
    if (!confirmAction("Format storage card?", "This will erase every recording on the connected HiDock storage card. This action cannot be undone.")) return;
    await run("Formatting card...", async () => {
      setDetails(JSON.stringify(await service.formatCard(true), null, 2));
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, service]);

  const setTimeNow = React.useCallback(async () => {
    if (!confirmAction("Set device time?", "This will update the connected HiDock device clock to the current computer time.")) return;
    await run("Setting device time to now...", async () => {
      setDetails(JSON.stringify(await service.setDeviceTime(new Date()), null, 2));
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, service]);

  const toggleAutoRecord = React.useCallback(async () => {
    if (!confirmAction("Toggle AutoRecord?", "This will change the connected HiDock auto-recording setting.")) return;
    await run("Toggling autoRecord setting...", async () => {
      const current = await service.getSettings();
      setDetails(JSON.stringify(await service.setSettings({ autoRecord: !current.autoRecord }), null, 2));
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, service]);

  const toggleNotification = React.useCallback(async () => {
    if (!confirmAction("Toggle notification?", "This will change the device notification popup or sound setting.")) return;
    await run("Toggling notification...", async () => {
      const current = await service.getSettings();
      setDetails(JSON.stringify(await service.setNotification(!current.notificationSound), null, 2));
      await refreshAfterSuccess();
    });
  }, [refreshAfterSuccess, run, service]);

  const startBluetoothScan = React.useCallback(async () => {
    if (!confirmAction("Start Bluetooth scan?", "This asks the HiDock device to scan nearby Bluetooth devices and may temporarily change Bluetooth state.")) return;
    const count = promptNumber("Bluetooth scan count", 10);
    if (count == null) return;
    await runAndSetDetails("Starting Bluetooth scan...", () => service.startBluetoothScan(count));
  }, [runAndSetDetails, service]);

  const stopBluetoothScan = React.useCallback(async () => {
    if (!confirmAction("Stop Bluetooth scan?", "This stops the current device Bluetooth scan.")) return;
    await runAndSetDetails("Stopping Bluetooth scan...", () => service.stopBluetoothScan());
  }, [runAndSetDetails, service]);

  const clearPairedBluetoothDevices = React.useCallback(async () => {
    if (!confirmAction("Clear paired Bluetooth devices?", "This removes saved Bluetooth pairings from the connected HiDock device.")) return;
    await runAndSetDetails("Clearing paired Bluetooth devices...", () => service.clearPairedBluetoothDevices());
  }, [runAndSetDetails, service]);

  const disconnectBluetoothDevice = React.useCallback(async () => {
    if (!confirmAction("Disconnect Bluetooth device?", "This disconnects the currently connected Bluetooth audio device.")) return;
    await runAndSetDetails("Disconnecting Bluetooth device...", () => service.disconnectBluetoothDevice());
  }, [runAndSetDetails, service]);

  const connectBluetoothDevice = React.useCallback(async () => {
    if (!confirmAction("Connect Bluetooth device?", "This asks HiDock to connect to the entered Bluetooth MAC address.")) return;
    const mac = promptBluetoothMac();
    if (!mac) return;
    await runAndSetDetails("Connecting Bluetooth device...", () => service.connectBluetoothDevice(mac));
  }, [runAndSetDetails, service]);

  const reconnectBluetoothDevice = React.useCallback(async () => {
    if (!confirmAction("Reconnect Bluetooth device?", "This asks HiDock to reconnect to the entered Bluetooth MAC address.")) return;
    const mac = promptBluetoothMac();
    if (!mac) return;
    await runAndSetDetails("Reconnecting Bluetooth device...", () => service.reconnectBluetoothDevice(mac));
  }, [runAndSetDetails, service]);

  const setWebUsbTimeout = React.useCallback(async () => {
    if (!confirmAction("Set WebUSB timeout?", "This writes a new device-side WebUSB timeout value.")) return;
    const timeout = promptNumber("WebUSB timeout in milliseconds", 10000);
    if (timeout == null) return;
    await runAndSetDetails("Setting WebUSB timeout...", () => service.setWebUsbTimeout(timeout));
  }, [runAndSetDetails, service]);

  const switchRecordingQuality = React.useCallback(async () => {
    if (!confirmAction("Switch recording quality?", "This changes the recording quality used by the connected HiDock device.")) return;
    await run("Switching recording quality...", async () => {
      const current = await service.getRecordingQuality();
      const next = current.quality === "normal" ? "high" : "normal";
      setDetails(JSON.stringify(await service.setRecordingQuality(next), null, 2));
    });
  }, [run, service]);

  const switchAudioInputDevice = React.useCallback(async () => {
    if (!confirmAction("Switch audio input?", "This changes the device recording input between Bluetooth mic and built-in mic.")) return;
    await run("Switching audio input...", async () => {
      const current = await service.getAudioInputDevice();
      const next = current.device === "bt-mic" ? "mic" : "bt-mic";
      setDetails(JSON.stringify(await service.setAudioInputDevice(next), null, 2));
    });
  }, [run, service]);

  const startRealtime = React.useCallback(async () => {
    if (!confirmAction("Start realtime audio?", "This puts the device into live audio mode until stopped.")) return;
    await runAndSetDetails("Starting realtime audio...", () => service.startRealtime(2));
  }, [runAndSetDetails, service]);

  const stopRealtime = React.useCallback(async () => {
    if (!confirmAction("Stop realtime audio?", "This exits live audio mode on the device.")) return;
    await runAndSetDetails("Stopping realtime audio...", () => service.stopRealtime());
  }, [runAndSetDetails, service]);

  const enterMassStorageMode = React.useCallback(async () => {
    if (!confirmAction("Enter mass storage mode?", "This can interrupt the WebUSB session and expose the device as USB storage.")) return;
    await runAndSetDetails("Entering mass storage mode...", () => service.enterMassStorageMode());
  }, [runAndSetDetails, service]);

  const sendKeyCode = React.useCallback(async (label, key, action) => {
    if (!confirmAction(`Send ${label}?`, "This sends a physical-button command to the device.")) return;
    await runAndSetDetails(`Sending ${label}...`, () => service.sendKeyCode(key, action));
  }, [runAndSetDetails, service]);

  return {
    busy,
    capability,
    connected,
    details,
    files,
    progress,
    selectedFile,
    selectedFilename,
    status,
    actions: {
      connect,
      disconnect,
      listFiles,
      selectFile,
      downloadSelected,
      importSelectedFile,
      deleteSelected,
      formatCard,
      getDeviceInfo: () => runAndSetDetails("Reading device info...", () => service.getDeviceInfo()),
      getFileCount: () => runAndSetDetails("Reading file count...", async () => ({ count: await service.getFileCount() })),
      getRecordingFile: () => runAndSetDetails("Reading recording file...", () => service.getRecordingFile()),
      getCardInfo: () => runAndSetDetails("Reading card info...", () => service.getCardInfo()),
      getBatteryStatus: () => runAndSetDetails("Reading battery...", () => service.getBatteryStatus()),
      getDeviceTime: () => runAndSetDetails("Reading device time...", () => service.getDeviceTime()),
      setTimeNow,
      getSettings: () => runAndSetDetails("Reading settings...", () => service.getSettings()),
      toggleAutoRecord,
      toggleNotification,
      getBluetoothStatus: () => runAndSetDetails("Reading Bluetooth status...", () => service.getBluetoothStatus()),
      startBluetoothScan,
      stopBluetoothScan,
      getBluetoothScanResults: () => runAndSetDetails("Reading Bluetooth scan results...", () => service.getBluetoothScanResults()),
      getPairedBluetoothDevices: () => runAndSetDetails("Reading paired Bluetooth devices...", () => service.getPairedBluetoothDevices()),
      clearPairedBluetoothDevices,
      disconnectBluetoothDevice,
      connectBluetoothDevice,
      reconnectBluetoothDevice,
      getWebUsbTimeout: () => runAndSetDetails("Reading WebUSB timeout...", () => service.getWebUsbTimeout()),
      setWebUsbTimeout,
      getRecordingStatus: () => runAndSetDetails("Reading recording status...", () => service.getRecordingStatus()),
      getRecordingQuality: () => runAndSetDetails("Reading recording quality...", () => service.getRecordingQuality()),
      switchRecordingQuality,
      getAudioInputDevice: () => runAndSetDetails("Reading audio input...", () => service.getAudioInputDevice()),
      switchAudioInputDevice,
      startRealtime,
      stopRealtime,
      getRealtime: () => runAndSetDetails("Reading realtime status...", () => service.getRealtime()),
      enterMassStorageMode,
      sendMuteKey: () => sendKeyCode("Mute Key", 0x01, 0x01),
      sendRecordKey: () => sendKeyCode("Record Key", 0x02, 0x02),
      sendPlaybackKey: () => sendKeyCode("Playback Key", 0x03, 0x03),
    },
  };
}
