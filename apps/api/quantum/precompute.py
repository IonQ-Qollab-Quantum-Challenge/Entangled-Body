from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from quantum.mapper import REGIONS, build_entanglement_links, counts_to_node_states, counts_to_region_states
from quantum.run_simulator import run_aer_measurement

DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "precomputed_samples.json"


def build_precomputed_samples(
    intensity: float = 0.45,
    shots: int = 1024,
    seed: int | None = 42,
) -> dict[str, Any]:
    samples: dict[str, Any] = {}

    for index, region in enumerate(REGIONS):
        measurement = run_aer_measurement(
            region=region,
            intensity=intensity,
            shots=shots,
            interaction="hover",
        )
        counts = measurement.get("counts", {})
        if not isinstance(counts, dict):
            counts = {}

        effective_shots = int(measurement.get("shots", shots))
        region_states = counts_to_region_states(
            counts=counts,
            region=region,
            intensity=intensity,
            shots=effective_shots,
            seed=None if seed is None else seed + index,
        )
        samples[region] = {
            **measurement,
            "region": region,
            "regionStates": region_states,
            "entanglementLinks": build_entanglement_links(region_states),
            "nodeStates": counts_to_node_states(
                counts=counts,
                region_states=region_states,
                interaction="hover",
                shots=effective_shots,
            ),
        }

    return {
        "source": "precomputed",
        "version": 1,
        "intensity": intensity,
        "shots": shots,
        "samples": samples,
    }


def write_precomputed_samples(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    intensity: float = 0.45,
    shots: int = 1024,
    seed: int | None = 42,
) -> dict[str, Any]:
    payload = build_precomputed_samples(intensity=intensity, shots=shots, seed=seed)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate precomputed weak-measurement samples.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--intensity", type=float, default=0.45)
    parser.add_argument("--shots", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    payload = write_precomputed_samples(
        output_path=args.output,
        intensity=max(0.0, min(args.intensity, 1.0)),
        shots=max(1, min(args.shots, 8192)),
        seed=args.seed,
    )
    print(f"Wrote {len(payload['samples'])} samples to {args.output}")


if __name__ == "__main__":
    main()
