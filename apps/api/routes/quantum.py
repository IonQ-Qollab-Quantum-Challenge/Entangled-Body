from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from quantum.mapper import REGIONS, build_entanglement_links, counts_to_node_states, counts_to_region_states
from quantum.run_simulator import run_aer_measurement

router = APIRouter(prefix="/quantum", tags=["quantum"])
DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "precomputed_samples.json"


class MeasurementRequest(BaseModel):
    region: str = Field(default="torso")
    intensity: float = Field(default=1.0, ge=0.0, le=1.0)
    shots: int = Field(default=1024, ge=1, le=8192)
    interaction: Literal["hover", "click", "hold"] = Field(default="hover")
    seed: int | None = Field(default=None)


@router.get("/health")
def quantum_health() -> dict:
    return {
        "ok": True,
        "mode": "simulator",
        "ionq_configured": False,
    }


@router.get("/precomputed")
def get_precomputed_sample() -> dict:
    fallback = _fallback_precomputed()
    if not DATA_PATH.exists() or DATA_PATH.stat().st_size == 0:
        return fallback

    try:
        with DATA_PATH.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)
    except json.JSONDecodeError:
        return fallback

    if not loaded:
        return fallback

    if isinstance(loaded, dict):
        return loaded

    return {
        "source": "precomputed",
        "samples": loaded,
    }


@router.post("/measure")
def measure_region(payload: MeasurementRequest) -> dict[str, Any]:
    measurement = run_aer_measurement(
        region=payload.region,
        intensity=payload.intensity,
        shots=payload.shots,
        interaction=payload.interaction,
    )

    counts = measurement["counts"]
    if not isinstance(counts, dict):
        raise HTTPException(status_code=500, detail="Simulator returned invalid counts.")

    region_states = counts_to_region_states(
        counts=counts,
        region=payload.region,
        intensity=payload.intensity,
        shots=int(measurement["shots"]),
        seed=payload.seed,
    )
    entanglement_links = build_entanglement_links(region_states)
    return {
        **measurement,
        "region": payload.region,
        "regionStates": region_states,
        "entanglementLinks": entanglement_links,
        "nodeStates": counts_to_node_states(
            counts=counts,
            region_states=region_states,
            interaction=payload.interaction,
            shots=int(measurement["shots"]),
        ),
    }


def _fallback_precomputed() -> dict[str, Any]:
    samples = {}
    for index, region in enumerate(REGIONS):
        region_states = {
            item: {
                "activation": 0.16,
                "coherence": 0.24,
                "displacement": 0.0,
            }
            for item in REGIONS
        }
        region_states[region] = {
            "activation": 0.52,
            "coherence": 0.46,
            "displacement": 0.12 if index % 2 == 0 else -0.12,
        }
        samples[region] = {
            "region": region,
            "regionStates": region_states,
            "entanglementLinks": build_entanglement_links(region_states),
            "source": "fallback",
        }

    return {
        "source": "fallback",
        "samples": samples,
    }
