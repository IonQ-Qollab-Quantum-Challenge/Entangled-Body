from __future__ import annotations

import os
from typing import Any

from quantum.run_simulator import run_aer_measurement

IONQ_API_KEY_ENV = "IONQ_API_KEY"


def ionq_is_configured() -> bool:
    return bool(os.getenv(IONQ_API_KEY_ENV))


def run_ionq_measurement(
    region: str,
    intensity: float = 1.0,
    shots: int = 1024,
    interaction: str = "hover",
) -> dict[str, Any]:
    """IonQ adapter placeholder with a deterministic local fallback.

    The project can run end-to-end without IonQ credentials. When credentials are
    absent, this returns the same payload shape as the simulator and annotates
    why the hardware path was not used.
    """

    if not ionq_is_configured():
        payload = run_aer_measurement(
            region=region,
            intensity=intensity,
            shots=shots,
            interaction=interaction,
        )
        return {
            **payload,
            "source": "fallback",
            "fallbackReason": f"{IONQ_API_KEY_ENV} is not configured.",
        }

    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError:
        payload = run_aer_measurement(
            region=region,
            intensity=intensity,
            shots=shots,
            interaction=interaction,
        )
        return {
            **payload,
            "source": "fallback",
            "fallbackReason": "qiskit-ionq is not installed.",
        }

    return {
        **run_aer_measurement(
            region=region,
            intensity=intensity,
            shots=shots,
            interaction=interaction,
        ),
        "source": "fallback",
        "fallbackReason": f"IonQ provider detected ({IonQProvider.__name__}), but hardware submission is not enabled for this demo.",
    }
