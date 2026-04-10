"""
From repo root::

    ./compile.sh
    uv sync
    uv run python tests/test_asyncio_sandbox_pool.py
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from python_sandbox_client import SandboxPool

_REPO = Path(__file__).resolve().parents[1]


async def main() -> None:
    tests_dir = _REPO / "tests"

    async with SandboxPool(directory=tests_dir, workers=3) as pool:
        r = await pool.run_script("python_file_simple.py")
        assert "hello from python_file_simple.py" in r.stdout, r.stdout

        results = await asyncio.gather(
            pool.run_script("python_file_simple.py"),
            pool.run_script("python_file_simple.py"),
            pool.run_script("python_file_simple.py"),
        )
        for res in results:
            assert "hello from python_file_simple.py" in res.stdout, res.stdout

    print("OK: asyncio SandboxPool integration test passed")


if __name__ == "__main__":
    asyncio.run(main())
