from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_PATH = ROOT / "apps" / "api"
sys.path.insert(0, str(API_PATH))

from quantum.mapper import build_entanglement_links, counts_to_node_states, counts_to_region_states
from quantum.run_simulator import run_aer_measurement


def main() -> None:
    region = sys.argv[1] if len(sys.argv) > 1 else "torso"
    measurement = run_aer_measurement(region=region, intensity=1.0, shots=512, interaction="click")
    counts = measurement["counts"]
    region_states = counts_to_region_states(counts=counts, region=region, intensity=1.0, shots=int(measurement["shots"]))
    payload = {
        **measurement,
        "region": region,
        "regionStates": region_states,
        "entanglementLinks": build_entanglement_links(region_states),
        "nodeStates": counts_to_node_states(
            counts=counts,
            region_states=region_states,
            interaction="click",
            shots=int(measurement["shots"]),
        ),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
