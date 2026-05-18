from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


def connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def transaction(connection: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS audio_files (
            id TEXT PRIMARY KEY,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL UNIQUE,
            display_title TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT,
            duration_seconds REAL,
            size_bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS transcription_jobs (
            id TEXT PRIMARY KEY,
            audio_file_id TEXT NOT NULL REFERENCES audio_files(id),
            status TEXT NOT NULL,
            transcription_engine TEXT NOT NULL,
            transcription_model TEXT NOT NULL,
            diarization_engine TEXT NOT NULL,
            diarization_model TEXT NOT NULL,
            language TEXT,
            device TEXT,
            compute_type TEXT,
            batch_size INTEGER,
            speaker_count INTEGER,
            min_speakers INTEGER,
            max_speakers INTEGER,
            settings_json TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS speakers (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
            speaker_key TEXT NOT NULL,
            display_name TEXT NOT NULL,
            sample_start REAL NOT NULL,
            sample_end REAL NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(job_id, speaker_key)
        );

        CREATE TABLE IF NOT EXISTS transcript_sentences (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
            speaker_id TEXT NOT NULL REFERENCES speakers(id),
            sentence_index INTEGER NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            original_text TEXT NOT NULL,
            current_text TEXT NOT NULL,
            confidence REAL,
            words_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(job_id, sentence_index)
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_credentials (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            display_name TEXT,
            encrypted_api_key TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_audio_files_deleted_at ON audio_files(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_audio_file_id ON transcription_jobs(audio_file_id);
        CREATE INDEX IF NOT EXISTS idx_speakers_job_id ON speakers(job_id);
        CREATE INDEX IF NOT EXISTS idx_sentences_job_id_index
            ON transcript_sentences(job_id, sentence_index);
        """
    )
    connection.commit()
