from __future__ import annotations

from datetime import UTC, datetime, timedelta

from whisperx_ui_backend.config import AppConfig
from whisperx_ui_backend.database import connect, initialize_database
from whisperx_ui_backend.job_queue import JobQueueService


def _setup(tmp_path):
    config = AppConfig(app_data_dir=tmp_path / "app_data")
    config.ensure_directories()
    connection = connect(config.database_path)
    initialize_database(connection)
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO audio_files (
            id, original_filename, stored_filename, display_title, file_path, mime_type,
            duration_seconds, size_bytes, created_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            "audio-1",
            "a.wav",
            "a.wav",
            "a",
            str(config.uploads_dir / "a.wav"),
            "audio/wav",
            None,
            1,
            now,
        ),
    )
    connection.commit()
    return config, connection


def test_worker_sigkill_is_recorded_as_failed_with_signal(tmp_path):
    config, connection = _setup(tmp_path)
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO transcription_jobs (
            id, audio_file_id, status, transcription_engine, transcription_model, diarization_engine,
            diarization_model, language, device, compute_type, batch_size, speaker_count, min_speakers,
            max_speakers, settings_json, error_message, created_at, queued_at
        ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        """,
        (
            "job-1",
            "audio-1",
            "faster-whisper",
            "distil-large-v3",
            "huggingface-pyannote",
            "pyannote/speaker-diarization-community-1",
            None,
            "auto",
            "int8",
            8,
            None,
            None,
            None,
            "{}",
            now,
            now,
        ),
    )
    connection.commit()
    connection.close()

    queue = JobQueueService(config)
    queue._handle_worker_exit("job-1", -9)

    verify = connect(config.database_path)
    row = verify.execute("SELECT status, error_message, worker_signal FROM transcription_jobs WHERE id = ?", ("job-1",)).fetchone()
    verify.close()
    assert row["status"] == "failed"
    assert "SIGKILL" in row["error_message"]
    assert row["worker_signal"] == 9


def test_reconcile_stale_processing_job_marks_failed(tmp_path):
    config, connection = _setup(tmp_path)
    stale_time = (datetime.now(UTC) - timedelta(minutes=2)).isoformat()
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO transcription_jobs (
            id, audio_file_id, status, transcription_engine, transcription_model, diarization_engine,
            diarization_model, language, device, compute_type, batch_size, speaker_count, min_speakers,
            max_speakers, settings_json, error_message, created_at, queued_at, last_heartbeat_at
        ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        """,
        (
            "job-2",
            "audio-1",
            "faster-whisper",
            "distil-large-v3",
            "huggingface-pyannote",
            "pyannote/speaker-diarization-community-1",
            None,
            "auto",
            "int8",
            8,
            None,
            None,
            None,
            "{}",
            now,
            now,
            stale_time,
        ),
    )
    connection.commit()
    connection.close()

    queue = JobQueueService(config)
    queue._reconcile_stale_processing_jobs()

    verify = connect(config.database_path)
    row = verify.execute("SELECT status, error_message FROM transcription_jobs WHERE id = ?", ("job-2",)).fetchone()
    verify.close()
    assert row["status"] == "failed"
    assert "heartbeat" in row["error_message"].lower()


def test_stale_active_worker_is_terminated_and_unregistered(tmp_path):
    config, connection = _setup(tmp_path)
    stale_time = (datetime.now(UTC) - timedelta(minutes=2)).isoformat()
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO transcription_jobs (
            id, audio_file_id, status, transcription_engine, transcription_model, diarization_engine,
            diarization_model, language, device, compute_type, batch_size, speaker_count, min_speakers,
            max_speakers, settings_json, error_message, created_at, queued_at, last_heartbeat_at
        ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        """,
        (
            "job-3",
            "audio-1",
            "faster-whisper",
            "distil-large-v3",
            "huggingface-pyannote",
            "pyannote/speaker-diarization-community-1",
            None,
            "auto",
            "int8",
            8,
            None,
            None,
            None,
            "{}",
            now,
            now,
            stale_time,
        ),
    )
    connection.commit()
    connection.close()

    class HungWorker:
        pid = 12345

        def __init__(self):
            self.terminated = False

        def poll(self):
            return None

        def terminate(self):
            self.terminated = True

    worker = HungWorker()
    queue = JobQueueService(config)
    queue._workers["job-3"] = worker

    reconciled_job_ids = queue._reconcile_stale_processing_jobs()
    queue._terminate_reconciled_workers(reconciled_job_ids)

    verify = connect(config.database_path)
    row = verify.execute("SELECT status, error_message FROM transcription_jobs WHERE id = ?", ("job-3",)).fetchone()
    verify.close()
    assert row["status"] == "failed"
    assert "heartbeat" in row["error_message"].lower()
    assert worker.terminated is True
    assert "job-3" not in queue._workers
