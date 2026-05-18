from __future__ import annotations

from math import asin, pi, sqrt

from qiskit import QuantumCircuit

from quantum.mapper import all_spatial_graph_distances, get_entanglement_links_with_strength, get_entanglement_pairs, get_region_entries

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
        return "graph_collapse"
    if interaction == "hold":
        return "graph_global_collapse"
    return "graph_probe"


def _linked_regions(region: str) -> list[str]:
    linked: list[str] = []
    for source, target in get_entanglement_pairs():
        if source == region:
            linked.append(target)
        elif target == region:
            linked.append(source)
    return linked


def build_hover_circuit(region: str, intensity: float = 1.0) -> QuantumCircuit:
    return build_graph_collapse_circuit(region, intensity, "hover")


def build_click_circuit(region: str) -> QuantumCircuit:
    return build_graph_collapse_circuit(region, 1.0, "click")


def build_hold_circuit(region: str = "torso") -> QuantumCircuit:
    return build_graph_collapse_circuit(region, 1.0, "hold")


def build_graph_collapse_circuit(
    region: str,
    intensity: float = 1.0,
    interaction: str = "hover",
) -> QuantumCircuit:
    """Build a graph-shaped collapse distribution from a classical interaction anchor.

    The observed node parameterizes distance-shaped rotations and weighted correlation
    gates. It does not imply that a user observation physically controls distant nodes.
    """

    observed_region = region if region in REGION_QUBITS else "torso"
    observed = _region_qubit(observed_region)
    normalized = _normalize_intensity(intensity)
    distances = all_spatial_graph_distances(observed_region)
    links = get_entanglement_links_with_strength()
    circuit = QuantumCircuit(QUBIT_COUNT, QUBIT_COUNT)

    for entry in get_region_entries():
        target_region = entry["id"]
        qubit = int(entry["qubitIndex"])
        probability = _target_probability(
            observed_region=observed_region,
            target_region=target_region,
            distance=float(distances.get(target_region, 0.0)),
            intensity=normalized,
            interaction=interaction,
        )
        circuit.ry(_probability_to_ry(probability), qubit)

    for link in _ranked_links(links, distances, interaction):
        source_region = link["source"]
        target_region = link["target"]
        source = _region_qubit(source_region)
        target = _region_qubit(target_region)
        strength = max(0.05, min(1.0, float(link["strength"])))
        angle = _edge_angle(strength, interaction)
        circuit.rzz(angle, source, target)

    circuit.measure(range(QUBIT_COUNT), range(QUBIT_COUNT))
    return circuit


def _target_probability(
    observed_region: str,
    target_region: str,
    distance: float,
    intensity: float,
    interaction: str,
) -> float:
    if target_region == observed_region:
        return 0.95

    max_distance = _max_spatial_distance(observed_region)
    distance_ratio = 0.0 if max_distance <= 0 else max(0.0, min(1.0, distance / max_distance))
    zero_probability = 0.05 + 0.10 * distance_ratio
    zero_probability *= _interaction_zero_scale(interaction)
    zero_probability = max(0.05, min(0.15, zero_probability))
    return 1.0 - zero_probability


def _interaction_zero_scale(interaction: str) -> float:
    if interaction == "hold":
        return 0.9
    if interaction == "click":
        return 1.0
    return 1.05


def _max_spatial_distance(observed_region: str) -> float:
    distances = all_spatial_graph_distances(observed_region)
    finite_distances = [distance for distance in distances.values() if distance != float("inf")]
    return max(finite_distances, default=1.0)


def _probability_to_ry(probability: float) -> float:
    safe_probability = max(0.0, min(1.0, probability))
    return 2.0 * asin(sqrt(safe_probability))


def _edge_angle(strength: float, interaction: str) -> float:
    if interaction == "hold":
        return strength * pi / 3.2
    if interaction == "click":
        return strength * pi / 4.4
    return strength * pi / 8.0


def _ranked_links(
    links: list[dict[str, object]],
    distances: dict[str, float],
    interaction: str,
) -> list[dict[str, object]]:
    ranked = sorted(
        links,
        key=lambda link: (
            min(float(distances.get(str(link["source"]), 999.0)), float(distances.get(str(link["target"]), 999.0))),
            -float(link["strength"]),
        ),
    )
    if interaction == "hover":
        return ranked[:8]
    if interaction == "click":
        return ranked[:18]
    return ranked[:24]


def build_legacy_hold_circuit() -> QuantumCircuit:
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
        return build_hold_circuit(region)
    return build_hover_circuit(region, intensity)
