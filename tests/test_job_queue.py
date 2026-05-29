from __future__ import annotations

from datetime import UTC, datetime, timedelta

from whisperx_ui_backend.config import AppConfig
from whisperx_ui_backend.database import connect, initialize_database
from whisperx_ui_backend import job_queue
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


def test_targeted_termination_holds_capacity_until_worker_exits(tmp_path):
    config, connection = _setup(tmp_path)
    now = datetime.now(UTC).isoformat()
    for job_id, status in (("job-active", "processing"), ("job-next", "queued")):
        connection.execute(
            """
            INSERT INTO transcription_jobs (
                id, audio_file_id, status, transcription_engine, transcription_model, diarization_engine,
                diarization_model, language, device, compute_type, batch_size, speaker_count, min_speakers,
                max_speakers, settings_json, error_message, created_at, queued_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                job_id,
                "audio-1",
                status,
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

    class Worker:
        pid = 12345

        def __init__(self):
            self.terminated = False
            self.return_code = None

        def poll(self):
            return self.return_code

        def terminate(self):
            self.terminated = True

    class RecordingQueue(JobQueueService):
        def __init__(self, config):
            super().__init__(config)
            self.spawned_job_ids = []

        def _spawn_worker(self, job_id: str) -> None:
            self.spawned_job_ids.append(job_id)

    worker = Worker()
    queue = RecordingQueue(config)
    queue._workers["job-active"] = worker

    queue.terminate_job("job-active")
    queue._start_workers_if_capacity()

    assert worker.terminated is True
    assert queue.spawned_job_ids == []

    worker.return_code = -15
    queue._poll_workers()
    queue._start_workers_if_capacity()

    assert "job-active" not in queue._workers
    assert queue.spawned_job_ids == ["job-next"]


def test_worker_command_uses_python_module_in_source_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(job_queue.sys, "executable", "/python")
    monkeypatch.delattr(job_queue.sys, "frozen", raising=False)

    command = job_queue.worker_command(tmp_path / "db.sqlite", tmp_path / "app_data", "job-1")

    assert command[:3] == ["/python", "-m", "whisperx_ui_backend.worker"]
    assert command[-2:] == ["--job-id", "job-1"]


def test_worker_command_uses_bundle_worker_dispatch_when_frozen(tmp_path, monkeypatch):
    monkeypatch.setattr(job_queue.sys, "executable", "/dist/whisperx-ui/whisperx-ui")
    monkeypatch.setattr(job_queue.sys, "frozen", True, raising=False)

    command = job_queue.worker_command(tmp_path / "db.sqlite", tmp_path / "app_data", "job-1")

    assert command[:2] == ["/dist/whisperx-ui/whisperx-ui", "worker"]
    assert "-m" not in command
    assert "whisperx_ui_backend.worker" not in command
    assert command[-2:] == ["--job-id", "job-1"]
