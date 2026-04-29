from __future__ import annotations

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator


def build_measurement_circuit(region: str, intensity: float = 1.0) -> QuantumCircuit:
    region_indexes = {
        "head": 0,
        "torso": 1,
        "leftArm": 2,
        "rightArm": 3,
        "leftLeg": 4,
        "rightLeg": 5,
    }
    selected = region_indexes.get(region, 1)
    normalized_intensity = max(0.0, min(float(intensity), 1.0))

    circuit = QuantumCircuit(6, 6)
    circuit.h(range(6))
    circuit.cx(0, 1)
    circuit.cx(1, 2)
    circuit.cx(1, 3)
    circuit.cx(2, 4)
    circuit.cx(3, 5)
    circuit.ry(normalized_intensity * 1.5708, selected)
    circuit.cx(selected, (selected + 1) % 6)
    circuit.measure(range(6), range(6))
    return circuit


def run_aer_measurement(region: str, intensity: float = 1.0, shots: int = 1024) -> dict[str, object]:
    safe_shots = max(1, min(int(shots), 8192))
    circuit = build_measurement_circuit(region=region, intensity=intensity)
    simulator = AerSimulator()
    compiled = transpile(circuit, simulator)
    result = simulator.run(compiled, shots=safe_shots).result()
    counts = dict(result.get_counts(compiled))
    dominant = max(counts.items(), key=lambda item: item[1])[0] if counts else ""

    return {
        "counts": counts,
        "dominantBitstring": dominant,
        "shots": safe_shots,
        "qubits": 6,
    }
