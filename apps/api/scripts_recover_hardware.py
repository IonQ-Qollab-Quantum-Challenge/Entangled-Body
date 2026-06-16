"""One-off recovery: re-fetch the 14 completed IonQ jobs from the crashed
shots=1024 hardware run (job circuit-78 hit QuotaExhaustedError) and rebuild
hardware_samples.json. Retrieving completed jobs costs no quota.

Mapping (region/interaction) -> job is by submission order, cross-checked
against the distinct-bitstring counts printed in the original run log.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from config.env import load_env_files

OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "hardware_samples.json"
BACKEND = "qpu.forte-enterprise-1"
SHOTS = 1024

# (region, interaction, expected_distinct_bitstrings_from_log, job_id) in submission order
RECOVER = [
    ("head", "click", 264, "019ecf9b-3f0f-7365-9c08-47f542212553"),
    ("head", "hold", 269, "019ecfa2-f57b-7727-8a7b-13d49fb69f9e"),
    ("chest", "click", 270, "019ecfad-3a06-71dc-ad10-29270ec4fa46"),
    ("chest", "hold", 254, "019ecfb6-3281-70e4-88af-af6ee7bf94d0"),
    ("torso", "click", 260, "019ecfc5-058c-7587-ba22-e00428fbbbc7"),
    ("torso", "hold", 251, "019ecfce-8aea-7329-a1eb-8b7edef29603"),
    ("oxygenTank", "click", 249, "019ecfd8-2a7a-74ee-9b16-8ab5335c9052"),
    ("oxygenTank", "hold", 271, "019ecfe1-e0ed-723b-bf15-98de619fa083"),
    ("rightShoulder", "click", 255, "019ecfeb-9462-761f-80aa-d5effcfcb652"),
    ("rightShoulder", "hold", 257, "019ecff2-bf0c-76df-a06d-36655797ef56"),
    ("leftShoulder", "click", 253, "019ed007-2029-77eb-a3ab-df66284bbc2d"),
    ("leftShoulder", "hold", 255, "019ed011-5560-76ee-8c19-8454ff68524e"),
    ("rightArm", "click", 243, "019ed031-dc2b-7401-91a1-03d5906ce8f5"),
    ("rightArm", "hold", 267, "019ed03b-b3fc-72d9-a1bd-08d555febb88"),
]


def main() -> None:
    load_env_files()
    if not os.getenv("IONQ_API_KEY"):
        raise SystemExit("IONQ_API_KEY not set")

    from qiskit_ionq import IonQProvider

    provider = IonQProvider(token=os.getenv("IONQ_API_KEY"))
    backend = provider.get_backend(BACKEND)

    samples: dict[str, dict] = {}
    all_ok = True
    for region, interaction, expected, job_id in RECOVER:
        job = backend.retrieve_job(job_id)
        result = job.result()
        try:
            counts = result.get_counts()
        except TypeError:
            counts = result.get_counts(0)
        counts = {str(bit): int(c) for bit, c in dict(counts).items()}
        n = len(counts)
        total = sum(counts.values())
        ok = n == expected
        all_ok = all_ok and ok
        flag = "OK" if ok else f"MISMATCH(expected {expected})"
        print(f"{region}/{interaction:5s} <- {job_id}  bitstrings={n} ({flag})  shots_total={total}")
        samples.setdefault(region, {})[interaction] = {
            "counts": counts,
            "shots": SHOTS,
            "backend": BACKEND,
        }

    if not all_ok:
        raise SystemExit("Aborting: at least one job's bitstring count did not match the log.")

    payload = {
        "source": "precomputed-hardware",
        "version": 1,
        "backend": BACKEND,
        "shots": SHOTS,
        "interactions": ["click", "hold"],
        "samples": samples,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\nRecovered {len(RECOVER)} samples (shots={SHOTS}) -> {OUTPUT_PATH}")
    print("Remaining 14 samples (leftArm, rightArm done; leftLeg/rightLeg/leftHand/rightHand/leftFoot/rightFoot, leftArm) "
          "will be (re)run by: python -m quantum.precompute --target hardware")


if __name__ == "__main__":
    main()
