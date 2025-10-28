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
deno run --allow-read --allow-net --allow-env python_sandbox_tool/main.ts
```

2. The server will start on `http://localhost:45555` (or the port specified in the `PORT` environment variable)

### API Endpoints

#### Run a Python Script
```bash
POST /runscript
Content-Type: application/json

{
  "directory": "/path/to/python/files",
  "filename": "script.py"
}
```

#### Check if Packages Exist
```bash
POST /checkpackages
Content-Type: application/json

{
  "directory": "/path/to/python/files",
  "packages": ["numpy", "pandas", "requests"]
}
```

#### Install Python Packages
```bash
POST /installpackages
Content-Type: application/json

{
  "directory": "/path/to/python/files",
  "packages": ["numpy", "matplotlib"]
}
```

### Example Usage

1. Create a Python file (e.g., `test.py`):
```python
print("Hello from sandboxed Python!")
import sys
print(f"Python version: {sys.version}")
```

2. Run it:
```bash
curl -X POST http://localhost:45555/runscript \
  -H "Content-Type: application/json" \
  -d '{"directory": "./", "filename": "test.py"}'
```

## Building a Binary

To create a standalone executable:

```bash
deno compile --allow-read --allow-net --allow-env --output python-sandbox-tool python_sandbox_tool/main.ts
```

This creates a self-contained binary that doesn't require Deno to be installed.

## Limitations

- Python packages must be compatible with Pyodide
- Some Python features may not be available in the WASM environment
- File access is limited to the specified directory
- No access to system resources or external networks
