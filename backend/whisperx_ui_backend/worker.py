from __future__ import annotations

import argparse
import logging
import os
import threading
import time
from pathlib import Path

from .config import AppConfig
from .database import connect, transaction
from .services import JobProgressReporter, run_job_execution, utc_now


logger = logging.getLogger(__name__)


def _heartbeat_update(stop_event: threading.Event, database_path: Path, job_id: str) -> None:
    while not stop_event.wait(timeout=2.0):
        connection = connect(database_path)
        try:
            with transaction(connection):
                connection.execute(
                    "UPDATE transcription_jobs SET last_heartbeat_at = ? WHERE id = ?",
                    (utc_now(), job_id),
                )
            JobProgressReporter(connection).advance_with_heartbeat(job_id)
        finally:
            connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--app-data", required=True)
    parser.add_argument("--job-id", required=True)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    database_path = Path(args.database)
    app_config = AppConfig(app_data_dir=Path(args.app_data))
    app_config.ensure_directories()
    connection = connect(database_path)
    try:
        with transaction(connection):
            connection.execute(
                """
                UPDATE transcription_jobs
                SET status = 'processing',
                    started_at = COALESCE(started_at, ?),
                    worker_pid = ?,
                    worker_started_at = ?,
                    last_heartbeat_at = ?,
                    worker_exit_code = NULL,
                    worker_signal = NULL
                WHERE id = ? AND status IN ('queued', 'processing')
                """,
                (utc_now(), os.getpid(), utc_now(), utc_now(), args.job_id),
            )
        JobProgressReporter(connection).set_stage(args.job_id, "starting")
    finally:
        connection.close()

    stop_event = threading.Event()
    heartbeat_thread = threading.Thread(
        target=_heartbeat_update, args=(stop_event, database_path, args.job_id), daemon=True
    )
    heartbeat_thread.start()
    try:
        connection = connect(database_path)
        try:
            run_job_execution(connection, app_config, args.job_id)
        finally:
            connection.close()
        return 0
    except Exception as exc:  # pragma: no cover - exercised in integration tests
        logger.exception("Worker execution failed job_id=%s", args.job_id)
        connection = connect(database_path)
        try:
            with transaction(connection):
                connection.execute(
                    """
                    UPDATE transcription_jobs
                    SET status = 'failed', error_message = ?, completed_at = ?
                    WHERE id = ? AND status != 'deleted'
                    """,
                    (str(exc), utc_now(), args.job_id),
                )
            JobProgressReporter(connection).mark_failed(args.job_id, str(exc))
        finally:
            connection.close()
        return 1
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=2.0)
        time.sleep(0.01)


if __name__ == "__main__":
    raise SystemExit(main())
