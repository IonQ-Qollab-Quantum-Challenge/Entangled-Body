"""Measure real IonQ hardware latency end-to-end.

Submits a single QPU job (the same circuit the app uses for a deliberate
collapse) and prints elapsed time at every status transition, so we can see
how much of the wait is queue vs. execution.

Usage (from apps/api/):
    python -m tests.probe_hardware_timing
    python -m tests.probe_hardware_timing --region head --interaction click --shots 256

Needs IONQ_API_KEY set (apps/api/.env is loaded automatically).
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from config.env import load_env_files
from quantum.circuits import build_measurement_circuit
from quantum.run_ionq import _qpu_backend_name

load_env_files()


def _status_name(job) -> str:
    status = getattr(job, "status", None)
    value = status() if callable(status) else status
    return str(value).rsplit(".", 1)[-1].strip().upper()


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe IonQ hardware latency.")
    parser.add_argument("--region", default="torso")
    parser.add_argument("--interaction", default="click", choices=["hover", "click", "hold"])
    parser.add_argument("--shots", type=int, default=256)
    parser.add_argument("--poll", type=float, default=5.0, help="seconds between status polls")
    parser.add_argument("--max-wait", type=float, default=3600.0, help="give up after N seconds")
    args = parser.parse_args()

    if not os.getenv("IONQ_API_KEY"):
        print("ERROR: IONQ_API_KEY is empty. Fill it in apps/api/.env first.", file=sys.stderr)
        return 2

    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError:
        print("ERROR: qiskit-ionq is not installed.", file=sys.stderr)
        return 2

    backend_name = _qpu_backend_name()
    print(f"Backend: {backend_name}  region={args.region}  interaction={args.interaction}  shots={args.shots}")

    provider = IonQProvider(token=os.getenv("IONQ_API_KEY"))
    backend = provider.get_backend(backend_name)
    circuit = build_measurement_circuit(
        region=args.region,
        intensity=1.0,
        interaction=args.interaction,
    )
    print(f"Circuit: {circuit.num_qubits} qubits, depth {circuit.depth()}, {circuit.size()} ops")

    t0 = time.monotonic()
    job = backend.run(circuit, shots=args.shots)
    submit_elapsed = time.monotonic() - t0
    job_id = job.job_id() if callable(getattr(job, "job_id", None)) else getattr(job, "job_id", None)
    print(f"[t+{submit_elapsed:6.1f}s] SUBMITTED  jobId={job_id}")

    last_status = None
    while True:
        elapsed = time.monotonic() - t0
        status = _status_name(job)
        if status != last_status:
            print(f"[t+{elapsed:6.1f}s] {status}")
            last_status = status
        if status in {"DONE", "COMPLETED", "SUCCESS"}:
            break
        if status in {"ERROR", "CANCELLED", "CANCELED", "FAILED"}:
            print(f"[t+{elapsed:6.1f}s] job ended in failure state: {status}", file=sys.stderr)
            return 1
        if elapsed > args.max_wait:
            print(f"[t+{elapsed:6.1f}s] gave up after --max-wait={args.max_wait}s (still {status})", file=sys.stderr)
            return 1
        time.sleep(args.poll)

    result = job.result()
    total = time.monotonic() - t0
    try:
        counts = dict(result.get_counts(circuit))
    except TypeError:
        counts = dict(result.get_counts())
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    print(f"\nTOTAL: {total:.1f}s to first real result")
    print(f"Top bitstrings: {top}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
