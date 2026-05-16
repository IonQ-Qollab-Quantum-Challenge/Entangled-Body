from __future__ import annotations

from math import pi

from qiskit import QuantumCircuit

from quantum.mapper import get_entanglement_pairs, get_region_entries

REGION_QUBITS = {
    entry["id"]: int(entry["qubitIndex"])
    for entry in get_region_entries()
}
QUBIT_COUNT = max(REGION_QUBITS.values(), default=5) + 1


def _normalize_intensity(intensity: float) -> float:
    return max(0.0, min(float(intensity), 1.0))


def _region_qubit(region: str) -> int:
    return REGION_QUBITS.get(region, REGION_QUBITS["torso"])


def circuit_type_for_interaction(interaction: str) -> str:
    if interaction == "click":
        return "bell_pair"
    if interaction == "hold":
        return "ghz_body"
    return "local_probe"


def _linked_regions(region: str) -> list[str]:
    linked: list[str] = []
    for source, target in get_entanglement_pairs():
        if source == region:
            linked.append(target)
        elif target == region:
            linked.append(source)
    return linked


def build_hover_circuit(region: str, intensity: float = 1.0) -> QuantumCircuit:
    selected = _region_qubit(region)
    normalized = _normalize_intensity(intensity)

    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    circuit.h(selected)
    for target_region in _linked_regions(region):
        circuit.cx(selected, _region_qubit(target_region))
    circuit.ry(normalized * pi / 6, selected)
    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def build_click_circuit(region: str) -> QuantumCircuit:
    selected = _region_qubit(region)
    target_region = next(iter(_linked_regions(region)), "torso")
    target = _region_qubit(target_region)
    if target == selected:
        target = 0 if selected != 0 else 1

    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    circuit.h(selected)
    circuit.cx(selected, target)
    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def build_hold_circuit() -> QuantumCircuit:
    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    source = _region_qubit("torso")
    circuit.h(source)
    for target in range(QUBIT_COUNT):
        if target != source:
            circuit.cx(source, target)
    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def build_measurement_circuit(
    region: str,
    intensity: float = 1.0,
    interaction: str = "hover",
) -> QuantumCircuit:
    if interaction == "click":
        return build_click_circuit(region)
    if interaction == "hold":
        return build_hold_circuit()
    return build_hover_circuit(region, intensity)
