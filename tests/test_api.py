from __future__ import annotations

import sys
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

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

    def test_application_roles_come_from_desktop_metadata(self):
        self.assertEqual(system_layer._application_roles("Development;IDE;", "Code Studio"), ["creator"])
        self.assertEqual(system_layer._application_roles("Game;", "Installed Game"), ["game"])
        self.assertEqual(system_layer._application_roles("Utility;", "Calculator"), [])

    def test_unknown_route_returns_not_found(self):
        status, payload = resolve("/api/v1/does-not-exist")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_capabilities_do_not_invent_switcher_or_notifications(self):
        status, payload = resolve("/api/v1/capabilities")
        self.assertEqual(status, 200)
        self.assertFalse(payload["switcher"])
        self.assertFalse(payload["notifications"])

    def test_power_actions_are_off_until_explicitly_enabled(self):
        status, payload = resolve("/api/v1/capabilities")
        action_status, result = system_layer.request_power_action("poweroff")
        self.assertEqual(status, 200)
        self.assertEqual(payload["power"], "session")
        self.assertEqual(payload["power_actions"], [])
        self.assertEqual(action_status, 403)
        self.assertEqual(result["error"], "power_unavailable")

    def test_power_actions_use_only_fixed_systemctl_arguments(self):
        system_layer.configure(launch_enabled=False, controls_enabled=True, power_enabled=True)
        with patch("system_layer.shutil.which", return_value="/usr/bin/systemctl"), patch("system_layer.subprocess.Popen") as process:
            status, payload = system_layer.request_power_action("suspend")
            self.assertEqual(status, 202)
            self.assertTrue(payload["accepted"])
            process.assert_called_once()
            self.assertEqual(process.call_args.args[0], ["/usr/bin/systemctl", "suspend"])
            self.assertNotIn("shell", process.call_args.kwargs)

        with patch("system_layer.shutil.which", return_value="/usr/bin/systemctl"), patch("system_layer.subprocess.Popen") as process:
            status, _ = system_layer.request_power_action("anything-else")
            self.assertEqual(status, 400)
            process.assert_not_called()

    def test_profile_personalization_is_separate_and_persistent(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {"XDG_CONFIG_HOME": os.path.join(temporary, "config"), "XDG_DATA_HOME": os.path.join(temporary, "data")}
            with patch.dict(os.environ, environment):
                system_layer.configure(launch_enabled=False, controls_enabled=True)
                preferences = {
                    "background": {"selection": "para-aurora", "fit": "fit", "dim": 30, "blur": 12, "revision": 0},
                    "home": {"order": ["storage", "network", "system"], "hidden": ["network"]},
                    "controlCenter": {"order": ["home", "profile", "settings", "power"], "hidden": []},
                }
                status, _ = system_layer.save_personalization("Player One", preferences)
                other_status, other = system_layer.personalization("Player Two")
                saved_status, saved = system_layer.personalization("Player One")
                self.assertEqual(status, 200)
                self.assertEqual(other_status, 200)
                self.assertIsNone(other["preferences"])
                self.assertEqual(saved_status, 200)
                self.assertEqual(saved["preferences"]["background"]["fit"], "fit")

    def test_custom_background_validates_image_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {"XDG_CONFIG_HOME": os.path.join(temporary, "config"), "XDG_DATA_HOME": os.path.join(temporary, "data")}
            with patch.dict(os.environ, environment):
                system_layer.configure(launch_enabled=False, controls_enabled=True)
                status, result = system_layer.save_custom_background("Player One", "image/png", b"\x89PNG\r\n\x1a\ncontent")
                path, mime = system_layer.custom_background_path("Player One")
                self.assertEqual(status, 201)
                self.assertTrue(result["revision"])
                self.assertTrue(path and path.is_file())
                self.assertEqual(mime, "image/png")

    def test_public_bind_requires_explicit_opt_in(self):
        with self.assertRaises(ValueError):
            validate_bind("0.0.0.0")
        self.assertEqual(str(validate_bind("0.0.0.0", allow_nonlocal=True)), "0.0.0.0")


if __name__ == "__main__":
    unittest.main()
