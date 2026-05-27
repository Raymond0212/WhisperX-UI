#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from whisperx_ui_backend.database import initialize_database  # noqa: E402


TABLE_ORDER = [
    "audio_files",
    "transcription_jobs",
    "speakers",
    "transcript_sentences",
    "app_settings",
    "provider_credentials",
]

COLUMN_NOTES = {
    ("audio_files", "id"): "Primary key",
    ("audio_files", "stored_filename"): "Not null, unique",
    ("audio_files", "deleted_at"): "Nullable soft-delete timestamp",
    ("transcription_jobs", "id"): "Primary key",
    ("transcription_jobs", "audio_file_id"): "Not null, references `audio_files(id)`",
    ("speakers", "id"): "Primary key",
    ("speakers", "job_id"): "Not null, references `transcription_jobs(id)` on delete cascade",
    ("transcript_sentences", "id"): "Primary key",
    ("transcript_sentences", "job_id"): "Not null, references `transcription_jobs(id)` on delete cascade",
    ("transcript_sentences", "speaker_id"): "Not null, references `speakers(id)`",
    ("app_settings", "key"): "Primary key",
    ("provider_credentials", "id"): "Primary key",
    ("provider_credentials", "provider"): "Not null, unique by index",
}


def column_note(table: str, row: sqlite3.Row) -> str:
    explicit = COLUMN_NOTES.get((table, row["name"]))
    if explicit:
        return explicit
    return "Not null" if row["notnull"] else "Nullable"


def emit_table(connection: sqlite3.Connection, table: str) -> list[str]:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    lines = [
        f"### `{table}`",
        "",
        "| Column | Type | Constraints / Notes |",
        "| --- | --- | --- |",
    ]
    for row in rows:
        lines.append(f"| `{row['name']}` | `{row['type']}` | {column_note(table, row)} |")
    if table == "speakers":
        lines.extend(["", "Unique constraint: `(job_id, speaker_key)`."])
    if table == "transcript_sentences":
        lines.extend(["", "Unique constraint: `(job_id, sentence_index)`."])
    return lines


def main() -> None:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    initialize_database(connection)

    lines = [
        "# Generated Database Schema",
        "",
        "This reference is generated from `backend/whisperx_ui_backend/database.py`.",
        "",
        "Regenerate it after schema changes with:",
        "",
        "```bash",
        "python3 scripts/generate-db-schema-doc.py > docs/generated/db-schema.md",
        "```",
        "",
        "## Tables",
        "",
    ]

    for index, table in enumerate(TABLE_ORDER):
        if index:
            lines.append("")
        lines.extend(emit_table(connection, table))

    indexes = connection.execute(
        """
        SELECT name, tbl_name, sql
        FROM sqlite_master
        WHERE type = 'index'
          AND name NOT LIKE 'sqlite_autoindex%'
        ORDER BY name
        """
    ).fetchall()
    lines.extend(
        [
            "",
            "## Indexes",
            "",
            "| Index | Definition |",
            "| --- | --- |",
        ]
    )
    for row in indexes:
        definition = " ".join((row["sql"] or f"`{row['tbl_name']}` auto index").split())
        lines.append(f"| `{row['name']}` | {definition} |")

    print("\n".join(lines))


if __name__ == "__main__":
    main()
