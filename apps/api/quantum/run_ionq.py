from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Any

from config.env import load_env_files
from quantum.circuits import build_measurement_circuit
from quantum.run_simulator import build_counts_payload, run_aer_measurement

HARDWARE_SAMPLES_PATH = Path(__file__).resolve().parents[1] / "data" / "hardware_samples.json"

IONQ_API_KEY_ENV = "IONQ_API_KEY"
IONQ_ENABLE_HARDWARE_ENV = "IONQ_ENABLE_HARDWARE"
IONQ_TIMEOUT_SECONDS_ENV = "IONQ_TIMEOUT_SECONDS"
IONQ_BACKEND_ENV = "IONQ_BACKEND"
IONQ_SIMULATOR_BACKEND_ENV = "IONQ_SIMULATOR_BACKEND"
IONQ_QPU_BACKEND_ENV = "IONQ_QPU_BACKEND"

DEFAULT_SIMULATOR_BACKEND = "ionq_simulator"
DEFAULT_QPU_BACKEND = "qpu.forte-enterprise-1"
DEFAULT_TIMEOUT_SECONDS = 300

STATUS_PENDING = "pending"
STATUS_COMPLETED = "completed"

load_env_files()


def ionq_is_configured() -> bool:
    return bool(os.getenv(IONQ_API_KEY_ENV))


def ionq_hardware_enabled() -> bool:
    return _truthy(os.getenv(IONQ_ENABLE_HARDWARE_ENV, "true"))


def ionq_status() -> dict[str, Any]:
    return {
        "ionq_configured": ionq_is_configured(),
        "ionq_hardware_enabled": ionq_hardware_enabled(),
        "ionq_simulator_backend": _simulator_backend_name(),
        "ionq_qpu_backend": _qpu_backend_name(),
        "ionq_timeout_seconds": _timeout_seconds(),
        "available_backends": ["aer", "ionq_simulator", "ionq_hardware"],
        "default_backend": "ionq_simulator",
    }


_HARDWARE_CACHE: dict[str, Any] | None = None
_HARDWARE_CACHE_MTIME: float | None = None


def _load_hardware_cache() -> dict[str, Any]:
    """Load precomputed real-hardware samples, reloading if the file changed.

    The cache lets QPU measurements respond instantly with genuine IonQ
    hardware counts instead of waiting out a multi-minute queue on every
    request. Generate the file offline with ``precompute.py --target hardware``.
    """

    global _HARDWARE_CACHE, _HARDWARE_CACHE_MTIME
    try:
        mtime = HARDWARE_SAMPLES_PATH.stat().st_mtime
    except OSError:
        _HARDWARE_CACHE, _HARDWARE_CACHE_MTIME = {}, None
        return {}

    if _HARDWARE_CACHE is None or mtime != _HARDWARE_CACHE_MTIME:
        try:
            loaded = json.loads(HARDWARE_SAMPLES_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            loaded = {}
        _HARDWARE_CACHE = loaded if isinstance(loaded, dict) else {}
        _HARDWARE_CACHE_MTIME = mtime
    return _HARDWARE_CACHE


def cached_hardware_measurement(
    region: str,
    interaction: str,
    requested_backend: str = "ionq_hardware",
    rng: random.Random | None = None,
) -> dict[str, Any] | None:
    """Return a single-shot payload drawn from precomputed hardware counts, or None.

    Hardware QPU circuits depend only on ``region`` and ``interaction`` (the
    collapse circuits ignore intensity), so a small offline-generated cache
    covers every reachable hardware request. A miss returns None so callers can
    fall back to live submission.

    The cached entry stores the full multi-shot distribution (e.g. 1024 real
    IonQ shots) as a *reservoir*. We do not serve the dominant bitstring; each
    call draws one bitstring at random, weighted by its observed frequency, and
    returns it as a genuine single shot — reproducing what a fresh one-shot QPU
    measurement would have collapsed to, with the real hardware probabilities.
    """

    cache = _load_hardware_cache()
    samples = cache.get("samples") if isinstance(cache, dict) else None
    region_entry = samples.get(region) if isinstance(samples, dict) else None
    entry = region_entry.get(interaction) if isinstance(region_entry, dict) else None
    if not isinstance(entry, dict):
        return None

    raw_counts = entry.get("counts")
    if not isinstance(raw_counts, dict) or not raw_counts:
        return None
    reservoir = {str(bit): int(count) for bit, count in raw_counts.items()}

    picker = rng or random
    drawn = picker.choices(list(reservoir.keys()), weights=list(reservoir.values()), k=1)[0]
    counts = {drawn: 1}

    backend = entry.get("backend") or cache.get("backend") or _qpu_backend_name()
    predicted = bool(entry.get("predicted"))

    return {
        **build_counts_payload(counts, 1, str(backend), interaction, "ionq"),
        "status": STATUS_COMPLETED,
        "requestedBackend": requested_backend,
        "provider": "ionq",
        "hardware": not predicted,
        "predicted": predicted,
        "reservoirShots": int(entry.get("shots") or sum(reservoir.values())),
        "source": "precomputed-hardware-predicted" if predicted else "precomputed-hardware",
    }


def submit_ionq_job(
    region: str,
    intensity: float = 1.0,
    shots: int = 1,
    interaction: str = "hover",
    requested_backend: str = "ionq_simulator",
    seed: int | None = None,
) -> dict[str, Any]:
    """Submit an IonQ job and return immediately with a jobId.

    The QPU (and IonQ's cloud simulator) execute asynchronously through a job
    queue that can take far longer than an HTTP gateway timeout, so we never
    block on the result here. Callers poll :func:`fetch_ionq_job` instead.

    When IonQ cannot be reached safely (no key, hardware disabled, missing SDK,
    submission error) we fall back to a synchronous Aer measurement so the
    response keeps the same shape and the experience degrades gracefully.
    """

    safe_shots = max(1, min(int(shots), 8192))
    if not ionq_is_configured():
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"{IONQ_API_KEY_ENV} is not configured.",
        )

    if requested_backend == "ionq_hardware" and not ionq_hardware_enabled():
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"{IONQ_ENABLE_HARDWARE_ENV} is false; QPU submission was blocked.",
        )

    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason="qiskit-ionq is not installed.",
        )

    backend_name = _backend_name_for_request(requested_backend)
    try:
        provider = IonQProvider(token=os.getenv(IONQ_API_KEY_ENV))
        backend = provider.get_backend(backend_name)
        circuit = build_measurement_circuit(
            region=region,
            intensity=intensity,
            interaction=interaction,
        )
        job = backend.run(circuit, shots=safe_shots)
        return {
            "status": STATUS_PENDING,
            "jobId": _job_id(job),
            "jobStatus": _job_status(job),
            "requestedBackend": requested_backend,
            "provider": "ionq",
            "hardware": requested_backend == "ionq_hardware",
            "backend": _backend_display_name(backend, backend_name),
            "shots": safe_shots,
        }
    except Exception as exc:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"IonQ submission failed on {backend_name}: {exc}",
        )


def fetch_ionq_job(
    job_id: str,
    region: str,
    intensity: float = 1.0,
    shots: int = 1,
    interaction: str = "hover",
    requested_backend: str = "ionq_simulator",
    seed: int | None = None,
) -> dict[str, Any]:
    """Poll a previously submitted IonQ job.

    Returns a ``pending`` envelope while the job is queued/running, the full
    counts payload once it is done, or an Aer fallback if it failed or could not
    be retrieved. This call is stateless: the original request parameters are
    supplied by the caller on every poll so no server-side job store is needed.
    """

    safe_shots = max(1, min(int(shots), 8192))
    if not ionq_is_configured():
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"{IONQ_API_KEY_ENV} is not configured.",
        )

    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason="qiskit-ionq is not installed.",
        )

    backend_name = _backend_name_for_request(requested_backend)
    try:
        provider = IonQProvider(token=os.getenv(IONQ_API_KEY_ENV))
        backend = provider.get_backend(backend_name)
        job = backend.retrieve_job(job_id)
        status = _job_status(job)
        state = _classify_status(status)

        if state == STATUS_PENDING:
            return {
                "status": STATUS_PENDING,
                "jobId": job_id,
                "jobStatus": status,
                "requestedBackend": requested_backend,
                "provider": "ionq",
                "hardware": requested_backend == "ionq_hardware",
            }

        if state == "failed":
            return _aer_fallback(
                region=region,
                intensity=intensity,
                shots=safe_shots,
                interaction=interaction,
                seed=seed,
                requested_backend=requested_backend,
                reason=f"IonQ job {job_id} ended with status {status}.",
            )

        circuit = build_measurement_circuit(
            region=region,
            intensity=intensity,
            interaction=interaction,
        )
        result = _job_result(job, _timeout_seconds())
        counts = _result_counts(result, circuit)
        actual_backend = _backend_display_name(backend, backend_name)
        return {
            **build_counts_payload(counts, safe_shots, actual_backend, interaction, "ionq"),
            "status": STATUS_COMPLETED,
            "requestedBackend": requested_backend,
            "provider": "ionq",
            "hardware": requested_backend == "ionq_hardware",
            "jobId": job_id,
            "jobStatus": status,
        }
    except Exception as exc:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"IonQ job retrieval failed on {backend_name}: {exc}",
        )


def run_ionq_measurement(
    region: str,
    intensity: float = 1.0,
    shots: int = 1,
    interaction: str = "hover",
    requested_backend: str = "ionq_simulator",
    seed: int | None = None,
) -> dict[str, Any]:
    """Submit an IonQ job and block until the result is ready, in one call.

    Suitable for fast backends (the IonQ simulator at low shot counts) where the
    job finishes within the HTTP gateway timeout. Hardware QPU requests must use
    :func:`submit_ionq_job` + :func:`fetch_ionq_job` instead, since queue waits
    can far exceed any gateway timeout.
    """

    safe_shots = max(1, min(int(shots), 8192))
    if not ionq_is_configured():
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"{IONQ_API_KEY_ENV} is not configured.",
        )

    if requested_backend == "ionq_hardware" and not ionq_hardware_enabled():
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"{IONQ_ENABLE_HARDWARE_ENV} is false; QPU submission was blocked.",
        )

    try:
        from qiskit_ionq import IonQProvider  # type: ignore
    except ImportError:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason="qiskit-ionq is not installed.",
        )

    backend_name = _backend_name_for_request(requested_backend)
    try:
        provider = IonQProvider(token=os.getenv(IONQ_API_KEY_ENV))
        backend = provider.get_backend(backend_name)
        circuit = build_measurement_circuit(
            region=region,
            intensity=intensity,
            interaction=interaction,
        )
        job = backend.run(circuit, shots=safe_shots)
        result = _job_result(job, _timeout_seconds())
        counts = _result_counts(result, circuit)
        actual_backend = _backend_display_name(backend, backend_name)
        return {
            **build_counts_payload(counts, safe_shots, actual_backend, interaction, "ionq"),
            "status": STATUS_COMPLETED,
            "requestedBackend": requested_backend,
            "provider": "ionq",
            "hardware": requested_backend == "ionq_hardware",
            "jobId": _job_id(job),
            "jobStatus": _job_status(job),
        }
    except Exception as exc:
        return _aer_fallback(
            region=region,
            intensity=intensity,
            shots=safe_shots,
            interaction=interaction,
            seed=seed,
            requested_backend=requested_backend,
            reason=f"IonQ execution failed on {backend_name}: {exc}",
        )


def _aer_fallback(
    region: str,
    intensity: float,
    shots: int,
    interaction: str,
    seed: int | None,
    requested_backend: str,
    reason: str,
) -> dict[str, Any]:
    payload = run_aer_measurement(
        region=region,
        intensity=intensity,
        shots=shots,
        interaction=interaction,
        seed=seed,
    )
    return {
        **payload,
        "status": STATUS_COMPLETED,
        "requestedBackend": requested_backend,
        "provider": "aer",
        "hardware": False,
        "source": "fallback",
        "fallbackReason": reason,
    }


def _classify_status(status: str | None) -> str:
    """Map a qiskit/IonQ job status onto pending / completed / failed."""

    name = (status or "").rsplit(".", 1)[-1].strip().upper()
    if name in {"DONE", "COMPLETED", "SUCCESS"}:
        return STATUS_COMPLETED
    if name in {"ERROR", "CANCELLED", "CANCELED", "FAILED"}:
        return "failed"
    return STATUS_PENDING


def _backend_name_for_request(requested_backend: str) -> str:
    if requested_backend == "ionq_hardware":
        return _qpu_backend_name()
    return _simulator_backend_name()


def _simulator_backend_name() -> str:
    simulator_backend = os.getenv(IONQ_SIMULATOR_BACKEND_ENV)
    if simulator_backend:
        return simulator_backend
    generic_backend = os.getenv(IONQ_BACKEND_ENV, "")
    if generic_backend and "simulator" in generic_backend.lower():
        return generic_backend
    return DEFAULT_SIMULATOR_BACKEND


def _qpu_backend_name() -> str:
    return os.getenv(IONQ_QPU_BACKEND_ENV) or os.getenv(IONQ_BACKEND_ENV) or DEFAULT_QPU_BACKEND


def _timeout_seconds() -> int:
    try:
        return max(1, int(os.getenv(IONQ_TIMEOUT_SECONDS_ENV, str(DEFAULT_TIMEOUT_SECONDS))))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _job_result(job: Any, timeout_seconds: int) -> Any:
    try:
        return job.result(timeout=timeout_seconds)
    except TypeError:
        return job.result()


def _result_counts(result: Any, circuit: Any) -> dict[str, int]:
    try:
        return dict(result.get_counts(circuit))
    except TypeError:
        return dict(result.get_counts())


def _job_id(job: Any) -> str | None:
    job_id = getattr(job, "job_id", None)
    if callable(job_id):
        return str(job_id())
    if job_id is not None:
        return str(job_id)
    return None


def _job_status(job: Any) -> str | None:
    status = getattr(job, "status", None)
    if callable(status):
        return str(status())
    if status is not None:
        return str(status)
    return None


def _backend_display_name(backend: Any, fallback: str) -> str:
    name = getattr(backend, "name", None)
    if callable(name):
        return str(name())
    if name:
        return str(name)
    return fallback
