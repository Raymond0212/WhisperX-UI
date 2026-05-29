from __future__ import annotations

from datetime import UTC, datetime

from whisperx_ui_backend.database import connect, initialize_database
from whisperx_ui_backend.services import DatabaseTranscriptWriter, ProcessorSentence


def _setup_job(tmp_path):
    db_path = tmp_path / "database.sqlite"
    connection = connect(db_path)
    initialize_database(connection)
    now = datetime.now(UTC).isoformat()
    connection.execute(
        """
        INSERT INTO audio_files (
            id, original_filename, stored_filename, display_title, file_path, mime_type,
            duration_seconds, size_bytes, created_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        ("audio-1", "a.wav", "a.wav", "a", str(tmp_path / "a.wav"), "audio/wav", None, 1, now),
    )
    connection.execute(
        """
        INSERT INTO transcription_jobs (
            id, audio_file_id, status, transcription_engine, transcription_model,
            diarization_engine, diarization_model, language, device, compute_type,
            batch_size, speaker_count, min_speakers, max_speakers, settings_json,
            error_message, created_at
        ) VALUES (?, ?, 'processing', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
        """,
        (
            "job-1",
            "audio-1",
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
    connection.commit()
    return connection


def test_persist_uses_longest_sentence_as_speaker_sample(tmp_path):
    connection = _setup_job(tmp_path)

    DatabaseTranscriptWriter(connection).persist(
        "job-1",
        [
            ProcessorSentence("SPEAKER_00", 0.0, 1.0, "Short first."),
            ProcessorSentence("SPEAKER_00", 2.0, 8.0, "Longer second."),
            ProcessorSentence("SPEAKER_01", 10.0, 12.0, "Other speaker."),
        ],
    )

    rows = {
        row["speaker_key"]: row
        for row in connection.execute(
            "SELECT speaker_key, sample_start, sample_end FROM speakers ORDER BY speaker_key"
        ).fetchall()
    }
    assert rows["SPEAKER_00"]["sample_start"] == 2.0
    assert rows["SPEAKER_00"]["sample_end"] == 8.0
    assert rows["SPEAKER_01"]["sample_start"] == 10.0
    assert rows["SPEAKER_01"]["sample_end"] == 12.0


def test_persist_longest_sample_tie_keeps_earliest_sentence(tmp_path):
    connection = _setup_job(tmp_path)

    DatabaseTranscriptWriter(connection).persist(
        "job-1",
        [
            ProcessorSentence("SPEAKER_00", 0.0, 4.0, "First long."),
            ProcessorSentence("SPEAKER_00", 8.0, 12.0, "Second same length."),
        ],
    )

    row = connection.execute(
        "SELECT sample_start, sample_end FROM speakers WHERE speaker_key = ?",
        ("SPEAKER_00",),
    ).fetchone()
    assert row["sample_start"] == 0.0
    assert row["sample_end"] == 4.0
