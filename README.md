# WhisperX UI

WhisperX UI is a local-first app for transcribing audio, reviewing sentence-level transcripts, renaming speakers, playing timestamped audio, and exporting VTT captions.

It runs on your machine. Uploaded audio, transcripts, settings, logs, downloaded models, and exports are stored locally by default.

## What It Does

- Upload audio files into a local library.
- Download and use the default faster-whisper model when needed.
- Run local transcription with optional Hugging Face pyannote diarization.
- Fall back to a single-speaker transcript when no Hugging Face token is provided.
- Edit transcript sentences and speaker display names.
- Play audio from transcript timestamps.
- Export VTT from sentence or speaker-turn views.

## Requirements

- Python 3.11 or 3.12
- `uv`
- Node.js and npm
- Internet access on first model download

A Hugging Face token is optional. Add one when you want pyannote speaker diarization.

## Run Locally

macOS/Linux:

```bash
./scripts/one-click-dev.sh
```

Windows PowerShell:

```powershell
.\scripts\one-click-dev.ps1
```

Then open:

```text
http://127.0.0.1:5173
```

The one-click scripts load `.env` when present, install dependencies, start the backend on `http://127.0.0.1:8000`, and start the frontend on `http://127.0.0.1:5173`.

## Local Data

By default, runtime data is stored under:

```text
app_data/
```

Set `WHISPERX_UI_APP_DATA` to use a different location:

```bash
WHISPERX_UI_APP_DATA=/path/to/app-data ./scripts/one-click-dev.sh
```

## Release Builds

Repository owners can run the manual GitHub Actions workflow **Build release executables** to produce:

```text
whisperx-ui-linux-x64.tar.gz
whisperx-ui-macos-arm64.tar.gz
whisperx-ui-windows-x64.zip
```

macOS release artifacts are Apple Silicon builds.

For local release packaging on macOS or Linux:

```bash
./scripts/build-release.sh
```

The bundle is written to:

```text
dist/whisperx-ui/
```

Run it:

```bash
./dist/whisperx-ui/whisperx-ui
```

Then open:

```text
http://127.0.0.1:8000
```

Windows release bundles are currently produced by GitHub Actions only.

## Binary Configuration

The built `whisperx-ui` binary is configured with environment variables.

| Variable                           | Default     | Description                                                                                                                                                                                   |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WHISPERX_UI_HOST`                 | `127.0.0.1` | Host address for the bundled local server. Keep the default for local-only use.                                                                                                               |
| `WHISPERX_UI_PORT`                 | `8000`      | Port for the bundled local server. Change this if another app is already using port `8000`.                                                                                                   |
| `WHISPERX_UI_APP_DATA`             | `app_data`  | Directory for SQLite, uploads, exports, logs, downloaded models, and encrypted local credentials. Relative paths resolve from the directory where the binary is launched.                     |
| `WHISPERX_UI_DEBUG`                | off         | Enables verbose backend logging when set to `1`, `true`, `yes`, `on`, or `debug`.                                                                                                             |
| `WHISPERX_UI_INLINE_JOB_EXECUTION` | off         | Runs transcription jobs inside the server process when set to `1`, `true`, or `yes`. This is mainly for diagnostics; normal binary use should leave it unset so jobs run in worker processes. |

macOS/Linux example:

```bash
WHISPERX_UI_PORT=8010 WHISPERX_UI_APP_DATA=/path/to/app-data ./whisperx-ui
```

Windows PowerShell example:

```powershell
$env:WHISPERX_UI_PORT="8010"
$env:WHISPERX_UI_APP_DATA="C:\path\to\app-data"
.\whisperx-ui.exe
```

After changing `WHISPERX_UI_HOST` or `WHISPERX_UI_PORT`, open the matching address in your browser.

The binary also contains an internal `whisperx-ui worker` command to spawn transcription and diarization worker nodes. The main executable spawns it automatically for transcription jobs; do not run it manually.

## Contributing

Developer setup, test commands, and validation workflows are documented in [CONTRIBUTE.md](CONTRIBUTE.md).
