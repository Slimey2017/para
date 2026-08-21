from __future__ import annotations

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/mock-api"))
from modules.endpoints import resolve  # noqa: E402
from server import validate_bind  # noqa: E402


class ApiContractTests(unittest.TestCase):
    def test_health_is_explicitly_mock(self):
        status, payload = resolve("/api/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["mode"], "development-mock")

    def test_system_disables_privileged_actions(self):
        status, payload = resolve("/api/v1/status")
        self.assertEqual(status, 200)
        self.assertTrue(payload["safe_mode"])
        self.assertFalse(payload["privileged_actions_enabled"])

    def test_unknown_route_is_honest(self):
        status, payload = resolve("/api/v1/does-not-exist")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_public_bind_requires_explicit_opt_in(self):
        with self.assertRaises(ValueError):
            validate_bind("0.0.0.0")
        self.assertEqual(str(validate_bind("0.0.0.0", allow_nonlocal=True)), "0.0.0.0")


if __name__ == "__main__":
    unittest.main()
