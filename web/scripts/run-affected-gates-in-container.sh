#!/usr/bin/env bash

set -euo pipefail

tests=()
files=()
web_root="$(pwd -P)"

normalize_file() {
  local kind=$1
  local value=$2
  local absolute
  if [[ -z "$value" || "$value" == -* || "$value" == /* ]]; then
    echo "$kind must be an existing repository-relative file: $value" >&2
    exit 2
  fi
  absolute="$(realpath -e -- "$value" 2>/dev/null)" || {
    echo "$kind does not exist: $value" >&2
    exit 2
  }
  if [[ "$absolute" != "$web_root/"* || ! -f "$absolute" ]]; then
    echo "$kind must stay inside the Web repository and name a file: $value" >&2
    exit 2
  fi
  printf '%s\n' "${absolute#"$web_root/"}"
}

append_unique() {
  local value=$1
  shift
  local existing
  for existing in "$@"; do
    [[ "$existing" == "$value" ]] && return 1
  done
  return 0
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --test)
      [[ "$#" -ge 2 ]] || { echo "--test requires a path" >&2; exit 2; }
      normalized="$(normalize_file "--test" "$2")"
      append_unique "$normalized" "${tests[@]}" && tests+=("$normalized")
      shift 2
      ;;
    --file)
      [[ "$#" -ge 2 ]] || { echo "--file requires a path" >&2; exit 2; }
      normalized="$(normalize_file "--file" "$2")"
      append_unique "$normalized" "${files[@]}" && files+=("$normalized")
      shift 2
      ;;
    *)
      echo "Unknown affected-gate option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${#tests[@]}" -eq 0 || "${#files[@]}" -eq 0 ]]; then
  echo "Usage: run-affected-gates-in-container.sh --test <path> [...] --file <path> [...]" >&2
  exit 2
fi

overall_status=0
run_stage() {
  local name=$1
  shift
  local started_at=$SECONDS
  local stage_status
  echo "Affected Web gate started: $name"
  set +e
  "$@"
  stage_status=$?
  set -e
  echo "Affected Web gate finished: $name ($((SECONDS - started_at))s, status $stage_status)"
  if [[ "$stage_status" -ne 0 ]]; then
    overall_status=1
  fi
}

run_stage "focused tests" bun run test -- "${tests[@]}"
run_stage "typecheck" bun run typecheck
run_stage "affected lint" bun x oxlint -c .oxlintrc.json -- "${files[@]}"
run_stage "affected format check" bun run format:check -- "${files[@]}"
run_stage "production build" bun run build

exit "$overall_status"
