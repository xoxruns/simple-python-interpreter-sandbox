from __future__ import annotations

import asyncio
import json
import os
import platform
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any


_BUNDLED_WORKER_ENV_VAR = "PYTHON_SANDBOX_WORKER_BIN"
_BUNDLED_WORKER_NAME = "python-sandbox-worker"


def _platform_tag(system: str | None = None, machine: str | None = None) -> str:
    system_name = system or platform.system()
    machine_name = (machine or platform.machine()).lower()

    if system_name == "Darwin" and machine_name in {"arm64", "aarch64"}:
        return "darwin-arm64"
    if system_name == "Linux" and machine_name in {"x86_64", "amd64"}:
        return "linux-x86_64-gnu"

    raise RuntimeError(
        "Unsupported platform for bundled sandbox worker: "
        f"{system_name} {machine_name}. "
        "Supported targets are macOS arm64 and Linux x86_64 glibc.",
    )


def _bundled_worker_path() -> Path:
    package_root = Path(__file__).resolve().parent
    return package_root / "bin" / _platform_tag() / _BUNDLED_WORKER_NAME


def _default_worker_bin() -> Path:
    override = os.environ.get(_BUNDLED_WORKER_ENV_VAR)
    if override:
        return Path(override).expanduser().resolve()
    return _bundled_worker_path()


def _missing_worker_error(worker_bin: Path) -> FileNotFoundError:
    return FileNotFoundError(
        "sandbox worker binary not found: "
        f"{worker_bin}. Build it with ./compile.sh or set "
        f"{_BUNDLED_WORKER_ENV_VAR} to an explicit worker binary.",
    )


def _ensure_executable(worker_bin: Path) -> None:
    if os.name == "nt":
        return

    mode = worker_bin.stat().st_mode
    desired = mode | stat.S_IXUSR
    if desired != mode:
        worker_bin.chmod(desired)


@dataclass(frozen=True)
class RunScriptResult:
    result: Any
    stdout: str
    stderr: str


class SandboxError(RuntimeError):
    def __init__(self, message: str, response: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.response = response


class _StdioWorker:
    """One Deno stdio worker: single in-flight request at a time (serialized by _io_lock)."""

    def __init__(
        self,
        *,
        directory: str,
        package_cache_dir: str | None,
        worker_bin: Path,
        request_timeout: float | None,
    ) -> None:
        self._directory = directory
        self._package_cache_dir = package_cache_dir
        self._worker_bin = worker_bin
        self._request_timeout = request_timeout
        self._proc: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._stderr_task: asyncio.Task[None] | None = None
        self._pending: dict[int | str, asyncio.Future[dict[str, Any]]] = {}
        self._pending_lock = asyncio.Lock()
        self._io_lock = asyncio.Lock()
        self._next_req_id = 0

    def _alloc_id(self) -> int:
        self._next_req_id += 1
        return self._next_req_id

    async def start(self) -> None:
        env = dict(os.environ)
        if self._package_cache_dir is not None:
            env["PYODIDE_PACKAGE_CACHE_DIR"] = self._package_cache_dir

        self._proc = await asyncio.create_subprocess_exec(
            str(self._worker_bin),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None
        assert self._proc.stderr is not None

        self._reader_task = asyncio.create_task(self._read_stdout_loop())
        self._stderr_task = asyncio.create_task(self._drain_stderr_loop())

        await self._request({"op": "setdirectory", "directory": self._directory})

    async def _read_stdout_loop(self) -> None:
        assert self._proc is not None
        stdout = self._proc.stdout
        assert stdout is not None
        while True:
            line_b = await stdout.readline()
            if not line_b:
                break
            line = line_b.decode(errors="replace").strip()
            if not line or not line.startswith("{"):
                continue
            try:
                msg: dict[str, Any] = json.loads(line)
            except json.JSONDecodeError:
                continue
            rid = msg.get("id")
            async with self._pending_lock:
                fut = self._pending.pop(rid, None)
            if fut is not None and not fut.done():
                fut.set_result(msg)

        async with self._pending_lock:
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(
                        RuntimeError("sandbox worker stdout closed unexpectedly"),
                    )
            self._pending.clear()

    async def _drain_stderr_loop(self) -> None:
        assert self._proc is not None
        stderr = self._proc.stderr
        assert stderr is not None
        while True:
            line = await stderr.readline()
            if not line:
                break

    async def _raw_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("worker not started")

        rid = self._alloc_id()
        body = {**payload, "id": rid}
        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()

        async with self._io_lock:
            async with self._pending_lock:
                self._pending[rid] = fut
            data = (json.dumps(body, separators=(",", ":")) + "\n").encode()
            self._proc.stdin.write(data)
            await self._proc.stdin.drain()
            try:
                if self._request_timeout is None:
                    return await fut
                return await asyncio.wait_for(fut, timeout=self._request_timeout)
            except TimeoutError:
                async with self._pending_lock:
                    self._pending.pop(rid, None)
                raise

    async def _request(self, payload: dict[str, Any]) -> Any:
        msg = await self._raw_request(payload)
        if not msg.get("ok"):
            raise SandboxError(str(msg.get("error", "unknown error")), msg)
        return msg.get("data")

    async def run_script(self, filename: str) -> RunScriptResult:
        data = await self._request({"op": "runscript", "filename": filename})
        d = data or {}
        return RunScriptResult(
            result=d.get("result"),
            stdout=str(d.get("stdout") or ""),
            stderr=str(d.get("stderr") or ""),
        )

    async def check_packages(self, packages: list[str]) -> dict[str, bool]:
        data = await self._request({"op": "checkpackages", "packages": packages})
        return dict(data.get("results") or {})

    async def install_packages(self, packages: list[str]) -> dict[str, Any]:
        data = await self._request({"op": "installpackages", "packages": packages})
        return dict(data.get("results") or {})

    async def shutdown(self) -> None:
        if self._proc is None:
            return
        if self._proc.returncode is not None:
            return

        try:
            await self._raw_request({"op": "shutdown"})
        except Exception:
            pass

        try:
            self._proc.terminate()
            await asyncio.wait_for(self._proc.wait(), timeout=5.0)
        except (TimeoutError, ProcessLookupError):
            try:
                self._proc.kill()
            except ProcessLookupError:
                pass

        if self._reader_task is not None:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass


class SandboxPool:
    """
    Pool of stdio workers for concurrent script runs (one active request per worker).

    Example::

        async with SandboxPool(
            directory="/path/to/scripts",
            package_cache_dir="/path/to/pyodide-cache",
            workers=5,
        ) as pool:
            r = await pool.run_script("foo.py")
            results = await asyncio.gather(
                pool.run_script("a.py"),
                pool.run_script("b.py"),
            )
    """

    def __init__(
        self,
        directory: str | Path,
        *,
        workers: int = 5,
        package_cache_dir: str | Path | None = None,
        worker_bin: str | Path | None = None,
        request_timeout: float | None = 120.0,
    ) -> None:
        if workers < 1:
            raise ValueError("workers must be >= 1")
        self._directory = str(Path(directory).resolve())
        self._package_cache_dir = (
            str(Path(package_cache_dir).resolve())
            if package_cache_dir is not None
            else None
        )
        self._workers_n = workers
        self._worker_bin = (
            Path(worker_bin).expanduser().resolve()
            if worker_bin is not None
            else _default_worker_bin()
        )
        self._request_timeout = request_timeout
        self._workers: list[_StdioWorker] = []
        self._rr = 0
        self._rr_lock = asyncio.Lock()

    async def __aenter__(self) -> SandboxPool:
        if not self._worker_bin.is_file():
            raise _missing_worker_error(self._worker_bin)

        _ensure_executable(self._worker_bin)

        self._workers = [
            _StdioWorker(
                directory=self._directory,
                package_cache_dir=self._package_cache_dir,
                worker_bin=self._worker_bin,
                request_timeout=self._request_timeout,
            )
            for _ in range(self._workers_n)
        ]
        await asyncio.gather(*(w.start() for w in self._workers))
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await asyncio.gather(*(w.shutdown() for w in self._workers))
        self._workers.clear()

    async def _pick_worker(self) -> _StdioWorker:
        async with self._rr_lock:
            w = self._workers[self._rr % len(self._workers)]
            self._rr += 1
            return w

    async def run_script(self, filename: str) -> RunScriptResult:
        return await (await self._pick_worker()).run_script(filename)

    async def check_packages(self, packages: list[str]) -> dict[str, bool]:
        return await (await self._pick_worker()).check_packages(packages)

    async def install_packages(self, packages: list[str]) -> dict[str, Any]:
        return await (await self._pick_worker()).install_packages(packages)
