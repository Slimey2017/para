from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/gateway"))
from server import resolve, validate_bind  # noqa: E402
import system_layer  # noqa: E402


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        system_layer.configure(launch_enabled=False)

    def test_health_reports_gateway(self):
        status, payload = resolve("/api/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["name"], "para-gateway")

    def test_system_and_storage_come_from_host(self):
        system_status, system = resolve("/api/v1/system")
        storage_status, storage = resolve("/api/v1/storage")
        self.assertEqual(system_status, 200)
        self.assertTrue(system["os"])
        self.assertEqual(storage_status, 200)
        self.assertGreater(storage["primary"]["total_gb"], 0)

    def test_application_launch_is_hidden_by_default(self):
        status, payload = resolve("/api/v1/apps")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in payload["applications"]], ["para:bear-home"])
        launch_status, _ = system_layer.launch_application("linux:any.desktop")
        self.assertEqual(launch_status, 404)

    def test_unknown_route_returns_not_found(self):
        status, payload = resolve("/api/v1/does-not-exist")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_public_bind_requires_explicit_opt_in(self):
        with self.assertRaises(ValueError):
            validate_bind("0.0.0.0")
        self.assertEqual(str(validate_bind("0.0.0.0", allow_nonlocal=True)), "0.0.0.0")


if __name__ == "__main__":
    unittest.main()
