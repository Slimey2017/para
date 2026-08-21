from __future__ import annotations

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
            token = f'"{screen_id}"' if "-" in screen_id else f"{screen_id}:"
            if "-" not in screen_id:
                self.assertRegex(app, rf"\b{re.escape(screen_id)}\s*:")
            else:
                self.assertIn(f'"{screen_id}":', app)

    def test_service_registry_labels_every_status(self):
        services = json.loads((ROOT / "config/services.json").read_text(encoding="utf-8"))["services"]
        self.assertGreaterEqual(len(services), 12)
        self.assertTrue(all(item.get("status") for item in services))
        self.assertTrue(all(isinstance(item.get("privileged"), bool) for item in services))

    def test_no_default_form_buttons(self):
        html = (ROOT / "apps/para-home/index.html").read_text(encoding="utf-8")
        self.assertNotIn("<button", html)
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn(".action-button", css)
        self.assertIn(":focus-visible", css)

    def test_render_blueprint_uses_explicit_public_launcher(self):
        blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")
        self.assertIn("startCommand: ./scripts/render-start.sh", blueprint)
        self.assertIn("healthCheckPath: /api/v1/health", blueprint)
        launcher = (ROOT / "scripts/render-start.sh").read_text(encoding="utf-8")
        self.assertIn("--allow-nonlocal", launcher)
        self.assertIn('${PORT:-10000}', launcher)

    def test_bear_home_uses_illustrated_room_and_focus_hotspots(self):
        art = ROOT / "apps/para-home/assets/bear-home-room.png"
        self.assertTrue(art.exists())
        self.assertGreater(art.stat().st_size, 1_000_000)
        screen = (ROOT / "apps/para-home/src/screens/libraries.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn("bear-home-room.png", screen)
        self.assertIn('label: "Videos"', screen)
        self.assertIn('label: "External Drives"', screen)
        self.assertIn('action: "bear-more"', screen)
        self.assertIn("console-art-frame bear-home-room__frame", screen)
        self.assertIn("object-fit: contain", css)
        self.assertNotIn("object-fit: cover", css)

    def test_home_uses_reference_dashboard_and_shared_navigation(self):
        art = ROOT / "apps/para-home/assets/para-home-dashboard.png"
        self.assertTrue(art.exists())
        self.assertGreater(art.stat().st_size, 500_000)
        screen = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        self.assertIn("para-home-dashboard.png", screen)
        self.assertIn('label: "Continue"', screen)
        self.assertIn('label: "Community"', screen)
        self.assertIn('label: "Library"', screen)
        self.assertIn('route: "notifications"', screen)
        self.assertIn("dashboard-hotspot", screen)


if __name__ == "__main__":
    unittest.main()
