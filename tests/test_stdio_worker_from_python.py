import json
import queue
import subprocess
import threading
from pathlib import Path


def start_worker(worker_path: str) -> tuple[subprocess.Popen, "queue.Queue[str]"]:
    # One long-running Deno process that speaks newline-delimited JSON over stdio.
    cmd = [
        "deno",
        "run",
        "--allow-env",
        "--allow-net",
        "--allow-read",
        "--allow-write",
        worker_path,
    ]

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered
    )

    assert proc.stdin is not None
    assert proc.stdout is not None
    assert proc.stderr is not None

    stderr = proc.stderr

    stderr_lines: "queue.Queue[str]" = queue.Queue()

    def drain_stderr() -> None:
        try:
            for line in stderr:
                stderr_lines.put(line)
        except Exception:
            # Best-effort only; main assertions rely on stdout JSON.
            pass

    t = threading.Thread(target=drain_stderr, daemon=True)
    t.start()

    return proc, stderr_lines


def send_request(proc: subprocess.Popen, req: dict) -> dict:
    assert proc.stdin is not None
    assert proc.stdout is not None

    proc.stdin.write(json.dumps(req) + "\n")
    proc.stdin.flush()

    # Worker responses are one JSON object per line.
    while True:
        line = proc.stdout.readline()
        if line == "":
            raise RuntimeError("worker stdout closed unexpectedly")
        line = line.strip()
        if not line:
            continue
        if not line.startswith("{"):
            # Ignore any stray logs on stdout (shouldn't happen, but be defensive).
            continue
        return json.loads(line)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    worker_path = str(repo_root / "python_sandbox_tool" / "main_stdio.ts")
    tests_dir = str(repo_root / "tests")

    proc, stderr_lines = start_worker(worker_path)

    try:
        resp1 = send_request(proc, {"id": 1, "op": "setdirectory", "directory": tests_dir})
        assert resp1.get("ok") is True, resp1

        resp2 = send_request(proc, {"id": 2, "op": "runscript", "filename": "python_file_simple.py"})
        assert resp2.get("ok") is True, resp2

        stdout = (resp2.get("data") or {}).get("stdout") or ""
        assert "hello from python_file_simple.py" in stdout, stdout

        resp3 = send_request(proc, {"id": 3, "op": "shutdown"})
        assert resp3.get("ok") is True, resp3

        proc.wait(timeout=30)
    finally:
        # Best-effort: if something went wrong, terminate to avoid dangling processes.
        try:
            proc.kill()
        except Exception:
            pass

    # If you want to debug failures, print recent stderr lines:
    # while not stderr_lines.empty():
    #     print(stderr_lines.get(), end="")

    print("OK: stdio worker integration test passed")


if __name__ == "__main__":
    main()

