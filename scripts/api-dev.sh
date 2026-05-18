#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "[api-dev] Missing virtualenv. Run ./scripts/setup.sh first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

cd "$ROOT_DIR/apps/api"
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
