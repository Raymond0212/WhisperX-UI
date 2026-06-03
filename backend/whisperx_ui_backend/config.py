from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


SUPPORTED_AUDIO_EXTENSION_ORDER = (
    ".aac",
    ".aif",
    ".aifc",
    ".aiff",
    ".amr",
    ".caf",
    ".flac",
    ".m4a",
    ".mka",
    ".mp3",
    ".mpga",
    ".mpeg",
    ".oga",
    ".ogg",
    ".opus",
    ".wav",
    ".wave",
    ".webm",
)
SUPPORTED_AUDIO_EXTENSIONS = set(SUPPORTED_AUDIO_EXTENSION_ORDER)


@dataclass(frozen=True)
class AppConfig:
    app_data_dir: Path

    @property
    def database_path(self) -> Path:
        return self.app_data_dir / "database.sqlite"

    @property
    def uploads_dir(self) -> Path:
        return self.app_data_dir / "uploads"

    @property
    def exports_dir(self) -> Path:
        return self.app_data_dir / "exports"

    @property
    def logs_dir(self) -> Path:
        return self.app_data_dir / "logs"

    @property
    def models_dir(self) -> Path:
        return self.app_data_dir / "models"

    def ensure_directories(self) -> None:
        for path in (
            self.app_data_dir,
            self.uploads_dir,
            self.exports_dir,
            self.logs_dir,
            self.models_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)


def get_config() -> AppConfig:
    raw_dir = os.environ.get("WHISPERX_UI_APP_DATA", "app_data")
    config = AppConfig(app_data_dir=Path(raw_dir).expanduser().resolve())
    config.ensure_directories()
    return config


def is_debug_enabled() -> bool:
    value = os.environ.get("WHISPERX_UI_DEBUG", "").strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}
