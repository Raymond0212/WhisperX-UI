# Electron Bundling Plan (Windows + macOS)

## Objective

Bundle WhisperX-UI into a desktop application for Windows and macOS using Electron, while preserving local-first behavior:

- React/Vite frontend
- FastAPI Python backend
- local SQLite database
- local uploads, exports, logs, and model cache
- download-on-demand Whisper/faster-whisper models

Large ML models remain download-on-demand by default; offline distribution is a future optional variant.

## Current Architecture Assessment

### Existing strengths

- clean frontend/backend split
- frontend can be produced as static files from Vite
- backend already runs locally with Uvicorn/FastAPI
- runtime storage already configurable through `WHISPERX_UI_APP_DATA`
- model cache already expected under app data
- existing workflow is local-first

### Main packaging risk

Electron is straightforward compared to packaging Python ML dependencies:

- `torch`
- `torchaudio`
- `faster-whisper`
- `pyannote.audio`
- `transformers`
- `huggingface-hub`

These carry native wheels and must be packaged per OS + CPU architecture.

## Recommended Desktop Architecture

```text
Electron desktop app
├── Electron main process
│   ├── starts local backend process
│   ├── assigns app data directory
│   ├── waits for backend health check
│   ├── opens BrowserWindow
│   └── shuts backend down on exit
│
├── Electron renderer
│   └── built Vite frontend
│
└── Python backend runtime
    ├── FastAPI app
    ├── Python executable or bundled environment
    ├── Python dependencies
    └── local app data
```

Runtime flow:

```text
Electron BrowserWindow
        ↓
React frontend
        ↓ HTTP
http://127.0.0.1:<local-port>/api
        ↓
FastAPI backend
        ↓
Electron userData directory
├── database.sqlite
├── uploads/
├── exports/
├── logs/
└── models/
```

## Phase 1 — Desktop Readiness

### Goal

Make the existing web app run reliably inside Electron without changing core product behavior.

### Tasks

1. **Add root desktop scripts** in a root `package.json`:
   - `desktop:install`
   - `desktop:dev`
   - `desktop:build`
   - `desktop:pack`
2. **Add `desktop/` Electron project** (`package.json`, `electron-main.js`, `preload.js`) that:
   - discovers repo paths in dev and packaged resources in prod
   - picks a free local port
   - sets backend env vars
   - starts backend process
   - polls `/api/health`
   - opens window
   - terminates backend on exit
3. **Inject API base URL at runtime** via preload bridge:

   ```js
   export const API_BASE =
     window.whisperxDesktop?.apiBaseUrl ||
     import.meta.env.VITE_API_BASE_URL ||
     "http://127.0.0.1:8000";
   ```

4. **Set desktop data path**:

   ```bash
   WHISPERX_UI_APP_DATA=<electron userData>/WhisperX-UI
   ```

5. **Add desktop CORS mode** using `WHISPERX_UI_DESKTOP=1`; prefer serving built frontend from FastAPI in desktop mode to avoid CORS entirely.
6. **Support configurable host/port**:

   ```bash
   WHISPERX_UI_HOST=127.0.0.1
   WHISPERX_UI_PORT=<selected-port>
   ```

## Phase 2 — Developer Electron App

### Goal

Run desktop locally against the existing Python development environment.

### Runtime behavior

Electron starts backend with local toolchain:

```bash
uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --host 127.0.0.1 --port <port>
```

Then Electron loads either `frontend/dist/index.html` or (preferred when served by FastAPI) `http://127.0.0.1:<port>/`.

### Acceptance criteria

- `npm run desktop:dev` launches desktop app
- app data written under Electron user data, not repository
- upload works
- model preparation works
- transcription works
- VTT export works
- closing app stops backend
- relaunch preserves DB + model cache

## Phase 3 — Integration Improvements

### Goal

Increase desktop robustness and reduce Electron-specific edge cases.

### Tasks

1. **Serve frontend from FastAPI in desktop mode**:
   - `/api/*` remains API
   - `/*` serves SPA/static fallback
2. **Add `/api/runtime` diagnostics endpoint** returning runtime mode, paths, platform, and Python version.
3. **Add structured startup logs** to `<app_data>/logs/backend.log` including startup context and failures.
4. **Optional `POST /api/shutdown`** enabled only in desktop mode and local bind.

## Phase 4 — Packaging Python Runtime

### Goal

Produce self-contained desktop runtime.

### Recommendation

Start with bundled Python environment (not PyInstaller first):

- bundled `.venv` for initial implementation
- optional micromamba/conda for tighter native dependency control
- defer PyInstaller until later

### Baseline packaging strategy

For each OS:

1. create clean Python env
2. install dependencies
3. install backend package
4. copy env into Electron resources
5. start bundled Python executable from Electron

Expected resource layout:

```text
resources/
├── frontend/dist/
├── backend/whisperx_ui_backend/
└── python/
```

## Phase 5 — Model Distribution Strategy

### Recommendation

Do not bundle Whisper/pyannote models into the base installer.

Default:

- installer contains Electron + frontend + backend + Python runtime
- faster-whisper model downloads on first use into `models/`
- pyannote download requires Hugging Face token

Optional later variants:

- online installer
- runtime bundled (no model bundle)
- offline bundle (includes default model)
- enterprise offline package

## Phase 6 — CI/CD Packaging

### Goal

Produce reproducible Windows + macOS artifacts in CI.

Suggested matrix:

```yaml
strategy:
  matrix:
    os: [windows-latest, macos-13, macos-14]
```

Suggested outputs:

- Windows x64 NSIS installer
- macOS x64 DMG
- macOS arm64 DMG

CI outline:

1. checkout
2. install Node
3. install Python
4. build frontend
5. build/restore Python runtime
6. install desktop dependencies
7. package Electron app
8. upload artifacts

Release hardening:

- Windows signing
- macOS signing + notarization
- installer + first-launch smoke tests
- model-download smoke tests

## Phase 7 — Product Improvements Before Distribution

- first-run checks (runtime, model cache, token status, disk)
- model manager (installed/download/delete/redownload/default)
- backend/model status UI
- better desktop error surfaces
- log export bundle excluding user media/transcripts by default

## Phase 8 — Security and Reliability

- bind backend to `127.0.0.1` only
- Electron hardening:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
- guarantee backend shutdown on app lifecycle termination
- select dynamic local port (no hardcoded `8000`)
- write user data only to Electron user data directory

## Milestone Order

1. desktop prototype wrapper
2. desktop-compatible backend integrations
3. internal packaged builds
4. self-contained runtime builds
5. release pipeline (signing, notarization, smoke tests)

## Definition of Done

Packaging is complete when Windows installer and macOS DMG run without developer tooling installed and all core flows succeed:

- automatic backend startup
- automatic frontend load
- user-data directory persistence
- upload/transcription/diarization/VTT export
- clean shutdown with backend termination
- relaunch preserves DB/model cache
- logs available for support
- CI reproduces release artifacts
