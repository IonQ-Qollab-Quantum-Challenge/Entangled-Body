from __future__ import annotations

import json
from itertools import combinations
from math import log2
from pathlib import Path
from typing import Any


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "body_region_map.json"
REQUIRED_REGION_KEYS = {"id", "label", "qubitIndex"}
DEFAULT_REGIONS = [
    "head",
    "chest",
    "torso",
    "oxygenTank",
    "rightShoulder",
    "leftShoulder",
    "rightArm",
    "leftArm",
    "rightHand",
    "leftHand",
    "rightLeg",
    "leftLeg",
    "rightFoot",
    "leftFoot",
]
DEFAULT_QUBIT_INDEXES = {
    "head": 0,
    "chest": 1,
    "torso": 2,
    "oxygenTank": 3,
    "rightShoulder": 4,
    "leftShoulder": 5,
    "rightArm": 6,
    "leftArm": 7,
    "rightHand": 8,
    "leftHand": 9,
    "rightLeg": 10,
    "leftLeg": 11,
    "rightFoot": 12,
    "leftFoot": 13,
}


def load_region_map() -> dict[str, Any]:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        loaded = json.load(handle)
    validate_region_map(loaded)
    return loaded


def validate_region_map(region_map: dict[str, Any]) -> None:
    if not isinstance(region_map, dict):
        raise ValueError("Region map must be a JSON object.")

    regions = region_map.get("regions")
    if not isinstance(regions, list) or not regions:
        raise ValueError("Region map requires a non-empty regions list.")

    seen_ids: set[str] = set()
    seen_qubits: set[int] = set()
    for entry in regions:
        if not isinstance(entry, dict) or not REQUIRED_REGION_KEYS.issubset(entry):
            raise ValueError("Each region requires id, label, and qubitIndex.")
        region_id = entry["id"]
        qubit_index = entry["qubitIndex"]
        if not isinstance(region_id, str) or not region_id:
            raise ValueError("Region id must be a non-empty string.")
        if region_id in seen_ids:
            raise ValueError(f"Duplicate region id: {region_id}")
        if not isinstance(qubit_index, int) or qubit_index < 0:
            raise ValueError(f"Invalid qubitIndex for region: {region_id}")
        if qubit_index in seen_qubits:
            raise ValueError(f"Duplicate qubitIndex: {qubit_index}")
        seen_ids.add(region_id)
        seen_qubits.add(qubit_index)

    links = region_map.get("entanglementLinks", [])
    if not isinstance(links, list):
        raise ValueError("entanglementLinks must be a list.")
    for link in links:
        if not isinstance(link, dict):
            raise ValueError("Each entanglement link must be an object.")
        if link.get("source") not in seen_ids or link.get("target") not in seen_ids:
            raise ValueError("Entanglement links must reference known regions.")


def _region_ids() -> list[str]:
    try:
        region_map = load_region_map()
    except (OSError, json.JSONDecodeError, ValueError):
        return DEFAULT_REGIONS
    return [entry["id"] for entry in region_map["regions"]]


REGIONS = _region_ids()


def get_region_entries() -> list[dict[str, Any]]:
    try:
        region_map = load_region_map()
    except (OSError, json.JSONDecodeError, ValueError):
        return [
            {"id": region, "label": region, "qubitIndex": DEFAULT_QUBIT_INDEXES[region]}
            for region in DEFAULT_REGIONS
        ]
    return list(region_map["regions"])


def get_entanglement_pairs() -> list[tuple[str, str]]:
    try:
        region_map = load_region_map()
    except (OSError, json.JSONDecodeError, ValueError):
        return [
            ("head", "chest"),
            ("head", "oxygenTank"),
            ("chest", "torso"),
            ("chest", "oxygenTank"),
            ("chest", "rightShoulder"),
            ("chest", "leftShoulder"),
            ("torso", "oxygenTank"),
            ("torso", "rightLeg"),
            ("torso", "leftLeg"),
            ("oxygenTank", "rightShoulder"),
            ("oxygenTank", "leftShoulder"),
            ("rightShoulder", "rightArm"),
            ("leftShoulder", "leftArm"),
            ("rightArm", "rightHand"),
            ("leftArm", "leftHand"),
            ("rightLeg", "rightFoot"),
            ("leftLeg", "leftFoot"),
        ]
    return [
        (link["source"], link["target"])
        for link in region_map.get("entanglementLinks", [])
    ]


def _empty_state() -> dict[str, float]:
    return {
        "activation": 0.0,
        "coherence": 0.0,
        "displacement": 0.0,
    }


def calculate_marginals(
    counts: dict[str, int],
    shots: int | None = None,
) -> dict[str, dict[str, float]]:
    total = shots or sum(counts.values()) or 1
    marginals: dict[str, dict[str, float]] = {}

    for entry in get_region_entries():
        region = entry["id"]
        qubit_index = int(entry["qubitIndex"])
        one_count = sum(
            count
            for bitstring, count in counts.items()
            if bit_for_qubit(bitstring, qubit_index) == "1"
        )
        p1 = one_count / total
        marginals[region] = {
            "p0": round(1.0 - p1, 6),
            "p1": round(p1, 6),
            "expectationZ": round((1.0 - p1) - p1, 6),
            "entropy": round(binary_entropy(p1), 6),
        }

    return marginals


def calculate_correlations(
    counts: dict[str, int],
    shots: int | None = None,
) -> list[dict[str, Any]]:
    total = shots or sum(counts.values()) or 1
    entries = get_region_entries()
    correlations: list[dict[str, Any]] = []

    for left, right in combinations(entries, 2):
        left_region = left["id"]
        right_region = right["id"]
        left_index = int(left["qubitIndex"])
        right_index = int(right["qubitIndex"])
        joint = {
            "00": 0.0,
            "01": 0.0,
            "10": 0.0,
            "11": 0.0,
        }

        for bitstring, count in counts.items():
            left_bit = bit_for_qubit(bitstring, left_index)
            right_bit = bit_for_qubit(bitstring, right_index)
            joint[f"{left_bit}{right_bit}"] += count / total

        p_left_1 = joint["10"] + joint["11"]
        p_right_1 = joint["01"] + joint["11"]
        zz = joint["00"] + joint["11"] - joint["01"] - joint["10"]
        correlations.append(
            {
                "source": left_region,
                "target": right_region,
                "zz": round(zz, 6),
                "mutualInformation": round(mutual_information(joint, p_left_1, p_right_1), 6),
            }
        )

    return correlations


def counts_to_region_states(
    counts: dict[str, int],
    region: str,
    intensity: float = 1.0,
    shots: int | None = None,
    seed: int | None = None,
) -> dict[str, dict[str, float]]:
    normalized_intensity = max(0.0, min(float(intensity), 1.0))
    marginals = calculate_marginals(counts, shots)
    correlations = calculate_correlations(counts, shots)
    max_correlation_by_region = {item: 0.0 for item in REGIONS}

    for correlation in correlations:
        strength = abs(float(correlation["zz"]))
        max_correlation_by_region[correlation["source"]] = max(
            max_correlation_by_region[correlation["source"]],
            strength,
        )
        max_correlation_by_region[correlation["target"]] = max(
            max_correlation_by_region[correlation["target"]],
            strength,
        )

    states = {item: _empty_state() for item in REGIONS}
    for body_region in REGIONS:
        marginal = marginals.get(body_region, {"p1": 0.0, "expectationZ": 1.0, "entropy": 0.0})
        activation = float(marginal["p1"]) * normalized_intensity
        local_purity = 1.0 - float(marginal["entropy"])
        state = states[body_region]
        state["activation"] = round(max(0.0, min(1.0, activation)), 6)
        state["coherence"] = round(max(0.0, min(1.0, max(local_purity, max_correlation_by_region[body_region]))), 6)
        state["displacement"] = round(max(-1.0, min(1.0, float(marginal["expectationZ"]))), 6)

    return states


def build_entanglement_links(
    region_states: dict[str, dict[str, float]],
    correlations: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    links: list[dict[str, Any]] = []

    if correlations is not None:
        candidate_pairs = {tuple(sorted(pair)) for pair in get_entanglement_pairs()}
        for correlation in correlations:
            source = correlation["source"]
            target = correlation["target"]
            if tuple(sorted((source, target))) not in candidate_pairs:
                continue
            mutual_information_value = float(correlation["mutualInformation"])
            if mutual_information_value > 0.04:
                links.append(
                    {
                        "source": source,
                        "target": target,
                        "strength": round(min(1.0, mutual_information_value), 4),
                    }
                )
        return links

    for source, target in get_entanglement_pairs():
        source_state = region_states.get(source, _empty_state())
        target_state = region_states.get(target, _empty_state())
        strength = (source_state["coherence"] + target_state["coherence"]) / 2
        if strength > 0.12:
            links.append({"source": source, "target": target, "strength": round(strength, 4)})

    return links


def counts_to_node_states(
    counts: dict[str, int],
    region_states: dict[str, dict[str, float]],
    interaction: str,
    shots: int | None = None,
) -> list[dict[str, Any]]:
    total = shots or sum(counts.values()) or 1
    dominant = max(counts.items(), key=lambda item: item[1])[0] if counts else ""
    collapsed = interaction in {"click", "hold"}

    node_states: list[dict[str, Any]] = []
    for entry in get_region_entries():
        region = entry["id"]
        qubit_index = int(entry["qubitIndex"])
        measured_bit = bit_for_qubit(dominant, qubit_index)
        matching_counts = sum(
            count
            for bitstring, count in counts.items()
            if bit_for_qubit(bitstring, qubit_index) == measured_bit
        )
        state = region_states.get(region, _empty_state())
        node_states.append(
            {
                "region": region,
                "qubitIndex": qubit_index,
                "measuredBit": measured_bit,
                "probability": round(matching_counts / total, 6),
                "activation": round(state["activation"], 6),
                "coherence": round(state["coherence"], 6),
                "collapsed": collapsed,
            }
        )

    return node_states


def bit_for_qubit(bitstring: str, qubit_index: int) -> str:
    """Qiskit count strings are classical-bit big endian; qubit i maps through bitstring[::-1][i]."""
    reversed_bits = bitstring[::-1]
    if qubit_index < 0 or qubit_index >= len(reversed_bits):
        return "0"
    return reversed_bits[qubit_index]


def binary_entropy(p1: float) -> float:
    p = max(0.0, min(1.0, p1))
    if p <= 0.0 or p >= 1.0:
        return 0.0
    return -p * log2(p) - (1.0 - p) * log2(1.0 - p)


def mutual_information(joint: dict[str, float], p_left_1: float, p_right_1: float) -> float:
    left = {"0": 1.0 - p_left_1, "1": p_left_1}
    right = {"0": 1.0 - p_right_1, "1": p_right_1}
    value = 0.0

    for bits, probability in joint.items():
        if probability <= 0.0:
            continue
        left_probability = left[bits[0]]
        right_probability = right[bits[1]]
        denominator = left_probability * right_probability
        if denominator <= 0.0:
            continue
        value += probability * log2(probability / denominator)

    return max(0.0, value)
