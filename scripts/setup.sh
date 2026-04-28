#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
VENV_DIR="$ROOT_DIR/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[setup] python3 is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[setup] npm is required." >&2
  exit 1
fi

echo "[setup] Installing root node dependencies..."
npm install

echo "[setup] Creating python virtualenv at $VENV_DIR"
python3 -m venv "$VENV_DIR"

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

echo "[setup] Installing API python dependencies..."
pip install --upgrade pip
pip install -r "$API_DIR/requirements.txt"

echo "[setup] Done. Next: run 'npm run dev'"
