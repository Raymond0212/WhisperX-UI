from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "dist" / "whisperx-ui"
EXECUTABLE = APP_DIR / ("whisperx-ui.exe" if os.name == "nt" else "whisperx-ui")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def fetch_text(url: str, timeout: float = 2.0) -> tuple[int, str, str]:
    with urlopen(url, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return response.status, response.headers.get("content-type", ""), body


def wait_for_health(base_url: str, deadline: float) -> None:
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            status, _content_type, body = fetch_text(f"{base_url}/api/health")
            if status == 200 and "ok" in body:
                return
        except (OSError, URLError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise RuntimeError(f"release executable did not become healthy: {last_error}")


def main() -> int:
    if not EXECUTABLE.is_file():
        print(f"[FAIL] Missing release executable: {EXECUTABLE}", file=sys.stderr)
        return 1

    worker_help = subprocess.run(
        [str(EXECUTABLE), "worker", "--help"],
        cwd=str(APP_DIR),
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if worker_help.returncode != 0 or "--job-id" not in worker_help.stdout:
        print(worker_help.stdout, file=sys.stdout)
        print(worker_help.stderr, file=sys.stderr)
        print("[FAIL] Release executable did not expose worker dispatch.", file=sys.stderr)
        return 1

    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="whisperx-ui-release-smoke-") as app_data:
        env = {
            **os.environ,
            "WHISPERX_UI_HOST": "127.0.0.1",
            "WHISPERX_UI_PORT": str(port),
            "WHISPERX_UI_APP_DATA": app_data,
        }
        process = subprocess.Popen(
            [str(EXECUTABLE)],
            cwd=str(APP_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        exited_early = False
        try:
            wait_for_health(base_url, time.time() + 60)

            status, content_type, html = fetch_text(f"{base_url}/")
            if status != 200 or "text/html" not in content_type or "<!doctype html" not in html.lower():
                raise RuntimeError("release root did not serve the built frontend index")

            asset_paths = re.findall(r"""(?:src|href)=["']([^"']*/assets/[^"']+)["']""", html)
            if not asset_paths:
                raise RuntimeError("release frontend index did not reference built assets")

            asset_status, asset_type, _asset_body = fetch_text(f"{base_url}{asset_paths[0]}")
            if asset_status != 200 or not asset_type:
                raise RuntimeError(f"release asset did not load: {asset_paths[0]}")
        finally:
            exited_early = process.poll() is not None
            if not exited_early:
                process.terminate()
            try:
                stdout, stderr = process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                stdout, stderr = process.communicate(timeout=10)

        if exited_early:
            print(stdout, file=sys.stdout)
            print(stderr, file=sys.stderr)
            print(f"[FAIL] Release executable exited with {process.returncode}", file=sys.stderr)
            return 1

    print("[OK] Release executable served API health, frontend index, and frontend asset.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
