#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: bash scripts/run-docker-gate.sh <command> [args...]" >&2
  exit 2
fi

web_root="$(cd "$(dirname "$0")/.." && pwd)"
run_id="$(date +%Y%m%d%H%M%S)-$$"
container_name="canvas-new-api-verify-$run_id"
volume_name="canvas-new-api-verify-node-modules-$run_id"
volume_created=0

cleanup() {
  local original_status=$?
  local cleanup_status=0
  local containers volumes

  trap - EXIT INT TERM
  set +e
  docker rm -f "$container_name" >/dev/null 2>&1
  if [[ "$volume_created" -eq 1 ]]; then
    docker volume rm "$volume_name" >/dev/null
    cleanup_status=$?
  fi

  containers="$(docker ps -aq --filter "name=^/${container_name}$")"
  volumes="$(docker volume ls -q --filter "name=^${volume_name}$")"
  if [[ -n "$containers" || -n "$volumes" ]]; then
    echo "Web verification cleanup left Docker resources for run $run_id" >&2
    cleanup_status=1
  else
    echo "Web verification Docker cleanup passed for run $run_id: no container or dependency volume remains."
  fi

  if [[ "$original_status" -ne 0 ]]; then
    exit "$original_status"
  fi
  exit "$cleanup_status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker volume create --label com.canvas.scope=automated-verification "$volume_name" >/dev/null
volume_created=1

docker run \
  --name "$container_name" \
  --rm \
  --label com.canvas.scope=automated-verification \
  --mount "type=bind,src=$web_root,dst=/app" \
  --mount "type=volume,src=$volume_name,dst=/app/node_modules" \
  --workdir /app \
  oven/bun:1 \
  sh -lc 'bun install --frozen-lockfile && exec "$@"' sh "$@"
