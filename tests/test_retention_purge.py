from __future__ import annotations

import importlib
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from whisperx_ui_backend.config import AppConfig
from whisperx_ui_backend.database import connect, initialize_database
from whisperx_ui_backend.services import AudioService


def _utc_age(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).isoformat()


def _setup(tmp_path):
    config = AppConfig(app_data_dir=tmp_path / "app_data")
    config.ensure_directories()
    connection = connect(config.database_path)
    initialize_database(connection)
    return config, connection


def _insert_audio(
    connection: sqlite3.Connection,
    config: AppConfig,
    *,
    audio_id: str,
    stored_filename: str,
    deleted_at: str | None,
    file_path: Path | None = None,
) -> Path:
    path = file_path or config.uploads_dir / stored_filename
    if path.parent == config.uploads_dir:
        path.write_bytes(b"audio")
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO audio_files (
            id, original_filename, stored_filename, display_title, file_path, mime_type,
            duration_seconds, size_bytes, created_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            audio_id,
            stored_filename,
            stored_filename,
            stored_filename,
            str(path),
            "audio/wav",
            None,
            5,
            now,
            deleted_at,
        ),
    )
    connection.commit()
    return path


def _insert_job_graph(connection: sqlite3.Connection, audio_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO transcription_jobs (
            id, audio_file_id, status, transcription_engine, transcription_model,
            diarization_engine, diarization_model, language, device, compute_type,
            batch_size, speaker_count, min_speakers, max_speakers, settings_json,
            error_message, created_at
        ) VALUES (?, ?, 'deleted', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
        """,
        (
            f"job-{audio_id}",
            audio_id,
            "faster-whisper",
            "distil-large-v3",
            "huggingface-pyannote",
            "pyannote/speaker-diarization-community-1",
            "cpu",
            "int8",
            8,
            "{}",
            now,
        ),
    )
    connection.execute(
        """
        INSERT INTO speakers (
            id, job_id, speaker_key, display_name, sample_start, sample_end, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (f"speaker-{audio_id}", f"job-{audio_id}", "SPEAKER_00", "SPEAKER_00", 0.0, 1.0, now, now),
    )
    connection.execute(
        """
        INSERT INTO transcript_sentences (
            id, job_id, speaker_id, sentence_index, start_time, end_time,
            original_text, current_text, confidence, words_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        """,
        (
            f"sentence-{audio_id}",
            f"job-{audio_id}",
            f"speaker-{audio_id}",
            0,
            0.0,
            1.0,
            "Hello.",
            "Hello.",
            now,
            now,
        ),
    )
    connection.commit()


def test_delete_audio_hides_item_marks_jobs_deleted_and_retains_file_until_purge(tmp_path, monkeypatch):
    monkeypatch.setenv("WHISPERX_UI_APP_DATA", str(tmp_path / "app_data"))
    monkeypatch.setenv("WHISPERX_UI_INLINE_JOB_EXECUTION", "1")
    app_module = importlib.import_module("whisperx_ui_backend.app")

    with TestClient(app_module.app) as client:
        upload_response = client.post(
            "/api/audio",
            files={"file": ("meeting.wav", b"fake audio bytes", "audio/wav")},
            data={"display_title": "Team Meeting"},
        )
        assert upload_response.status_code == 200, upload_response.text
        audio = upload_response.json()
        audio_row = client.app.state.connection.execute(
            "SELECT file_path FROM audio_files WHERE id = ?",
            (audio["id"],),
        ).fetchone()
        stored_path = Path(audio_row["file_path"])
        now = datetime.now(UTC).isoformat()
        client.app.state.connection.execute(
            """
            INSERT INTO transcription_jobs (
                id, audio_file_id, status, transcription_engine, transcription_model,
                diarization_engine, diarization_model, language, device, compute_type,
                batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                error_message, created_at
            ) VALUES (?, ?, 'completed', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
            """,
            (
                "job-delete-check",
                audio["id"],
                "faster-whisper",
                "distil-large-v3",
                "huggingface-pyannote",
                "pyannote/speaker-diarization-community-1",
                "cpu",
                "int8",
                8,
                "{}",
                now,
            ),
        )
        client.app.state.connection.commit()

        delete_response = client.delete(f"/api/audio/{audio['id']}")
        assert delete_response.status_code == 204
        assert stored_path.exists()
        assert audio["id"] not in {item["id"] for item in client.get("/api/audio").json()}
        assert client.get(f"/api/audio/{audio['id']}").status_code == 404
        assert client.patch(f"/api/audio/{audio['id']}", json={"display_title": "New"}).status_code == 404
        assert client.get(f"/api/audio/{audio['id']}/stream").status_code == 404
        assert client.delete(f"/api/audio/{audio['id']}").status_code == 404

        row = client.app.state.connection.execute(
            "SELECT status FROM transcription_jobs WHERE id = ?",
            ("job-delete-check",),
        ).fetchone()
        assert row["status"] == "deleted"


def test_delete_audio_terminates_related_active_jobs(tmp_path, monkeypatch):
    monkeypatch.setenv("WHISPERX_UI_APP_DATA", str(tmp_path / "app_data"))
    monkeypatch.setenv("WHISPERX_UI_INLINE_JOB_EXECUTION", "1")
    app_module = importlib.import_module("whisperx_ui_backend.app")

    terminated_job_ids = []

    with TestClient(app_module.app) as client:
        monkeypatch.setattr(
            client.app.state.job_queue,
            "terminate_job",
            lambda job_id: terminated_job_ids.append(job_id),
        )
        upload_response = client.post(
            "/api/audio",
            files={"file": ("meeting.wav", b"fake audio bytes", "audio/wav")},
            data={"display_title": "Team Meeting"},
        )
        assert upload_response.status_code == 200, upload_response.text
        audio = upload_response.json()
        now = datetime.now(UTC).isoformat()
        for job_id, status in (("job-active", "processing"), ("job-complete", "completed")):
            client.app.state.connection.execute(
                """
                INSERT INTO transcription_jobs (
                    id, audio_file_id, status, transcription_engine, transcription_model,
                    diarization_engine, diarization_model, language, device, compute_type,
                    batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                    error_message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
                """,
                (
                    job_id,
                    audio["id"],
                    status,
                    "faster-whisper",
                    "distil-large-v3",
                    "huggingface-pyannote",
                    "pyannote/speaker-diarization-community-1",
                    "cpu",
                    "int8",
                    8,
                    "{}",
                    now,
                ),
            )
        client.app.state.connection.commit()

        delete_response = client.delete(f"/api/audio/{audio['id']}")

        assert delete_response.status_code == 204
        assert terminated_job_ids == ["job-active", "job-complete"]


def test_daily_retention_purge_waits_until_next_local_midnight():
    app_module = importlib.import_module("whisperx_ui_backend.app")

    wait_seconds = app_module.seconds_until_next_local_midnight(
        datetime(2026, 5, 29, 23, 30, 0, tzinfo=UTC)
    )

    assert wait_seconds == 30 * 60


def test_purge_deleted_audio_older_than_retention_removes_rows_and_upload_file(tmp_path):
    config, connection = _setup(tmp_path)
    path = _insert_audio(
        connection,
        config,
        audio_id="audio-old",
        stored_filename="old.wav",
        deleted_at=_utc_age(31),
    )
    _insert_job_graph(connection, "audio-old")
    log_path = config.logs_dir / "jobs" / "job-audio-old.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("job log", encoding="utf-8")

    purged = AudioService(connection, config).purge_deleted_older_than(retention_days=30)

    assert purged == 1
    assert not path.exists()
    assert not log_path.exists()
    for table in ("audio_files", "transcription_jobs", "speakers", "transcript_sentences"):
        count = connection.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"]
        assert count == 0


def test_purge_keeps_non_expired_deleted_audio_and_active_old_audio(tmp_path):
    config, connection = _setup(tmp_path)
    recent_path = _insert_audio(
        connection,
        config,
        audio_id="audio-recent",
        stored_filename="recent.wav",
        deleted_at=_utc_age(3),
    )
    active_path = _insert_audio(
        connection,
        config,
        audio_id="audio-active",
        stored_filename="active.wav",
        deleted_at=None,
    )

    purged = AudioService(connection, config).purge_deleted_older_than(retention_days=30)

    assert purged == 0
    assert recent_path.exists()
    assert active_path.exists()
    audio_ids = {
        row["id"] for row in connection.execute("SELECT id FROM audio_files ORDER BY id").fetchall()
    }
    assert audio_ids == {"audio-active", "audio-recent"}


def test_purge_does_not_remove_files_outside_uploads_directory(tmp_path):
    config, connection = _setup(tmp_path)
    outside_path = tmp_path / "outside.wav"
    outside_path.write_bytes(b"keep me")
    _insert_audio(
        connection,
        config,
        audio_id="audio-outside",
        stored_filename="missing-inside.wav",
        deleted_at=_utc_age(31),
        file_path=outside_path,
    )

    purged = AudioService(connection, config).purge_deleted_older_than(retention_days=30)

    assert purged == 1
    assert outside_path.exists()
    assert connection.execute("SELECT COUNT(*) AS count FROM audio_files").fetchone()["count"] == 0
