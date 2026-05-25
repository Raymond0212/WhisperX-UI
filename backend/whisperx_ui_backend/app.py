from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from .config import AppConfig, get_config, is_debug_enabled
from .database import connect, initialize_database
from .job_queue import JobQueueService
from .schemas import (
    AudioFileOut,
    AudioUpdate,
    HuggingFaceTokenWrite,
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
    SecretService,
    SpeakerService,
    TranscriptService,
    VttService,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=logging.DEBUG if is_debug_enabled() else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    config = get_config()
    logging.getLogger(__name__).info(
        "Backend startup debug=%s app_data_dir=%s",
        is_debug_enabled(),
        str(config.app_data_dir),
    )
    connection = connect(config.database_path)
    initialize_database(connection)
    job_queue = JobQueueService(config)
    job_queue.start()
    app.state.config = config
    app.state.connection = connection
    app.state.job_queue = job_queue
    try:
        yield
    finally:
        job_queue.stop()
        connection.close()


app = FastAPI(title="WhisperX UI", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
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


def settings_service(
    connection=Depends(get_connection), config: AppConfig = Depends(get_app_config)
) -> SettingsService:
    return SettingsService(connection, config)


def secret_service(
    connection=Depends(get_connection), config: AppConfig = Depends(get_app_config)
) -> SecretService:
    return SecretService(connection, config)


def model_service(connection=Depends(get_connection), config: AppConfig = Depends(get_app_config)) -> ModelService:
    return ModelService(connection, config)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    return service.update_audio(audio_id, update.model_dump(exclude_unset=True))


@app.delete("/api/audio/{audio_id}", status_code=204)
def delete_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    service.soft_delete(audio_id)
    return None


@app.get("/api/audio/{audio_id}/stream")
def stream_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    path, media_type = service.stream_info(audio_id)
    return FileResponse(path, media_type=media_type, filename=Path(path).name)


@app.get("/api/audio/{audio_id}/download")
def download_audio(audio_id: str, service: AudioService = Depends(audio_service)):
    audio = service.get_audio(audio_id)
    path, media_type = service.stream_info(audio_id)
    return FileResponse(path, media_type=media_type, filename=audio["original_filename"])


@app.post("/api/jobs", response_model=JobOut)
def create_job(request: JobCreate, service: JobService = Depends(job_service)):
    job = service.create_and_run(request)
    app.state.job_queue.wake()
    return job


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


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str, service: JobService = Depends(job_service)):
    service.delete_job(job_id)
    app.state.job_queue.terminate_job(job_id)
    return None


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


@app.post("/api/secrets/hf-token", status_code=204)
def store_hf_token(
    request: HuggingFaceTokenWrite, service: SecretService = Depends(secret_service)
):
    service.store_hf_token(request.hf_token)
    return None
