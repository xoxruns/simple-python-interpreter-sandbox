"""
From repo root::

    uv sync
    uv run python tests/test_asyncio_google_request.py
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from python_sandbox_client import SandboxPool

_REPO = Path(__file__).resolve().parents[1]


async def main() -> None:
    tests_dir = _REPO / "tests"

    async with SandboxPool(directory=tests_dir, workers=1) as pool:
        installed = await pool.install_packages(["requests"])
        assert installed.get("requests", {}).get("success") is True, installed

        result = await pool.run_script("python_file_google.py")
        assert "hello from python_file_google.py" in result.stdout, result.stdout

        json_start = result.stdout.find("{")
        assert json_start != -1, result.stdout
        payload = json.loads(result.stdout[json_start:])

        google = payload.get("google", {})
        assert "error" not in google, payload
        assert int(google.get("status", 0)) >= 200, payload
        assert int(google.get("status", 0)) < 400, payload

    print("OK: asyncio Google request test passed")


if __name__ == "__main__":
    asyncio.run(main())

