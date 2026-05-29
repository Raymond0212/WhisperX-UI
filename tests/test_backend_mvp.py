from __future__ import annotations

import importlib
import sqlite3
import sys
import time
import types
import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient


def _upload_audio(client: TestClient) -> dict:
    response = client.post(
        "/api/audio",
        files={"file": ("meeting.wav", b"fake audio bytes", "audio/wav")},
        data={"display_title": "Team Meeting"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("WHISPERX_UI_APP_DATA", str(tmp_path / "app_data"))
    monkeypatch.setenv("WHISPERX_UI_INLINE_JOB_EXECUTION", "1")
    app_module = importlib.import_module("whisperx_ui_backend.app")
    return TestClient(app_module.app)


def _wait_for_terminal_job(client: TestClient, job_id: str, timeout_seconds: float = 5.0) -> dict:
    deadline = time.time() + timeout_seconds
    while True:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in {"completed", "failed", "deleted"}:
            return job
        if time.time() >= deadline:
            raise AssertionError(f"Timed out waiting for terminal job status: {job}")
        time.sleep(0.05)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def test_model_options_exposes_phase2_registry_and_defaults(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/model-options")
        assert response.status_code == 200
        payload = response.json()
        assert payload["defaults"]["transcription_engine"] == "faster-whisper"
        assert payload["defaults"]["transcription_model"] == "distil-large-v3"
        assert payload["defaults"]["diarization_engine"] == "huggingface-pyannote"
        assert payload["defaults"]["diarization_model"] == "pyannote/speaker-diarization-community-1"
        assert set(payload.keys()) == {"transcription_models", "diarization_models", "defaults"}
        transcription_ids = [item["id"] for item in payload["transcription_models"]]
        assert transcription_ids == [
            "tiny",
            "tiny.en",
            "base",
            "base.en",
            "small",
            "small.en",
            "distil-small.en",
            "medium",
            "medium.en",
            "distil-medium.en",
            "large-v1",
            "large-v2",
            "large-v3",
            "large",
            "distil-large-v2",
            "distil-large-v3",
            "large-v3-turbo",
            "turbo",
        ]
        assert "whisperx-small" not in transcription_ids
        assert "none" not in transcription_ids
        assert payload["diarization_models"] == [
            {
                "id": "pyannote/speaker-diarization-community-1",
                "label": "Pyannote Speaker Diarization Community-1",
                "requires_token": True,
            }
        ]


def test_prepare_basic_downloads_default_model_to_local_models_dir(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    calls = {}

    def fake_download_hf_snapshot(*, repo_id, local_dir, cache_dir, token):
        calls["repo_id"] = repo_id
        calls["local_dir"] = local_dir
        calls["cache_dir"] = cache_dir
        calls["token"] = token
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / "model.bin").write_bytes(b"fake model")
        return str(local_dir)

    monkeypatch.setattr(services_module, "download_hf_snapshot", fake_download_hf_snapshot)

    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "distil-large-v3", "hf_token": "secret"},
        )
        assert response.status_code == 200, response.text
        prepared = response.json()
        assert prepared["ready"] is True
        assert prepared["models"][0]["key"] == "distil-large-v3"
        assert prepared["models"][0]["downloaded"] is True
        assert calls["repo_id"] == "Systran/faster-distil-whisper-large-v3"
        assert calls["token"] == "secret"
        assert calls["cache_dir"].name == ".hf-cache"


def test_prepare_basic_is_idempotent_and_rejects_invalid_profile(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    calls = {"count": 0}

    def fake_download_hf_snapshot(*, repo_id, local_dir, cache_dir, token):
        calls["count"] += 1
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / "model.bin").write_bytes(b"fake model")
        return str(local_dir)

    monkeypatch.setattr(services_module, "download_hf_snapshot", fake_download_hf_snapshot)
    with _client(tmp_path, monkeypatch) as client:
        first = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "distil-large-v3"},
        )
        assert first.status_code == 200
        second = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "distil-large-v3"},
        )
        assert second.status_code == 200
        assert calls["count"] == 1

        bad_profile = client.post(
            "/api/models/prepare-basic",
            json={"profile": "full", "transcription_model": "distil-large-v3"},
        )
        assert bad_profile.status_code == 400
        assert "Only the basic model profile is supported" in bad_profile.text

        bad_model = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "not-a-model"},
        )
        assert bad_model.status_code == 400
        assert "Unsupported basic transcription model" in bad_model.text


def test_prepare_basic_propagates_download_failure(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")

    def failing_download(*, repo_id, local_dir, cache_dir, token):
        raise RuntimeError("download failed")

    monkeypatch.setattr(services_module, "download_hf_snapshot", failing_download)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "distil-large-v3"},
        )
        assert response.status_code == 500
        assert response.json()["detail"] == "download failed"


def test_vtt_service_renders_sentence_and_speaker_turn_exports():
    services_module = importlib.import_module("whisperx_ui_backend.services")
    sentences = [
        {
            "speaker_id": "speaker-a",
            "speaker_display_name": "Alice",
            "start_time": 0.0,
            "end_time": 1.5,
            "current_text": "Hello\nthere.",
        },
        {
            "speaker_id": "speaker-a",
            "speaker_display_name": "Alice",
            "start_time": 1.5,
            "end_time": 3.0,
            "current_text": "Still Alice.",
        },
        {
            "speaker_id": "speaker-b",
            "speaker_display_name": "Bob",
            "start_time": 3.0,
            "end_time": 4.0,
            "current_text": "Reply.",
        },
    ]

    class FakeTranscriptService:
        def list_sentences(self, job_id: str) -> list[dict]:
            assert job_id == "job-1"
            return sentences

    service = services_module.VttService(FakeTranscriptService())

    sentence_vtt = service.render("job-1", "sentences")
    assert "00:00:00.000 --> 00:00:01.500\nAlice: Hello there." in sentence_vtt
    assert "00:00:01.500 --> 00:00:03.000\nAlice: Still Alice." in sentence_vtt

    speaker_turn_vtt = service.render("job-1", "speaker-turns")
    assert "00:00:00.000 --> 00:00:03.000\nAlice: Hello there. Still Alice." in speaker_turn_vtt
    assert "00:00:03.000 --> 00:00:04.000\nBob: Reply." in speaker_turn_vtt
    assert "00:00:01.500 --> 00:00:03.000\nAlice: Still Alice." not in speaker_turn_vtt


def test_job_create_uses_phase2_engine_fields(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")

    class FakeProcessor:
        def run(self, job_id: str) -> None:
            raise RuntimeError("expected test failure")

    monkeypatch.setattr(
        services_module,
        "create_processor",
        lambda connection, config, audio, request: FakeProcessor(),
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post(
            "/api/jobs",
            json={
                "audio_file_id": audio["id"],
                "transcription_engine": "faster-whisper",
                "transcription_model": "distil-large-v3",
                "diarization_engine": "huggingface-pyannote",
                "diarization_model": "pyannote/speaker-diarization-community-1",
            },
        )
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        assert job["progress_stage"] in {"queued", "starting", "preparing_transcription", "transcribing"}
        assert isinstance(job["progress_percent"], (float, int))
        assert job["progress_message"]
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "failed"
        assert job["progress_stage"] == "failed"
        assert job["progress_message"]
        assert job["transcription_engine"] == "faster-whisper"
        assert job["diarization_engine"] == "huggingface-pyannote"
        assert job["settings"]["transcription_model"] == "distil-large-v3"


def test_list_audio_jobs_excludes_deleted_rows(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        active_job_id = str(uuid.uuid4())
        deleted_job_id = str(uuid.uuid4())
        now = _utc_now()
        connection = client.app.state.connection
        connection.execute(
            """
            INSERT INTO transcription_jobs (
                id, audio_file_id, status, transcription_engine, transcription_model,
                diarization_engine, diarization_model, language, device, compute_type,
                batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                error_message, created_at
            )
            VALUES (?, ?, 'completed', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
            """,
            (
                active_job_id,
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
        connection.execute(
            """
            INSERT INTO transcription_jobs (
                id, audio_file_id, status, transcription_engine, transcription_model,
                diarization_engine, diarization_model, language, device, compute_type,
                batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                error_message, created_at
            )
            VALUES (?, ?, 'deleted', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)
            """,
            (
                deleted_job_id,
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
        connection.commit()

        response = client.get(f"/api/audio/{audio['id']}/jobs")
        assert response.status_code == 200, response.text
        jobs = response.json()
        job_ids = {job["id"] for job in jobs}
        assert active_job_id in job_ids
        assert deleted_job_id not in job_ids


def test_settings_default_to_phase2_contract(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        settings = client.get("/api/settings").json()
        assert settings["transcription_engine"] == "faster-whisper"
        assert settings["transcription_model"] == "distil-large-v3"
        assert settings["diarization_engine"] == "huggingface-pyannote"
        assert settings["diarization_model"] == "pyannote/speaker-diarization-community-1"
        assert settings["hf_token_stored"] is False


def test_hf_token_write_only_endpoint_stores_encrypted_secret(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        save_response = client.post("/api/secrets/hf-token", json={"hf_token": "hf-secret-token"})
        assert save_response.status_code == 204

        # Endpoint is write-only; no read API should expose the raw token.
        read_response = client.get("/api/secrets/hf-token")
        assert read_response.status_code == 405

        settings = client.get("/api/settings").json()
        assert "hf_token" not in settings
        assert "diarization_token" not in settings
        assert settings["hf_token_stored"] is True

    db_path = tmp_path / "app_data" / "database.sqlite"
    connection = sqlite3.connect(db_path)
    row = connection.execute(
        "SELECT encrypted_api_key FROM provider_credentials WHERE provider = ?",
        ("huggingface",),
    ).fetchone()
    connection.close()
    assert row is not None
    assert row[0] != "hf-secret-token"


def test_job_uses_stored_hf_token_when_request_omits_token(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    diarize_calls: dict[str, str] = {}

    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Hello team.",
                    "words": [
                        {"word": "Hello", "start": 0.0, "end": 0.7},
                        {"word": "team.", "start": 1.0, "end": 1.8},
                    ],
                }
            ]
        },
    )

    def fake_diarize_with_pyannote(**kwargs):
        diarize_calls["hf_token"] = kwargs["hf_token"]
        return [{"start": 0.0, "end": 2.0, "speaker": "SPEAKER_03"}]

    monkeypatch.setattr(services_module, "diarize_with_pyannote", fake_diarize_with_pyannote)

    with _client(tmp_path, monkeypatch) as client:
        save_response = client.post("/api/secrets/hf-token", json={"hf_token": "hf-saved-token"})
        assert save_response.status_code == 204

        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        assert job["progress_stage"] in {"queued", "starting", "preparing_transcription", "transcribing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "completed"
        assert job["progress_stage"] == "completed"
        assert float(job["progress_percent"]) == 100.0

    assert diarize_calls["hf_token"] == "hf-saved-token"


def test_prepare_basic_uses_stored_hf_token_when_request_omits_token(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    calls: dict[str, str | None] = {}

    def fake_download_hf_snapshot(*, repo_id, local_dir, cache_dir, token):
        calls["token"] = token
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / "model.bin").write_bytes(b"fake model")
        return str(local_dir)

    monkeypatch.setattr(services_module, "download_hf_snapshot", fake_download_hf_snapshot)

    with _client(tmp_path, monkeypatch) as client:
        save_response = client.post("/api/secrets/hf-token", json={"hf_token": "hf-stored-for-model"})
        assert save_response.status_code == 204

        response = client.post(
            "/api/models/prepare-basic",
            json={"profile": "basic", "transcription_model": "distil-large-v3"},
        )
        assert response.status_code == 200, response.text
        assert calls["token"] == "hf-stored-for-model"


def test_zero_config_processing_completes_without_hf_token(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")

    def fake_transcribe_with_faster_whisper(**kwargs):
        return {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Hello team.",
                    "words": [{"word": "Hello", "start": 0.0, "end": 0.8}],
                }
            ]
        }

    def fail_diarization(**kwargs):
        raise AssertionError("Diarization should not run for zero-config tokenless path")

    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        fake_transcribe_with_faster_whisper,
    )
    monkeypatch.setattr(services_module, "diarize_with_pyannote", fail_diarization)

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "completed"
        transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
        assert transcript[0]["speaker_key"] == "SPEAKER_00"
        assert transcript[0]["speaker_display_name"] == "SPEAKER_00"


def test_vtt_export_filename_uses_edited_audio_title_and_job_id(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "text": "Hello team.",
                    "words": [{"word": "Hello", "start": 0.0, "end": 0.6}],
                }
            ]
        },
    )
    monkeypatch.setattr(
        services_module,
        "diarize_with_pyannote",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("tokenless path should skip diarization")),
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        rename = client.patch(
            f"/api/audio/{audio['id']}",
            json={"display_title": "My Edited Transcript / v2"},
        )
        assert rename.status_code == 200, rename.text

        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = _wait_for_terminal_job(client, response.json()["id"])
        assert job["status"] == "completed"

        export_response = client.get(f"/api/jobs/{job['id']}/export.vtt?view=sentences")
        assert export_response.status_code == 200, export_response.text
        assert (
            export_response.headers["content-disposition"]
            == f'attachment; filename="My-Edited-Transcript-v2-{job["id"]}-sentences.vtt"'
        )


def test_job_batch_size_is_passed_to_faster_whisper(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    transcribe_calls: dict = {}

    def fake_transcribe_with_faster_whisper(**kwargs):
        transcribe_calls.update(kwargs)
        return {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Hello team.",
                    "words": [{"word": "Hello", "start": 0.0, "end": 0.8}],
                }
            ]
        }

    monkeypatch.setattr(services_module, "transcribe_with_faster_whisper", fake_transcribe_with_faster_whisper)

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"], "batch_size": 16})
        assert response.status_code == 200, response.text
        job = _wait_for_terminal_job(client, response.json()["id"])
        assert job["status"] == "completed"

    assert transcribe_calls["batch_size"] == 16


def test_zero_config_silent_audio_completes_with_empty_transcript(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {"segments": []},
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "completed"
        transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
        speakers = client.get(f"/api/jobs/{job['id']}/speakers").json()
        assert transcript == []
        assert speakers == []


def test_job_run_invokes_final_runtime_memory_cleanup(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    cleanup_steps: list[str] = []

    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {"segments": [{"start": 0.0, "end": 1.0, "text": "Hello world."}]},
    )
    monkeypatch.setattr(
        services_module,
        "_cleanup_runtime_memory",
        lambda step: cleanup_steps.append(step),
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "completed"

    assert cleanup_steps == ["processor_finalize"]


def test_token_enabled_diarization_success_assigns_speaker_labels(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")

    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Hello team.",
                    "words": [
                        {"word": "Hello", "start": 0.0, "end": 0.7},
                        {"word": "team.", "start": 1.0, "end": 1.8},
                    ],
                }
            ]
        },
    )
    monkeypatch.setattr(
        services_module,
        "diarize_with_pyannote",
        lambda **kwargs: [{"start": 0.0, "end": 2.0, "speaker": "SPEAKER_03"}],
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post(
            "/api/jobs",
            json={"audio_file_id": audio["id"], "settings": {"diarization_token": "hf-token"}},
        )
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "completed"
        transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
        assert transcript[0]["speaker_key"] == "SPEAKER_03"
        assert [word["speaker"] for word in transcript[0]["words"]] == ["SPEAKER_03", "SPEAKER_03"]


def test_segment_to_sentences_assigns_speaker_per_sentence_from_word_overlaps():
    services_module = importlib.import_module("whisperx_ui_backend.services")
    sentences = services_module.segment_to_sentences(
        {
            "start": 0.0,
            "end": 4.0,
            "text": "Hello there. General Kenobi.",
            "speaker": "SPEAKER_99",
            "words": [
                {"word": "Hello", "start": 0.0, "end": 0.4, "speaker": "SPEAKER_01"},
                {"word": "there.", "start": 0.5, "end": 1.1, "speaker": "SPEAKER_01"},
                {"word": "General", "start": 2.0, "end": 2.6, "speaker": "SPEAKER_02"},
                {"word": "Kenobi.", "start": 2.7, "end": 3.6, "speaker": "SPEAKER_02"},
            ],
        }
    )
    assert [sentence.text for sentence in sentences] == ["Hello there.", "General Kenobi."]
    assert [sentence.speaker_key for sentence in sentences] == ["SPEAKER_01", "SPEAKER_02"]


def test_segment_to_sentences_splits_mixed_speaker_sentence_without_flattening():
    services_module = importlib.import_module("whisperx_ui_backend.services")
    sentences = services_module.segment_to_sentences(
        {
            "start": 0.0,
            "end": 5.0,
            "text": "A one. B two. A three. B four.",
            "words": [
                {"word": "A", "start": 0.0, "end": 0.2, "speaker": "SPEAKER_A"},
                {"word": "one.", "start": 0.2, "end": 0.8, "speaker": "SPEAKER_A"},
                {"word": "B", "start": 0.9, "end": 1.1, "speaker": "SPEAKER_B"},
                {"word": "two.", "start": 1.1, "end": 1.5, "speaker": "SPEAKER_B"},
                {"word": "A", "start": 1.6, "end": 1.8, "speaker": "SPEAKER_A"},
                {"word": "three.", "start": 1.8, "end": 2.4, "speaker": "SPEAKER_A"},
                {"word": "B", "start": 2.5, "end": 2.7, "speaker": "SPEAKER_B"},
                {"word": "four.", "start": 2.7, "end": 3.3, "speaker": "SPEAKER_B"},
            ],
        }
    )
    assert [row.speaker_key for row in sentences] == [
        "SPEAKER_A",
        "SPEAKER_B",
        "SPEAKER_A",
        "SPEAKER_B",
    ]


def test_assign_speakers_handles_rapid_abab_turns_within_single_segment():
    assignment_module = importlib.import_module("whisperx_ui_backend.processors.speaker_assignment")
    segments = [
        {
            "start": 0.0,
            "end": 2.0,
            "text": "a b a b",
            "words": [
                {"word": "a", "start": 0.0, "end": 0.4},
                {"word": "b", "start": 0.45, "end": 0.8},
                {"word": "a", "start": 0.85, "end": 1.2},
                {"word": "b", "start": 1.25, "end": 1.6},
            ],
        }
    ]
    intervals = [
        {"start": 0.0, "end": 0.5, "speaker": "A"},
        {"start": 0.5, "end": 0.9, "speaker": "B"},
        {"start": 0.9, "end": 1.3, "speaker": "A"},
        {"start": 1.3, "end": 1.8, "speaker": "B"},
    ]
    result = assignment_module.assign_speakers(segments, intervals)
    assert [word["speaker"] for word in result[0]["words"]] == ["A", "B", "A", "B"]


def test_assign_speakers_handles_gap_and_tie_deterministically():
    assignment_module = importlib.import_module("whisperx_ui_backend.processors.speaker_assignment")
    segments = [
        {
            "start": 0.0,
            "end": 2.0,
            "text": "word1 word2",
            "words": [
                {"word": "word1", "start": 0.49, "end": 0.51},
                {"word": "word2", "start": 1.90, "end": 1.95},
            ],
        }
    ]
    intervals = [
        {"start": 0.0, "end": 0.5, "speaker": "A"},
        {"start": 0.5, "end": 1.0, "speaker": "B"},
    ]
    result = assignment_module.assign_speakers(segments, intervals)
    # tie at boundary -> deterministic first interval winner
    assert result[0]["words"][0]["speaker"] == "A"
    # far gap word -> nearest fallback still assigns deterministically
    assert result[0]["words"][1]["speaker"] in {"A", "B"}


def test_diarization_or_assignment_failure_propagates_to_failed_job(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {"segments": [{"start": 0.0, "end": 1.0, "text": "Hi.", "words": []}]},
    )
    monkeypatch.setattr(
        services_module,
        "diarize_with_pyannote",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("diarization failed")),
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post(
            "/api/jobs",
            json={
                "audio_file_id": audio["id"],
                "settings": {"diarization_token": "hf-token"},
            },
        )
        assert response.status_code == 200, response.text
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "failed"
        assert "diarization failed" in job["error_message"]


def test_create_processor_rejects_unsupported_engines(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    config_module = importlib.import_module("whisperx_ui_backend.config")
    schemas_module = importlib.import_module("whisperx_ui_backend.schemas")
    config = config_module.AppConfig(app_data_dir=tmp_path / "data")
    config.ensure_directories()
    request = schemas_module.JobCreate(audio_file_id="audio-1")
    connection = sqlite3.connect(":memory:")
    try:
        request.transcription_engine = "bad-engine"
        try:
            services_module.create_processor(connection, config, {"file_path": "a.wav"}, request)
            raise AssertionError("Expected unsupported transcription engine failure")
        except RuntimeError as exc:
            assert 'Unsupported transcription_engine "bad-engine"' in str(exc)

        request.transcription_engine = "faster-whisper"
        request.diarization_engine = "bad-diarization"
        try:
            services_module.create_processor(connection, config, {"file_path": "a.wav"}, request)
            raise AssertionError("Expected unsupported diarization engine failure")
        except RuntimeError as exc:
            assert 'Unsupported diarization_engine "bad-diarization"' in str(exc)
    finally:
        connection.close()


def test_invalid_model_validation_fails_job_cleanly(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post(
            "/api/jobs",
            json={
                "audio_file_id": audio["id"],
                "transcription_model": "not-supported",
                "diarization_model": "pyannote/speaker-diarization-community-1",
            },
        )
        assert response.status_code == 200
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "failed"
        assert "Unsupported transcription model: not-supported" in job["error_message"]


def test_invalid_diarization_model_validation_fails_job_cleanly(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")

    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {"segments": [{"start": 0.0, "end": 1.0, "text": "Hi.", "words": []}]},
    )

    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        response = client.post(
            "/api/jobs",
            json={
                "audio_file_id": audio["id"],
                "transcription_model": "distil-large-v3",
                "diarization_model": "not-supported",
                "settings": {"diarization_token": "token"},
            },
        )
        assert response.status_code == 200
        job = response.json()
        assert job["status"] in {"queued", "processing"}
        job = _wait_for_terminal_job(client, job["id"])
        assert job["status"] == "failed"
        assert "Unsupported diarization model: not-supported" in job["error_message"]


def test_settings_sanitize_legacy_or_invalid_models_to_phase2_defaults(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        save_response = client.patch(
            "/api/settings",
            json={
                "settings": {
                    "transcription_engine": "local",
                    "transcription_model": "whisperx-small",
                    "diarization_engine": "none",
                    "diarization_model": "none",
                }
            },
        )
        assert save_response.status_code == 200
        settings = save_response.json()
        assert settings["transcription_engine"] == "faster-whisper"
        assert settings["transcription_model"] == "distil-large-v3"
        assert settings["diarization_engine"] == "huggingface-pyannote"
        assert settings["diarization_model"] == "pyannote/speaker-diarization-community-1"


def test_database_initialization_adds_progress_and_runtime_device_columns(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch):
        db_path = tmp_path / "app_data" / "database.sqlite"
        connection = sqlite3.connect(db_path)
        try:
            columns = {
                row[1] for row in connection.execute("PRAGMA table_info(transcription_jobs)").fetchall()
            }
        finally:
            connection.close()
    for column in (
        "progress_stage",
        "progress_percent",
        "progress_message",
        "progress_stage_started_at",
        "progress_updated_at",
        "runtime_device",
        "runtime_device_note",
    ):
        assert column in columns


def test_job_response_exposes_runtime_device_fallback(tmp_path, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    with _client(tmp_path, monkeypatch) as client:
        audio = _upload_audio(client)
        job_id = str(uuid.uuid4())
        now = _utc_now()
        connection = client.app.state.connection
        connection.execute(
            """
            INSERT INTO transcription_jobs (
                id, audio_file_id, status, transcription_engine, transcription_model,
                diarization_engine, diarization_model, language, device, compute_type,
                batch_size, speaker_count, min_speakers, max_speakers, settings_json,
                error_message, created_at, queued_at
            ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                job_id,
                audio["id"],
                "faster-whisper",
                "distil-large-v3",
                "huggingface-pyannote",
                "pyannote/speaker-diarization-community-1",
                None,
                "cuda",
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
        services_module.set_runtime_device(
            connection,
            job_id,
            requested_device="cuda",
            runtime_device="cpu",
        )

        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()
        assert job["runtime_device"] == "cpu"
        assert job["runtime_device_note"] == "fell_back_to_cpu"


def test_legacy_provider_columns_still_accept_new_job_payload(tmp_path, monkeypatch):
    data_dir = tmp_path / "legacy_app_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "database.sqlite"
    connection = sqlite3.connect(db_path)
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
            transcription_provider TEXT NOT NULL,
            transcription_model TEXT NOT NULL,
            diarization_provider TEXT NOT NULL,
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
            job_id TEXT NOT NULL,
            speaker_key TEXT NOT NULL,
            display_name TEXT NOT NULL,
            sample_start REAL NOT NULL,
            sample_end REAL NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transcript_sentences (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            speaker_id TEXT NOT NULL,
            sentence_index INTEGER NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            original_text TEXT NOT NULL,
            current_text TEXT NOT NULL,
            confidence REAL,
            words_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    connection.commit()
    connection.close()

    monkeypatch.setenv("WHISPERX_UI_APP_DATA", str(data_dir))
    monkeypatch.setenv("WHISPERX_UI_INLINE_JOB_EXECUTION", "1")
    app_module = importlib.import_module("whisperx_ui_backend.app")
    monkeypatch.setattr(app_module, "initialize_database", lambda conn: None)
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "transcribe_with_faster_whisper",
        lambda **kwargs: {
            "segments": [{"start": 0.0, "end": 1.0, "text": "Hi.", "words": []}],
        },
    )
    with TestClient(app_module.app) as client:
        audio = _upload_audio(client)
        response = client.post("/api/jobs", json={"audio_file_id": audio["id"]})
        assert response.status_code == 200, response.text
        job = response.json()
        job = _wait_for_terminal_job(client, job["id"])
        assert job["transcription_engine"] == "faster-whisper"
        assert job["diarization_engine"] == "huggingface-pyannote"


def test_pyannote_extract_intervals_prefers_exclusive_speaker_diarization_wrapper():
    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")

    class FakeTurn:
        def __init__(self, start: float, end: float):
            self.start = start
            self.end = end

    class FakeAnnotation:
        def itertracks(self, yield_label=True):
            assert yield_label is True
            yield (FakeTurn(0.0, 1.1), None, "SPEAKER_01")
            yield (FakeTurn(1.1, 2.4), None, "SPEAKER_02")

    class CommunityWrapper:
        def __init__(self):
            self.exclusive_speaker_diarization = FakeAnnotation()

    intervals = diarization_module._extract_intervals(CommunityWrapper())
    assert intervals == [
        {"start": 0.0, "end": 1.1, "speaker": "SPEAKER_01"},
        {"start": 1.1, "end": 2.4, "speaker": "SPEAKER_02"},
    ]


def test_diarize_with_pyannote_uses_preloaded_waveform_input(tmp_path, monkeypatch):
    import torch

    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")
    calls: dict = {}

    class FakeTurn:
        def __init__(self, start: float, end: float):
            self.start = start
            self.end = end

    class FakeAnnotation:
        def itertracks(self, yield_label=True):
            assert yield_label is True
            yield (FakeTurn(0.0, 0.9), None, "SPEAKER_01")

    class FakePipelineInstance:
        def __call__(self, diarization_input, **kwargs):
            calls["input"] = diarization_input
            calls["kwargs"] = kwargs
            return FakeAnnotation()

    class FakePipeline:
        @staticmethod
        def from_pretrained(model_id, token=None, use_auth_token=None):
            calls["model_id"] = model_id
            calls["token"] = token if token is not None else use_auth_token
            return FakePipelineInstance()

    fake_pyannote_audio = types.SimpleNamespace(Pipeline=FakePipeline)
    fake_pyannote_pkg = types.ModuleType("pyannote")
    fake_pyannote_pkg.audio = fake_pyannote_audio
    monkeypatch.setitem(sys.modules, "pyannote", fake_pyannote_pkg)
    monkeypatch.setitem(sys.modules, "pyannote.audio", fake_pyannote_audio)

    stereo_waveform = torch.tensor([[0.2, -0.2, 0.0], [0.0, 0.2, -0.2]], dtype=torch.float32)
    monkeypatch.setattr(
        "torchaudio.load",
        lambda _: (stereo_waveform, 16000),
    )

    intervals = diarization_module.diarize_with_pyannote(
        audio_path=str(tmp_path / "audio.wav"),
        model_id="pyannote/speaker-diarization-community-1",
        hf_token="hf-test-token",
        speaker_count=2,
    )
    assert intervals == [{"start": 0.0, "end": 0.9, "speaker": "SPEAKER_01"}]
    assert calls["model_id"] == "pyannote/speaker-diarization-community-1"
    assert calls["token"] == "hf-test-token"
    assert calls["kwargs"]["num_speakers"] == 2
    assert calls["input"]["sample_rate"] == 16000
    assert tuple(calls["input"]["waveform"].shape) == (1, 3)


def test_diarize_with_pyannote_falls_back_when_torchaudio_decode_fails(tmp_path, monkeypatch):
    import torch

    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")
    calls: dict = {}

    class FakeTurn:
        def __init__(self, start: float, end: float):
            self.start = start
            self.end = end

    class FakeAnnotation:
        def itertracks(self, yield_label=True):
            yield (FakeTurn(0.0, 0.5), None, "SPEAKER_00")

    class FakePipelineInstance:
        def __call__(self, diarization_input, **kwargs):
            calls["input"] = diarization_input
            return FakeAnnotation()

    class FakePipeline:
        @staticmethod
        def from_pretrained(model_id, token=None, use_auth_token=None):
            return FakePipelineInstance()

    fake_pyannote_audio = types.SimpleNamespace(Pipeline=FakePipeline)
    fake_pyannote_pkg = types.ModuleType("pyannote")
    fake_pyannote_pkg.audio = fake_pyannote_audio
    monkeypatch.setitem(sys.modules, "pyannote", fake_pyannote_pkg)
    monkeypatch.setitem(sys.modules, "pyannote.audio", fake_pyannote_audio)

    monkeypatch.setattr("torchaudio.load", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("bad decode")))
    monkeypatch.setattr(
        "faster_whisper.audio.decode_audio",
        lambda _: [0.1, -0.1, 0.0, 0.2],
    )

    intervals = diarization_module.diarize_with_pyannote(
        audio_path=str(tmp_path / "audio.wav"),
        model_id="pyannote/speaker-diarization-community-1",
        hf_token="hf-test-token",
    )
    assert intervals == [{"start": 0.0, "end": 0.5, "speaker": "SPEAKER_00"}]
    assert calls["input"]["sample_rate"] == 16000
    assert tuple(calls["input"]["waveform"].shape) == (1, 4)
    assert calls["input"]["waveform"].dtype == torch.float32


def test_faster_whisper_resolves_cuda_to_cpu_when_cuda_unavailable(monkeypatch):
    import torch

    processor_module = importlib.import_module("whisperx_ui_backend.processors.faster_whisper_processor")

    class FakeModel:
        init_kwargs = None

        def __init__(self, *_args, **kwargs):
            FakeModel.init_kwargs = kwargs

        def transcribe(self, *_args, **_kwargs):
            class Info:
                language = "en"

            return iter([]), Info()

    monkeypatch.setitem(
        sys.modules,
        "faster_whisper",
        types.SimpleNamespace(WhisperModel=FakeModel, BatchedInferencePipeline=None),
    )
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    payload = processor_module.transcribe_with_faster_whisper(
        audio_path="/tmp/audio.wav",
        model_id="distil-large-v3",
        device="cuda",
        compute_type="int8",
        batch_size=1,
        download_root="/tmp/models",
    )

    assert payload["segments"] == []
    assert FakeModel.init_kwargs["device"] == "cpu"


def test_faster_whisper_uses_batched_pipeline_for_batch_size(monkeypatch):
    processor_module = importlib.import_module("whisperx_ui_backend.processors.faster_whisper_processor")
    calls: dict = {}

    class FakeWord:
        word = "Hello"
        start = 0.0
        end = 0.5
        probability = 0.9

    class FakeSegment:
        start = 0.0
        end = 0.5
        text = "Hello"
        avg_logprob = -0.1
        words = [FakeWord()]

    class FakeInfo:
        language = "en"

    class FakeModel:
        def __init__(self, *_args, **kwargs):
            calls["model_kwargs"] = kwargs

        def transcribe(self, *_args, **_kwargs):
            raise AssertionError("Expected batched pipeline for batch_size > 1")

    class FakeBatchedPipeline:
        def __init__(self, model):
            calls["pipeline_model"] = model

        def transcribe(self, *_args, **kwargs):
            calls["pipeline_kwargs"] = kwargs
            return iter([FakeSegment()]), FakeInfo()

    monkeypatch.setitem(
        sys.modules,
        "faster_whisper",
        types.SimpleNamespace(WhisperModel=FakeModel, BatchedInferencePipeline=FakeBatchedPipeline),
    )

    payload = processor_module.transcribe_with_faster_whisper(
        audio_path="/tmp/audio.wav",
        model_id="distil-large-v3",
        device="cpu",
        compute_type="int8",
        batch_size=12,
        download_root="/tmp/models",
    )

    assert payload["segments"][0]["text"] == "Hello"
    assert calls["pipeline_kwargs"]["batch_size"] == 12
    assert calls["pipeline_kwargs"]["word_timestamps"] is True
    assert calls["pipeline_kwargs"]["without_timestamps"] is False


def test_auto_device_prefers_cuda_consistently_for_whisper_and_pyannote(monkeypatch):
    import torch

    processor_module = importlib.import_module("whisperx_ui_backend.processors.faster_whisper_processor")
    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)

    assert processor_module.resolve_transcription_device("auto") == "cuda"
    assert diarization_module.resolve_diarization_device("auto") == "cuda"
    assert processor_module.resolve_transcription_device("cuda") == "cuda"
    assert diarization_module.resolve_diarization_device("cuda") == "cuda"


def test_auto_device_falls_back_to_cpu_when_cuda_unavailable(monkeypatch):
    import torch

    processor_module = importlib.import_module("whisperx_ui_backend.processors.faster_whisper_processor")
    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    assert processor_module.resolve_transcription_device("auto") == "cpu"
    assert diarization_module.resolve_diarization_device("auto") == "cpu"


def test_pyannote_resolves_cuda_to_cpu_when_cuda_unavailable(tmp_path, monkeypatch):
    import torch

    diarization_module = importlib.import_module("whisperx_ui_backend.processors.pyannote_diarization")
    calls: dict = {}

    class FakeTurn:
        def __init__(self, start: float, end: float):
            self.start = start
            self.end = end

    class FakeAnnotation:
        def itertracks(self, yield_label=True):
            yield (FakeTurn(0.0, 0.5), None, "SPEAKER_00")

    class FakePipelineInstance:
        def to(self, device_obj):
            calls["to"] = str(device_obj)
            return self

        def __call__(self, diarization_input, **kwargs):
            calls["input"] = diarization_input
            return FakeAnnotation()

    class FakePipeline:
        @staticmethod
        def from_pretrained(model_id, token=None, use_auth_token=None):
            return FakePipelineInstance()

    fake_pyannote_audio = types.SimpleNamespace(Pipeline=FakePipeline)
    fake_pyannote_pkg = types.ModuleType("pyannote")
    fake_pyannote_pkg.audio = fake_pyannote_audio
    monkeypatch.setitem(sys.modules, "pyannote", fake_pyannote_pkg)
    monkeypatch.setitem(sys.modules, "pyannote.audio", fake_pyannote_audio)
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr("torchaudio.load", lambda *_args, **_kwargs: (torch.tensor([[0.1, -0.1]]), 16000))

    intervals = diarization_module.diarize_with_pyannote(
        audio_path=str(tmp_path / "audio.wav"),
        model_id="pyannote/speaker-diarization-community-1",
        hf_token="hf-test-token",
        device="cuda",
    )

    assert intervals == [{"start": 0.0, "end": 0.5, "speaker": "SPEAKER_00"}]
    assert calls["to"] == "cpu"
