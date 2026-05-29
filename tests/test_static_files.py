from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from whisperx_ui_backend import static_files


def test_frontend_mount_serves_index_and_assets(tmp_path, monkeypatch):
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text(
        '<!doctype html><script type="module" src="/assets/index.js"></script>',
        encoding="utf-8",
    )
    (assets_dir / "index.js").write_text("console.log('ok');", encoding="utf-8")

    monkeypatch.setattr(static_files, "frontend_dist_dir", lambda: dist_dir)
    app = FastAPI()
    static_files.mount_frontend(app)

    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/workspace").status_code == 200
        asset_response = client.get("/assets/index.js")

    assert asset_response.status_code == 200
    assert "console.log" in asset_response.text


def test_frontend_mount_does_not_mask_unknown_api_paths(tmp_path, monkeypatch):
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<!doctype html>", encoding="utf-8")

    monkeypatch.setattr(static_files, "frontend_dist_dir", lambda: dist_dir)
    app = FastAPI()
    static_files.mount_frontend(app)

    with TestClient(app) as client:
        response = client.get("/api/missing")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_frontend_mount_preserves_api_method_not_allowed(tmp_path, monkeypatch):
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<!doctype html>", encoding="utf-8")

    monkeypatch.setattr(static_files, "frontend_dist_dir", lambda: dist_dir)
    app = FastAPI()

    @app.post("/api/write-only")
    def write_only():
        return {"ok": True}

    static_files.mount_frontend(app)

    with TestClient(app) as client:
        response = client.get("/api/write-only")

    assert response.status_code == 405
