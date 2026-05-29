from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def test_markdown_links_to_repository_files_exist():
    for markdown_path in [REPO_ROOT / "AGENTS.md", *sorted((REPO_ROOT / "docs").rglob("*.md"))]:
        text = markdown_path.read_text(encoding="utf-8")
        for raw_target in LOCAL_MARKDOWN_LINK_RE.findall(text):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            assert (markdown_path.parent / target).resolve().exists(), (
                f"{markdown_path.relative_to(REPO_ROOT)} links to missing file {raw_target}"
            )


def test_production_phase_removes_stale_preview_filenames():
    stale_marker = "m" + "vp"
    stale_paths = [
        path.relative_to(REPO_ROOT).as_posix()
        for root in ("docs/product-specs", "tests")
        for path in (REPO_ROOT / root).rglob(f"*{stale_marker}*")
        if "__pycache__" not in path.parts
    ]
    assert stale_paths == []
