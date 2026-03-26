# Python Sandbox Tool

A secure Python interpreter sandbox built with Deno and Pyodide that runs Python code in a WebAssembly (WASM) environment.

## What is this?

This tool provides a sandboxed Python interpreter that runs with deno runtime using WebAssembly. It's designed to safely execute Python code without giving access to the host system.

This project was made to be used in the pentesting AI agent [deadend-cli](https://github.com/xoxruns/deadend-cli)

## Security & Sandboxing

The sandbox is protected through multiple layers:

- **WebAssembly Isolation**: Python code runs in a WASM sandbox, completely isolated from the host system
- **No File System Access**: Python code cannot access files outside the designated directory
- **No Network Access**: Python code cannot make network requests unless explicitly allowed
- **Memory Isolation**: Each Python execution runs in its own memory space
- **Controlled Environment**: Only specific Python packages can be loaded

## How to Use

### Running the Server

1. Start the server:
```bash
deno run --allow-read --allow-net --allow-env --allow-write python_sandbox_tool/main.ts
```

2. The server will start on `http://localhost:45555` (or the port specified in the `PORT` environment variable)

### API Endpoints

#### Set Directory
Sets the directory that will be mounted in the Python sandbox environment.

**Request:**
```bash
POST /setdirectory
Content-Type: application/json

{
  "directory": "/path/to/python/files"
}
```

**Response:**
```json
{
  "current_directory": "/path/to/python/files"
}
```

#### Run a Python Script
Executes a Python script from the mounted directory.

**Request:**
```bash
POST /runscript
Content-Type: application/json

{
  "filename": "script.py"
}
```

**Response:**
```json
{
  "result": <return_value>,
  "stdout": "output from print statements",
  "stderr": "error output if any"
}
```

**Note:** The filename should be relative to the mounted directory. If the filename starts with `/mnt`, it will be used as-is; otherwise, it will be prefixed with `/mnt/`.

#### Check if Packages Exist
Checks whether specified Python packages are available in the sandbox.

**Request:**
```bash
POST /checkpackages
Content-Type: application/json

{
  "packages": ["numpy", "pandas", "requests"]
}
```

**Response:**
```json
{
  "results": {
    "numpy": true,
    "pandas": false,
    "requests": true
  }
}
```

#### Install Python Packages
Installs Python packages in the sandbox environment.

**Request:**
```bash
POST /installpackages
Content-Type: application/json

{
  "packages": ["numpy", "matplotlib"]
}
```

**Response:**
```json
{
  "results": {
    "numpy": {
      "success": true
    },
    "matplotlib": {
      "success": false,
      "error": "installation failed"
    }
  }
}
```

### Example Usage with curl

1. **Set the working directory:**
```bash
curl -X POST http://localhost:45555/setdirectory \
  -H "Content-Type: application/json" \
  -d '{"directory": "/path/to/your/python/files"}'
```

2. **Install required packages:**
```bash
curl -X POST http://localhost:45555/installpackages \
  -H "Content-Type: application/json" \
  -d '{"packages": ["requests"]}'
```

3. **Check if packages are available:**
```bash
curl -X POST http://localhost:45555/checkpackages \
  -H "Content-Type: application/json" \
  -d '{"packages": ["numpy", "pandas", "requests"]}'
```

4. **Run a Python script:**
```bash
curl -X POST http://localhost:45555/runscript \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.py"}'
```

**Complete workflow example:**
```bash
# Set the directory
curl -X POST http://localhost:45555/setdirectory \
  -H "Content-Type: application/json" \
  -d '{"directory": "./tests"}'

# Install packages
curl -X POST http://localhost:45555/installpackages \
  -H "Content-Type: application/json" \
  -d '{"packages": ["requests"]}'

# Run a script
curl -X POST http://localhost:45555/runscript \
  -H "Content-Type: application/json" \
  -d '{"filename": "python_file.py"}'
```

### Stdio worker (no HTTP server)

If you prefer not to run an HTTP server, use the stdio worker. It loads Pyodide once, then reads **newline-delimited JSON** on **stdin** and writes **one JSON object per line** on **stdout**. Debug logs go to **stderr** so stdout stays machine-readable.

Start it:

```bash
deno run --allow-env --allow-net --allow-read --allow-write python_sandbox_tool/main_stdio.ts
```

Supported `op` values (each message is a single JSON object; include optional `id` for correlation):

| `op` | Fields | Purpose |
|------|--------|---------|
| `setdirectory` | `directory` | Mount host directory at `/mnt` in the sandbox (call once per worker before other ops) |
| `runscript` | `filename` | Run a file under the mounted directory (or use a path starting with `/mnt/`) |
| `checkpackages` | `packages` | Array of package names to probe |
| `installpackages` | `packages` | Array of package names to install |
| `shutdown` | — | Stop the worker cleanly |

Example (three requests then exit):

```bash
printf '%s\n' \
  '{"op":"setdirectory","directory":"/absolute/path/to/python/files"}' \
  '{"op":"runscript","filename":"script.py"}' \
  '{"op":"shutdown"}' \
| deno run --allow-env --allow-net --allow-read --allow-write python_sandbox_tool/main_stdio.ts
```

### Python client (`python_sandbox_client`, asyncio)

The repo includes a small **asyncio** client that spawns one or more stdio worker subprocesses and exposes a pool API (good for running many scripts with limited concurrency, e.g. five workers).

**Requirements:** [Deno](https://deno.land/) on `PATH`, and [uv](https://docs.astral.sh/uv/) for installing the Python package.

From the repository root:

```bash
uv sync
```

Example:

```python
import asyncio
from pathlib import Path
from python_sandbox_client import SandboxPool

async def main():
    scripts_dir = Path("/absolute/path/to/python/files")
    async with SandboxPool(directory=scripts_dir, workers=5) as pool:
        r = await pool.run_script("script.py")
        print(r.stdout, r.stderr, r.result)

        # concurrent runs (up to `workers` at a time)
        out = await asyncio.gather(
            pool.run_script("a.py"),
            pool.run_script("b.py"),
        )

asyncio.run(main())
```

- **`directory`**: host folder whose files appear under `/mnt` in the sandbox (same idea as `POST /setdirectory`).
- **`workers`**: number of separate Deno/Pyodide processes; use this for parallelism.
- **`worker_ts`**: optional path to `main_stdio.ts`. If omitted, the client assumes the default layout next to this repo (`python_sandbox_tool/main_stdio.ts`).
- **`SandboxPool`** also provides `check_packages(...)` and `install_packages(...)` mapped to the same stdio ops.

**Smoke tests (after `uv sync`):**

```bash
uv run python tests/test_asyncio_sandbox_pool.py
uv run python tests/test_stdio_worker_from_python.py
```

**Deno tests (stdio worker integration):**

```bash
cd python_sandbox_tool
deno task test
```

## Building a Binary

To create a standalone executable:

```bash
deno compile --allow-read --allow-net --allow-env --output python-sandbox-tool python_sandbox_tool/main.ts
```

This creates a self-contained binary that doesn't require Deno to be installed. The binary includes all dependencies and can be run directly:

```bash
./python-sandbox-tool
```

To compile the stdio worker instead of the HTTP server, point `deno compile` at `python_sandbox_tool/main_stdio.ts` (same `--allow-*` flags as above).

## Limitations

- Python packages must be compatible with Pyodide
- Some Python features may not be available in the WASM environment
- File access is limited to the specified directory
- No access to system resources or external networks
