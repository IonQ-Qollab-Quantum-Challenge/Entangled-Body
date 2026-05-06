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


def _entangle_body(circuit: QuantumCircuit) -> None:
    circuit.h(range(QUBIT_COUNT))
    for source, target in get_entanglement_pairs():
        circuit.cx(_region_qubit(source), _region_qubit(target))


def build_hover_circuit(region: str, intensity: float = 1.0) -> QuantumCircuit:
    selected = _region_qubit(region)
    normalized = _normalize_intensity(intensity)

    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    _entangle_body(circuit)
    circuit.ry(normalized * pi / 5, selected)
    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def build_click_circuit(region: str) -> QuantumCircuit:
    selected = _region_qubit(region)

    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    _entangle_body(circuit)
    circuit.x(selected)
    circuit.rz(pi / 3, selected)
    for source, target in get_entanglement_pairs():
        if source == region:
            circuit.cx(selected, _region_qubit(target))
        elif target == region:
            circuit.cx(selected, _region_qubit(source))
    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def build_hold_circuit() -> QuantumCircuit:
    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)
    _entangle_body(circuit)
    for index in range(QUBIT_COUNT):
        circuit.ry((index + 1) * pi / 16, index)
    for index in range(QUBIT_COUNT - 1):
        circuit.cx(index, index + 1)
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
