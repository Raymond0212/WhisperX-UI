from __future__ import annotations

import uvicorn

from .config import get_backend_binding


def main() -> None:
    binding = get_backend_binding()
    uvicorn.run(
        "whisperx_ui_backend.app:app",
        app_dir="backend",
        host=binding.host,
        port=binding.port,
    )


if __name__ == "__main__":
    main()
