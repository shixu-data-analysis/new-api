#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: bash scripts/run-docker-gate.sh <command> [args...]" >&2
  exit 2
fi

web_root="$(cd "$(dirname "$0")/.." && pwd)"
run_id="$(date +%Y%m%d%H%M%S)-$$"
container_name="canvas-new-api-verify-$run_id"
dependency_key="$(shasum -a 256 "$web_root/package.json" "$web_root/bun.lock" "$web_root/Dockerfile.verify" | awk '{print $1}' | shasum -a 256 | awk '{print $1}')"
dependency_image="canvas-new-api-verify-deps:$dependency_key"
started_at="$(date +%s)"

cleanup() {
  local original_status=$?
  local cleanup_status=0
  local containers volumes

  trap - EXIT INT TERM
  set +e
  docker rm -f "$container_name" >/dev/null 2>&1

  containers="$(docker ps -aq --filter "name=^/${container_name}$")"
  volumes="$(docker volume ls -q --filter "label=com.canvas.verification-run=$run_id")"
  if [[ -n "$containers" || -n "$volumes" ]]; then
    echo "Web verification cleanup left Docker resources for run $run_id" >&2
    cleanup_status=1
  else
    echo "Web verification Docker cleanup passed for run $run_id: no container or run-owned volume remains."
  fi
  echo "Web verification run finished in $(($(date +%s) - started_at))s with status $original_status."

  if [[ "$original_status" -ne 0 ]]; then
    exit "$original_status"
  fi
  exit "$cleanup_status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if docker image inspect "$dependency_image" >/dev/null 2>&1; then
  echo "Reusing verified Web dependency image: $dependency_image"
else
  build_started_at="$(date +%s)"
  docker build \
    --file "$web_root/Dockerfile.verify" \
    --tag "$dependency_image" \
    "$web_root"
  echo "Web verification dependency image ready in $(($(date +%s) - build_started_at))s."
fi

mount_args=()
while IFS= read -r -d '' entry; do
  name="${entry##*/}"
  case "$name" in
    .git | node_modules | dist | .env | .env.*) continue ;;
  esac
  mount_args+=(--mount "type=bind,src=$entry,dst=/app/$name")
done < <(find "$web_root" -mindepth 1 -maxdepth 1 -print0)

docker run \
  --name "$container_name" \
  --rm \
  --label com.canvas.scope=automated-verification \
  --label "com.canvas.verification-run=$run_id" \
  "${mount_args[@]}" \
  --workdir /app \
  "$dependency_image" \
  "$@"
