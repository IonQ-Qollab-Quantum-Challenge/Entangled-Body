from __future__ import annotations

import json
from math import sin
from pathlib import Path
from random import Random
from typing import Any


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "body_region_map.json"
REQUIRED_REGION_KEYS = {"id", "label", "qubitIndex"}
DEFAULT_REGIONS = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"]
DEFAULT_QUBIT_INDEXES = {
    "head": 0,
    "torso": 1,
    "leftArm": 2,
    "rightArm": 3,
    "leftLeg": 4,
    "rightLeg": 5,
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
            ("head", "torso"),
            ("leftArm", "rightArm"),
            ("leftLeg", "rightLeg"),
            ("torso", "leftArm"),
            ("torso", "rightLeg"),
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


def counts_to_region_states(
    counts: dict[str, int],
    region: str,
    intensity: float = 1.0,
    shots: int | None = None,
    seed: int | None = None,
) -> dict[str, dict[str, float]]:
    total = shots or sum(counts.values()) or 1
    normalized_intensity = max(0.0, min(float(intensity), 1.0))
    states = {item: _empty_state() for item in REGIONS}
    random = Random(seed) if seed is not None else None

    for bitstring, count in counts.items():
        probability = count / total
        reversed_bits = bitstring[::-1]

        for index, body_region in enumerate(REGIONS):
            bit = reversed_bits[index] if index < len(reversed_bits) else "0"
            sign = 1.0 if bit == "1" else -1.0
            prior = states[body_region]
            prior["activation"] += probability if bit == "1" else probability * 0.2
            prior["coherence"] += probability * (1.0 - abs(probability - 0.5))
            prior["displacement"] += sign * probability * 0.34

    selected = region if region in states else "torso"
    for index, body_region in enumerate(REGIONS):
        link_boost = 0.18 if body_region != selected and index % 2 == REGIONS.index(selected) % 2 else 0.0
        direct_boost = 0.38 if body_region == selected else 0.0
        phase = (
            (random.random() - 0.5) * 0.1
            if random is not None
            else sin((index + 1) * (len(counts) + 1)) * 0.05
        )
        state = states[body_region]
        state["activation"] = max(
            0.0,
            min(1.0, state["activation"] * normalized_intensity + direct_boost + link_boost),
        )
        state["coherence"] = max(0.0, min(1.0, state["coherence"] + direct_boost * 0.6))
        state["displacement"] = max(-1.0, min(1.0, state["displacement"] + phase))

    return states


def build_entanglement_links(region_states: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    links: list[dict[str, Any]] = []
    pairs = get_entanglement_pairs()

    for source, target in pairs:
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
