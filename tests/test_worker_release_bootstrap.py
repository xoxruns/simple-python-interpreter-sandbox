"""
Verify the client can bootstrap a worker binary from a release-style URL.

From repo root::

    UV_CACHE_DIR=$(pwd)/.uv-cache uv run python tests/test_worker_release_bootstrap.py
"""

from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path

import python_sandbox_client.pool as pool_module


def main() -> None:
    original_bundled = pool_module._bundled_worker_path

    try:
        with tempfile.TemporaryDirectory() as temp_dir_s:
            temp_dir = Path(temp_dir_s)
            release_root = temp_dir / "releases" / "download"
            cache_root = temp_dir / "cache"
            release_tag = "v0.1.0"
            target = "linux-x86_64-gnu"
            asset_name = f"python-sandbox-worker-{target}"
            asset_path = release_root / release_tag / asset_name
            asset_path.parent.mkdir(parents=True, exist_ok=True)
            asset_path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            asset_path.chmod(asset_path.stat().st_mode | stat.S_IXUSR)

            os.environ["PYTHON_SANDBOX_WORKER_CACHE_DIR"] = str(cache_root)
            os.environ["PYTHON_SANDBOX_WORKER_RELEASE_BASE_URL"] = release_root.as_uri()
            os.environ["PYTHON_SANDBOX_WORKER_RELEASE_TAG"] = release_tag
            os.environ.pop("PYTHON_SANDBOX_WORKER_BIN", None)

            # Force the resolver down the release-bootstrap path.
            pool_module._bundled_worker_path = lambda: temp_dir / "missing-worker"  # type: ignore[assignment]

            resolved = pool_module._default_worker_bin()

            assert resolved.is_file(), resolved
            assert resolved.read_text(encoding="utf-8") == "#!/bin/sh\nexit 0\n"
            assert resolved.parent == cache_root / "workers" / release_tag / target
    finally:
        pool_module._bundled_worker_path = original_bundled
        os.environ.pop("PYTHON_SANDBOX_WORKER_CACHE_DIR", None)
        os.environ.pop("PYTHON_SANDBOX_WORKER_RELEASE_BASE_URL", None)
        os.environ.pop("PYTHON_SANDBOX_WORKER_RELEASE_TAG", None)

    print("OK: worker release bootstrap test passed")


if __name__ == "__main__":
    main()
