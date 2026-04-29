from __future__ import annotations

from math import sin
from typing import Any


REGIONS = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"]


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
) -> dict[str, dict[str, float]]:
    total = shots or sum(counts.values()) or 1
    normalized_intensity = max(0.0, min(float(intensity), 1.0))
    states = {item: _empty_state() for item in REGIONS}

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
        phase = sin((index + 1) * (len(counts) + 1)) * 0.05
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
    pairs = [("head", "torso"), ("leftArm", "rightArm"), ("leftLeg", "rightLeg"), ("torso", "leftArm"), ("torso", "rightLeg")]

    for source, target in pairs:
        source_state = region_states.get(source, _empty_state())
        target_state = region_states.get(target, _empty_state())
        strength = (source_state["coherence"] + target_state["coherence"]) / 2
        if strength > 0.12:
            links.append({"source": source, "target": target, "strength": round(strength, 4)})

    return links
