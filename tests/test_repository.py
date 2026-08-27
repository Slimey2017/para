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

    def test_render_blueprint_uses_real_api(self):
        blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")
        self.assertIn("buildCommand: ./scripts/check.sh", blueprint)
        self.assertIn("startCommand: ./scripts/render-start.sh", blueprint)
        self.assertIn("healthCheckPath: /api/v1/health", blueprint)
        launcher = (ROOT / "scripts/render-start.sh").read_text(encoding="utf-8")
        self.assertIn("services/api/server.py", launcher)
        self.assertIn("--allow-nonlocal", launcher)
        self.assertIn('${PORT:-10000}', launcher)

    def test_bear_home_art_is_preserved_for_a_future_direct_control_game(self):
        art = ROOT / "apps/para-home/assets/bear-home-room.png"
        self.assertTrue(art.exists())
        self.assertGreater(art.stat().st_size, 3_000_000)
        self.assertEqual(hashlib.sha256(art.read_bytes()).hexdigest(), "25e5575eb43e90356a4b937a66be55ddec3494abb5c45d7f222afe6493a0b3bd")
        future = (ROOT / "apps/para-home/src/future/bear-home-game.js").read_text(encoding="utf-8")
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        library = (ROOT / "apps/para-home/src/screens/libraries.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn('inputModel: "direct-character-control"', future)
        self.assertIn('description: "Explore your files as a cozy interactive world."', future)
        self.assertNotRegex(manifest, r'id:\s*"bear-home"')
        self.assertNotIn("Bear Home", library)
        self.assertNotIn("bear-hotspot", css)

    def test_para_files_replaces_bear_home_as_the_file_manager(self):
        files = (ROOT / "apps/para-home/src/screens/files.js").read_text(encoding="utf-8")
        gateway = (ROOT / "services/api/system_layer.py").read_text(encoding="utf-8")
        launcher = (ROOT / "scripts/dev.sh").read_text(encoding="utf-8")
        hosted = (ROOT / "scripts/render-start.sh").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        for command in ["back", "forward", "up", "refresh", "new-folder", "view", "sort", "options"]:
            self.assertIn(f'data-files-command="{command}"', files)
        for shortcut in ['event.key.toLowerCase() === "c"', 'event.key.toLowerCase() === "x"', 'event.key.toLowerCase() === "v"', 'event.key === "Delete"', 'event.key === "F2"', 'event.key === "Backspace"']:
            self.assertIn(shortcut, files)
        for action in ['"create-folder"', '"create-file"', '"rename"', '"copy"', '"move"', '"trash"', '"restore"', '"delete"']:
            self.assertIn(action, gateway)
        self.assertIn("PARA_ENABLE_FILE_OPERATIONS", launcher)
        self.assertIn("--enable-file-operations", launcher)
        self.assertNotIn("--enable-file-operations", hosted)
        self.assertIn('files: filesScreen', app)
        self.assertNotIn('"bear-home"', app)

    def test_home_keeps_four_primary_sections_and_system_out(self):
        screen = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        for title in ["Continue", "Explore", "Create", "Community"]:
            self.assertEqual(screen.count(f'title: "{title}"'), 1)
        section_block = screen.split("const sections = [", 1)[1].split("];", 1)[0]
        self.assertNotIn('title: "System"', section_block)
        self.assertNotIn("para-home-dashboard.png", screen)
        self.assertIn("activateHome", screen)
        self.assertIn('role="tablist"', screen)
        self.assertIn("contextMarkup", screen)
        self.assertIn("Ready to play?", screen)
        self.assertIn('data-home-open-section="explore"', screen)
        self.assertIn('data-focus-zone="home-nav"', screen)
        self.assertIn('data-focus-zone="home-content"', screen)
        self.assertIn("rememberedHomeSection", screen)
        self.assertNotIn("home-launcher", screen)
        self.assertNotIn("home-widget", screen)

    def test_home_continue_queue_centers_real_activity(self):
        screen = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        runtime = (ROOT / "apps/para-home/src/services/experience-runtime.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn("export function recentExperiences()", runtime)
        self.assertIn("CONTINUE_LIMIT = 10", runtime)
        self.assertIn("queueInstalledExperience", runtime)
        self.assertIn('queueStatus: "Ready to play"', runtime)
        self.assertIn("queueInstalledEntries(runtime, completedDemos)", runtime)
        self.assertIn("runtime.recent.filter((item) => item.id !== `demo:${id}`)", runtime)
        self.assertIn("experiences.slice(0, 10)", screen)
        self.assertIn("home-continue-carousel", screen)
        self.assertIn("updateContinueFocus", screen)
        self.assertIn("focus.lockInput(190)", screen)
        self.assertIn("context.scrollTo", screen)
        self.assertIn('data-nav-left="${escapeHtml(focusId)}"', screen)
        self.assertIn('data-nav-right="${escapeHtml(focusId)}"', screen)
        for heading in ["Games", "Apps", "ParaStore", "Recent Projects", "Installed Creator Apps", "PARA Updates", "Messages"]:
            self.assertIn(heading, screen)
        for distance in range(4):
            self.assertIn(f'data-focus-distance="{distance}"', css)
        self.assertIn("--continue-center-space", css)
        self.assertNotIn("home-recent-row", css)
        self.assertIn("home-flow-row", css)
        self.assertIn("overflow-y: auto", css)

    def test_shared_navigation_engine_is_spatial_and_gamepad_native(self):
        focus = (ROOT / "apps/para-home/src/focus-manager.js").read_text(encoding="utf-8")
        gamepad = (ROOT / "apps/para-home/src/gamepad.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        for marker in ["data-focus-zone", "this.memory", "getBoundingClientRect", "alignmentPenalty", "lockInput", "POINTER_HANDOFF_DISTANCE = 6"]:
            self.assertIn(marker, focus)
        for marker in ["DEADZONE = 0.28", "REPEAT_DELAY_MS = 350", "REPEAT_RATE_MS = 120", "activeIndex", "navigator.getGamepads", "find(meaningful)"]:
            self.assertIn(marker, gamepad)
        self.assertIn('para-home-section-shift', app)
        self.assertNotIn('const majorSections = ["home", "apps", "settings"]', app)

    def test_official_logo_is_used_without_generated_ring(self):
        logo = ROOT / "apps/para-home/assets/para-logo.png"
        self.assertTrue(logo.exists())
        self.assertEqual(hashlib.sha256(logo.read_bytes()).hexdigest(), "32b657bf30d6091e8441268049b7ffdbefa150e4ca2259ebe1755bf1e9dc54b0")
        home = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        components = (ROOT / "apps/para-home/src/ui/components.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn('paraLogo("home-wordmark__logo")', home)
        self.assertIn("./assets/para-logo.png", components)
        self.assertNotIn("brand__mark", css)
        self.assertNotIn("home-wordmark__mark", css)
        self.assertNotIn("conic-gradient(from 205deg", css)

    def test_built_in_wallpapers_use_supplied_images(self):
        expected = {
            "background-aurora-current.png": "6fae718d7f8e33d6e274bf4e8876640aef1103e5df393096f4ff9e5953e51f12",
            "background-violet-horizon.png": "82f5eef9ad30289e9dd38ebf8e56b9bb2cd80bbd6625cb6aba371039b354135e",
            "background-midnight-flow.png": "f779bb08742cbcd50cc3ef9add755f0b2658824f761d76eb441e9f03f36accd5",
            "background-matte-black.png": "e8976d7b7c5a7c4ba76b77b1133fbb46d601bd7868eda064b0bd89875fdc84fc",
        }
        for filename, digest in expected.items():
            artwork = ROOT / "apps/para-home/assets" / filename
            self.assertTrue(artwork.exists())
            self.assertEqual(hashlib.sha256(artwork.read_bytes()).hexdigest(), digest)
        state = (ROOT / "apps/para-home/src/state.js").read_text(encoding="utf-8")
        screen = (ROOT / "apps/para-home/src/screens/personalization.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        self.assertNotIn('kind: "gradient"', state)
        self.assertNotIn('kind: "solid"', state)
        for name in ["Aurora Current", "Violet Horizon", "Midnight Flow", "Matte Black"]:
            self.assertIn(f'name: "{name}"', state)
        for action in ["preview-background", "apply-background", "cancel-background-selection", "restore-background-default", "open-background-picker"]:
            self.assertIn(f'data-action="{action}"', screen)
            self.assertIn(f'case "{action}"', app)
        self.assertIn("Add Custom Background", screen)

    def test_para_button_supports_tap_and_hold(self):
        gamepad = (ROOT / "apps/para-home/src/gamepad.js").read_text(encoding="utf-8")
        focus = (ROOT / "apps/para-home/src/focus-manager.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        self.assertIn("paraTap", gamepad)
        self.assertIn("paraHold", gamepad)
        self.assertIn(">= 650", gamepad)
        self.assertIn("paraHold", focus)
        self.assertIn("controlCenterShell", app)

    def test_startup_is_the_eight_second_para_ignition(self):
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        adapter = (ROOT / "apps/para-home/src/services/startup-adapter.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn("STARTUP_DURATION_MS = 8000", adapter)
        for marker in ["BLACK_END: 1000", "POINT_END: 1250", "RING_END: 1850", "MARK_END: 5000", "BRAND_END: 7000"]:
            self.assertIn(marker, adapter)
        self.assertIn('paraLogo("para-ignition__mark")', boot)
        self.assertIn("requestAnimationFrame(run)", boot)
        self.assertIn("para-startup-light", adapter)
        for legacy in ["liquid__blob", "beat-orb", "boot-stage", "melt-logo"]:
            self.assertNotIn(legacy, boot)
            self.assertNotIn(legacy, css)

    def test_first_time_setup_has_all_fourteen_chapters(self):
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        chapters = [
            "Controller", "Language & Region", "Display Area", "Internet", "PARA Account",
            "Gaming Accounts", "Other Accounts", "Privacy", "Accessibility", "Audio",
            "Power & Sleep", "Background", "Updates & Storage", "Ready",
        ]
        chapter_block = boot.split("export const SETUP_CHAPTERS", 1)[1].split("]);", 1)[0]
        for chapter in chapters:
            self.assertEqual(chapter_block.count(f'"{chapter}"'), 1)
        self.assertIn("SETUP_CHAPTERS.length - 1", app)
        self.assertIn("setup-journey__line", boot)
        self.assertNotIn("setup-progress span", (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8"))

    def test_control_center_is_a_compact_contextual_strip(self):
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        for title in ["Home", "Switcher", "Notifications", "Friends", "Downloads", "Music", "Network", "Sound", "Microphone", "Controller", "Profile", "Power"]:
            self.assertIn(f'title: "{title}"', control)
        self.assertIn("control-center-strip", control)
        self.assertIn("control-center-context", control)
        self.assertIn("lastSelectedId", control)
        self.assertIn('data-action="enter-sleep"', control)
        self.assertIn('data-action="restart-shell"', control)
        self.assertIn('data-action="confirm-turn-off"', control)
        self.assertNotIn("<h2>Control Center</h2>", control)
        self.assertNotIn(">Customize<", control)
        self.assertNotIn("control-center-close", control)
        self.assertNotIn("control-center-item", css)

    def test_power_screen_has_real_routes_and_exact_shutdown_timeline(self):
        system_screen = (ROOT / "apps/para-home/src/screens/system.js").read_text(encoding="utf-8")
        screen = system_screen.split("export function powerScreen()", 1)[1].split("export function healthScreen()", 1)[0]
        experience = (ROOT / "apps/para-home/src/ui/power-experience.js").read_text(encoding="utf-8")
        adapter = (ROOT / "apps/para-home/src/services/power-adapter.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        gateway = (ROOT / "services/api/system_layer.py").read_text(encoding="utf-8")
        for title in ["Return Home", "Sleep", "Restart PARA", "Turn Off PARA", "Sign Out", "Recovery"]:
            self.assertEqual(screen.count(f'title: "{title}"'), 1)
        self.assertIn("Turn off PARA?", screen)
        self.assertIn("Any unsaved work may be lost.", screen)
        self.assertIn("POWER_SEQUENCE_DURATION_MS = 8000", experience)
        for marker in ["FADE_END: 1000", "LOGO_END: 2000", "MESSAGE_OUT: 5500", "GLOW_CONTRACT: 7000"]:
            self.assertIn(marker, experience)
        self.assertIn('./assets/para-logo.png', experience)
        self.assertIn('"Turning off PARA"', experience)
        self.assertIn('"Entering Sleep"', experience)
        self.assertIn('"Restarting PARA"', experience)
        self.assertIn("window.close()", adapter)
        self.assertIn('location.replace(destination)', adapter)
        for action in ["enter-sleep", "confirm-turn-off", "cancel-turn-off", "turn-off-para", "restart-shell"]:
            self.assertIn(f'case "{action}"', app)
        self.assertIn('["systemctl", "suspend"]', gateway)
        self.assertIn('["systemctl", "reboot"]', gateway)
        self.assertIn('["systemctl", "poweroff"]', gateway)
        self.assertIn("if not _power_enabled", gateway)

    def test_host_power_requires_local_opt_in(self):
        launcher = (ROOT / "scripts/dev.sh").read_text(encoding="utf-8")
        hosted = (ROOT / "scripts/render-start.sh").read_text(encoding="utf-8")
        self.assertIn("PARA_ENABLE_POWER_ACTIONS", launcher)
        self.assertIn("--enable-power-actions", launcher)
        self.assertNotIn("--enable-power-actions", hosted)

    def test_banned_consumer_terms_are_absent(self):
        banned = re.compile(r"\b(mock|stub|prototype|frontend|backend|simulated)\b", re.IGNORECASE)
        for path in (ROOT / "apps/para-home").rglob("*"):
            if path.is_file() and path.suffix in {".html", ".js", ".css"}:
                self.assertIsNone(banned.search(path.read_text(encoding="utf-8")), path)

    def test_legacy_data_and_routes_are_gone(self):
        self.assertFalse((ROOT / "apps/para-home/src/mock-data.js").exists())
        self.assertTrue((ROOT / "services/api/server.py").exists())
        self.assertTrue((ROOT / "services/api/system_layer.py").exists())
        self.assertFalse((ROOT / "services/mock-api").exists())
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        for route in ["store", "social", "calls", "updates", "subscription"]:
            self.assertNotRegex(manifest, rf'id:\s*"{route}"')

    def test_live_clock_uses_one_shared_minute_aligned_helper(self):
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        clock = (ROOT / "apps/para-home/src/services/live-clock.js").read_text(encoding="utf-8")
        self.assertIn('mountLiveClock(root)', app)
        self.assertIn('hour12: true', clock)
        self.assertIn('60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())', clock)
        self.assertIn('window.clearTimeout(timer)', clock)
        self.assertNotIn('setInterval(updateClock', app)

    def test_demo_continuity_and_control_center_sources_are_persistent(self):
        state = (ROOT / "apps/para-home/src/state.js").read_text(encoding="utf-8")
        runtime = (ROOT / "apps/para-home/src/services/experience-runtime.js").read_text(encoding="utf-8")
        experiences = (ROOT / "apps/para-home/src/screens/experiences.js").read_text(encoding="utf-8")
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        self.assertIn('para.home.state.v5', state)
        for field in ["recent", "running", "installedDemos", "downloads", "notifications", "creator"]:
            self.assertIn(field, state)
        catalog = (ROOT / "apps/para-home/src/services/demo-catalog.js").read_text(encoding="utf-8")
        self.assertIn("DEMOS = Object.freeze([])", catalog)
        for demo in ["Pulse Pong", "Neon Lane", "Violet Step"]:
            self.assertNotIn(demo, catalog)
        self.assertIn('recordExperience', runtime)
        self.assertIn('startDemoInstall', runtime)
        self.assertIn('canvas', experiences)
        for item in ['"home", "switcher"', 'ids.push("downloads")', 'ids.push("audio")', 'ids.push("microphone")']:
            self.assertIn(item, control)

    def test_para_keyboard_button_supports_p(self):
        focus = (ROOT / "apps/para-home/src/focus-manager.js").read_text(encoding="utf-8")
        self.assertIn('["p", "m"]', focus)

    def test_store_games_persist_into_continue_and_resume_directly(self):
        runtime = (ROOT / "apps/para-home/src/services/experience-runtime.js").read_text(encoding="utf-8")
        home = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('item.id.startsWith("store:")', runtime)
        self.assertIn('data-store-id=', home)
        self.assertIn('target.matches("[data-continue-item]") && target.dataset.storeId', app)
        self.assertIn("const GAME_ACTIVITY_ID = `store:${RUNTIME_ID}`", server)
        self.assertIn("localStorage.setItem(HOME_STATE_KEY", server)

    def test_game_capture_prefers_direct_frames_then_reuses_self_tab_fallback(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('captureCanvas.captureStream(30)', server)
        self.assertIn('async function requestGameStream(audio = false)', server)
        self.assertIn('requestCompositedGameStream(audio)', server)
        self.assertIn('requestSessionSelfCapture(audio)', server)
        self.assertIn('navigator.mediaDevices.getDisplayMedia', server)
        self.assertIn("preferCurrentTab: true", server)
        self.assertIn("sessionSelfCapture", server)
        self.assertIn("RestrictionTarget.fromElement(document.body)", server)
        self.assertIn('createMediaStreamDestination()', server)
        self.assertIn('async function verifyRecordedBlob(blob)', server)
        self.assertIn('The gameplay recording could not be decoded.', server)

    def test_game_control_center_uses_m_and_avoids_fullscreen_blur(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn("event.key?.toLowerCase() === 'm'", server)
        self.assertIn('maskedPadCache', server)
        self.assertNotIn('backdrop-filter:', server)


if __name__ == "__main__":
    unittest.main()

def test_core_resilience_services_present():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    save = (root / "apps/para-home/src/services/save-data.js").read_text()
    runtime = (root / "apps/para-home/src/services/experience-runtime.js").read_text()
    system = (root / "apps/para-home/src/screens/system.js").read_text()
    assert "VERSION_LIMIT" in save and "restoreSaveVersion" in save
    assert "pauseDownload" in runtime and "resumeDownload" in runtime and "cancelDownload" in runtime
    assert "PARA does not invent demo saves" in system
