from __future__ import annotations

import importlib
import sqlite3

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
    app_module = importlib.import_module("whisperx_ui_backend.app")
    return TestClient(app_module.app)


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
        assert job["status"] == "failed"
        assert job["transcription_engine"] == "faster-whisper"
        assert job["diarization_engine"] == "huggingface-pyannote"
        assert job["settings"]["transcription_model"] == "distil-large-v3"


def test_settings_default_to_phase2_contract(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        settings = client.get("/api/settings").json()
        assert settings["transcription_engine"] == "faster-whisper"
        assert settings["transcription_model"] == "distil-large-v3"
        assert settings["diarization_engine"] == "huggingface-pyannote"
        assert settings["diarization_model"] == "pyannote/speaker-diarization-community-1"


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
        assert job["status"] == "completed"
        transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
        assert transcript[0]["speaker_key"] == "SPEAKER_00"
        assert transcript[0]["speaker_display_name"] == "SPEAKER_00"


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
        assert job["status"] == "completed"
        transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
        speakers = client.get(f"/api/jobs/{job['id']}/speakers").json()
        assert transcript == []
        assert speakers == []


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
