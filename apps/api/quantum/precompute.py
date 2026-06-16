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


def _write_hardware_payload(output_path: Path, payload: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _load_hardware_payload(
    output_path: Path,
    backend_name: str,
    shots: int,
    interactions: tuple[str, ...],
) -> dict[str, Any]:
    """Reuse an existing hardware file so completed samples are not re-run.

    QPU jobs are slow and metered, so resuming an interrupted run (timeout,
    quota, network) instead of starting over is essential.
    """

    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = None
        if isinstance(existing, dict) and isinstance(existing.get("samples"), dict):
            existing["backend"] = backend_name
            existing["shots"] = shots
            existing["interactions"] = list(interactions)
            return existing

    return {
        "source": "precomputed-hardware",
        "version": 1,
        "backend": backend_name,
        "shots": shots,
        "interactions": list(interactions),
        "samples": {},
    }


def _completed_count(samples: dict[str, Any]) -> int:
    return sum(
        1
        for region in samples.values()
        if isinstance(region, dict)
        for entry in region.values()
        if isinstance(entry, dict) and entry.get("counts")
    )


def build_hardware_samples(
    output_path: Path,
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

    Progress is written to ``output_path`` after every sample and re-used on the
    next run, so an interruption (quota exhausted, timeout, network drop) never
    discards completed QPU jobs — re-running the same command resumes the rest.
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

    payload = _load_hardware_payload(output_path, backend_name, shots, interactions)
    samples: dict[str, Any] = payload["samples"]

    total = len(regions) * len(interactions)
    done = 0
    for region in regions:
        samples.setdefault(region, {})
        for interaction in interactions:
            done += 1
            existing = samples[region].get(interaction)
            # Skip only genuine hardware results; predicted (Aer) placeholders are
            # re-run on real hardware so they get upgraded when quota is available.
            if isinstance(existing, dict) and existing.get("counts") and not existing.get("predicted"):
                print(f"[{done}/{total}] {region}/{interaction} -> already done, skipping", flush=True)
                continue

            print(f"[{done}/{total}] {region}/{interaction} -> {backend_name} (shots={shots})", flush=True)
            circuit = build_measurement_circuit(region=region, intensity=1.0, interaction=interaction)
            started = time.monotonic()
            try:
                counts = _run_hardware_circuit(backend, circuit, shots, max_wait, poll)
            except Exception as exc:
                _write_hardware_payload(output_path, payload)
                completed = _completed_count(samples)
                print(f"\n[stopped] {region}/{interaction} failed: {exc}", flush=True)
                print(
                    f"Saved {completed}/{total} completed samples to {output_path}. "
                    "Re-run the same command to resume the remaining samples.",
                    flush=True,
                )
                raise
            elapsed = time.monotonic() - started
            print(f"    done in {elapsed:.1f}s, {len(counts)} bitstrings", flush=True)

            samples[region][interaction] = {
                "counts": counts,
                "shots": shots,
                "backend": backend_name,
            }
            _write_hardware_payload(output_path, payload)  # persist after every sample

    return payload


def fill_predicted_samples(
    output_path: Path = HARDWARE_OUTPUT_PATH,
    interactions: tuple[str, ...] = HARDWARE_INTERACTIONS,
    shots: int = 1024,
    backend_name: str | None = None,
) -> dict[str, Any]:
    """Fill every (region, interaction) that lacks a real hardware result with a
    predicted distribution from the ideal Aer simulator.

    The collapse circuit is fully determined by (region, interaction), so an
    ideal noiseless simulation is the natural expected-value stand-in for a QPU
    run we have not (yet) executed. These entries are tagged ``predicted: True``
    so the API can flag them and so a later ``--target hardware`` run overwrites
    them with genuine hardware counts. Real hardware entries are left untouched.
    """

    from quantum.run_ionq import _qpu_backend_name

    backend_name = backend_name or _qpu_backend_name()
    payload = _load_hardware_payload(output_path, backend_name, shots, interactions)
    samples: dict[str, Any] = payload["samples"]

    filled = 0
    for region in REGIONS:
        samples.setdefault(region, {})
        for interaction in interactions:
            existing = samples[region].get(interaction)
            if isinstance(existing, dict) and existing.get("counts") and not existing.get("predicted"):
                continue  # keep genuine hardware results

            measurement = run_aer_measurement(
                region=region,
                intensity=1.0,
                shots=shots,
                interaction=interaction,
            )
            counts = measurement.get("counts")
            if not isinstance(counts, dict):
                counts = {}
            samples[region][interaction] = {
                "counts": {str(bit): int(c) for bit, c in counts.items()},
                "shots": int(measurement.get("shots", shots)),
                "backend": "aer-predicted",
                "predicted": True,
            }
            filled += 1
            print(f"predicted {region}/{interaction} ({len(counts)} bitstrings)", flush=True)

    _write_hardware_payload(output_path, payload)
    print(f"Filled {filled} predicted samples; wrote {output_path}", flush=True)
    return payload


def write_hardware_samples(
    output_path: Path = HARDWARE_OUTPUT_PATH,
    interactions: tuple[str, ...] = HARDWARE_INTERACTIONS,
    shots: int = 1024,
    max_wait: float = 3600.0,
    poll: float = 5.0,
    backend_name: str | None = None,
) -> dict[str, Any]:
    payload = build_hardware_samples(
        output_path=output_path,
        regions=list(REGIONS),
        interactions=interactions,
        shots=shots,
        max_wait=max_wait,
        poll=poll,
        backend_name=backend_name,
    )
    _write_hardware_payload(output_path, payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate precomputed weak-measurement samples.")
    parser.add_argument(
        "--target",
        choices=["aer", "hardware", "hardware-predict"],
        default="aer",
        help=(
            "aer: Aer hover samples for /precomputed; hardware: real QPU collapse samples for /measure; "
            "hardware-predict: fill missing (region, interaction) with ideal Aer predictions tagged predicted=True."
        ),
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

    if args.target == "hardware-predict":
        interactions = tuple(item.strip() for item in args.interactions.split(",") if item.strip())
        output_path = args.output or HARDWARE_OUTPUT_PATH
        payload = fill_predicted_samples(
            output_path=output_path,
            interactions=interactions,
            shots=max(1, min(args.shots_hardware, 8192)),
        )
        print(f"Hardware samples now cover {len(payload['samples'])} regions in {output_path}")
        return

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
