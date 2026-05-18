from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from dotenv import dotenv_values


API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parents[1]
DEFAULT_ENV_FILES = (REPO_ROOT / ".env", API_DIR / ".env")


def load_env_files(env_files: Iterable[Path] = DEFAULT_ENV_FILES) -> None:
    """Load local .env files without replacing non-empty environment variables."""

    for env_path in env_files:
        if not env_path.exists():
            continue
        for key, value in dotenv_values(env_path).items():
            if value is None or os.environ.get(key):
                continue
            os.environ[key] = value

