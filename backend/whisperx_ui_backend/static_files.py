from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def bundled_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parents[2]


def frontend_dist_dir() -> Path:
    candidates = [
        Path(__file__).resolve().parent / "frontend_dist",
        bundled_root() / "frontend_dist",
        bundled_root() / "frontend" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return candidates[0]


def mount_frontend(app: FastAPI) -> None:
    dist_dir = frontend_dist_dir()
    dist_root = dist_dir.resolve()
    index_html = dist_dir / "index.html"

    if not index_html.is_file():
        return

    assets_dir = dist_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/")
    def serve_index() -> FileResponse:
        return FileResponse(index_html)

    @app.get("/{path:path}", include_in_schema=False)
    def serve_spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            request_path = f"/{path}"
            for route in app.routes:
                methods = getattr(route, "methods", set()) or set()
                path_regex = getattr(route, "path_regex", None)
                if "GET" not in methods and path_regex and path_regex.match(request_path):
                    raise HTTPException(status_code=405, detail="Method not allowed")
            raise HTTPException(status_code=404, detail="Not found")

        requested_file = (dist_dir / path).resolve()
        try:
            requested_file.relative_to(dist_root)
        except ValueError:
            return FileResponse(index_html)

        if requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(index_html)
