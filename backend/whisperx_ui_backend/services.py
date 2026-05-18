from __future__ import annotations

import json
import mimetypes
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from fastapi import HTTPException, UploadFile

from .config import SUPPORTED_AUDIO_EXTENSIONS, AppConfig
from .database import transaction
from .model_registry import (
    DEFAULT_DIARIZATION_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    DIARIZATION_ENGINE,
    DIARIZATION_MODEL_IDS,
    TRANSCRIPTION_ENGINE,
    TRANSCRIPTION_MODEL_IDS,
    TRANSCRIPTION_MODELS,
    model_options_payload,
    validate_diarization_model,
    validate_transcription_model,
)
from .processors.faster_whisper_processor import transcribe_with_faster_whisper
from .processors.pyannote_diarization import diarize_with_pyannote
from .processors.speaker_assignment import assign_speakers
from .schemas import JobCreate, ModelPrepareRequest


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def decode_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def sanitize_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "audio"
    stem = Path(name).stem or "audio"
    suffix = Path(name).suffix.lower()
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(".-") or "audio"
    return f"{safe_stem}{suffix}"


def require_audio_extension(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_AUDIO_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_AUDIO_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio extension. Use: {supported}",
        )


def infer_audio_content_type(filename: str, supplied_content_type: str | None = None) -> str:
    if supplied_content_type and supplied_content_type.lower().startswith("audio/"):
        return supplied_content_type
    guessed = mimetypes.guess_type(filename)[0]
    if guessed and guessed.lower().startswith("audio/"):
        return guessed
    return "application/octet-stream"


SECRET_KEY_PARTS = ("api_key", "token", "secret")


LOCAL_MODEL_DEFINITIONS: dict[str, dict[str, Any]] = {
    option.id: {
        "display_name": option.label,
        "repo_id": option.hf_repo_id,
        "local_dir_name": option.hf_repo_id.replace("/", "--"),
        "required_for_basic": option.id == DEFAULT_TRANSCRIPTION_MODEL,
        "notes": "Faster-whisper model cache for local one-click processing.",
    }
    for option in TRANSCRIPTION_MODELS
}


def sanitize_persisted_settings(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, nested_value in value.items():
            lowered = key.lower()
            if key == "online_api_keys" or any(part in lowered for part in SECRET_KEY_PARTS):
                continue
            sanitized[key] = sanitize_persisted_settings(nested_value)
        return sanitized
    if isinstance(value, list):
        return [sanitize_persisted_settings(item) for item in value]
    return value


def local_model_path(config: AppConfig, model_key: str) -> Path | None:
    definition = LOCAL_MODEL_DEFINITIONS.get(model_key)
    if definition is None:
        return None
    return config.models_dir / str(definition["local_dir_name"])


def is_downloaded_model_dir(path: Path) -> bool:
    return path.exists() and any(item.name != ".cache" for item in path.iterdir())


def download_hf_snapshot(
    *, repo_id: str, local_dir: Path, cache_dir: Path, token: str | None
) -> str:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:
        raise RuntimeError(
            "huggingface_hub is not installed. Install project dependencies before downloading "
            "local models."
        ) from exc

    return snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        cache_dir=str(cache_dir),
        token=token or None,
    )


def resolve_transcription_model_reference(config: AppConfig, model_key: str) -> str:
    path = local_model_path(config, model_key)
    if path is not None and is_downloaded_model_dir(path):
        return str(path)
    return model_key


class ModelService:
    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def list_models(self) -> list[dict[str, Any]]:
        return [
            self._status_for_model(model_key)
            for model_key in sorted(LOCAL_MODEL_DEFINITIONS)
        ]

    def model_options(self) -> dict[str, object]:
        return model_options_payload()

    def prepare_basic(self, request: ModelPrepareRequest) -> dict[str, Any]:
        if request.profile != "basic":
            raise HTTPException(status_code=400, detail="Only the basic model profile is supported")

        model_key = request.transcription_model or DEFAULT_TRANSCRIPTION_MODEL
        if model_key not in LOCAL_MODEL_DEFINITIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported basic transcription model: {model_key}",
            )

        status = self._status_for_model(model_key)
        if not status["downloaded"]:
            definition = LOCAL_MODEL_DEFINITIONS[model_key]
            local_dir = local_model_path(self.config, model_key)
            assert local_dir is not None
            local_dir.mkdir(parents=True, exist_ok=True)
            try:
                download_hf_snapshot(
                    repo_id=str(definition["repo_id"]),
                    local_dir=local_dir,
                    cache_dir=self.config.models_dir / ".hf-cache",
                    token=request.hf_token,
                )
            except Exception as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            status = self._status_for_model(model_key)

        return {
            "profile": "basic",
            "ready": status["downloaded"],
            "models": [status],
        }

    def _status_for_model(self, model_key: str) -> dict[str, Any]:
        definition = LOCAL_MODEL_DEFINITIONS[model_key]
        path = local_model_path(self.config, model_key)
        assert path is not None
        return {
            "key": model_key,
            "display_name": definition["display_name"],
            "repo_id": definition["repo_id"],
            "local_path": str(path),
            "downloaded": is_downloaded_model_dir(path),
            "required_for_basic": definition["required_for_basic"],
            "notes": definition.get("notes"),
        }


class AudioService:
    def __init__(self, connection: sqlite3.Connection, config: AppConfig) -> None:
        self.connection = connection
        self.config = config

    def create_upload(self, upload: UploadFile, display_title: str | None) -> dict[str, Any]:
        original_filename = sanitize_filename(upload.filename or "audio")
        require_audio_extension(original_filename)
        stored_filename = f"{uuid.uuid4()}-{original_filename}"
        file_path = self.config.uploads_dir / stored_filename
        size_bytes = 0
        with file_path.open("wb") as output:
            while chunk := upload.file.read(1024 * 1024):
                size_bytes += len(chunk)
                output.write(chunk)

        now = utc_now()
        audio_id = str(uuid.uuid4())
        default_title = Path(original_filename).stem
        title = (display_title or default_title).strip() or default_title
        mime_type = infer_audio_content_type(original_filename, upload.content_type)
        with transaction(self.connection):
            self.connection.execute(
                """
                INSERT INTO audio_files (
                    id, original_filename, stored_filename, display_title, file_path, mime_type,
                    duration_seconds, size_bytes, created_at, deleted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    audio_id,
                    original_filename,
                    stored_filename,
                    title,
                    str(file_path),
                    mime_type,
                    None,
                    size_bytes,
                    now,
                ),
            )
        return self.get_audio(audio_id, include_deleted=True)

    def list_audio(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT a.*,
                   (
                     SELECT j.status
                     FROM transcription_jobs j
                     WHERE j.audio_file_id = a.id
                     ORDER BY j.created_at DESC
                     LIMIT 1
                   ) AS latest_job_status
            FROM audio_files a
            WHERE a.deleted_at IS NULL
            ORDER BY a.created_at DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]

    def get_audio(self, audio_id: str, *, include_deleted: bool = False) -> dict[str, Any]:
        query = "SELECT * FROM audio_files WHERE id = ?"
        params: tuple[Any, ...] = (audio_id,)
        if not include_deleted:
            query += " AND deleted_at IS NULL"
        row = self.connection.execute(query, params).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Audio file not found")
        result = dict(row)
        result["latest_job_status"] = self.connection.execute(
            """
            SELECT status FROM transcription_jobs
            WHERE audio_file_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (audio_id,),
        ).fetchone()
        if result["latest_job_status"] is not None:
            result["latest_job_status"] = result["latest_job_status"]["status"]
        return result

    def update_title(self, audio_id: str, display_title: str) -> dict[str, Any]:
        with transaction(self.connection):
            cursor = self.connection.execute(
                """
                UPDATE audio_files
                SET display_title = ?
                WHERE id = ? AND deleted_at IS NULL
                """,
                (display_title.strip(), audio_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Audio file not found")
        return self.get_audio(audio_id)

    def soft_delete(self, audio_id: str) -> None:
        now = utc_now()
        with transaction(self.connection):
            cursor = self.connection.execute(
                "UPDATE audio_files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
                (now, audio_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Audio file not found")
            self.connection.execute(
                "UPDATE transcription_jobs SET status = 'deleted' WHERE audio_file_id = ?",
                (audio_id,),
            )

    def stream_info(self, audio_id: str) -> tuple[Path, str]:
        audio = self.get_audio(audio_id)
        path = Path(audio["file_path"]).expanduser().resolve()
        uploads_dir = self.config.uploads_dir.resolve()
        try:
            path.relative_to(uploads_dir)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Stored audio path is invalid") from exc
        if not path.exists():
            raise HTTPException(status_code=404, detail="Stored audio file is missing")
        media_type = infer_audio_content_type(path.name, audio["mime_type"])
        return path, media_type


class JobService:
    def __init__(self, connection: sqlite3.Connection, config: AppConfig) -> None:
        self.connection = connection
        self.config = config

    def create_and_run(self, request: JobCreate) -> dict[str, Any]:
        audio_row = self.connection.execute(
            "SELECT * FROM audio_files WHERE id = ? AND deleted_at IS NULL",
            (request.audio_file_id,),
        ).fetchone()
        if audio_row is None:
            raise HTTPException(status_code=404, detail="Audio file not found")

        job_id = str(uuid.uuid4())
        now = utc_now()
        settings = sanitize_persisted_settings(request.model_dump())
        with transaction(self.connection):
            job_columns = {
                row["name"]
                for row in self.connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
            has_engine_columns = "transcription_engine" in job_columns
            if has_engine_columns:
                self.connection.execute(
                    """
                    INSERT INTO transcription_jobs (
                        id, audio_file_id, status, transcription_engine, transcription_model,
                        diarization_engine, diarization_model, language, device, compute_type,
                        batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                        error_message, created_at, started_at, completed_at
                    )
                    VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
                    """,
                    (
                        job_id,
                        request.audio_file_id,
                        request.transcription_engine,
                        request.transcription_model,
                        request.diarization_engine,
                        request.diarization_model,
                        request.language,
                        request.device,
                        request.compute_type,
                        request.batch_size,
                        request.speaker_count,
                        request.min_speakers,
                        request.max_speakers,
                        json.dumps(settings, sort_keys=True),
                        now,
                        now,
                    ),
                )
            else:
                self.connection.execute(
                    """
                    INSERT INTO transcription_jobs (
                        id, audio_file_id, status, transcription_provider, transcription_model,
                        diarization_provider, diarization_model, language, device, compute_type,
                        batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                        error_message, created_at, started_at, completed_at
                    )
                    VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
                    """,
                    (
                        job_id,
                        request.audio_file_id,
                        request.transcription_engine,
                        request.transcription_model,
                        request.diarization_engine,
                        request.diarization_model,
                        request.language,
                        request.device,
                        request.compute_type,
                        request.batch_size,
                        request.speaker_count,
                        request.min_speakers,
                        request.max_speakers,
                        json.dumps(settings, sort_keys=True),
                        now,
                        now,
                    ),
                )

        try:
            create_processor(self.connection, self.config, dict(audio_row), request).run(job_id)
        except Exception as exc:
            with transaction(self.connection):
                self.connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET status = 'failed', error_message = ?, completed_at = ?
                    WHERE id = ?
                    """,
                    (str(exc), utc_now(), job_id),
                )
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM transcription_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found")
        result = dict(row)
        if "transcription_engine" not in result and "transcription_provider" in result:
            result["transcription_engine"] = result["transcription_provider"]
        if "diarization_engine" not in result and "diarization_provider" in result:
            result["diarization_engine"] = result["diarization_provider"]
        result["settings"] = decode_json(result.pop("settings_json"), {})
        return result

    def list_jobs_for_audio(self, audio_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM transcription_jobs WHERE audio_file_id = ? ORDER BY created_at DESC",
            (audio_id,),
        ).fetchall()
        jobs = []
        for row in rows:
            job = dict(row)
            if "transcription_engine" not in job and "transcription_provider" in job:
                job["transcription_engine"] = job["transcription_provider"]
            if "diarization_engine" not in job and "diarization_provider" in job:
                job["diarization_engine"] = job["diarization_provider"]
            job["settings"] = decode_json(job.pop("settings_json"), {})
            jobs.append(job)
        return jobs


class TranscriptProcessor(Protocol):
    def run(self, job_id: str) -> None:
        ...


@dataclass
class ProcessorSentence:
    speaker_key: str
    start_time: float
    end_time: float
    text: str
    confidence: float | None = None
    words: list[dict[str, Any]] | None = None


SENTENCE_BOUNDARY_RE = re.compile(r"\S.*?(?:[.!?]+(?=\s|$)|$)", re.DOTALL)


def segment_to_sentences(segment: dict[str, Any]) -> list[ProcessorSentence]:
    text = str(segment.get("text", "")).strip()
    if not text:
        return []

    raw_text = str(segment.get("text", ""))
    raw_start = len(raw_text) - len(raw_text.lstrip())
    raw_end = len(raw_text.rstrip())
    normalized_text = raw_text[raw_start:raw_end] or text
    matches = [
        (match.start(), match.end(), match.group().strip())
        for match in SENTENCE_BOUNDARY_RE.finditer(normalized_text)
        if match.group().strip()
    ]
    if not matches:
        matches = [(0, len(normalized_text), text)]

    start_time = float(segment["start"])
    end_time = float(segment["end"])
    duration = max(end_time - start_time, 0.0)
    text_length = max(len(normalized_text), 1)
    segment_words = segment.get("words") or []
    segment_speaker = segment.get("speaker") or _speaker_from_words(segment_words) or "SPEAKER_00"

    timed_words = [
        word
        for word in segment_words
        if isinstance(word.get("start"), int | float) and isinstance(word.get("end"), int | float)
    ]
    if timed_words and len(timed_words) == len(segment_words):
        return _sentences_from_timed_words(
            words=timed_words,
            fallback_speaker=segment_speaker,
            confidence=segment.get("confidence"),
        )

    sentences: list[ProcessorSentence] = []
    for start_index, end_index, sentence_text in matches:
        sentence_start = start_time + duration * (start_index / text_length)
        sentence_end = start_time + duration * (end_index / text_length)
        if sentence_end <= sentence_start:
            sentence_end = end_time
        words = _words_for_sentence(segment_words, sentence_start, sentence_end, sentence_text)
        sentences.extend(
            _sentence_rows_from_words(
                sentence_text=sentence_text,
                sentence_start=sentence_start,
                sentence_end=sentence_end,
                words=words,
                fallback_speaker=segment_speaker,
                confidence=segment.get("confidence"),
            )
        )
    return sentences


def _sentences_from_timed_words(
    *, words: list[dict[str, Any]], fallback_speaker: str, confidence: float | None
) -> list[ProcessorSentence]:
    grouped: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for word in words:
        current.append(word)
        token = str(word.get("word", "")).strip()
        if token.endswith((".", "!", "?")):
            grouped.append(current)
            current = []
    if current:
        grouped.append(current)

    rows: list[ProcessorSentence] = []
    for group in grouped:
        sentence_text = " ".join(str(word.get("word", "")).strip() for word in group).strip()
        rows.extend(
            _sentence_rows_from_words(
                sentence_text=sentence_text,
                sentence_start=float(group[0]["start"]),
                sentence_end=float(group[-1]["end"]),
                words=group,
                fallback_speaker=fallback_speaker,
                confidence=confidence,
            )
        )
    return rows


def _speaker_from_words(words: list[dict[str, Any]]) -> str | None:
    for word in words:
        speaker = word.get("speaker")
        if speaker:
            return str(speaker)
    return None


def _speaker_for_sentence(words: list[dict[str, Any]] | None, fallback: str) -> str:
    if not words:
        return fallback
    durations: dict[str, float] = {}
    for word in words:
        speaker = word.get("speaker")
        if not speaker:
            continue
        start = word.get("start")
        end = word.get("end")
        duration = 0.0
        if isinstance(start, int | float) and isinstance(end, int | float):
            duration = max(0.0, float(end) - float(start))
        durations[str(speaker)] = durations.get(str(speaker), 0.0) + duration
    if durations:
        return max(durations, key=durations.get)
    first = _speaker_from_words(words)
    return first or fallback


def _sentence_rows_from_words(
    *,
    sentence_text: str,
    sentence_start: float,
    sentence_end: float,
    words: list[dict[str, Any]] | None,
    fallback_speaker: str,
    confidence: float | None,
) -> list[ProcessorSentence]:
    if not words:
        return [
            ProcessorSentence(
                speaker_key=fallback_speaker,
                start_time=sentence_start,
                end_time=sentence_end,
                text=sentence_text,
                confidence=confidence,
                words=None,
            )
        ]

    runs: list[list[dict[str, Any]]] = []
    current_run: list[dict[str, Any]] = []
    current_speaker: str | None = None
    for word in words:
        speaker = str(word.get("speaker") or fallback_speaker)
        if current_speaker is None or speaker == current_speaker:
            current_run.append(word)
            current_speaker = speaker
            continue
        runs.append(current_run)
        current_run = [word]
        current_speaker = speaker
    if current_run:
        runs.append(current_run)

    if len(runs) == 1:
        speaker = _speaker_for_sentence(words, fallback_speaker)
        return [
            ProcessorSentence(
                speaker_key=speaker,
                start_time=sentence_start,
                end_time=sentence_end,
                text=sentence_text,
                confidence=confidence,
                words=words,
            )
        ]

    rows: list[ProcessorSentence] = []
    for run in runs:
        run_start = sentence_start
        run_end = sentence_end
        timed = [
            word
            for word in run
            if isinstance(word.get("start"), int | float) and isinstance(word.get("end"), int | float)
        ]
        if timed:
            run_start = float(timed[0]["start"])
            run_end = float(timed[-1]["end"])
        run_text = " ".join(str(word.get("word", "")).strip() for word in run).strip() or sentence_text
        run_speaker = _speaker_for_sentence(run, fallback_speaker)
        rows.append(
            ProcessorSentence(
                speaker_key=run_speaker,
                start_time=run_start,
                end_time=run_end,
                text=run_text,
                confidence=confidence,
                words=run,
            )
        )
    return rows


def _segments_have_speaker_labels(segments: list[dict[str, Any]]) -> bool:
    return any(
        segment.get("speaker") or _speaker_from_words(segment.get("words") or [])
        for segment in segments
    )


def _words_for_sentence(
    words: list[dict[str, Any]], sentence_start: float, sentence_end: float, sentence_text: str
) -> list[dict[str, Any]] | None:
    if not words:
        return None

    timed_words = [
        word
        for word in words
        if isinstance(word.get("start"), int | float) and isinstance(word.get("end"), int | float)
    ]
    if len(timed_words) == len(words):
        selected = []
        for word in words:
            midpoint = (float(word["start"]) + float(word["end"])) / 2
            if sentence_start <= midpoint <= sentence_end:
                selected.append(word)
        return selected or None

    remaining_text = sentence_text.lower()
    selected = []
    for word in words:
        token = str(word.get("word", "")).strip().lower()
        if token and token in remaining_text:
            selected.append(word)
            remaining_text = remaining_text.replace(token, "", 1)
    return selected or None


class DatabaseTranscriptWriter:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def persist(self, job_id: str, sentences: list[ProcessorSentence]) -> None:
        now = utc_now()
        speaker_keys = sorted({sentence.speaker_key or "SPEAKER_00" for sentence in sentences})
        speaker_ids = {speaker_key: str(uuid.uuid4()) for speaker_key in speaker_keys}

        samples: dict[str, tuple[float, float]] = {}
        for sentence in sentences:
            speaker_key = sentence.speaker_key or "SPEAKER_00"
            samples.setdefault(speaker_key, (sentence.start_time, sentence.end_time))

        with transaction(self.connection):
            self.connection.execute("DELETE FROM transcript_sentences WHERE job_id = ?", (job_id,))
            self.connection.execute("DELETE FROM speakers WHERE job_id = ?", (job_id,))
            self.connection.executemany(
                """
                INSERT INTO speakers (
                    id, job_id, speaker_key, display_name, sample_start, sample_end,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        speaker_ids[speaker_key],
                        job_id,
                        speaker_key,
                        speaker_key,
                        samples[speaker_key][0],
                        samples[speaker_key][1],
                        now,
                        now,
                    )
                    for speaker_key in speaker_keys
                ],
            )
            self.connection.executemany(
                """
                INSERT INTO transcript_sentences (
                    id, job_id, speaker_id, sentence_index, start_time, end_time,
                    original_text, current_text, confidence, words_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        str(uuid.uuid4()),
                        job_id,
                        speaker_ids[sentence.speaker_key or "SPEAKER_00"],
                        sentence_index,
                        sentence.start_time,
                        sentence.end_time,
                        sentence.text,
                        sentence.text,
                        sentence.confidence,
                        json.dumps(sentence.words) if sentence.words else None,
                        now,
                        now,
                    )
                    for sentence_index, sentence in enumerate(sentences)
                ],
            )
            self.connection.execute(
                """
                UPDATE transcription_jobs
                SET status = 'completed', completed_at = ?, error_message = NULL
                WHERE id = ?
                """,
                (now, job_id),
            )


class FasterWhisperProcessor:
    def __init__(
        self,
        connection: sqlite3.Connection,
        audio: dict[str, Any],
        request: JobCreate,
        config: AppConfig,
    ) -> None:
        self.writer = DatabaseTranscriptWriter(connection)
        self.audio = audio
        self.request = request
        self.config = config

    def run(self, job_id: str) -> None:
        audio_path = self.audio["file_path"]
        transcription_model = validate_transcription_model(
            self.request.transcription_model or DEFAULT_TRANSCRIPTION_MODEL
        )
        result = transcribe_with_faster_whisper(
            audio_path=audio_path,
            model_id=resolve_transcription_model_reference(self.config, transcription_model),
            device=self.request.device,
            compute_type=self.request.compute_type,
            language=self.request.language,
            download_root=str(self.config.models_dir),
        )

        diarization_token = self.request.settings.get("diarization_token") or self.request.settings.get(
            "hf_token"
        )
        if diarization_token:
            diarization_model = validate_diarization_model(
                self.request.diarization_model or DEFAULT_DIARIZATION_MODEL
            )
            speaker_segments = diarize_with_pyannote(
                audio_path=audio_path,
                model_id=diarization_model,
                hf_token=diarization_token,
                speaker_count=self.request.speaker_count,
                min_speakers=self.request.min_speakers,
                max_speakers=self.request.max_speakers,
            )
            result["segments"] = assign_speakers(result.get("segments", []), speaker_segments)
        else:
            result["segments"] = _assign_single_speaker(result.get("segments", []))

        segments = result.get("segments", [])
        if not segments:
            self.writer.persist(job_id, [])
            return
        if not _segments_have_speaker_labels(segments):
            raise RuntimeError(
                "Diarization did not produce speaker labels. Verify Hugging Face token and "
                "pyannote model access."
            )

        sentences = [
            sentence
            for segment in segments
            for sentence in segment_to_sentences(segment)
        ]
        self.writer.persist(job_id, sentences)


def _assign_single_speaker(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for segment in segments:
        segment["speaker"] = segment.get("speaker") or "SPEAKER_00"
        for word in segment.get("words") or []:
            word["speaker"] = word.get("speaker") or "SPEAKER_00"
    return segments


def create_processor(
    connection: sqlite3.Connection, config: AppConfig, audio: dict[str, Any], request: JobCreate
) -> TranscriptProcessor:
    if request.transcription_engine != TRANSCRIPTION_ENGINE:
        raise RuntimeError(f'Unsupported transcription_engine "{request.transcription_engine}"')
    if request.diarization_engine != DIARIZATION_ENGINE:
        raise RuntimeError(f'Unsupported diarization_engine "{request.diarization_engine}"')
    return FasterWhisperProcessor(connection, audio, request, config)


class TranscriptService:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_sentences(self, job_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT ts.*, s.speaker_key, s.display_name AS speaker_display_name
            FROM transcript_sentences ts
            JOIN speakers s ON s.id = ts.speaker_id
            WHERE ts.job_id = ?
            ORDER BY ts.sentence_index
            """,
            (job_id,),
        ).fetchall()
        result = []
        for row in rows:
            sentence = dict(row)
            sentence["words"] = decode_json(sentence.pop("words_json"), None)
            result.append(sentence)
        return result

    def update_sentence(self, sentence_id: str, current_text: str) -> dict[str, Any]:
        now = utc_now()
        with transaction(self.connection):
            cursor = self.connection.execute(
                """
                UPDATE transcript_sentences
                SET current_text = ?, updated_at = ?
                WHERE id = ?
                """,
                (current_text, now, sentence_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Transcript sentence not found")
        row = self.connection.execute(
            """
            SELECT ts.*, s.speaker_key, s.display_name AS speaker_display_name
            FROM transcript_sentences ts
            JOIN speakers s ON s.id = ts.speaker_id
            WHERE ts.id = ?
            """,
            (sentence_id,),
        ).fetchone()
        sentence = dict(row)
        sentence["words"] = decode_json(sentence.pop("words_json"), None)
        return sentence


class SpeakerService:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_speakers(self, job_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM speakers WHERE job_id = ? ORDER BY speaker_key",
            (job_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def update_display_name(self, speaker_id: str, display_name: str) -> dict[str, Any]:
        now = utc_now()
        with transaction(self.connection):
            cursor = self.connection.execute(
                "UPDATE speakers SET display_name = ?, updated_at = ? WHERE id = ?",
                (display_name.strip(), now, speaker_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Speaker not found")
        row = self.connection.execute(
            "SELECT * FROM speakers WHERE id = ?",
            (speaker_id,),
        ).fetchone()
        return dict(row)


class SettingsService:
    DEFAULTS = {
        "transcription_engine": TRANSCRIPTION_ENGINE,
        "transcription_model": DEFAULT_TRANSCRIPTION_MODEL,
        "diarization_engine": DIARIZATION_ENGINE,
        "diarization_model": DEFAULT_DIARIZATION_MODEL,
        "language": None,
        "device": "auto",
        "compute_type": "int8",
        "batch_size": 8,
        "speaker_count": None,
        "min_speakers": None,
        "max_speakers": None,
        "local_models_path": "app_data/models",
    }

    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def get_settings(self) -> dict[str, Any]:
        settings = dict(self.DEFAULTS)
        rows = self.connection.execute("SELECT key, value_json FROM app_settings").fetchall()
        for row in rows:
            settings[row["key"]] = decode_json(row["value_json"], None)
        settings = self._sanitize_loaded_settings(settings)
        return self._redact(settings)

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        sanitized = sanitize_persisted_settings(updates)
        with transaction(self.connection):
            for key, value in sanitized.items():
                self.connection.execute(
                    """
                    INSERT INTO app_settings (key, value_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(value), now),
                )
        return self.get_settings()

    def _redact(self, settings: dict[str, Any]) -> dict[str, Any]:
        return dict(settings)

    def _sanitize_loaded_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(settings)
        if normalized.get("transcription_engine") != TRANSCRIPTION_ENGINE:
            normalized["transcription_engine"] = TRANSCRIPTION_ENGINE
        if normalized.get("diarization_engine") != DIARIZATION_ENGINE:
            normalized["diarization_engine"] = DIARIZATION_ENGINE

        transcription_model = normalized.get("transcription_model")
        if transcription_model not in TRANSCRIPTION_MODEL_IDS:
            normalized["transcription_model"] = DEFAULT_TRANSCRIPTION_MODEL

        diarization_model = normalized.get("diarization_model")
        if diarization_model not in DIARIZATION_MODEL_IDS:
            normalized["diarization_model"] = DEFAULT_DIARIZATION_MODEL
        return normalized


class VttService:
    def __init__(self, transcript_service: TranscriptService) -> None:
        self.transcript_service = transcript_service

    def render(self, job_id: str) -> str:
        cues = ["WEBVTT", ""]
        for sentence in self.transcript_service.list_sentences(job_id):
            start = format_vtt_time(sentence["start_time"])
            end = format_vtt_time(sentence["end_time"])
            cues.append(f"{start} --> {end}")
            text = sentence["current_text"].replace("\n", " ").strip()
            cues.append(f"{sentence['speaker_display_name']}: {text}")
            cues.append("")
        return "\n".join(cues)


def format_vtt_time(seconds: float) -> str:
    milliseconds_total = int(round(seconds * 1000))
    milliseconds = milliseconds_total % 1000
    total_seconds = milliseconds_total // 1000
    secs = total_seconds % 60
    total_minutes = total_seconds // 60
    minutes = total_minutes % 60
    hours = total_minutes // 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"
