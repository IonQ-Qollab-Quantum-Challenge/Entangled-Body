from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_PATH = ROOT / "apps" / "api"
sys.path.insert(0, str(API_PATH))

from quantum.precompute import main


if __name__ == "__main__":
    main()
