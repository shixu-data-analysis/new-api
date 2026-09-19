#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: bash scripts/run-docker-affected-gate.sh --test <path> [...] --file <path> [...]" >&2
  exit 2
fi

web_root="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$web_root/scripts/run-docker-gate.sh" \
  bash scripts/run-affected-gates-in-container.sh "$@"
