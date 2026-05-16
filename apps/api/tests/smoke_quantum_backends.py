from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.env import load_env_files  # noqa: E402
from routes.quantum import MeasurementRequest, measure_region, quantum_health  # noqa: E402


REQUIRED_RESPONSE_KEYS = {
    "counts",
    "probabilities",
    "dominantBitstring",
    "shots",
    "qubits",
    "circuitType",
    "region",
    "marginals",
    "correlations",
    "regionStates",
    "entanglementLinks",
    "nodeStates",
}


class QuantumBackendSmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_env = {
            "IONQ_API_KEY": os.environ.get("IONQ_API_KEY"),
            "IONQ_ENABLE_HARDWARE": os.environ.get("IONQ_ENABLE_HARDWARE"),
        }
        os.environ.pop("IONQ_API_KEY", None)
        os.environ["IONQ_ENABLE_HARDWARE"] = "false"

    def tearDown(self) -> None:
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_aer_measurement_preserves_response_contract(self) -> None:
        response = measure_region(
            MeasurementRequest(region="torso", shots=32, seed=7, backend="aer"),
        )
        self.assertTrue(REQUIRED_RESPONSE_KEYS.issubset(response))
        self.assertEqual(response["requestedBackend"], "aer")
        self.assertEqual(response["provider"], "aer")
        self.assertFalse(response["hardware"])
        self.assertEqual(response["qubits"], 14)

    def test_ionq_simulator_without_key_falls_back_to_aer_shape(self) -> None:
        response = measure_region(
            MeasurementRequest(region="rightHand", shots=32, backend="ionq_simulator"),
        )
        self.assertTrue(REQUIRED_RESPONSE_KEYS.issubset(response))
        self.assertEqual(response["requestedBackend"], "ionq_simulator")
        self.assertEqual(response["source"], "fallback")
        self.assertIn("IONQ_API_KEY", response["fallbackReason"])

    def test_ionq_hardware_disabled_never_submits_qpu(self) -> None:
        os.environ["IONQ_API_KEY"] = "test-key-not-used"
        os.environ["IONQ_ENABLE_HARDWARE"] = "false"
        response = measure_region(
            MeasurementRequest(region="leftFoot", shots=32, backend="ionq_hardware"),
        )
        self.assertTrue(REQUIRED_RESPONSE_KEYS.issubset(response))
        self.assertEqual(response["requestedBackend"], "ionq_hardware")
        self.assertEqual(response["source"], "fallback")
        self.assertFalse(response["hardware"])
        self.assertIn("blocked", response["fallbackReason"])

    def test_health_does_not_expose_api_key(self) -> None:
        os.environ["IONQ_API_KEY"] = "secret-value"
        health = quantum_health()
        self.assertTrue(health["ionq_configured"])
        self.assertNotIn("secret-value", repr(health))
        self.assertIn("ionq_hardware_enabled", health)

    def test_load_env_files_reads_local_env_when_env_is_missing_or_empty(self) -> None:
        original_key = os.environ.get("IONQ_API_KEY")
        original_backend = os.environ.get("IONQ_BACKEND")
        try:
            os.environ["IONQ_API_KEY"] = ""
            os.environ["IONQ_BACKEND"] = "real-env-backend"
            with tempfile.TemporaryDirectory() as tmp_dir:
                env_path = Path(tmp_dir) / ".env"
                env_path.write_text(
                    "IONQ_API_KEY=local-test-key\nIONQ_BACKEND=local-backend\n",
                    encoding="utf-8",
                )

                load_env_files((env_path,))

            self.assertEqual(os.environ["IONQ_API_KEY"], "local-test-key")
            self.assertEqual(os.environ["IONQ_BACKEND"], "real-env-backend")
        finally:
            if original_key is None:
                os.environ.pop("IONQ_API_KEY", None)
            else:
                os.environ["IONQ_API_KEY"] = original_key
            if original_backend is None:
                os.environ.pop("IONQ_BACKEND", None)
            else:
                os.environ["IONQ_BACKEND"] = original_backend


class IonQHardwareIntegrationTests(unittest.TestCase):
    def test_real_ionq_hardware_execution_when_explicitly_enabled(self) -> None:
        if os.environ.get("RUN_IONQ_HARDWARE_TEST", "").lower() not in {"1", "true", "yes", "on"}:
            self.skipTest("Set RUN_IONQ_HARDWARE_TEST=true to submit a real IonQ QPU job.")
        if not os.environ.get("IONQ_API_KEY"):
            self.skipTest("IONQ_API_KEY is required for real IonQ QPU execution.")
        if os.environ.get("IONQ_ENABLE_HARDWARE", "").lower() not in {"1", "true", "yes", "on"}:
            self.skipTest("Set IONQ_ENABLE_HARDWARE=true to allow real IonQ QPU execution.")

        response = measure_region(
            MeasurementRequest(
                region="torso",
                interaction="click",
                shots=16,
                backend="ionq_hardware",
            ),
        )

        self.assertTrue(REQUIRED_RESPONSE_KEYS.issubset(response))
        self.assertEqual(response["requestedBackend"], "ionq_hardware")
        self.assertEqual(response["provider"], "ionq")
        self.assertTrue(response["hardware"])
        self.assertNotEqual(response.get("source"), "fallback")
        self.assertNotIn("fallbackReason", response)
        self.assertTrue(response.get("jobId"))
        self.assertTrue(response["counts"])


if __name__ == "__main__":
    unittest.main()
