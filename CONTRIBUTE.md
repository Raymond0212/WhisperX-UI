# Contribute

This file contains developer-facing commands for working on WhisperX UI. The user-facing project overview lives in [README.md](README.md).

## Backend Development

```bash
uv sync --extra test
uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload --reload-dir backend --reload-dir tests
```

The backend defaults to `app_data/` for SQLite, uploads, exports, logs, and models. Override it with:

```bash
WHISPERX_UI_APP_DATA=./app_data uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload
```

Enable verbose backend debugging:

```bash
WHISPERX_UI_DEBUG=1 uv run uvicorn whisperx_ui_backend.app:app --app-dir backend --reload --log-level debug
```

## Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE_URL` when the backend is not running on `http://127.0.0.1:8000`.

## Tests

Backend tests:

```bash
./scripts/run-backend-tests.sh
```

Frontend tests:

```bash
cd frontend
npm test
```

## Runtime Smoke Check

Run a local runtime smoke validation:

```bash
./scripts/smoke-check-local-runtime.sh
```

Optional token-enabled diarization check:

```bash
HF_TOKEN=hf_xxx ./scripts/smoke-check-local-runtime.sh
```

The script runs in-process via FastAPI `TestClient`, so it does not require a local socket bind. First run needs internet access to install Python dependencies and download models.

If model preparation fails, the script prints the backend response and exits with `[FAIL]`. Silent or near-silent audio may validly produce zero transcript sentences as long as the job completes and the transcript endpoint returns a valid list payload.

## Release Validation

The release workflow and `scripts/build-release.sh` run backend tests, frontend tests, frontend build, PyInstaller packaging, and packaged executable validation before reporting a release bundle.
