import React from "react";
import {
  AlertTriangle,
  Battery,
  Bluetooth,
  Clock3,
  Download,
  HardDrive,
  Import,
  Info,
  Mic,
  PlayCircle,
  Radio,
  RefreshCw,
  Settings2,
  Trash2,
  Usb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ACTION_GROUPS = [
  {
    title: "Session",
    actions: [
      { label: "Connect", key: "connect", icon: Usb, variant: "default", requiresUsb: true },
      { label: "Disconnect", key: "disconnect", variant: "outline", requiresConnection: true },
      { label: "List Files", key: "listFiles", icon: RefreshCw, variant: "outline", requiresConnection: true },
      { label: "Download Selected", key: "downloadSelected", icon: Download, requiresConnection: true, requiresSelection: true },
      { label: "Import to WhisperX", key: "importSelectedFile", icon: Import, requiresConnection: true, requiresSelection: true },
    ],
  },
  {
    title: "Inspect",
    actions: [
      { label: "Device Info", key: "getDeviceInfo", icon: Info, requiresConnection: true },
      { label: "File Count", key: "getFileCount", requiresConnection: true },
      { label: "Recording File", key: "getRecordingFile", requiresConnection: true },
      { label: "Card Info", key: "getCardInfo", icon: HardDrive, requiresConnection: true },
      { label: "Battery", key: "getBatteryStatus", icon: Battery, requiresConnection: true },
      { label: "Get Time", key: "getDeviceTime", icon: Clock3, requiresConnection: true },
      { label: "Set Time Now", key: "setTimeNow", icon: Clock3, requiresConnection: true },
      { label: "Get Settings", key: "getSettings", icon: Settings2, requiresConnection: true },
      { label: "Toggle AutoRecord", key: "toggleAutoRecord", icon: Settings2, requiresConnection: true },
      { label: "Toggle Notification", key: "toggleNotification", icon: Settings2, requiresConnection: true },
    ],
  },
  {
    title: "Bluetooth",
    actions: [
      { label: "Bluetooth Status", key: "getBluetoothStatus", icon: Bluetooth, requiresConnection: true },
      { label: "Start Scan", key: "startBluetoothScan", icon: Bluetooth, requiresConnection: true },
      { label: "Stop Scan", key: "stopBluetoothScan", icon: Bluetooth, requiresConnection: true },
      { label: "Scan Results", key: "getBluetoothScanResults", icon: Bluetooth, requiresConnection: true },
      { label: "Paired Devices", key: "getPairedBluetoothDevices", icon: Bluetooth, requiresConnection: true },
      { label: "Clear Paired", key: "clearPairedBluetoothDevices", icon: Trash2, requiresConnection: true },
      { label: "Disconnect BT", key: "disconnectBluetoothDevice", icon: Bluetooth, requiresConnection: true },
      { label: "Connect BT", key: "connectBluetoothDevice", icon: Bluetooth, requiresConnection: true },
      { label: "Reconnect BT", key: "reconnectBluetoothDevice", icon: Bluetooth, requiresConnection: true },
    ],
  },
  {
    title: "Recording",
    actions: [
      { label: "Get Timeout", key: "getWebUsbTimeout", requiresConnection: true },
      { label: "Set Timeout", key: "setWebUsbTimeout", requiresConnection: true },
      { label: "Recording Status", key: "getRecordingStatus", icon: Radio, requiresConnection: true },
      { label: "Get Quality", key: "getRecordingQuality", requiresConnection: true },
      { label: "Switch Quality", key: "switchRecordingQuality", requiresConnection: true },
      { label: "Get Audio Input", key: "getAudioInputDevice", icon: Mic, requiresConnection: true },
      { label: "Switch Audio Input", key: "switchAudioInputDevice", icon: Mic, requiresConnection: true },
      { label: "Start Live", key: "startRealtime", icon: PlayCircle, requiresConnection: true },
      { label: "Live Status", key: "getRealtime", icon: Radio, requiresConnection: true },
      { label: "Stop Live", key: "stopRealtime", icon: Radio, requiresConnection: true },
      { label: "Mass Storage", key: "enterMassStorageMode", icon: HardDrive, requiresConnection: true },
      { label: "Mute Key", key: "sendMuteKey", requiresConnection: true },
      { label: "Record Key", key: "sendRecordKey", requiresConnection: true },
      { label: "Playback Key", key: "sendPlaybackKey", requiresConnection: true },
      { label: "Delete One", key: "deleteSelected", icon: Trash2, requiresConnection: true, requiresSelection: true, variant: "outline" },
      { label: "Format Card", key: "formatCard", icon: Trash2, requiresConnection: true, variant: "outline" },
    ],
  },
];

export function HiDockPanel({ manager, onImportAudio }) {
  const { actions, busy, capability, connected, details, progress, selectedFile, status } = manager;

  async function handleAction(action) {
    if (action.key === "importSelectedFile") {
      const file = await actions.importSelectedFile();
      if (file) onImportAudio(file);
      return;
    }
    await actions[action.key]?.();
  }

  return (
    <section className="workspace hidock-workspace">
      <div className="workspace-shell">
        <div className="audio-header">
          <div className="title-field">
            <span className="workspace-breadcrumb">HiDock <span>/</span></span>
            <div className="hidock-title-block">
              <h1 className="title-display">HiDock Manager</h1>
              <p className="hidock-subtitle">Manage on-device recordings and import them into WhisperX.</p>
            </div>
          </div>
        </div>

        <div className="workspace-content">
          {!capability.canUsbOperate && (
            <div className="hidock-warning" role="alert">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>WebUSB unavailable</strong>
                <p>{capability.reason}</p>
              </div>
            </div>
          )}

          <div className="hidock-summary-grid" aria-label="HiDock status">
            <SummaryCard label="Connection" value={connected ? "Connected" : "Disconnected"} detail={status} />
            <SummaryCard label="Selection" value={selectedFile?.filename || "No file selected"} detail={selectedFile?.durationLabel || "Choose one file from the sidebar"} />
            <SummaryCard label="Transfer" value={progress.current} detail={progress.aggregate} />
          </div>

          <div className="hidock-action-groups">
            {ACTION_GROUPS.map((group) => (
              <Card key={group.title} className="hidock-action-card">
                <CardContent>
                  <div className="hidock-action-card__header">
                    <strong>{group.title}</strong>
                  </div>
                  <div className="hidock-action-grid">
                    {group.actions.map((action) => {
                      const Icon = action.icon;
                      const disabled = busy
                        || (action.requiresUsb && !capability.canUsbOperate)
                        || (action.requiresConnection && !connected)
                        || (action.requiresSelection && !selectedFile)
                        || (action.disabledWhenConnected && connected);
                      return (
                        <Button
                          key={action.label}
                          type="button"
                          variant={action.variant || "secondary"}
                          size="sm"
                          disabled={disabled}
                          onClick={() => {
                            void handleAction(action);
                          }}
                        >
                          {Icon ? <Icon data-icon="inline-start" /> : null}
                          <span>{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidock-detail-grid">
            <Card className="hidock-selected-card">
              <CardContent>
                <div className="hidock-selected-card__header">
                  <strong>Selected File</strong>
                </div>
                {selectedFile ? (
                  <dl className="hidock-selected-meta">
                    <div>
                      <dt>Name</dt>
                      <dd>{selectedFile.filename}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{selectedFile.createdAtRaw}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{selectedFile.durationLabel}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{selectedFile.fileLength.toLocaleString()} bytes</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="tree-empty">Select one HiDock file from the sidebar.</p>
                )}
              </CardContent>
            </Card>

            <Card className="hidock-details-card">
              <CardContent>
                <div className="hidock-selected-card__header">
                  <strong>Operation Details</strong>
                </div>
                <pre className="hidock-details-output">{details || "Run a HiDock action to inspect device details."}</pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ detail, label, value }) {
  return (
    <Card className="summary-card hidock-summary-card">
      <CardContent>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </CardContent>
    </Card>
  );
}
