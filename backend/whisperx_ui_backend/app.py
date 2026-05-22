from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from platform import platform
from sys import executable
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from .config import AppConfig, get_config, is_desktop_mode
from .database import connect, initialize_database
from .schemas import (
    AudioFileOut,
    AudioUpdate,
    JobCreate,
    JobOut,
    LocalModelOut,
    ModelPrepareOut,
    ModelPrepareRequest,
    SettingsUpdate,
    SpeakerOut,
    SpeakerUpdate,
    TranscriptSentenceOut,
    TranscriptSentenceUpdate,
)
from .services import (
    AudioService,
    JobService,
    ModelService,
    SettingsService,
    SpeakerService,
    TranscriptService,
    VttService,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = get_config()
    connection = connect(config.database_path)
    initialize_database(connection)
    app.state.config = config
    app.state.connection = connection
    try:
        yield
    finally:
        connection.close()


app = FastAPI(title="WhisperX UI", version="0.1.0", lifespan=lifespan)

_allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if is_desktop_mode():
    _allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=not is_desktop_mode(),
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    return app.state.connection


def get_app_config() -> AppConfig:
    return app.state.config


def audio_service(
    connection=Depends(get_connection), config: AppConfig = Depends(get_app_config)
) -> AudioService:
    return AudioService(connection, config)


def job_service(
    connection=Depends(get_connection), config: AppConfig = Depends(get_app_config)
) -> JobService:
    return JobService(connection, config)


def transcript_service(connection=Depends(get_connection)) -> TranscriptService:
    return TranscriptService(connection)


def speaker_service(connection=Depends(get_connection)) -> SpeakerService:
    return SpeakerService(connection)


def settings_service(connection=Depends(get_connection)) -> SettingsService:
    return SettingsService(connection)


def model_service(config: AppConfig = Depends(get_app_config)) -> ModelService:
    return ModelService(config)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/runtime")
def runtime(config: AppConfig = Depends(get_app_config)) -> dict[str, str | bool]:
    return {
        "version": app.version,
        "desktop": is_desktop_mode(),
        "app_data_dir": str(config.app_data_dir),
        "models_dir": str(config.models_dir),
        "platform": platform(),
        "python": executable,
    }


@app.post("/api/audio", response_model=AudioFileOut)
def upload_audio(
    file: Annotated[UploadFile, File()],
    display_title: Annotated[str | None, Form()] = None,
    service: AudioService = Depends(audio_service),
):
    return service.create_upload(file, display_title)


@app.get("/api/audio", response_model=list[AudioFileOut])
def list_audio(service: AudioService = Depends(audio_service)):
    return service.list_audio()


@app.get("/api/audio/{audio_id}", response_model=AudioFileOut)
def get_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    return service.get_audio(audio_id)


@app.patch("/api/audio/{audio_id}", response_model=AudioFileOut)
def update_audio(
    audio_id: str,
    update: AudioUpdate,
    service: AudioService = Depends(audio_service),
):
    return service.update_title(audio_id, update.display_title)


@app.delete("/api/audio/{audio_id}", status_code=204)
def delete_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    service.soft_delete(audio_id)
    return None


@app.get("/api/audio/{audio_id}/stream")
def stream_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    path, media_type = service.stream_info(audio_id)
    return FileResponse(path, media_type=media_type, filename=Path(path).name)


@app.post("/api/jobs", response_model=JobOut)
def create_job(request: JobCreate, service: JobService = Depends(job_service)):
    return service.create_and_run(request)


@app.get("/api/models", response_model=list[LocalModelOut])
def list_models(service: ModelService = Depends(model_service)):
    return service.list_models()


@app.get("/api/model-options")
def list_model_options(service: ModelService = Depends(model_service)):
    return service.model_options()


@app.post("/api/models/prepare-basic", response_model=ModelPrepareOut)
def prepare_basic_models(
    request: ModelPrepareRequest,
    service: ModelService = Depends(model_service),
):
    return service.prepare_basic(request)


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, service: JobService = Depends(job_service)):
    return service.get_job(job_id)


@app.get("/api/audio/{audio_id}/jobs", response_model=list[JobOut])
def list_audio_jobs(audio_id: str, service: JobService = Depends(job_service)):
    return service.list_jobs_for_audio(audio_id)


@app.get("/api/jobs/{job_id}/transcript", response_model=list[TranscriptSentenceOut])
def list_transcript(job_id: str, service: TranscriptService = Depends(transcript_service)):
    return service.list_sentences(job_id)


@app.patch("/api/transcript-sentences/{sentence_id}", response_model=TranscriptSentenceOut)
def update_sentence(
    sentence_id: str,
    update: TranscriptSentenceUpdate,
    service: TranscriptService = Depends(transcript_service),
):
    return service.update_sentence(sentence_id, update.current_text)


@app.get("/api/jobs/{job_id}/speakers", response_model=list[SpeakerOut])
def list_speakers(job_id: str, service: SpeakerService = Depends(speaker_service)):
    return service.list_speakers(job_id)


@app.patch("/api/speakers/{speaker_id}", response_model=SpeakerOut)
def update_speaker(
    speaker_id: str,
    update: SpeakerUpdate,
    service: SpeakerService = Depends(speaker_service),
):
    return service.update_display_name(speaker_id, update.display_name)


@app.get("/api/jobs/{job_id}/export.vtt")
def export_vtt(job_id: str, service: TranscriptService = Depends(transcript_service)):
    if not service.list_sentences(job_id):
        raise HTTPException(status_code=404, detail="Transcript not found")
    return PlainTextResponse(
        VttService(service).render(job_id),
        media_type="text/vtt",
        headers={"Content-Disposition": f'attachment; filename="{job_id}.vtt"'},
    )


@app.get("/api/settings")
def get_settings(service: SettingsService = Depends(settings_service)):
    return service.get_settings()


@app.patch("/api/settings")
def update_settings(update: SettingsUpdate, service: SettingsService = Depends(settings_service)):
    return service.update_settings(update.settings)
