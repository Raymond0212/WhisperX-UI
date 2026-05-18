from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


JobStatus = Literal["uploaded", "processing", "completed", "failed", "deleted"]


class AudioFileOut(BaseModel):
    id: str
    original_filename: str
    stored_filename: str
    display_title: str
    mime_type: str | None = None
    duration_seconds: float | None = None
    size_bytes: int
    created_at: str
    deleted_at: str | None = None
    latest_job_status: str | None = None


class AudioUpdate(BaseModel):
    display_title: str = Field(min_length=1, max_length=200)


class JobCreate(BaseModel):
    audio_file_id: str
    transcription_engine: str = "faster-whisper"
    transcription_model: str = "distil-large-v3"
    diarization_engine: str = "huggingface-pyannote"
    diarization_model: str = "pyannote/speaker-diarization-community-1"
    language: str | None = None
    device: str = "auto"
    compute_type: str = "int8"
    batch_size: int = Field(default=8, ge=1, le=128)
    speaker_count: int | None = Field(default=None, ge=1, le=20)
    min_speakers: int | None = Field(default=None, ge=1, le=20)
    max_speakers: int | None = Field(default=None, ge=1, le=20)
    settings: dict[str, Any] = Field(default_factory=dict)


class JobOut(BaseModel):
    id: str
    audio_file_id: str
    status: JobStatus
    transcription_engine: str
    transcription_model: str
    diarization_engine: str
    diarization_model: str
    language: str | None = None
    device: str | None = None
    compute_type: str | None = None
    batch_size: int | None = None
    speaker_count: int | None = None
    min_speakers: int | None = None
    max_speakers: int | None = None
    settings: dict[str, Any]
    error_message: str | None = None
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None


class SpeakerOut(BaseModel):
    id: str
    job_id: str
    speaker_key: str
    display_name: str
    sample_start: float
    sample_end: float
    created_at: str
    updated_at: str


class SpeakerUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class TranscriptSentenceOut(BaseModel):
    id: str
    job_id: str
    speaker_id: str
    speaker_key: str
    speaker_display_name: str
    sentence_index: int
    start_time: float
    end_time: float
    original_text: str
    current_text: str
    confidence: float | None = None
    words: list[dict[str, Any]] | None = None
    created_at: str
    updated_at: str


class TranscriptSentenceUpdate(BaseModel):
    current_text: str = Field(max_length=10000)


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    settings: dict[str, Any] = Field(default_factory=dict)


class LocalModelOut(BaseModel):
    key: str
    display_name: str
    repo_id: str
    local_path: str
    downloaded: bool
    required_for_basic: bool
    notes: str | None = None


class ModelPrepareRequest(BaseModel):
    profile: str = "basic"
    transcription_model: str = "distil-large-v3"
    hf_token: str | None = None


class ModelPrepareOut(BaseModel):
    profile: str
    ready: bool
    models: list[LocalModelOut]
