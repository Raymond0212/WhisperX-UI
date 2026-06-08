const DEFAULT_VIDS = [0x10d6, 0x3887];
const KNOWN_PIDS = [0xaf0c, 0xaf0d, 0xb00d, 0xaf0e, 0xb00e, 0xaf0f, 0x0100, 0x0101, 0x0102, 0x0103, 0x2040, 0x2041];

const CMD_GET_DEVICE_INFO = 1;
const CMD_GET_DEVICE_TIME = 2;
const CMD_SET_DEVICE_TIME = 3;
const CMD_GET_FILE_LIST = 4;
const CMD_TRANSFER_FILE = 5;
const CMD_GET_FILE_COUNT = 6;
const CMD_DELETE_FILE = 7;
const CMD_BNC_DEMO = 10;
const CMD_GET_SETTINGS = 11;
const CMD_SET_SETTINGS = 12;
const CMD_GET_CARD_INFO = 16;
const CMD_FORMAT_CARD = 17;
const CMD_GET_RECORDING_FILE = 18;
const CMD_SEND_KEY_CODE = 28;
const CMD_GET_RECORDING_STATUS = 29;
const CMD_SET_RECORDING_QUALITY = 30;
const CMD_GET_RECORDING_QUALITY = 31;
const CMD_REALTIME_CONTROL = 33;
const CMD_GET_REALTIME = 34;
const CMD_BLUETOOTH_COMMAND = 4098;
const CMD_GET_BLUETOOTH_STATUS = 4099;
const CMD_GET_BATTERY_STATUS = 4100;
const CMD_START_STOP_BLUETOOTH_SCAN = 4101;
const CMD_GET_BLUETOOTH_SCAN_RESULTS = 4102;
const CMD_GET_PAIRED_BLUETOOTH_DEVICES = 4103;
const CMD_CLEAR_PAIRED_BLUETOOTH_DEVICES = 4104;
const CMD_SET_AUDIO_INPUT_DEVICE = 4105;
const CMD_GET_AUDIO_INPUT_DEVICE = 4106;
const CMD_ENTER_MASS_STORAGE_MODE = 61455;
const CMD_SET_WEBUSB_TIMEOUT = 61456;
const CMD_GET_WEBUSB_TIMEOUT = 61457;

const OUT_EP = 1;
const IN_EP = 2;
const IFACE = 0;
const ALT = 0;
const CONFIG = 1;

const UNSUPPORTED_REASON =
  "WebUSB is unavailable in this browser runtime. Use Chrome or Edge desktop over localhost or HTTPS.";

function debugLog(level, message, extra) {
  const method = console[level] || console.log;
  method.call(console, `[hidock] ${message}`, extra ?? "");
}

function formatBytes(size) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number(size) || 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return index === 0 ? `${Math.floor(value)} ${units[index]}` : `${value.toFixed(2)} ${units[index]}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function normalizeImportFilename(filename) {
  return /\.hda$/i.test(filename) ? filename.replace(/\.hda$/i, ".wav") : filename;
}

function isLikelySafariOrIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
}

function toHex(value) {
  return value == null ? undefined : `0x${value.toString(16)}`;
}

function productModel(pid) {
  if (pid === 0xaf0c || pid === 0x0100 || pid === 0x0102) return "hidock-h1";
  if (pid === 0xaf0d || pid === 0x0101 || pid === 0x0103) return "hidock-h1e";
  if (pid === 0xaf0e || pid === 0x2040) return "hidock-p1";
  if (pid === 0xaf0f || pid === 0x2041) return "hidock-p1-mini";
  if (pid === 0xb00d || pid === 0xb00e) return "hidock-h1-lite";
  return undefined;
}

function readUint32BE(bytes, offset = 0) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32BE(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function genericResult(msg) {
  if (!msg) return { result: "failed", error: "No response" };
  const code = msg.body[0] ?? 1;
  return { result: code === 0 ? "success" : "failed", code };
}

function parseBluetoothDevices(body) {
  if (body.length === 0) return [];
  const count = ((body[0] & 0xff) << 8) | (body[1] & 0xff);
  const decoder = new TextDecoder("utf-8");
  const devices = [];
  let offset = 2;

  for (let index = 0; index < count && offset < body.length; index += 1) {
    if (offset + 2 > body.length) break;
    const nameLength = ((body[offset++] & 0xff) << 8) | (body[offset++] & 0xff);
    if (offset + nameLength + 10 > body.length) break;
    const nameBytes = body.slice(offset, offset + nameLength);
    offset += nameLength;
    const mac = Array.from(body.slice(offset, offset + 6))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join("-");
    offset += 6;
    const rssi = body[offset++] & 0xff;
    const cod = ((body[offset++] & 0xff) << 16) | ((body[offset++] & 0xff) << 8) | (body[offset++] & 0xff);
    devices.push({
      name: decoder.decode(nameBytes).replace(/\0+$/g, ""),
      mac,
      rssi,
      cod,
      audio: ((cod & 0x1f00) >> 8) === 4,
    });
  }

  return devices;
}

function macToBytes(mac) {
  const parts = String(mac || "").split("-");
  if (parts.length !== 6) throw new Error("Bluetooth MAC must use AA-BB-CC-DD-EE-FF format");
  return parts.map((part) => {
    const value = Number.parseInt(part, 16);
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      throw new Error("Bluetooth MAC contains an invalid byte");
    }
    return value;
  });
}

function toBcd(value) {
  return ((Math.floor(value / 10) << 4) | (value % 10)) & 0xff;
}

function parseBcdTime(body) {
  if (body.length < 7) return "unknown";
  const digits = Array.from(body.slice(0, 7))
    .map((byte) => `${(byte >> 4) & 0x0f}${byte & 0x0f}`)
    .join("");
  if (digits === "00000000000000") return "unknown";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateHiDockDurationSec(fileLength, version, filename) {
  if (fileLength <= 0) return 0;
  if (version === 1) return Math.floor(fileLength / 16);
  if (version === 2) return Math.floor(Math.max(0, fileLength - 44) / 96);
  if (version === 3) return Math.floor(Math.max(0, fileLength - 44) / 192);
  if (version === 5) return Math.floor(fileLength / 12);
  if (version === 6) return Math.floor(fileLength / 16);
  if (version === 7) return Math.floor(fileLength / 10);
  if (/^\d{14}REC\d+\.wav$/i.test(filename)) return Math.floor(fileLength / 32);
  if (/^(\d{2})?(\d{2})(\w{3})(\d{2})-\d{6}-.*\.(hda|wav)$/i.test(filename)) return Math.floor(fileLength / 8);
  return 0;
}

function monthNumber(month) {
  const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    String(month || "").toLowerCase(),
  );
  return index === -1 ? null : String(index + 1).padStart(2, "0");
}

function parseHiDockFilenameDate(name) {
  if (/^\d{14}/.test(name)) {
    const value = name.slice(0, 14);
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }

  const match = name.match(/^(\d{2})?(\d{2})([A-Za-z]{3})(\d{2})-(\d{2})(\d{2})(\d{2})-.*\.(hda|wav)$/);
  if (!match) return "-";
  const month = monthNumber(match[3]);
  if (!month) return "-";
  return `20${match[2]}-${month}-${match[4]} ${match[5]}:${match[6]}:${match[7]}`;
}

class BrowserDeviceService {
  fail() {
    throw new Error(UNSUPPORTED_REASON);
  }

  getCapability() {
    return {
      canUsbOperate: false,
      canPickFolder: typeof window !== "undefined" && typeof window.showDirectoryPicker === "function",
      runtime: "browser",
      transport: "ui-only",
      reason: isLikelySafariOrIOS()
        ? "Safari and iOS do not support WebUSB. Use Chrome or Edge desktop."
        : UNSUPPORTED_REASON,
    };
  }

  async connect() { return this.fail(); }
  async disconnect() {}
  async getDeviceInfo() { return this.fail(); }
  async getFileCount() { return this.fail(); }
  async listFiles() { return this.fail(); }
  async readFileBlob() { return this.fail(); }
  async downloadFiles() { return this.fail(); }
  async deleteFile() { return this.fail(); }
  async getCardInfo() { return this.fail(); }
  async formatCard() { return this.fail(); }
  async getRecordingFile() { return this.fail(); }
  async getBatteryStatus() { return this.fail(); }
  async getDeviceTime() { return this.fail(); }
  async setDeviceTime() { return this.fail(); }
  async getSettings() { return this.fail(); }
  async setSettings() { return this.fail(); }
  async setNotification() { return this.fail(); }
  async beginBncDemo() { return this.fail(); }
  async endBncDemo() { return this.fail(); }
  async startBluetoothScan() { return this.fail(); }
  async stopBluetoothScan() { return this.fail(); }
  async getBluetoothScanResults() { return this.fail(); }
  async getPairedBluetoothDevices() { return this.fail(); }
  async clearPairedBluetoothDevices() { return this.fail(); }
  async getBluetoothStatus() { return this.fail(); }
  async disconnectBluetoothDevice() { return this.fail(); }
  async connectBluetoothDevice() { return this.fail(); }
  async reconnectBluetoothDevice() { return this.fail(); }
  async getWebUsbTimeout() { return this.fail(); }
  async setWebUsbTimeout() { return this.fail(); }
  async sendKeyCode() { return this.fail(); }
  async enterMassStorageMode() { return this.fail(); }
  async getRecordingStatus() { return this.fail(); }
  async getRecordingQuality() { return this.fail(); }
  async setRecordingQuality() { return this.fail(); }
  async getAudioInputDevice() { return this.fail(); }
  async setAudioInputDevice() { return this.fail(); }
  async startRealtime() { return this.fail(); }
  async stopRealtime() { return this.fail(); }
  async getRealtime() { return this.fail(); }
}

class WebUsbDeviceService {
  constructor() {
    this.device = null;
    this.seq = Date.now() >>> 0;
    this.pending = new Map();
    this.pendingByCmd = new Map();
    this.queuedByCmd = new Map();
    this.rxBuf = new Uint8Array(0);
    this.readLoopRunning = false;
    this.cachedDeviceInfo = null;
  }

  getCapability() {
    const hasUsb = typeof navigator !== "undefined" && Boolean(navigator.usb);
    return {
      canUsbOperate: hasUsb,
      canPickFolder: typeof window !== "undefined" && typeof window.showDirectoryPicker === "function",
      runtime: "browser",
      transport: hasUsb ? "webusb" : "ui-only",
      reason: hasUsb ? undefined : "WebUSB is unavailable. Use Chrome or Edge desktop with localhost or HTTPS.",
    };
  }

  nextSeq() {
    this.seq = (this.seq + 1) >>> 0;
    return this.seq;
  }

  makeFrame(cmd, seq, body = new Uint8Array()) {
    const length = body.length;
    const out = new Uint8Array(12 + length);
    let index = 0;
    out[index++] = 0x12;
    out[index++] = 0x34;
    out[index++] = (cmd >> 8) & 0xff;
    out[index++] = cmd & 0xff;
    out[index++] = (seq >>> 24) & 0xff;
    out[index++] = (seq >>> 16) & 0xff;
    out[index++] = (seq >>> 8) & 0xff;
    out[index++] = seq & 0xff;
    out[index++] = (length >>> 24) & 0xff;
    out[index++] = (length >>> 16) & 0xff;
    out[index++] = (length >>> 8) & 0xff;
    out[index++] = length & 0xff;
    out.set(body, index);
    return out;
  }

  concat(left, right) {
    const out = new Uint8Array(left.length + right.length);
    out.set(left, 0);
    out.set(right, left.length);
    return out;
  }

  parseFramesFromBuffer(buffer) {
    const messages = [];
    let offset = 0;
    while (offset + 12 <= buffer.length) {
      if (buffer[offset] !== 0x12 || buffer[offset + 1] !== 0x34) {
        offset += 1;
        continue;
      }
      const cmd = (buffer[offset + 2] << 8) | buffer[offset + 3];
      const seq = ((buffer[offset + 4] << 24) | (buffer[offset + 5] << 16) | (buffer[offset + 6] << 8) | buffer[offset + 7]) >>> 0;
      const length = ((buffer[offset + 8] << 24) | (buffer[offset + 9] << 16) | (buffer[offset + 10] << 8) | buffer[offset + 11]) >>> 0;
      const total = 12 + length;
      if (offset + total > buffer.length) break;
      messages.push({ cmd, seq, body: buffer.slice(offset + 12, offset + total) });
      offset += total;
    }
    return { messages, rest: buffer.slice(offset) };
  }

  startReadLoop() {
    if (this.readLoopRunning || !this.device) return;
    this.readLoopRunning = true;
    void (async () => {
      while (this.readLoopRunning && this.device) {
        try {
          const result = await this.device.transferIn(IN_EP, 512 * 1024);
          if (!result?.data) continue;
          const chunk = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
          this.rxBuf = this.concat(this.rxBuf, chunk);
          const { messages, rest } = this.parseFramesFromBuffer(this.rxBuf);
          this.rxBuf = rest;
          messages.forEach((message) => {
            const wait = this.pending.get(`${message.cmd}-${message.seq}`);
            if (wait) {
              clearTimeout(wait.timeout);
              this.pending.delete(`${message.cmd}-${message.seq}`);
              wait.resolve(message);
              return;
            }
            const byCommand = this.pendingByCmd.get(message.cmd);
            if (byCommand && byCommand.length > 0) {
              const commandWaiter = byCommand.shift();
              if (commandWaiter) {
                clearTimeout(commandWaiter.timeout);
                commandWaiter.resolve(message);
                if (byCommand.length === 0) this.pendingByCmd.delete(message.cmd);
                return;
              }
            }
            const queued = this.queuedByCmd.get(message.cmd) ?? [];
            queued.push(message);
            this.queuedByCmd.set(message.cmd, queued);
          });
        } catch {
          await sleep(30);
        }
      }
    })();
  }

  async sendCommand(cmd, body = new Uint8Array(), timeoutSec = 8) {
    if (!this.device) throw new Error("Device not connected");
    const seq = this.nextSeq();
    const frame = this.makeFrame(cmd, seq, body);
    const key = `${cmd}-${seq}`;
    const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        resolve(null);
      }, timeoutSec * 1000);
      this.pending.set(key, { resolve, timeout });
    });
    const result = await this.device.transferOut(OUT_EP, new Uint8Array(frame));
    if (result.status !== "ok") {
      this.pending.delete(key);
      throw new Error(`USB write failed: ${result.status}`);
    }
    return promise;
  }

  async waitForCommand(cmd, timeoutSec = 2) {
    const queued = this.queuedByCmd.get(cmd);
    if (queued?.length) {
      const message = queued.shift() ?? null;
      if (queued.length === 0) this.queuedByCmd.delete(cmd);
      return message;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const waiters = this.pendingByCmd.get(cmd) ?? [];
        const index = waiters.findIndex((waiter) => waiter.timeout === timeout);
        if (index >= 0) waiters.splice(index, 1);
        if (waiters.length === 0) this.pendingByCmd.delete(cmd);
        resolve(null);
      }, timeoutSec * 1000);

      const waiters = this.pendingByCmd.get(cmd) ?? [];
      waiters.push({ resolve, timeout });
      this.pendingByCmd.set(cmd, waiters);
    });
  }

  async connect() {
    debugLog("info", "connect requested");
    if (!navigator.usb) throw new Error("WebUSB is not supported in this browser");
    const known = await navigator.usb.getDevices();
    const existing = known.find((device) => DEFAULT_VIDS.includes(device.vendorId) && KNOWN_PIDS.includes(device.productId));
    let device;
    try {
      device = existing ?? (await navigator.usb.requestDevice({ filters: DEFAULT_VIDS.map((vendorId) => ({ vendorId })) }));
    } catch (error) {
      const message = error?.message ?? String(error);
      const lower = message.toLowerCase();
      if (lower.includes("no device selected") || lower.includes("notfounderror")) {
        throw new Error("WebUSB device picker did not return a device. Open this app in Chrome or Edge directly and try again.");
      }
      if (lower.includes("securityerror") || lower.includes("notallowederror")) {
        throw new Error("WebUSB access was blocked by browser security or permission policy. Use Chrome or Edge desktop on localhost or HTTPS.");
      }
      throw error;
    }

    if (!device.opened) await device.open();
    if (device.configuration?.configurationValue !== CONFIG) await device.selectConfiguration(CONFIG);
    await device.claimInterface(IFACE);
    await device.selectAlternateInterface(IFACE, ALT);

    this.device = device;
    this.rxBuf = new Uint8Array(0);
    this.pending.clear();
    this.startReadLoop();

    const info = await this.readDeviceInfoRaw().catch(() => ({ connected: true }));
    this.cachedDeviceInfo = {
      ...info,
      connected: true,
      vid: toHex(device.vendorId),
      pid: toHex(device.productId),
      serial: device.serialNumber ?? undefined,
    };
    return this.cachedDeviceInfo;
  }

  async disconnect() {
    this.readLoopRunning = false;
    this.pending.forEach((entry) => {
      clearTimeout(entry.timeout);
      entry.resolve(null);
    });
    this.pending.clear();
    this.pendingByCmd.forEach((entries) => {
      entries.forEach((entry) => {
        clearTimeout(entry.timeout);
        entry.resolve(null);
      });
    });
    this.pendingByCmd.clear();
    this.queuedByCmd.clear();
    if (this.device?.opened) await this.device.close();
    this.device = null;
    this.rxBuf = new Uint8Array(0);
    this.cachedDeviceInfo = null;
  }

  async readDeviceInfoRaw() {
    const response = await this.sendCommand(CMD_GET_DEVICE_INFO, new Uint8Array(), 5);
    if (!response || response.cmd !== CMD_GET_DEVICE_INFO) throw new Error("Failed to get device info");
    const versionNumber = response.body.length >= 4 ? readUint32BE(response.body, 0) : 0;
    const version = versionNumber
      ? `${(versionNumber >> 16) & 0xff}.${(versionNumber >> 8) & 0xff}.${versionNumber & 0xff}`
      : undefined;
    const serial = response.body.length > 4
      ? new TextDecoder("ascii").decode(response.body.slice(4, 20)).replace(/\0/g, "").trim()
      : this.device?.serialNumber;
    return {
      connected: true,
      model: productModel(this.device?.productId) ?? "HiDock Device",
      firmwareVersion: version,
      vid: toHex(this.device?.vendorId),
      pid: toHex(this.device?.productId),
      serial: serial || (this.device?.serialNumber ?? undefined),
    };
  }

  async getDeviceInfo() {
    if (this.cachedDeviceInfo) return this.cachedDeviceInfo;
    const fresh = await this.readDeviceInfoRaw();
    this.cachedDeviceInfo = fresh;
    return fresh;
  }

  async getFileCount() {
    const response = await this.sendCommand(CMD_GET_FILE_COUNT, new Uint8Array(), 5);
    if (!response || response.body.length < 4) return 0;
    return readUint32BE(response.body);
  }

  parseFileListPayload(bytes) {
    let offset = 0;
    let expected = -1;
    if (bytes.length >= 6 && bytes[0] === 0xff && bytes[1] === 0xff) {
      expected = ((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0;
      offset = 6;
    }
    const files = [];
    while (offset < bytes.length) {
      if (offset + 4 > bytes.length) break;
      const version = bytes[offset++];
      const nameLength = (bytes[offset++] << 16) | (bytes[offset++] << 8) | bytes[offset++];
      if (offset + nameLength > bytes.length) break;
      const nameBytes = bytes.slice(offset, offset + nameLength);
      offset += nameLength;
      const filename = new TextDecoder("ascii").decode(nameBytes).replace(/\0+$/g, "");
      if (offset + 4 + 6 + 16 > bytes.length) break;
      const fileLength = ((bytes[offset++] << 24) | (bytes[offset++] << 16) | (bytes[offset++] << 8) | bytes[offset++]) >>> 0;
      offset += 6;
      const signature = Array.from(bytes.slice(offset, offset + 16))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      offset += 16;
      const durationSec = estimateHiDockDurationSec(fileLength, version, filename);
      const modeRaw = filename.replace(/^(\w{9})-(\d{6})-(.+?)\d+\.\w+$/i, "$3").toUpperCase();
      const mode = modeRaw === "WHSP" || modeRaw === "WIP" ? "whisper" : modeRaw === "CALL" ? "call" : "room";
      files.push({
        filename,
        fileLength,
        createdAtRaw: parseHiDockFilenameDate(filename),
        durationSec,
        durationLabel: formatDuration(durationSec),
        mode,
        version,
        signature,
      });
    }
    return { files, expected };
  }

  async listFiles(onPartial) {
    const countHint = await this.getFileCount().catch(() => 0);
    let aggregate = new Uint8Array(0);
    let done = false;
    let rounds = 0;
    let lastEmitted = 0;
    let consecutiveNulls = 0;
    const startedAt = Date.now();
    while (!done && rounds < 20) {
      if (Date.now() - startedAt > 15000) break;
      rounds += 1;
      const response = await this.sendCommand(CMD_GET_FILE_LIST, new Uint8Array(), 3);
      if (!response?.body) {
        consecutiveNulls += 1;
        if (consecutiveNulls >= 2) break;
        continue;
      }
      consecutiveNulls = 0;
      if (response.body.length === 0) break;
      const merged = new Uint8Array(aggregate.length + response.body.length);
      merged.set(aggregate, 0);
      merged.set(response.body, aggregate.length);
      aggregate = merged;
      const parsed = this.parseFileListPayload(aggregate);
      if (typeof onPartial === "function" && parsed.files.length > lastEmitted) {
        onPartial(parsed.files);
        lastEmitted = parsed.files.length;
      }
      if ((parsed.expected >= 0 && parsed.files.length >= parsed.expected) || (countHint > 0 && parsed.files.length >= countHint)) {
        done = true;
      }
    }
    const finalFiles = this.parseFileListPayload(aggregate).files;
    if (finalFiles.length === 0 && countHint > 0) {
      throw new Error("Timed out while listing files from device");
    }
    return finalFiles;
  }

  async readFileBlob(file, onProgress) {
    this.queuedByCmd.delete(CMD_TRANSFER_FILE);
    const aggregateTotal = file.fileLength;
    let aggregateDone = 0;
    let offset = 0;
    const chunks = [];
    const startBody = new TextEncoder().encode(file.filename);
    const start = await this.sendCommand(CMD_TRANSFER_FILE, startBody, 12);

    if (start?.body?.length) {
      const initialChunk = new Uint8Array(start.body);
      chunks.push(initialChunk.buffer.slice(initialChunk.byteOffset, initialChunk.byteOffset + initialChunk.byteLength));
      offset += initialChunk.length;
      aggregateDone += initialChunk.length;
      onProgress?.({ filename: file.filename, done: offset, total: file.fileLength, aggregateDone, aggregateTotal });
    }

    const deadline = Date.now() + 180000;
    let consecutiveEmpty = 0;
    while (offset < file.fileLength) {
      if (Date.now() > deadline) throw new Error("Timed out while transferring file");
      const message = await this.waitForCommand(CMD_TRANSFER_FILE, 15);
      if (!message) throw new Error(this.device ? "Timed out while reading file" : "Device disconnected");
      if (!message.body?.length) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= 3) throw new Error("No data returned from device");
        await sleep(100);
        continue;
      }
      consecutiveEmpty = 0;
      const chunk = new Uint8Array(message.body);
      chunks.push(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
      offset += chunk.length;
      aggregateDone += chunk.length;
      onProgress?.({ filename: file.filename, done: offset, total: file.fileLength, aggregateDone, aggregateTotal });
    }

    if (offset === 0) throw new Error("No data returned from device");
    const blob = new Blob(chunks, { type: /\.wav$/i.test(file.filename) || /\.hda$/i.test(file.filename) ? "audio/wav" : "application/octet-stream" });
    if (offset < file.fileLength) throw new Error(`Short read: expected ${file.fileLength} bytes, got ${offset}`);
    return { blob, bytesRead: offset, filename: file.filename };
  }

  async downloadFiles(files, _destination, onProgress) {
    void _destination;
    const reportFiles = [];
    for (const file of files) {
      try {
        const result = await this.readFileBlob(file, onProgress);
        const url = URL.createObjectURL(result.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        reportFiles.push({
          filename: file.filename,
          status: "success",
          bytesWritten: result.bytesRead,
          outputPath: file.filename,
        });
      } catch (error) {
        debugLog("error", "download file failed", { filename: file.filename, error: error?.message ?? String(error) });
        reportFiles.push({
          filename: file.filename,
          status: "failed",
          bytesWritten: 0,
          error: error?.message ?? String(error),
          outputPath: file.filename,
        });
      }
    }
    return {
      files: reportFiles,
      totalBytesWritten: reportFiles.reduce((sum, entry) => sum + entry.bytesWritten, 0),
    };
  }

  async deleteFile(filename) {
    const response = await this.sendCommand(CMD_DELETE_FILE, new TextEncoder().encode(filename), 8);
    if (!response || response.cmd !== CMD_DELETE_FILE) return { result: "failed", code: -1 };
    const code = response.body[0] ?? 2;
    const resultMap = { 0: "success", 1: "not-exists", 2: "failed" };
    return { result: resultMap[code] ?? "unknown_error", code };
  }

  async getCardInfo() {
    const response = await this.sendCommand(CMD_GET_CARD_INFO, new Uint8Array(), 5);
    if (!response || response.body.length < 12) throw new Error("Failed to get card info");
    const free = readUint32BE(response.body, 0);
    const capacity = readUint32BE(response.body, 4);
    const statusRaw = readUint32BE(response.body, 8);
    return { free, used: Math.max(0, capacity - free), capacity, statusRaw, status: statusRaw.toString(16) };
  }

  async formatCard(confirmed) {
    if (!confirmed) return { result: "failed", error: "format requires explicit confirmation" };
    const response = await this.sendCommand(CMD_FORMAT_CARD, new Uint8Array([1, 2, 3, 4]), 60);
    if (!response) return { result: "failed", error: "No response" };
    const code = response.body[0] ?? 1;
    return { result: code === 0 ? "success" : "failed", code };
  }

  async getRecordingFile() {
    const response = await this.sendCommand(CMD_GET_RECORDING_FILE, new Uint8Array(), 5);
    if (!response || response.body.length === 0) return null;
    const name = new TextDecoder("ascii").decode(response.body).replace(/\0/g, "").trim();
    return name ? { name, status: "recording_active_or_last" } : null;
  }

  async getBatteryStatus() {
    const response = await this.sendCommand(CMD_GET_BATTERY_STATUS, new Uint8Array(), 5);
    if (!response || response.body.length < 6) return null;
    const statusCode = response.body[0] & 0xff;
    return {
      status: statusCode === 0 ? "idle" : statusCode === 1 ? "charging" : "full",
      battery: response.body[1] & 0xff,
      voltage: readUint32BE(response.body, 2),
    };
  }

  async getDeviceTime() {
    const response = await this.sendCommand(CMD_GET_DEVICE_TIME, new Uint8Array(), 5);
    if (!response) throw new Error("Failed to get device time");
    return { time: parseBcdTime(response.body) };
  }

  async setDeviceTime(date) {
    const year = date.getFullYear();
    const payload = new Uint8Array([
      toBcd(Math.floor(year / 100)),
      toBcd(year % 100),
      toBcd(date.getMonth() + 1),
      toBcd(date.getDate()),
      toBcd(date.getHours()),
      toBcd(date.getMinutes()),
      toBcd(date.getSeconds()),
    ]);
    const response = await this.sendCommand(CMD_SET_DEVICE_TIME, payload, 5);
    if (!response) return { result: "failed", error: "No response" };
    const code = response.body[0] ?? 1;
    return { result: code === 0 ? "success" : "failed", code };
  }

  async getSettings() {
    const response = await this.sendCommand(CMD_GET_SETTINGS, new Uint8Array(), 5);
    if (!response || response.body.length < 4) throw new Error("Failed to get settings");
    return {
      autoRecord: response.body[3] === 1,
      autoPlay: response.body[7] === 1,
      notificationSound: response.body.length >= 12 ? response.body[11] === 1 : undefined,
      bluetoothTone: response.body[15] !== 1,
    };
  }

  async setSettings(settings) {
    const current = await this.getSettings();
    const merged = { ...current, ...settings };
    const payload = new Uint8Array(16);
    payload[3] = merged.autoRecord ? 1 : 2;
    payload[7] = merged.autoPlay ? 1 : 2;
    payload[11] = merged.notificationSound === false ? 2 : 1;
    payload[15] = merged.bluetoothTone ? 2 : 1;
    return genericResult(await this.sendCommand(CMD_SET_SETTINGS, payload, 5));
  }

  async setNotification(enabled) {
    return this.setSettings({ notificationSound: enabled });
  }

  async beginBncDemo() {
    return genericResult(await this.sendCommand(CMD_BNC_DEMO, new Uint8Array([1]), 5));
  }

  async endBncDemo() {
    return genericResult(await this.sendCommand(CMD_BNC_DEMO, new Uint8Array([0]), 5));
  }

  async startBluetoothScan(count) {
    return genericResult(await this.sendCommand(CMD_START_STOP_BLUETOOTH_SCAN, new Uint8Array([1, count & 0xff]), 10));
  }

  async stopBluetoothScan() {
    return genericResult(await this.sendCommand(CMD_START_STOP_BLUETOOTH_SCAN, new Uint8Array([0]), 10));
  }

  async getBluetoothScanResults() {
    const response = await this.sendCommand(CMD_GET_BLUETOOTH_SCAN_RESULTS, new Uint8Array(), 5);
    if (!response) throw new Error("Failed to get Bluetooth scan results");
    return parseBluetoothDevices(response.body);
  }

  async getPairedBluetoothDevices() {
    const response = await this.sendCommand(CMD_GET_PAIRED_BLUETOOTH_DEVICES, new Uint8Array(), 5);
    if (!response) throw new Error("Failed to get paired Bluetooth devices");
    return parseBluetoothDevices(response.body);
  }

  async clearPairedBluetoothDevices() {
    return genericResult(await this.sendCommand(CMD_CLEAR_PAIRED_BLUETOOTH_DEVICES, new Uint8Array([1]), 10));
  }

  async getBluetoothStatus() {
    const response = await this.sendCommand(CMD_GET_BLUETOOTH_STATUS, new Uint8Array(), 5);
    if (!response || response.body.length < 11) return null;
    return {
      mac: Array.from(response.body.slice(0, 6)).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join("-"),
      connected: response.body[6] === 1,
      a2dp: response.body[7] === 1,
      hfp: response.body[8] === 1,
      avrcp: response.body[9] === 1,
      battery: response.body[10] ?? 0,
    };
  }

  async disconnectBluetoothDevice() {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([0]), 8));
  }

  async connectBluetoothDevice(mac) {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([1, ...macToBytes(mac)]), 8));
  }

  async reconnectBluetoothDevice(mac) {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([2, ...macToBytes(mac)]), 8));
  }

  async getWebUsbTimeout() {
    const response = await this.sendCommand(CMD_GET_WEBUSB_TIMEOUT, new Uint8Array(), 5);
    if (!response || response.body.length < 4) throw new Error("Failed to get WebUSB timeout");
    return { timeout: readUint32BE(response.body) };
  }

  async setWebUsbTimeout(timeoutMs) {
    return genericResult(await this.sendCommand(CMD_SET_WEBUSB_TIMEOUT, new Uint8Array(writeUint32BE(timeoutMs)), 5));
  }

  async sendKeyCode(key, action) {
    return genericResult(await this.sendCommand(CMD_SEND_KEY_CODE, new Uint8Array([key & 0xff, action & 0xff]), 5));
  }

  async enterMassStorageMode() {
    return genericResult(await this.sendCommand(CMD_ENTER_MASS_STORAGE_MODE, new Uint8Array([1]), 5));
  }

  async getRecordingStatus() {
    const response = await this.sendCommand(CMD_GET_RECORDING_STATUS, new Uint8Array(), 5);
    if (!response || response.body.length < 6) throw new Error("Failed to get recording status");
    const typeCode = response.body[0];
    return {
      recording: new TextDecoder("ascii").decode(response.body.slice(1, 33)).replace(/\0/g, "").trim() || null,
      duration: readUint32BE(response.body, 33),
      samples: Array.from(response.body.slice(37)),
      type: typeCode === 1 ? "recording" : typeCode === 2 ? "whisper" : null,
    };
  }

  async getRecordingQuality() {
    const response = await this.sendCommand(CMD_GET_RECORDING_QUALITY, new Uint8Array(), 5);
    if (!response || response.body.length < 1) throw new Error("Failed to get recording quality");
    return { quality: response.body[0] === 2 ? "high" : "normal" };
  }

  async setRecordingQuality(quality) {
    return genericResult(await this.sendCommand(CMD_SET_RECORDING_QUALITY, new Uint8Array([quality === "high" ? 2 : 1]), 5));
  }

  async getAudioInputDevice() {
    const response = await this.sendCommand(CMD_GET_AUDIO_INPUT_DEVICE, new Uint8Array(), 5);
    if (!response || response.body.length < 1) throw new Error("Failed to get audio input device");
    return { device: response.body[0] === 2 ? "bt-mic" : "mic" };
  }

  async setAudioInputDevice(device) {
    return genericResult(await this.sendCommand(CMD_SET_AUDIO_INPUT_DEVICE, new Uint8Array([device === "bt-mic" ? 2 : 1]), 5));
  }

  async startRealtime(mode) {
    return genericResult(await this.sendCommand(CMD_REALTIME_CONTROL, new Uint8Array([1, mode & 0xff]), 5));
  }

  async stopRealtime() {
    return genericResult(await this.sendCommand(CMD_REALTIME_CONTROL, new Uint8Array([0]), 5));
  }

  async getRealtime() {
    const response = await this.sendCommand(CMD_GET_REALTIME, new Uint8Array(), 5);
    if (!response || response.body.length < 6) throw new Error("Failed to get realtime status");
    return {
      rest: readUint32BE(response.body, 0),
      muted: response.body[4] === 1,
      dataLength: response.body[5] ?? 0,
    };
  }
}

export function createDeviceService() {
  return typeof navigator !== "undefined" && "usb" in navigator ? new WebUsbDeviceService() : new BrowserDeviceService();
}

export { formatBytes, formatDuration, normalizeImportFilename };
