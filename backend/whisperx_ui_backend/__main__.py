from __future__ import annotations

import os
import sys

import uvicorn

from whisperx_ui_backend.app import app


def _run_worker() -> int:
    from whisperx_ui_backend.worker import main as worker_main

    sys.argv = [sys.argv[0], *sys.argv[2:]]
    return worker_main()


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "worker":
        raise SystemExit(_run_worker())

    host = os.environ.get("WHISPERX_UI_HOST", "127.0.0.1")
    port = int(os.environ.get("WHISPERX_UI_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
