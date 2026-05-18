from __future__ import annotations

from qiskit import transpile
from qiskit_aer import AerSimulator

from quantum.circuits import QUBIT_COUNT, build_measurement_circuit, circuit_type_for_interaction
from quantum.mapper import get_region_entries


def build_counts_payload(
    counts: dict[str, int],
    shots: int,
    backend: str,
    interaction: str,
    source: str | None = None,
) -> dict[str, object]:
    dominant = max(counts.items(), key=lambda item: item[1])[0] if counts else ""
    probabilities = {
        bitstring: round(count / shots, 6)
        for bitstring, count in sorted(counts.items())
    }

    return {
        "counts": counts,
        "probabilities": probabilities,
        "dominantBitstring": dominant,
        "shots": shots,
        "qubits": QUBIT_COUNT,
        "backend": backend,
        "circuitType": circuit_type_for_interaction(interaction),
        "source": source or backend,
    }


def run_aer_measurement(
    region: str,
    intensity: float = 1.0,
    shots: int = 1,
    interaction: str = "hover",
    seed: int | None = None,
) -> dict[str, object]:
    safe_shots = max(1, min(int(shots), 8192))
    try:
        circuit = build_measurement_circuit(
            region=region,
            intensity=intensity,
            interaction=interaction,
        )
        simulator = AerSimulator(seed_simulator=seed)
        compiled = transpile(circuit, simulator, seed_transpiler=seed)
        result = simulator.run(compiled, shots=safe_shots, seed_simulator=seed).result()
        counts = dict(result.get_counts(compiled))
        source = "aer"
        error = None
    except Exception as exc:
        counts = _fallback_counts(region=region, shots=safe_shots)
        source = "fallback"
        error = str(exc)

    payload = build_counts_payload(counts, safe_shots, source, interaction, source)
    if error is not None:
        payload["fallbackReason"] = error
    return payload


def _fallback_counts(region: str, shots: int) -> dict[str, int]:
    region_indexes = {
        entry["id"]: int(entry["qubitIndex"])
        for entry in get_region_entries()
    }
    selected = region_indexes.get(region, region_indexes["torso"])
    active = ["0"] * QUBIT_COUNT
    active[QUBIT_COUNT - selected - 1] = "1"
    dominant = "".join(active)
    secondary = "0" * QUBIT_COUNT
    dominant_count = max(1, int(shots * 0.68))
    return {
        dominant: dominant_count,
        secondary: shots - dominant_count,
    }
