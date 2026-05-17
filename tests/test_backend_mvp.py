from __future__ import annotations

import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WHISPERX_UI_APP_DATA", str(tmp_path / "app_data"))
    app_module = importlib.import_module("whisperx_ui_backend.app")
    with TestClient(app_module.app) as client:
        yield client


def upload_audio(
    client: TestClient, filename: str = "meeting.wav", content_type: str = "audio/wav"
) -> dict:
    response = client.post(
        "/api/audio",
        files={"file": (filename, b"fake audio bytes", content_type)},
        data={"display_title": "Team Meeting"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_job(client: TestClient, audio_id: str) -> dict:
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio_id,
            "transcription_provider": "placeholder",
            "transcription_model": "whisperx-small",
            "diarization_model": "pyannote-local",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def app_connection():
    app_module = importlib.import_module("whisperx_ui_backend.app")
    return app_module.app.state.connection


def test_upload_duplicate_filenames_are_distinct_and_listed(client):
    first = upload_audio(client)
    second = upload_audio(client)

    assert first["id"] != second["id"]
    assert first["original_filename"] == "meeting.wav"
    assert second["original_filename"] == "meeting.wav"
    assert first["stored_filename"] != second["stored_filename"]

    response = client.get("/api/audio")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_upload_supported_extensions_and_rejects_unsupported(client):
    for extension in [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"]:
        uploaded = upload_audio(client, f"meeting{extension}")
        assert uploaded["original_filename"] == f"meeting{extension}"

    response = client.post(
        "/api/audio",
        files={"file": ("notes.txt", b"not audio", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported audio extension" in response.json()["detail"]


def test_upload_sanitizes_filename_path_traversal(client):
    uploaded = upload_audio(client, "../bad path/name.wav")

    assert "/" not in uploaded["original_filename"]
    assert "\\" not in uploaded["original_filename"]
    assert uploaded["original_filename"] == "name.wav"
    assert uploaded["stored_filename"].endswith("-name.wav")


def test_uploaded_audio_title_can_be_edited_and_reflected_in_audio_views(client):
    audio = upload_audio(client)

    update_response = client.patch(
        f"/api/audio/{audio['id']}",
        json={"display_title": "  Renamed Planning Session  "},
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["id"] == audio["id"]
    assert updated["display_title"] == "Renamed Planning Session"
    assert updated["original_filename"] == audio["original_filename"]

    get_response = client.get(f"/api/audio/{audio['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["display_title"] == "Renamed Planning Session"

    list_response = client.get("/api/audio")
    assert list_response.status_code == 200
    assert [item["display_title"] for item in list_response.json()] == [
        "Renamed Planning Session"
    ]

    missing_response = client.patch(
        "/api/audio/not-found",
        json={"display_title": "Missing"},
    )
    assert missing_response.status_code == 404


def test_stream_uses_stored_mime_type_and_known_audio_record(client):
    response = client.post(
        "/api/audio",
        files={"file": ("meeting.flac", b"fake audio bytes", "audio/flac")},
    )
    assert response.status_code == 200, response.text
    audio = response.json()

    stream_response = client.get(f"/api/audio/{audio['id']}/stream")
    assert stream_response.status_code == 200
    assert stream_response.headers["content-type"].startswith("audio/flac")
    assert stream_response.content == b"fake audio bytes"


def test_upload_normalizes_non_audio_content_type_for_supported_extension(client):
    audio = upload_audio(client, "meeting.wav", "text/plain")

    assert audio["mime_type"] == "audio/x-wav"

    stream_response = client.get(f"/api/audio/{audio['id']}/stream")
    assert stream_response.status_code == 200
    assert stream_response.headers["content-type"].startswith("audio/x-wav")


def test_stream_normalizes_legacy_non_audio_stored_mime_type(client):
    audio = upload_audio(client, "legacy.mp3", "audio/mpeg")
    connection = app_connection()
    connection.execute(
        "UPDATE audio_files SET mime_type = ? WHERE id = ?",
        ("text/plain", audio["id"]),
    )
    connection.commit()

    stream_response = client.get(f"/api/audio/{audio['id']}/stream")
    assert stream_response.status_code == 200
    assert stream_response.headers["content-type"].startswith("audio/mpeg")


def test_prepare_basic_models_downloads_faster_whisper_to_local_models_dir(client, monkeypatch):
    calls = {}
    services_module = importlib.import_module("whisperx_ui_backend.services")

    def fake_download_hf_snapshot(*, repo_id, local_dir, cache_dir, token):
        calls["repo_id"] = repo_id
        calls["local_dir"] = local_dir
        calls["cache_dir"] = cache_dir
        calls["token"] = token
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / "model.bin").write_bytes(b"fake model")
        return str(local_dir)

    monkeypatch.setattr(services_module, "download_hf_snapshot", fake_download_hf_snapshot)

    initial_response = client.get("/api/models")
    assert initial_response.status_code == 200
    assert initial_response.json()[0]["downloaded"] is False

    response = client.post(
        "/api/models/prepare-basic",
        json={"profile": "basic", "transcription_model": "whisperx-small", "hf_token": "secret"},
    )

    assert response.status_code == 200, response.text
    prepared = response.json()
    assert prepared["ready"] is True
    model = prepared["models"][0]
    assert model["key"] == "whisperx-small"
    assert model["repo_id"] == "Systran/faster-whisper-small"
    assert model["downloaded"] is True
    assert model["local_path"].endswith("app_data/models/Systran--faster-whisper-small")
    assert calls["repo_id"] == "Systran/faster-whisper-small"
    assert calls["token"] == "secret"
    assert calls["cache_dir"].name == ".hf-cache"
    assert "secret" not in response.text

    list_response = client.get("/api/models")
    assert list_response.status_code == 200
    assert list_response.json()[0]["downloaded"] is True


def test_prepare_basic_models_rejects_unknown_model(client):
    response = client.post(
        "/api/models/prepare-basic",
        json={"profile": "basic", "transcription_model": "unknown"},
    )

    assert response.status_code == 400
    assert "Unsupported basic transcription model" in response.json()["detail"]


def test_stream_after_delete_missing_file_and_invalid_stored_path(client, tmp_path):
    deleted_audio = upload_audio(client)
    assert client.delete(f"/api/audio/{deleted_audio['id']}").status_code == 204
    assert client.get(f"/api/audio/{deleted_audio['id']}/stream").status_code == 404

    missing_audio = upload_audio(client, "missing.wav")
    connection = app_connection()
    missing_path = connection.execute(
        "SELECT file_path FROM audio_files WHERE id = ?",
        (missing_audio["id"],),
    ).fetchone()["file_path"]
    Path(missing_path).unlink()
    missing_response = client.get(f"/api/audio/{missing_audio['id']}/stream")
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "Stored audio file is missing"

    invalid_audio = upload_audio(client, "invalid.wav")
    connection.execute(
        "UPDATE audio_files SET file_path = ? WHERE id = ?",
        (str(tmp_path / "outside.wav"), invalid_audio["id"]),
    )
    connection.commit()
    invalid_response = client.get(f"/api/audio/{invalid_audio['id']}/stream")
    assert invalid_response.status_code == 500
    assert invalid_response.json()["detail"] == "Stored audio path is invalid"


def test_placeholder_job_persists_speakers_transcript_edits_and_vtt(client):
    audio = upload_audio(client)
    job = create_job(client, audio["id"])

    assert job["status"] == "completed"
    assert job["settings"]["transcription_model"] == "whisperx-small"

    speakers_response = client.get(f"/api/jobs/{job['id']}/speakers")
    assert speakers_response.status_code == 200
    speakers = speakers_response.json()
    assert [speaker["speaker_key"] for speaker in speakers] == ["SPEAKER_00", "SPEAKER_01"]

    rename_response = client.patch(
        f"/api/speakers/{speakers[0]['id']}",
        json={"display_name": "Alice"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["speaker_key"] == "SPEAKER_00"
    assert rename_response.json()["display_name"] == "Alice"

    transcript_response = client.get(f"/api/jobs/{job['id']}/transcript")
    assert transcript_response.status_code == 200
    transcript = transcript_response.json()
    assert len(transcript) == 3
    assert transcript[0]["speaker_display_name"] == "Alice"
    assert transcript[0]["original_text"] == transcript[0]["current_text"]
    original_start = transcript[0]["start_time"]
    original_end = transcript[0]["end_time"]
    original_speaker_id = transcript[0]["speaker_id"]

    edit_response = client.patch(
        f"/api/transcript-sentences/{transcript[0]['id']}",
        json={"current_text": "Edited sentence text."},
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["current_text"] == "Edited sentence text."
    assert edit_response.json()["original_text"] == "This is a placeholder transcript sentence."
    assert edit_response.json()["start_time"] == original_start
    assert edit_response.json()["end_time"] == original_end
    assert edit_response.json()["speaker_id"] == original_speaker_id

    vtt_response = client.get(f"/api/jobs/{job['id']}/export.vtt")
    assert vtt_response.status_code == 200
    assert vtt_response.headers["content-type"].startswith("text/vtt")
    assert vtt_response.text.startswith("WEBVTT\n\n")
    assert "00:00:00.000 --> 00:00:04.800" in vtt_response.text
    assert "Alice: Edited sentence text." in vtt_response.text
    assert "SPEAKER_01: It lets you test editing and speaker labels." in vtt_response.text


def test_speaker_samples_have_non_empty_timestamp_ranges(client):
    audio = upload_audio(client)
    job = create_job(client, audio["id"])

    speakers_response = client.get(f"/api/jobs/{job['id']}/speakers")
    assert speakers_response.status_code == 200
    speakers = speakers_response.json()

    transcript_response = client.get(f"/api/jobs/{job['id']}/transcript")
    assert transcript_response.status_code == 200
    transcript = transcript_response.json()

    for speaker in speakers:
        assert speaker["sample_end"] > speaker["sample_start"]
        matching_sentence = next(
            sentence for sentence in transcript if sentence["speaker_id"] == speaker["id"]
        )
        assert speaker["sample_start"] == matching_sentence["start_time"]
        assert speaker["sample_end"] == matching_sentence["end_time"]


def test_job_failure_persists_failed_status_and_message(client, monkeypatch):
    class FailingProcessor:
        def run(self, job_id: str) -> None:
            raise RuntimeError("processor failed")

    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "create_processor",
        lambda connection, config, audio, request: FailingProcessor(),
    )

    audio = upload_audio(client)
    job = create_job(client, audio["id"])

    assert job["status"] == "failed"
    assert job["error_message"] == "processor failed"
    assert job["completed_at"] is not None
    assert job["settings"]["audio_file_id"] == audio["id"]


def test_default_local_job_fails_when_whisperx_is_unavailable(client, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "import_whisperx",
        lambda: (_ for _ in ()).throw(
            RuntimeError(
                "WhisperX is not installed or could not be imported. Install WhisperX or choose "
                'transcription_provider "placeholder" for demo output.'
            )
        ),
    )

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "none",
            "diarization_model": "none",
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "failed"
    assert "WhisperX is not installed" in job["error_message"]
    assert 'transcription_provider "placeholder"' in job["error_message"]
    assert job["completed_at"] is not None


def test_local_whisperx_fails_when_diarization_enabled_but_no_speaker_labels(
    client, monkeypatch
):
    class SpeakerlessModel:
        def transcribe(self, audio_path, batch_size, language):
            return {
                "language": "en",
                "segments": [{"start": 0.0, "end": 2.0, "text": "Speaker unknown."}],
            }

    fake_whisperx = SimpleNamespace(
        load_model=lambda model, device, compute_type, language: SpeakerlessModel()
    )
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "local",
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "failed"
    assert "Diarization did not produce speaker labels" in job["error_message"]
    assert 'diarization_provider "none"' in job["error_message"]


def test_diarization_none_allows_speakerless_whisperx_output_as_single_speaker(
    client, monkeypatch
):
    calls = {}

    class SpeakerlessModel:
        def transcribe(self, audio_path, batch_size, language):
            return {
                "language": "en",
                "segments": [{"start": 0.0, "end": 2.0, "text": "Speaker unknown."}],
            }

    class FakeDiarizationPipeline:
        def __init__(self, use_auth_token, device):
            calls["diarization_init"] = {"use_auth_token": use_auth_token, "device": device}

        def __call__(self, audio_path, **kwargs):
            calls["diarization_call"] = kwargs
            return [{"start": 0.0, "end": 2.0, "speaker": "SPEAKER_99"}]

    fake_whisperx = SimpleNamespace(
        load_model=lambda model, device, compute_type, language: SpeakerlessModel(),
        DiarizationPipeline=FakeDiarizationPipeline,
    )
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "none",
            "diarization_model": "none",
            "settings": {"diarization_token": "runtime-token"},
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "completed"
    assert calls == {}

    transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
    assert [sentence["speaker_key"] for sentence in transcript] == ["SPEAKER_00"]


def test_local_whisperx_uses_downloaded_model_path_when_available(client, monkeypatch):
    captured = {}

    class SpeakerlessModel:
        def transcribe(self, audio_path, batch_size, language):
            return {
                "language": "en",
                "segments": [{"start": 0.0, "end": 2.0, "text": "Downloaded model."}],
            }

    def load_model(model, device, compute_type, language):
        captured["model"] = model
        return SpeakerlessModel()

    services_module = importlib.import_module("whisperx_ui_backend.services")
    app_module = importlib.import_module("whisperx_ui_backend.app")
    model_path = services_module.local_model_path(
        app_module.app.state.config,
        "whisperx-small",
    )
    model_path.mkdir(parents=True, exist_ok=True)
    (model_path / "model.bin").write_bytes(b"fake model")

    fake_whisperx = SimpleNamespace(load_model=load_model)
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "none",
            "diarization_model": "none",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    assert captured["model"] == str(model_path)


def test_whisperx_processor_runs_alignment_and_diarization_assignment_with_speaker_limits(
    client, monkeypatch
):
    calls = {}

    class FakeModel:
        def transcribe(self, audio_path, batch_size, language):
            return {
                "language": "en",
                "segments": [{"start": 0.0, "end": 3.0, "text": "Aligned words."}],
            }

    class FakeDiarizationPipeline:
        def __init__(self, use_auth_token, device):
            calls["diarization_init"] = {"use_auth_token": use_auth_token, "device": device}

        def __call__(self, audio_path, **kwargs):
            calls["diarization_call"] = kwargs
            return [{"start": 0.0, "end": 3.0, "speaker": "SPEAKER_04"}]

    def align(segments, align_model, metadata, audio_path, device, return_char_alignments):
        calls["align"] = {
            "segments": segments,
            "align_model": align_model,
            "metadata": metadata,
            "device": device,
            "return_char_alignments": return_char_alignments,
        }
        return {
            "language": "en",
            "segments": [
                {
                    "start": 0.0,
                    "end": 3.0,
                    "text": "Aligned words.",
                    "words": [
                        {"word": "Aligned", "start": 0.0, "end": 1.0},
                        {"word": "words.", "start": 1.1, "end": 2.5},
                    ],
                }
            ],
        }

    def assign_word_speakers(speaker_segments, result):
        calls["speaker_segments"] = speaker_segments
        result["segments"][0]["words"][0]["speaker"] = "SPEAKER_04"
        result["segments"][0]["words"][1]["speaker"] = "SPEAKER_04"
        return result

    fake_whisperx = SimpleNamespace(
        load_model=lambda model, device, compute_type, language: FakeModel(),
        load_align_model=lambda language_code, device: ("align-model", {"language": language_code}),
        align=align,
        DiarizationPipeline=FakeDiarizationPipeline,
        assign_word_speakers=assign_word_speakers,
    )
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "local",
            "diarization_model": "pyannote-local",
            "speaker_count": 2,
            "min_speakers": 1,
            "max_speakers": 4,
            "settings": {"diarization_token": "runtime-token"},
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "completed"
    assert job["settings"]["settings"] == {}
    assert calls["align"]["return_char_alignments"] is False
    assert calls["diarization_init"] == {"use_auth_token": "runtime-token", "device": "cpu"}
    assert calls["diarization_call"] == {
        "num_speakers": 2,
        "min_speakers": 1,
        "max_speakers": 4,
    }
    transcript = client.get(f"/api/jobs/{job['id']}/transcript").json()
    assert transcript[0]["speaker_key"] == "SPEAKER_04"
    assert [word["speaker"] for word in transcript[0]["words"]] == ["SPEAKER_04", "SPEAKER_04"]


def test_explicit_placeholder_still_completes_when_whisperx_is_unavailable(client, monkeypatch):
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(
        services_module,
        "import_whisperx",
        lambda: (_ for _ in ()).throw(RuntimeError("should not import")),
    )

    audio = upload_audio(client)
    job = create_job(client, audio["id"])

    assert job["status"] == "completed"
    assert job["error_message"] is None


def test_whisperx_processor_converts_and_persists_sentence_chunks(client, monkeypatch):
    class FakeModel:
        def transcribe(self, audio_path, batch_size, language):
            assert audio_path.endswith(".wav")
            assert batch_size == 8
            assert language is None
            return {
                "language": "en",
                "segments": [
                    {
                        "start": 0.0,
                        "end": 6.0,
                        "text": "Hello team. Next item?",
                        "speaker": "SPEAKER_02",
                        "confidence": 0.87,
                        "words": [
                            {"word": "Hello", "start": 0.0, "end": 0.8, "score": 0.91},
                            {"word": "team.", "start": 0.9, "end": 1.4, "score": 0.89},
                            {"word": "Next", "start": 3.5, "end": 4.0, "score": 0.88},
                            {"word": "item?", "start": 4.1, "end": 5.4, "score": 0.86},
                        ],
                    },
                    {
                        "start": 7.0,
                        "end": 8.5,
                        "text": "Done.",
                        "speaker": "SPEAKER_03",
                        "confidence": 0.93,
                        "words": [{"word": "Done.", "start": 7.0, "end": 8.4, "score": 0.93}],
                    },
                ],
            }

    fake_whisperx = SimpleNamespace(
        load_model=lambda model, device, compute_type, language: FakeModel()
    )
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "none",
            "diarization_model": "none",
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "completed"

    transcript_response = client.get(f"/api/jobs/{job['id']}/transcript")
    assert transcript_response.status_code == 200
    transcript = transcript_response.json()
    assert [sentence["original_text"] for sentence in transcript] == [
        "Hello team.",
        "Next item?",
        "Done.",
    ]
    assert [sentence["speaker_key"] for sentence in transcript] == [
        "SPEAKER_02",
        "SPEAKER_02",
        "SPEAKER_03",
    ]
    assert transcript[0]["confidence"] == 0.87
    assert [word["word"] for word in transcript[0]["words"]] == ["Hello", "team."]
    assert [word["word"] for word in transcript[1]["words"]] == ["Next", "item?"]
    assert transcript[0]["start_time"] == pytest.approx(0.0)
    assert transcript[0]["end_time"] < transcript[1]["start_time"]
    assert transcript[1]["end_time"] == pytest.approx(6.0)


def test_whisperx_processor_empty_result_fails_job(client, monkeypatch):
    class EmptyModel:
        def transcribe(self, audio_path, batch_size, language):
            return {"language": "en", "segments": []}

    fake_whisperx = SimpleNamespace(
        load_model=lambda model, device, compute_type, language: EmptyModel()
    )
    services_module = importlib.import_module("whisperx_ui_backend.services")
    monkeypatch.setattr(services_module, "import_whisperx", lambda: fake_whisperx)

    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_model": "whisperx-small",
            "diarization_provider": "none",
            "diarization_model": "none",
        },
    )

    assert response.status_code == 200, response.text
    job = response.json()
    assert job["status"] == "failed"
    assert job["error_message"] == "Processor did not return transcript sentences"


def test_segment_to_sentences_splits_multi_sentence_segment_proportionally():
    services_module = importlib.import_module("whisperx_ui_backend.services")

    sentences = services_module.segment_to_sentences(
        {
            "start": 10.0,
            "end": 20.0,
            "text": "First sentence. Second sentence!",
            "speaker": "SPEAKER_00",
            "confidence": 0.8,
        }
    )

    assert [sentence.text for sentence in sentences] == ["First sentence.", "Second sentence!"]
    assert sentences[0].start_time == pytest.approx(10.0)
    assert sentences[0].end_time == pytest.approx(14.6875)
    assert sentences[1].start_time == pytest.approx(15.0)
    assert sentences[1].end_time == pytest.approx(20.0)


def test_soft_delete_hides_audio_and_marks_jobs_deleted(client):
    audio = upload_audio(client)
    job = create_job(client, audio["id"])

    delete_response = client.delete(f"/api/audio/{audio['id']}")
    assert delete_response.status_code == 204

    list_response = client.get("/api/audio")
    assert list_response.status_code == 200
    assert list_response.json() == []

    job_response = client.get(f"/api/jobs/{job['id']}")
    assert job_response.status_code == 200
    assert job_response.json()["status"] == "deleted"


def test_create_job_rejects_deleted_audio(client):
    audio = upload_audio(client)
    assert client.delete(f"/api/audio/{audio['id']}").status_code == 204

    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_provider": "placeholder",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Audio file not found"


def test_export_missing_transcript_returns_not_found(client):
    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_provider": "placeholder",
        },
    )
    assert response.status_code == 200
    job_id = response.json()["id"]

    connection = app_connection()
    connection.execute("DELETE FROM transcript_sentences WHERE job_id = ?", (job_id,))
    connection.commit()

    export_response = client.get(f"/api/jobs/{job_id}/export.vtt")
    assert export_response.status_code == 404
    assert export_response.json()["detail"] == "Transcript not found"


def test_request_validation_rejects_invalid_title_and_speaker_limits(client):
    audio = upload_audio(client)

    title_response = client.patch(
        f"/api/audio/{audio['id']}",
        json={"display_title": ""},
    )
    assert title_response.status_code == 422

    job_response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_provider": "placeholder",
            "speaker_count": 0,
        },
    )
    assert job_response.status_code == 422


def test_settings_do_not_persist_plain_api_keys(client):
    response = client.patch(
        "/api/settings",
        json={
            "settings": {
                "transcription_model": "whisperx-medium",
                "openai_api_key": "secret-value",
                "online_api_keys": {"openai": "secret-value"},
                "nested": {"hf_token": "secret-value", "kept": "visible"},
            }
        },
    )
    assert response.status_code == 200
    settings = response.json()
    assert settings["transcription_model"] == "whisperx-medium"
    assert "openai_api_key" not in settings
    assert settings["online_api_keys"] == {}
    assert settings["nested"] == {"kept": "visible"}


def test_job_settings_do_not_persist_nested_plain_api_keys(client):
    audio = upload_audio(client)
    response = client.post(
        "/api/jobs",
        json={
            "audio_file_id": audio["id"],
            "transcription_provider": "placeholder",
            "settings": {
                "openai_api_key": "secret-value",
                "nested": {"hf_token": "secret-value", "kept": "visible"},
            },
        },
    )
    assert response.status_code == 200, response.text
    settings = response.json()["settings"]
    assert settings["settings"] == {"nested": {"kept": "visible"}}
    assert "openai_api_key" not in settings["settings"]
