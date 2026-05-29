from __future__ import annotations

import logging
import json
import signal
import subprocess
import sys
import threading
import time
import os
from typing import Protocol
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .config import AppConfig
from .database import connect, transaction
from .services import JobProgressReporter, run_job_execution

logger = logging.getLogger(__name__)
WORKER_HEARTBEAT_TIMEOUT_SECONDS = 30


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class JobQueueService:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._workers: dict[str, WorkerHandle] = {}
        self._inline_execution = os.environ.get("WHISPERX_UI_INLINE_JOB_EXECUTION", "").lower() in {
            "1",
            "true",
            "yes",
        }

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run_loop, name="job-queue", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        for process in self._workers.values():
            if process.poll() is None:
                process.terminate()

    def wake(self) -> None:
        self._wake_event.set()

    def terminate_job(self, job_id: str) -> None:
        process = self._workers.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        self._wake_event.set()

    def _run_loop(self) -> None:
        self._reconcile_stale_processing_jobs()
        while not self._stop_event.is_set():
            self._poll_workers()
            self._terminate_reconciled_workers(self._reconcile_stale_processing_jobs())
            self._start_workers_if_capacity()
            self._wake_event.wait(timeout=1.0)
            self._wake_event.clear()

    def _get_capacity(self, connection) -> int:
        rows = connection.execute("SELECT key, value_json FROM app_settings").fetchall()
        settings = {}
        for row in rows:
            try:
                settings[row["key"]] = json.loads(row["value_json"])
            except Exception:
                settings[row["key"]] = row["value_json"]
        max_parallel_jobs = 1
        if "max_parallel_jobs" in settings:
            try:
                max_parallel_jobs = int(settings["max_parallel_jobs"])
            except ValueError:
                max_parallel_jobs = 1
        max_parallel_jobs = min(4, max(1, max_parallel_jobs))
        return max_parallel_jobs

    def _start_workers_if_capacity(self) -> None:
        connection = connect(self.config.database_path)
        try:
            capacity = self._get_capacity(connection)
            available = max(0, capacity - len([p for p in self._workers.values() if p.poll() is None]))
            if available <= 0:
                return
            job_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
            has_worker_pid = "worker_pid" in job_columns
            order_column = "queued_at" if "queued_at" in job_columns else "created_at"
            if has_worker_pid:
                rows = connection.execute(
                    f"""
                    SELECT id FROM transcription_jobs
                    WHERE status = 'queued' AND worker_pid IS NULL
                    ORDER BY {order_column} ASC, created_at ASC
                    LIMIT ?
                    """,
                    (available,),
                ).fetchall()
            else:
                rows = connection.execute(
                    f"""
                    SELECT id FROM transcription_jobs
                    WHERE status = 'queued'
                    ORDER BY {order_column} ASC, created_at ASC
                    LIMIT ?
                    """,
                    (available,),
                ).fetchall()
            for row in rows:
                self._spawn_worker(str(row["id"]))
        finally:
            connection.close()

    def _spawn_worker(self, job_id: str) -> None:
        if self._inline_execution:
            process = _InlineWorkerProcess(self.config, job_id)
            process.start()
            self._workers[job_id] = process  # type: ignore[assignment]
            return
        log_dir = self.config.logs_dir / "jobs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{job_id}.log"
        log_file = log_path.open("a", encoding="utf-8")
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "whisperx_ui_backend.worker",
                "--database",
                str(self.config.database_path),
                "--app-data",
                str(self.config.app_data_dir),
                "--job-id",
                job_id,
            ],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._workers[job_id] = process
        connection = connect(self.config.database_path)
        try:
            job_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
            if "worker_pid" not in job_columns:
                return
            with transaction(connection):
                connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET worker_pid = ?, worker_started_at = ?, last_heartbeat_at = ?
                    WHERE id = ? AND status = 'queued'
                    """,
                    (process.pid, utc_now(), utc_now(), job_id),
                )
        finally:
            connection.close()

    def _poll_workers(self) -> None:
        done_job_ids: list[str] = []
        for job_id, process in self._workers.items():
            return_code = process.poll()
            if return_code is None:
                continue
            self._handle_worker_exit(job_id, return_code)
            done_job_ids.append(job_id)
        for job_id in done_job_ids:
            self._workers.pop(job_id, None)

    def _terminate_reconciled_workers(self, job_ids: list[str]) -> None:
        for job_id in job_ids:
            process = self._workers.pop(job_id, None)
            if process is None or process.poll() is not None:
                continue
            logger.warning("Terminating unresponsive worker for stale job_id=%s", job_id)
            process.terminate()

    def _handle_worker_exit(self, job_id: str, return_code: int) -> None:
        connection = connect(self.config.database_path)
        try:
            job_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
            row = connection.execute(
                "SELECT status FROM transcription_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            if row is None:
                return
            status = str(row["status"])
            signal_code = -return_code if return_code < 0 else None
            with transaction(connection):
                if "worker_exit_code" in job_columns and "worker_signal" in job_columns:
                    connection.execute(
                        """
                        UPDATE transcription_jobs
                        SET worker_exit_code = ?, worker_signal = ?, completed_at = COALESCE(completed_at, ?)
                        WHERE id = ?
                        """,
                        (return_code, signal_code, utc_now(), job_id),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE transcription_jobs
                        SET completed_at = COALESCE(completed_at, ?)
                        WHERE id = ?
                        """,
                        (utc_now(), job_id),
                    )
                if status in {"completed", "failed", "deleted"}:
                    return
                if signal_code == signal.SIGKILL:
                    error = "Model worker was killed by SIGKILL; likely out of memory."
                elif signal_code:
                    error = f"Model worker exited due to signal {signal_code}."
                else:
                    error = f"Model worker exited unexpectedly with code {return_code}."
                connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET status = 'failed', error_message = ?, completed_at = ?
                    WHERE id = ?
                    """,
                    (error, utc_now(), job_id),
                )
            JobProgressReporter(connection).mark_failed(job_id, error)
        finally:
            connection.close()

    def _reconcile_stale_processing_jobs(self) -> list[str]:
        connection = connect(self.config.database_path)
        stale_before = datetime.now(UTC) - timedelta(seconds=WORKER_HEARTBEAT_TIMEOUT_SECONDS)
        reconciled_job_ids: list[str] = []
        try:
            job_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
            if "last_heartbeat_at" not in job_columns:
                return reconciled_job_ids
            rows = connection.execute(
                """
                SELECT id, last_heartbeat_at
                FROM transcription_jobs
                WHERE status = 'processing'
                """
            ).fetchall()
            for row in rows:
                heartbeat = row["last_heartbeat_at"]
                if not heartbeat:
                    stale = True
                else:
                    try:
                        stale = datetime.fromisoformat(str(heartbeat)) < stale_before
                    except ValueError:
                        stale = True
                if not stale:
                    continue
                job_id = str(row["id"])
                with transaction(connection):
                    result = connection.execute(
                        """
                        UPDATE transcription_jobs
                        SET status = 'failed',
                            error_message = ?,
                            completed_at = ?,
                            worker_exit_code = COALESCE(worker_exit_code, -1)
                        WHERE id = ? AND status = 'processing'
                        """,
                        ("Worker heartbeat lost before completion.", utc_now(), job_id),
                    )
                if result.rowcount:
                    reconciled_job_ids.append(job_id)
                JobProgressReporter(connection).mark_failed(job_id, "Worker heartbeat lost before completion.")
            return reconciled_job_ids
        finally:
            connection.close()


class _InlineWorkerProcess:
    def __init__(self, config: AppConfig, job_id: str) -> None:
        self.config = config
        self.job_id = job_id
        self.pid = os.getpid()
        self._return_code: int | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def poll(self) -> int | None:
        if self._thread.is_alive():
            return None
        return self._return_code

    def terminate(self) -> None:
        self._return_code = -signal.SIGTERM

    def _run(self) -> None:
        connection = connect(self.config.database_path)
        try:
            with transaction(connection):
                result = connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET status = 'processing',
                        started_at = COALESCE(started_at, ?),
                        worker_pid = ?,
                        worker_started_at = ?,
                        last_heartbeat_at = ?
                    WHERE id = ? AND status = 'queued'
                    """,
                    (utc_now(), self.pid, utc_now(), utc_now(), self.job_id),
                )
                if result.rowcount == 0:
                    self._return_code = 0
                    return
            JobProgressReporter(connection).set_stage(self.job_id, "starting")
            run_job_execution(connection, self.config, self.job_id)
            self._return_code = 0
        except Exception as exc:
            with transaction(connection):
                connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET status = 'failed', error_message = ?, completed_at = ?
                    WHERE id = ? AND status != 'deleted'
                    """,
                    (str(exc), utc_now(), self.job_id),
                )
            JobProgressReporter(connection).mark_failed(self.job_id, str(exc))
            self._return_code = 1
        finally:
            connection.close()


class WorkerHandle(Protocol):
    pid: int

    def poll(self) -> int | None:
        ...

    def terminate(self) -> None:
        ...
