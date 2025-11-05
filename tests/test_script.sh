#!/usr/bin/env bash

set -euo pipefail

SERVER="http://localhost:45555"
TEST_DIR="/home/yass/Documents/python_sandboxed_tool/tests"
PY_FILE="python_file.py"



echo "==> Installing packages (requests)"
curl -sS -X POST "${SERVER}/installpackages" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg dir "$TEST_DIR" '{packages:["requests"]}')" | jq .

echo "==> Checking packages (numpy, pandas, requests)"
curl -sS -X POST "${SERVER}/checkpackages" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg dir "$TEST_DIR" '{packages:["requests"]}')" | jq .

echo "==> Setting directory"
curl -sS -X POST "${SERVER}/setdirectory" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg dir "$TEST_DIR" '{directory:$dir}')" | jq .

echo "==> Running script ${PY_FILE}"
curl -sS -X POST "${SERVER}/runscript" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg dir "$TEST_DIR" --arg file "$PY_FILE" '{filename:$file}')" | jq .

echo "Done."

