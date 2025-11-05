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

## Building a Binary

To create a standalone executable:

```bash
deno compile --allow-read --allow-net --allow-env --output python-sandbox-tool python_sandbox_tool/main.ts
```

This creates a self-contained binary that doesn't require Deno to be installed. The binary includes all dependencies and can be run directly:

```bash
./python-sandbox-tool
```

## Limitations

- Python packages must be compatible with Pyodide
- Some Python features may not be available in the WASM environment
- File access is limited to the specified directory
- No access to system resources or external networks
