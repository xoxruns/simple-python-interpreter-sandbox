#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRYPOINT="${ROOT_DIR}/python_sandbox_tool/main_stdio.ts"
CONFIG="${ROOT_DIR}/python_sandbox_tool/deno.json"
LOCKFILE="${ROOT_DIR}/python_sandbox_tool/deno.lock"
OUTPUT_ROOT="${ROOT_DIR}/python_sandbox_client/bin"
WORKER_NAME="python-sandbox-worker"

host_target() {
  local system machine
  system="$(uname -s)"
  machine="$(uname -m)"

  case "${system}:${machine}" in
    Darwin:arm64)
      printf '%s\n' "darwin-arm64"
      ;;
    Linux:x86_64)
      printf '%s\n' "linux-x86_64-gnu"
      ;;
    *)
      printf 'unsupported host platform: %s %s\n' "${system}" "${machine}" >&2
      exit 1
      ;;
  esac
}

deno_target_for() {
  case "$1" in
    darwin-arm64)
      printf '%s\n' "aarch64-apple-darwin"
      ;;
    linux-x86_64-gnu)
      printf '%s\n' "x86_64-unknown-linux-gnu"
      ;;
    *)
      printf 'unsupported compile target: %s\n' "$1" >&2
      exit 1
      ;;
  esac
}

compile_target() {
  local logical_target deno_target output_dir output_bin
  logical_target="$1"
  deno_target="$(deno_target_for "${logical_target}")"
  output_dir="${OUTPUT_ROOT}/${logical_target}"
  output_bin="${output_dir}/${WORKER_NAME}"

  mkdir -p "${output_dir}"

  deno compile \
    --config "${CONFIG}" \
    --lock "${LOCKFILE}" \
    --allow-env \
    --allow-net \
    --allow-read \
    --allow-write \
    --target "${deno_target}" \
    --output "${output_bin}" \
    "${ENTRYPOINT}"
}

if [[ "$#" -eq 0 ]]; then
  compile_target "$(host_target)"
  exit 0
fi

for target in "$@"; do
  compile_target "${target}"
done
