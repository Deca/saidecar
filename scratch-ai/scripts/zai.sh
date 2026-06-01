#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ -n "${ZELLIJ:-}" ]]; then
  npm run zellij:pane
  exit $?
fi

npm run zellij:session
