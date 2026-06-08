# Release Packaging

Status: Active

## Purpose

WhisperX UI release packaging creates self-contained executable bundles for the local-first web application. The bundle runs the FastAPI backend and serves the built Vite React frontend from the same local process.

## Local Builds

The local release script is `scripts/build-release.sh`. It is a Bash script intended for macOS and Linux development environments with `uv` and `npm` installed.

The script:

- syncs Python build and test dependencies from `uv.lock`;
- installs frontend dependencies with `npm ci`;
- runs backend and frontend tests;
- builds the Vite React frontend;
- copies the frontend build into the backend package;
- runs PyInstaller against `backend/whisperx_ui_backend/__main__.py`;
- starts the packaged executable and checks `/api/health`, `/`, and one built frontend asset.

The output directory is `dist/whisperx-ui/`. Runtime data remains local and defaults to `app_data/` unless `WHISPERX_UI_APP_DATA` overrides it.

## CI Builds

The GitHub Actions release workflow is the source of cross-platform release bundles. It produces Linux, macOS Apple Silicon, and Windows artifacts. There is no GitLab CI release configuration in the current repository.

Windows packaging is currently CI-only. Do not document a local Windows release command until a Windows-specific local script exists and is validated.

## Constraints

- Keep release behavior local-first: bundled executables must not introduce hosted services or remote persistence.
- Keep the backend as the release entry point so `/api/*` routes and the Vite React frontend are served by one local process.
- Keep CI release builds gated by backend tests, frontend tests, and packaged executable smoke validation before artifact upload.
- Update this document when release platforms, artifact names, or local packaging scripts change.
