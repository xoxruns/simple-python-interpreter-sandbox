"""
Verify Pyodide wheels go to ``package_cache_dir``, not the mounted script directory.

From repo root::

    ./compile.sh
    uv sync
    uv run python tests/test_package_cache_separate.py
"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from python_sandbox_client import SandboxPool


async def main() -> None:
    with tempfile.TemporaryDirectory() as scripts_dir_s, tempfile.TemporaryDirectory() as cache_dir_s:
        scripts_dir = Path(scripts_dir_s)
        cache_dir = Path(cache_dir_s)

        (scripts_dir / "only_here.py").write_text(
            'print("only_here")\n',
            encoding="utf-8",
        )

        async with SandboxPool(
            directory=scripts_dir,
            package_cache_dir=cache_dir,
            workers=1,
        ) as pool:
            installed = await pool.install_packages(["certifi"])
            assert installed.get("certifi", {}).get("success") is True, installed

            r = await pool.run_script("only_here.py")
            assert "only_here" in r.stdout, r.stdout

        whl_in_scripts = list(scripts_dir.glob("*.whl"))
        assert whl_in_scripts == [], f"unexpected wheels in script dir: {whl_in_scripts}"

        cache_files = list(cache_dir.rglob("*"))
        cache_regular = [p for p in cache_files if p.is_file()]
        assert len(cache_regular) > 0, "expected some files under package cache dir"

    print("OK: package cache is separate from script directory")


if __name__ == "__main__":
    asyncio.run(main())
