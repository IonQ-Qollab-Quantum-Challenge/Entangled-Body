from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

from config.env import load_env_files
from quantum.mapper import REGIONS, build_entanglement_links, counts_to_node_states, counts_to_region_states
from quantum.run_simulator import run_aer_measurement

DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "precomputed_samples.json"
HARDWARE_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "hardware_samples.json"
HARDWARE_INTERACTIONS = ("click", "hold")

_DONE_STATES = {"DONE", "COMPLETED", "SUCCESS"}
_FAILED_STATES = {"ERROR", "CANCELLED", "CANCELED", "FAILED"}


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


def _job_status_name(job: Any) -> str:
    status = getattr(job, "status", None)
    value = status() if callable(status) else status
    return str(value).rsplit(".", 1)[-1].strip().upper()


def _run_hardware_circuit(backend: Any, circuit: Any, shots: int, max_wait: float, poll: float) -> dict[str, int]:
    """Submit one circuit to the QPU and block (offline) until it finishes."""

    job = backend.run(circuit, shots=shots)
    start = time.monotonic()
    while True:
        status = _job_status_name(job)
        if status in _DONE_STATES:
            break
        if status in _FAILED_STATES:
            raise RuntimeError(f"QPU job ended in failure state: {status}")
        if time.monotonic() - start > max_wait:
            raise TimeoutError(f"QPU job exceeded --max-wait={max_wait}s (last status {status})")
        time.sleep(poll)

    result = job.result()
    try:
        counts = result.get_counts(circuit)
    except TypeError:
        counts = result.get_counts()
    return {str(bit): int(count) for bit, count in dict(counts).items()}


def build_hardware_samples(
    regions: list[str],
    interactions: tuple[str, ...] = HARDWARE_INTERACTIONS,
    shots: int = 1024,
    max_wait: float = 3600.0,
    poll: float = 5.0,
    backend_name: str | None = None,
) -> dict[str, Any]:
    """Run the finite set of collapse circuits on real IonQ hardware once.

    Each (region, interaction) pair fully determines a collapse circuit, so this
    enumerates the whole reachable hardware input space and stores genuine QPU
    counts the API can later serve instantly.
    """

    load_env_files()
    if not os.getenv("IONQ_API_KEY"):
        raise RuntimeError("IONQ_API_KEY is not set; cannot run hardware precompute.")

    from qiskit_ionq import IonQProvider  # type: ignore

    from quantum.circuits import build_measurement_circuit
    from quantum.run_ionq import _qpu_backend_name

    backend_name = backend_name or _qpu_backend_name()
    provider = IonQProvider(token=os.getenv("IONQ_API_KEY"))
    backend = provider.get_backend(backend_name)

    total = len(regions) * len(interactions)
    done = 0
    samples: dict[str, Any] = {}
    for region in regions:
        samples[region] = {}
        for interaction in interactions:
            done += 1
            print(f"[{done}/{total}] {region}/{interaction} -> {backend_name} (shots={shots})", flush=True)
            circuit = build_measurement_circuit(region=region, intensity=1.0, interaction=interaction)
            started = time.monotonic()
            counts = _run_hardware_circuit(backend, circuit, shots, max_wait, poll)
            elapsed = time.monotonic() - started
            print(f"    done in {elapsed:.1f}s, {len(counts)} bitstrings", flush=True)
            samples[region][interaction] = {
                "counts": counts,
                "shots": shots,
                "backend": backend_name,
            }

    return {
        "source": "precomputed-hardware",
        "version": 1,
        "backend": backend_name,
        "shots": shots,
        "interactions": list(interactions),
        "samples": samples,
    }


def write_hardware_samples(
    output_path: Path = HARDWARE_OUTPUT_PATH,
    interactions: tuple[str, ...] = HARDWARE_INTERACTIONS,
    shots: int = 1024,
    max_wait: float = 3600.0,
    poll: float = 5.0,
    backend_name: str | None = None,
) -> dict[str, Any]:
    payload = build_hardware_samples(
        regions=list(REGIONS),
        interactions=interactions,
        shots=shots,
        max_wait=max_wait,
        poll=poll,
        backend_name=backend_name,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate precomputed weak-measurement samples.")
    parser.add_argument(
        "--target",
        choices=["aer", "hardware"],
        default="aer",
        help="aer: Aer hover samples for /precomputed; hardware: real QPU collapse samples for /measure.",
    )
    parser.add_argument("--shots-hardware", type=int, default=1024, help="shots per hardware circuit (--target hardware)")
    parser.add_argument(
        "--interactions",
        default=",".join(HARDWARE_INTERACTIONS),
        help="comma-separated collapse interactions to run on hardware",
    )
    parser.add_argument("--max-wait", type=float, default=3600.0, help="per-job timeout in seconds (--target hardware)")
    parser.add_argument("--poll", type=float, default=5.0, help="seconds between status polls (--target hardware)")
    parser.add_argument("--output", type=Path, default=None, help="defaults per --target")
    parser.add_argument("--intensity", type=float, default=0.45)
    parser.add_argument("--shots", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.target == "hardware":
        interactions = tuple(item.strip() for item in args.interactions.split(",") if item.strip())
        output_path = args.output or HARDWARE_OUTPUT_PATH
        payload = write_hardware_samples(
            output_path=output_path,
            interactions=interactions,
            shots=max(1, min(args.shots_hardware, 8192)),
            max_wait=args.max_wait,
            poll=args.poll,
        )
        print(f"Wrote hardware samples for {len(payload['samples'])} regions to {output_path}")
        return

    output_path = args.output or DEFAULT_OUTPUT_PATH
    payload = write_precomputed_samples(
        output_path=output_path,
        intensity=max(0.0, min(args.intensity, 1.0)),
        shots=max(1, min(args.shots, 8192)),
        seed=args.seed,
    )
    print(f"Wrote {len(payload['samples'])} samples to {output_path}")


if __name__ == "__main__":
    main()
