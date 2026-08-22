from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RepositoryTests(unittest.TestCase):
    def test_frontend_routes_have_renderers(self):
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        ids = set(re.findall(r'id:\s*"([^"]+)"', manifest))
        for screen_id in ids:
            if "-" in screen_id:
                self.assertIn(f'"{screen_id}":', app)
            else:
                self.assertRegex(app, rf"\b{re.escape(screen_id)}\s*:")

    def test_service_registry_labels_every_status(self):
        services = json.loads((ROOT / "config/services.json").read_text(encoding="utf-8"))["services"]
        self.assertGreaterEqual(len(services), 12)
        self.assertTrue(all(item.get("status") for item in services))
        self.assertTrue(all(isinstance(item.get("privileged"), bool) for item in services))

    def test_render_blueprint_uses_gateway(self):
        blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")
        self.assertIn("startCommand: ./scripts/render-start.sh", blueprint)
        self.assertIn("healthCheckPath: /api/v1/health", blueprint)
        launcher = (ROOT / "scripts/render-start.sh").read_text(encoding="utf-8")
        self.assertIn("services/gateway/server.py", launcher)
        self.assertIn("--allow-nonlocal", launcher)
        self.assertIn('${PORT:-10000}', launcher)

    def test_bear_home_uses_clean_room_and_spatial_hotspots(self):
        art = ROOT / "apps/para-home/assets/bear-home-room.png"
        self.assertTrue(art.exists())
        self.assertGreater(art.stat().st_size, 3_000_000)
        self.assertEqual(hashlib.sha256(art.read_bytes()).hexdigest(), "25e5575eb43e90356a4b937a66be55ddec3494abb5c45d7f222afe6493a0b3bd")
        screen = (ROOT / "apps/para-home/src/screens/libraries.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        for label in ["Videos", "Discs", "Music", "Documents", "External Drives", "Downloads", "Bear Home menu"]:
            self.assertIn(f'label: "{label}"', screen)
        self.assertIn("data-focus-label", screen)
        self.assertIn("object-fit: contain", css)

    def test_home_keeps_five_primary_buttons(self):
        screen = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        for title in ["Continue", "Explore", "Create", "Community", "System"]:
            self.assertEqual(screen.count(f'title: "{title}"'), 1)
        self.assertNotIn("para-home-dashboard.png", screen)
        self.assertIn("activateHome", screen)
        self.assertIn('role="tablist"', screen)
        self.assertIn("contextMarkup", screen)
        self.assertNotIn("home-launcher", screen)
        self.assertNotIn("home-widget", screen)

    def test_para_button_supports_tap_and_hold(self):
        gamepad = (ROOT / "apps/para-home/src/gamepad.js").read_text(encoding="utf-8")
        focus = (ROOT / "apps/para-home/src/focus-manager.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        self.assertIn("paraTap", gamepad)
        self.assertIn("paraHold", gamepad)
        self.assertIn(">= 650", gamepad)
        self.assertIn("paraHold", focus)
        self.assertIn("controlCenterShell", app)

    def test_banned_consumer_terms_are_absent(self):
        banned = re.compile(r"\b(mock|stub|prototype|frontend|backend|simulated)\b", re.IGNORECASE)
        for path in (ROOT / "apps/para-home").rglob("*"):
            if path.is_file() and path.suffix in {".html", ".js", ".css"}:
                self.assertIsNone(banned.search(path.read_text(encoding="utf-8")), path)

    def test_legacy_data_and_routes_are_gone(self):
        self.assertFalse((ROOT / "apps/para-home/src/mock-data.js").exists())
        self.assertFalse((ROOT / "services/mock-api/server.py").exists())
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        for route in ["store", "creator", "social", "calls", "notifications", "updates", "subscription"]:
            self.assertNotRegex(manifest, rf'id:\s*"{route}"')


if __name__ == "__main__":
    unittest.main()
