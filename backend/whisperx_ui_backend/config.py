from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}


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


class BackendBinding(NamedTuple):
    host: str
    port: int


def get_backend_binding() -> BackendBinding:
    host = os.environ.get("WHISPERX_UI_HOST", "127.0.0.1").strip() or "127.0.0.1"
    raw_port = os.environ.get("WHISPERX_UI_PORT", "8000").strip()
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError("WHISPERX_UI_PORT must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("WHISPERX_UI_PORT must be between 1 and 65535")
    return BackendBinding(host=host, port=port)


def is_desktop_mode() -> bool:
    return os.environ.get("WHISPERX_UI_DESKTOP", "").strip() == "1"


def get_config() -> AppConfig:
    raw_dir = os.environ.get("WHISPERX_UI_APP_DATA", "app_data")
    config = AppConfig(app_data_dir=Path(raw_dir).expanduser().resolve())
    config.ensure_directories()
    return config

