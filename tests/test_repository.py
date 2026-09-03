from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RepositoryTests(unittest.TestCase):
    def test_focus_manager_ignores_malformed_keyboard_events(self):
        focus = (ROOT / "apps/para-home/src/focus-manager.js").read_text(encoding="utf-8")
        self.assertIn('const key = typeof event?.key === "string" ? event.key : "";', focus)
        self.assertGreaterEqual(focus.count('if (!key) return;'), 2)
        self.assertIn('target?.matches?.("input:not([type=\'range\']),textarea,select")', focus)

    def test_para_account_auth_is_real_and_first_boot_buttons_are_enabled(self):
        auth = (ROOT / "apps/para-home/src/screens/auth.js").read_text(encoding="utf-8")
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('data-action="setup-account-signin"', boot)
        self.assertIn('data-action="setup-account-signup"', boot)
        self.assertIn('data-account-signin-form', auth)
        self.assertIn('data-account-signup-form', auth)
        self.assertIn('/api/v1/auth/signin', api)
        self.assertIn('/api/v1/auth/recovery/request', api)
        self.assertIn('/api/v1/auth/recovery/complete', api)
        self.assertIn('data-account-recovery-form', auth)
        self.assertIn('data-account-reset-form', auth)
        self.assertIn('/auth/v1/token?grant_type=password', server)
        self.assertIn('PARA_ACCOUNT_SUPABASE_PROJECT_REF = "fqkbvxutsijruyawzxxo"', server)
        self.assertIn('sb_publishable_aKSE87nlJmUddelmwAwa9Q_5sz5ZESY', server)
        self.assertIn('HttpOnly; SameSite=Lax', server)


    def test_public_privacy_policy_covers_connected_accounts_and_google_data(self):
        privacy = (ROOT / "apps/para-home/privacy/index.html").read_text(encoding="utf-8")
        index = (ROOT / "apps/para-home/index.html").read_text(encoding="utf-8")
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        for marker in [
            "Google and YouTube data",
            "youtube.readonly",
            "Google API Services User Data Policy",
            "PARA does not sell personal information",
            "Steam OpenID",
            "Retention, disconnecting, and deletion",
        ]:
            self.assertIn(marker, privacy)
        self.assertIn('href="/privacy"', index)
        self.assertGreaterEqual(boot.count('href="/privacy"'), 2)
        self.assertIn('request.path in {"/privacy", "/privacy/"}', server)

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
        self.assertIn("python3 -m pip install -r requirements.txt", blueprint)
        self.assertIn("./scripts/check.sh", blueprint)
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
        for heading in ["Games", "Apps", "ParaStore", "Recent Projects", "Installed Creator Apps", "PARA Updates", "Friends"]:
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

    def test_para_account_email_verification_is_controller_ready(self):
        auth = (ROOT / "apps/para-home/src/screens/auth.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        self.assertIn('accountVerifyScreen', auth)
        self.assertIn('autocomplete="one-time-code"', auth)
        self.assertIn('case "account-verify-submit"', app)
        self.assertIn('case "account-verification-resend"', app)
        self.assertIn('authRequestVerification', api)
        self.assertIn('/api/v1/auth/verification/request', server)
        self.assertIn('EMAIL_VERIFICATION_MAX_ATTEMPTS = 6', server)
        self.assertIn('"account-verify"', manifest)

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

    def test_language_region_setup_uses_real_multi_option_selectors(self):
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        self.assertIn('const LANGUAGE_OPTIONS = Object.freeze([', boot)
        self.assertIn('["es", "Español"]', boot)
        self.assertIn('const FALLBACK_REGION_CODES = Object.freeze([', boot)
        self.assertIn('Intl.DisplayNames', boot)
        self.assertIn('for (let first = 65; first <= 90; first += 1)', boot)
        self.assertIn('Intl.supportedValuesOf("timeZone")', boot)
        self.assertIn('const KEYBOARD_LAYOUT_OPTIONS = Object.freeze([', boot)
        self.assertIn('["fr", "French · AZERTY"]', boot)
        self.assertNotIn('<select data-setup-setting="language"><option value="en" selected>English</option></select>', boot)
        self.assertNotIn('<select data-setup-setting="keyboardLayout"><option value="system" selected>System default</option></select>', boot)

    def test_steam_setup_uses_real_openid_connection_flow(self):
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        migration = (ROOT / "supabase/secure_gaming_account_links.sql").read_text(encoding="utf-8")
        self.assertIn('data-action="setup-connect-provider"', boot)
        self.assertIn('["steam", "Steam"]', boot)
        self.assertIn('data-provider="${id}"', boot)
        self.assertIn('Coming soon', boot)
        self.assertIn('window.location.assign("/api/v1/integrations/steam/connect")', app)
        self.assertIn('steamStatus:', api)
        self.assertIn('STEAM_OPENID_DISCOVERY_URL = "https://steamcommunity.com/openid/"', server)
        self.assertIn('STEAM_OPENID_LOGIN_URL = "https://steamcommunity.com/openid/login"', server)
        self.assertIn('"/api/v1/integrations/steam/callback"', server)
        self.assertIn("check_authentication", server)
        self.assertIn("SameSite=Lax", server)
        self.assertIn("gaming_accounts_select_own", migration)
        self.assertIn("auth.uid()", migration)

    def test_google_youtube_setup_uses_real_oauth_connection_flow(self):
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        render = (ROOT / "render.yaml").read_text(encoding="utf-8")
        migration = (ROOT / "supabase/secure_external_account_links.sql").read_text(encoding="utf-8")
        self.assertIn('["google", "Google / YouTube"]', boot)
        self.assertIn('data-provider="${id}"', boot)
        self.assertIn('window.location.assign("/api/v1/integrations/google/connect")', app)
        self.assertIn('googleStatus:', api)
        self.assertIn('googleDisconnect:', api)
        self.assertIn('GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"', server)
        self.assertIn('"https://www.googleapis.com/auth/youtube.readonly"', server)
        self.assertNotIn('"https://www.googleapis.com/auth/youtube.upload",\n)', server)
        self.assertIn('"/api/v1/integrations/google/callback"', server)
        self.assertIn('GOOGLE_YOUTUBE_CHANNELS_URL', server)
        self.assertIn('PARA_GOOGLE_CLIENT_ID', render)
        self.assertIn('PARA_GOOGLE_CLIENT_SECRET', render)
        self.assertIn('external_accounts_select_own', migration)
        self.assertIn('OAuth access/refresh tokens are intentionally NOT stored', migration)
        self.assertIn('auth.uid()', migration)

    def test_youtube_direct_upload_uses_incremental_oauth_and_resumable_upload(self):
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        privacy = (ROOT / "apps/para-home/privacy/index.html").read_text(encoding="utf-8")
        self.assertIn('YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"', server)
        self.assertIn('"/api/v1/integrations/google/youtube/authorize"', server)
        self.assertIn('"/api/v1/integrations/google/youtube/upload"', server)
        self.assertIn('uploadType": "resumable"', server)
        self.assertIn('stream_youtube_resumable_upload', server)
        self.assertIn('YOUTUBE_UPLOAD_SESSION_COOKIE', server)
        self.assertIn('youtubeUploadCapture:', api)
        self.assertIn('Authorize & Upload', app)
        self.assertIn('data-youtube-upload-audience', app)
        self.assertIn('resumePendingYouTubeUpload', app)
        self.assertIn('youtube.upload', privacy)
        self.assertIn('short-lived server memory', privacy)

    def test_v45_media_player_and_youtube_publish_polish_are_wired(self):
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        player = (ROOT / "apps/para-home/src/ui/video-player.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertIn("paraVideoPlayerMarkup", media)
        self.assertIn("activateParaVideoPlayers", media)
        for feature in ["data-video-seek", "data-video-volume", "data-video-speed", "data-video-action=\"fullscreen\""]:
            self.assertIn(feature, player)
        self.assertIn("Upload to YouTube", media)
        self.assertIn("data-youtube-upload-tags", app)
        self.assertIn("data-youtube-upload-category", app)
        self.assertIn("data-youtube-upload-schedule", app)
        self.assertIn("data-youtube-thumbnail-time", app)
        self.assertIn("YOUTUBE_DEFAULT_VISIBILITY_KEY", app)
        self.assertIn("youtubeSetThumbnail", api)
        self.assertIn("xhr.upload.onprogress", api)
        self.assertIn("GOOGLE_YOUTUBE_THUMBNAIL_UPLOAD_URL", server)
        self.assertIn('"publishAt"', server)
        self.assertIn('"categoryId"', server)
        self.assertIn('snippet["tags"]', server)
        self.assertIn("creator_stats", server)
        self.assertIn(".para-video-player__seek", css)
        self.assertIn(".youtube-upload-progress__bar", css)

    def test_v46_media_playback_fix_avoids_webm_duration_seek_and_removes_overlay_fullscreen(self):
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        player = (ROOT / "apps/para-home/src/ui/video-player.js").read_text(encoding="utf-8")
        capture = (ROOT / "apps/para-home/src/services/capture-service.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        self.assertNotIn("video.currentTime = 1e10", player)
        self.assertIn("mimeType: capturePlaybackMime(item)", media)
        self.assertNotIn('class="capture-hero__fullscreen"', media)
        self.assertNotIn(".capture-hero__fullscreen", css)
        self.assertIn("data-video-status", player)
        self.assertIn("video.canPlayType", player)
        # Gameplay recording stays in the injected runtime. New clips are stored directly
        # as WebM while legacy MP4 captures remain playable.
        self.assertIn('return "video/webm"', capture)
        self.assertIn('return "video/mp4"', capture)
        self.assertNotIn("MediaRecorder", capture)

    def test_v47_webm_playback_uses_generic_blob_mime_and_direct_video_src(self):
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        player = (ROOT / "apps/para-home/src/ui/video-player.js").read_text(encoding="utf-8")
        capture = (ROOT / "apps/para-home/src/services/capture-service.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        self.assertIn("capturePlaybackMime", capture)
        self.assertIn('return "video/webm"', capture)
        self.assertIn("new Blob([blob], { type: playbackMime })", capture)
        self.assertIn("capturePlaybackBlob(item)", media)
        self.assertIn("capturePlaybackMime(item)", media)
        self.assertIn("capturePlaybackBlob(item)", app)
        self.assertIn("capturePlaybackMime(item)", app)
        self.assertIn('<video src="${escapeAttr(src)}"', player)
        self.assertNotIn('<source src="${escapeAttr(src)}"', player)
        self.assertIn("player.dataset.mimeHint", player)
        self.assertNotIn("Unsupported media type", player)

    def test_v56_runtime_capture_saves_recorder_output_directly(self):
        capture = (ROOT / "apps/para-home/src/services/capture-service.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertNotIn("getDisplayMedia", capture)
        self.assertNotIn("MediaRecorder", capture)
        self.assertIn("saves the recording directly to Media Gallery", capture)
        self.assertIn('captureCanvas.captureStream(RUNTIME_CAPTURE_FPS)', server)
        self.assertIn('new MediaRecorder(stream, runtimeRecorderOptions', server)
        self.assertIn("sourceMimeType: rawBlob.type", server)
        self.assertIn("captureVersion: 9", server)
        self.assertIn("normalized: false", server)
        self.assertNotIn('normalizeRuntimeCapture', server)
        self.assertNotIn('/api/v1/capture/normalize', server)

    def test_control_center_is_a_compact_contextual_strip(self):
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        for title in ["Home", "Switcher", "Notifications", "Downloads", "Captures", "Music", "Network", "Sound", "Microphone", "Controller", "Profile", "Power"]:
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


    def test_control_center_v15_removes_dead_controls_and_hold_returns_home(self):
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        state = (ROOT / "apps/para-home/src/state.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        gamepad = (ROOT / "apps/para-home/src/gamepad.js").read_text(encoding="utf-8")
        self.assertNotIn('friends: { title: "Friends"', control)
        self.assertNotIn('settings: { title: "Quick Settings"', control)
        self.assertNotIn('"friends"', state.split("DEFAULT_CONTROL_CENTER_ORDER", 1)[1].split(");", 1)[0])
        hold = app.split("function paraHold()", 1)[1].split("function openSwitcher()", 1)[0]
        self.assertIn('navigate("home")', hold)
        self.assertNotIn('openSwitcher()', hold)
        self.assertIn('const shellOverlayActive = Boolean(document.querySelector("#para-overlay:not([hidden])"))', gamepad)
        self.assertIn('const shellOwnsInput = shellOverlayActive || !gameRuntimeActive', gamepad)

    def test_v22_achievement_runtime_is_wired_to_game_and_profile(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        state = (ROOT / "apps/para-home/src/state.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        for marker_text in ["def store_achievements", "paraSdk.achievements", "unlock: (key)", "setProgress: (key, value)", "para-achievementearned"]:
            self.assertIn(marker_text, server)
        for marker_text in ["seedAchievementCatalog", "achievementToast", "showAchievementToast(record)", "Achievement unlocked", "para-achievement-request", "drainAchievementRequests", "PARA_ACHIEVEMENT_QUEUE_KEY"]:
            self.assertIn(marker_text, server)
        self.assertLess(server.index("paraSdk.achievements ="), server.index("if (window.top !== window.self) return;"))
        self.assertIn('achievements: []', state)
        self.assertIn('achievements: [...(value.achievements || [])]', state)
        self.assertIn('storeAchievements:', api)
        self.assertIn('getProfileRuntime().achievements', media)
        self.assertIn('PARA Score', media)

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
        self.assertIn('key.toLowerCase() === "p"', focus)
        self.assertNotIn('["p", "m"]', focus)

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

    def test_game_capture_preserves_dom_hud_without_recording_para_shell(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('captureCanvas.captureStream(RUNTIME_CAPTURE_FPS)', server)
        self.assertIn('async function requestGameStream(audio = false)', server)
        self.assertIn('requestCompositedGameStream(audio)', server)
        self.assertIn('requestRestrictedGameRootStream(audio, root)', server)
        self.assertIn('gameRootHasDomVisuals', server)
        self.assertIn('navigator.mediaDevices.getDisplayMedia', server)
        self.assertIn("preferCurrentTab: true", server)
        self.assertIn('RestrictionTarget.fromElement(captureRoot)', server)
        self.assertIn("stream.__paraCaptureMode = 'restricted-game-root'", server)
        self.assertIn("node.id === 'para-game-system-shell'", server)
        self.assertNotIn("RestrictionTarget.fromElement(document.body)", server)
        self.assertNotIn('requestSessionSelfCapture(audio)', server)
        self.assertNotIn('normalizeRuntimeCapture', server)

    def test_game_control_center_matches_home_button_contract_and_avoids_fullscreen_blur(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn("event.key?.toLowerCase() === 'p'", server)
        self.assertNotIn("event.key?.toLowerCase() === 'm'", server)
        self.assertIn('data-action="controller"', server)
        self.assertIn('maskedPadCache', server)
        self.assertIn("leaveGame('/#/home')", server)
        for action in ['power-home', 'power-sleep', 'power-restart', 'power-shutdown', 'power-signout', 'power-recovery']:
            self.assertIn(f'data-context-action="{action}"', server)
        self.assertNotIn('data-context-action="power-menu"', server)
        self.assertIn('para-shell-power-command', server)
        self.assertNotIn('backdrop-filter:', server)
        self.assertNotIn('id="recording"', server)
        self.assertNotIn('Recording · Stop & Save', server)
        self.assertNotIn("recordingPill.classList.add('show')", server)

    def test_para_input_v2_is_wired(self):
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        system = (ROOT / "apps/para-home/src/screens/system.js").read_text(encoding="utf-8")
        service = (ROOT / "apps/para-home/src/services/para-input.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('id: "para-input"', manifest)
        self.assertIn('"para-input": paraInputScreen', app)
        self.assertIn('case "toggle-para-input"', app)
        self.assertIn('data-route="para-input"', system)
        self.assertIn('para.input.v2', service)
        self.assertIn('rightStickMode', service)
        self.assertIn('PARA INPUT V2', server)
        self.assertIn('configureForThisGame', server)
        self.assertIn('PARA INPUT', server)
        self.assertIn("enableForThisGame", server)
        self.assertIn("nativeGetGamepads", server)

    def test_v23_live_qa_repairs_are_regression_guarded(self):
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        boot = (ROOT / "apps/para-home/src/screens/boot.js").read_text(encoding="utf-8")
        experiences = (ROOT / "apps/para-home/src/screens/experiences.js").read_text(encoding="utf-8")
        files = (ROOT / "apps/para-home/src/screens/files.js").read_text(encoding="utf-8")
        home = (ROOT / "apps/para-home/src/screens/home.js").read_text(encoding="utf-8")
        libraries = (ROOT / "apps/para-home/src/screens/libraries.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        system = (ROOT / "apps/para-home/src/screens/system.js").read_text(encoding="utf-8")
        personalization = (ROOT / "apps/para-home/src/screens/personalization.js").read_text(encoding="utf-8")
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        runtime = (ROOT / "apps/para-home/src/services/experience-runtime.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        layer = (ROOT / "services/api/system_layer.py").read_text(encoding="utf-8")

        self.assertIn('.library-empty[hidden], .library-loading[hidden]', css)
        self.assertIn('html[data-large-text="true"][data-display-mode="Desk"]', css)
        self.assertIn('web_edition=args.allow_nonlocal', server)
        self.assertIn('"PARA Cloud Session"', layer)
        self.assertIn('"Browser connection"', layer)
        self.assertIn('"mounts": []', layer)
        self.assertIn('totalInstalled = games.length + profileCount', experiences)
        self.assertIn('cachedStoreCatalogLoaded', home)
        self.assertIn('STORE_VIEW_KEY', experiences)
        self.assertIn('store-product-back', app)
        self.assertIn('para.store.returnRoute', app)
        self.assertIn('completedAt', files)
        self.assertIn('View in Library', files)
        self.assertIn('setup-toggle-privacy', app)
        self.assertIn('data-privacy-id', boot)
        self.assertIn('aria-pressed', libraries)
        self.assertIn('aria-selected', media)
        self.assertIn('markNotificationRead', runtime)
        self.assertIn('Mark all as read', system)
        self.assertIn('"notifications", "downloads"', personalization)
        for label in ['Return Home', 'Sign Out', 'Recovery']:
            self.assertIn(label, control)
        self.assertIn('PARA Files', system)
        self.assertIn('para_build=v25', server)

    def test_v17_games_have_real_suspend_resume_session(self):
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn('function transitionIntoGame', app)
        self.assertIn('GAME_RETURN_TRANSITION_KEY', app)
        self.assertIn('IS_SUSPENDED_GAME_SHELL', app)
        self.assertIn('para-game-transition', css)
        self.assertIn('function revealGameAfterLaunch()', server)
        self.assertIn('function suspendGame(destination', server)
        self.assertIn('function resumeSuspendedGame()', server)
        self.assertIn('function closeSuspendedGame(destination', server)
        self.assertIn("createGamePageTransition('Suspending')", server)
        self.assertIn("createGamePageTransition('Resuming')", server)
        self.assertIn("createGamePageTransition('Closing Game')", server)
        self.assertIn('para_suspended_shell=1', server)
        self.assertIn("gameSuspended ? 'Suspended' : 'Running'", server)
        self.assertIn('if (!shellOpen && !gameSuspended) return pads;', server)
        self.assertIn('para_build=v25', app)
        server = (ROOT / 'services' / 'api' / 'server.py').read_text(encoding='utf-8')
        self.assertIn("document.title = 'PARA Home'", server)
        self.assertIn('restoreGameTabTitle()', server)
        self.assertIn('rememberGameDocumentTitle()', server)
        self.assertIn('is_suspended_home_shell', server)
        self.assertIn("frame-ancestors 'self'", server)


    def test_v49_online_trophies_are_regression_guarded(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        render = (ROOT / "render.yaml").read_text(encoding="utf-8")
        migration = (ROOT / "supabase/secure_online_achievement_runtime.sql").read_text(encoding="utf-8")

        for marker in [
            "PARA_SUPABASE_SERVICE_ROLE_KEY",
            "/api/v1/achievements/progress",
            "/api/v1/achievements/unlock",
            "record_player_achievement_progress",
        ]:
            self.assertIn(marker, server)
        self.assertIn("achievementProgress:", api)
        self.assertIn("unlockAchievement:", api)
        self.assertIn("setAchievementProgress:", api)
        self.assertIn("hydrateCloudAchievements", app)
        self.assertIn('syncState: cloudProgress >= localProgress ? "cloud" : "pending"', app)
        self.assertIn("CLOUD SYNCED", media)
        self.assertIn("SYNC PENDING", media)
        self.assertIn("- key: PARA_SUPABASE_SERVICE_ROLE_KEY", render)
        self.assertIn("sync: false", render)
        self.assertIn("security definer", migration.lower())
        self.assertIn("revoke all on function public.record_player_achievement_progress", migration.lower())
        self.assertIn("to service_role", migration.lower())
        self.assertNotIn("to authenticated", migration.lower().split("grant execute", 1)[-1])

    def test_v56_capture_has_no_server_side_video_conversion(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        capture = (ROOT / "apps/para-home/src/services/capture-service.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")

        for marker in [
            "/api/v1/capture/normalize",
            "normalize_capture_file",
            "normalizeRuntimeCapture",
            "libx264",
            "imageio_ffmpeg",
            "captureVersion: 6",
        ]:
            self.assertNotIn(marker, server)
        self.assertIn("captureVersion: 9", server)
        self.assertIn("captureState: 'ready'", server)
        self.assertIn("verifyPersistedCapture(saved.id, rawBlob, 'ready')", server)
        self.assertIn("normalized: false", server)
        self.assertIn("requestRestrictedGameRootStream", server)
        self.assertNotIn("getDisplayMedia", capture)
        self.assertNotIn("MediaRecorder", capture)
        self.assertIn("saves the recording directly to Media Gallery", capture)
        self.assertNotIn("Processing MP4", media)
        self.assertNotIn("MP4 failed", media)
        self.assertIn("Capture from inside a game", control)
        self.assertNotIn("imageio-ffmpeg", requirements)

    def test_v51_direct_renderer_stream_and_control_center_text_wrapping(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        self.assertIn("requestDirectGameSurfaceStream", server)
        self.assertIn("element.captureStream(RUNTIME_CAPTURE_FPS)", server)
        self.assertIn("direct-canvas-stream", server)
        self.assertIn("preserveDrawingBuffer=false", server)
        self.assertIn("requestRestrictedGameRootStream", server)
        self.assertIn("max-width:min(560px,calc(100vw - 24px))", server)
        self.assertIn("overflow-wrap:anywhere", server)
        self.assertIn("word-break:break-word", server)

    def test_v43_account_settings_are_real_account_hub(self):
        system = (ROOT / "apps/para-home/src/screens/system.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        css = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")
        for label in ["Your PARA identity", "Password & recovery", "Connected services", "PARA activity and privacy"]:
            self.assertIn(label, system)
        self.assertIn("paraApi.steamStatus()", system)
        self.assertIn("paraApi.googleStatus()", system)
        self.assertIn('data-action="account-send-password-reset"', system)
        self.assertIn('case "account-send-password-reset"', app)
        self.assertIn('para.integration.return', app)
        self.assertIn(".account-service-grid", css)
        self.assertIn(".account-shortcut-grid", css)



    def test_v52_friends_system_apps_store_artwork_switcher_and_files(self):
        self.assertTrue((ROOT / "apps/para-home/src/screens/friends.js").exists())

    def test_v53_friends_uses_no_fake_people_and_achievement_folders_resolve_real_games(self):
        friends = (ROOT / "apps/para-home/src/screens/friends.js").read_text(encoding="utf-8")
        content = (ROOT / "apps/para-home/src/content-data.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        self.assertNotIn("Mika", friends)
        self.assertNotIn("Romeo", friends)
        self.assertNotIn("Aleciyah", friends)
        self.assertNotIn("Conversation 2", friends)
        self.assertNotIn("Local Chat", friends)
        self.assertNotIn("para.messages.v1", friends)
        self.assertNotIn("localStorage", friends)
        self.assertIn("Only real PARA accounts will appear here", friends)
        self.assertIn("friends: []", content)
        self.assertNotIn("Aleciyah is online", content)
        self.assertIn("catalogByStore", media)
        self.assertIn("runtimeByStore", media)
        self.assertIn("paraApi.storeProduct(id)", media)
        self.assertIn('"Unknown Game"', media)
        self.assertNotIn(' : "PARA Game"', media)
        self.assertFalse((ROOT / "apps/para-home/src/mock-data.js").exists())

    def test_v54_global_rate_limit_resilience_survives_v56(self):
        api = (ROOT / "apps/para-home/src/services/para-api.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")

        for marker in [
            "API_MAX_CONCURRENT_REQUESTS = 4",
            "apiInFlight",
            "apiCache",
            "Retry-After",
            "retryAfterMs",
            "queueApiRequest",
        ]:
            self.assertIn(marker, api)
        self.assertIn("storeProduct(id)", media)
        self.assertNotIn("Promise.allSettled(missingStoreIds.map", media)
        self.assertNotIn("/api/v1/capture/normalize", server)
        self.assertNotIn("capture_encoder_busy", server)



    def test_v57_capture_requires_real_playback_and_replay_uses_self_contained_segments(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        player = (ROOT / "apps/para-home/src/ui/video-player.js").read_text(encoding="utf-8")
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        capture = (ROOT / "apps/para-home/src/services/capture-service.js").read_text(encoding="utf-8")

        for marker in [
            "RUNTIME_CAPTURE_PROBE_MS",
            "verifyPlayableVideoBlob",
            "recorded video bytes, but playback never advanced",
            "timesliceMs: 0",
            "REPLAY_SEGMENT_MS",
            "replaySegments",
            "playbackVerified: true",
        ]:
            self.assertIn(marker, server)
        self.assertLess(server.find("video/webm;codecs=vp8"), server.find("video/webm;codecs=vp9"))
        self.assertNotIn("selected = replay.chunks.filter", server)
        self.assertIn("data-video-segments", player)
        self.assertIn("switchSegment", player)
        self.assertIn("segmentUrls: sources.urls", media)
        self.assertIn("capturePlaybackSegments", capture)
        self.assertIn("isSegmentedCapture", capture)

    def test_v56_capture_success_requires_direct_media_gallery_readback(self):
        media = (ROOT / "apps/para-home/src/screens/media.js").read_text(encoding="utf-8")
        player = (ROOT / "apps/para-home/src/ui/video-player.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")

        for marker in [
            "captureVersion: 9",
            "verifyPersistedCapture",
            "captureState: 'ready'",
            "Gameplay capture saved to Media Gallery",
        ]:
            self.assertIn(marker, server)
        for removed in [
            "captureState: 'processing'",
            "/api/v1/capture/normalize",
            "acknowledgeCaptureJob",
            "MP4 ready",
            "processing MP4",
        ]:
            self.assertNotIn(removed, server)
        self.assertIn("para-capture-library-v1", media)
        self.assertNotIn("MP4 failed", media)
        self.assertNotIn("Processing MP4", media)
        self.assertNotIn("Chrome", player)
        self.assertNotIn("Chromium", player)
        self.assertNotIn("Chrome", server)
        self.assertNotIn("Chromium", server)

        final_save = server.find("await verifyPersistedCapture(saved.id, rawBlob, 'ready')")
        success_toast = server.find("toast('Gameplay capture saved to Media Gallery')")
        self.assertGreater(final_save, -1)
        self.assertGreater(success_toast, final_save)

    def test_v58_hud_hotfix_records_full_game_root_for_dom_overlays(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        for marker in [
            "gameCaptureRoot",
            "gameRootHasDomVisuals",
            "requestRestrictedGameRootStream",
            "RestrictionTarget.fromElement(captureRoot)",
            "navigator.mediaDevices.getDisplayMedia",
            "preferCurrentTab: true",
            "selfBrowserSurface: 'include'",
            "stream.__paraCaptureMode = 'restricted-game-root'",
            "node.id === 'para-game-system-shell'",
            "captureRoot.style.isolation = 'isolate'",
            "captureRoot.style.transformStyle = 'flat'",
        ]:
            self.assertIn(marker, server)
        self.assertNotIn("RestrictionTarget.fromElement(document.body)", server)
        self.assertIn("element.captureStream(RUNTIME_CAPTURE_FPS)", server)
        self.assertIn("captureCanvas.captureStream(RUNTIME_CAPTURE_FPS)", server)

    def test_v58_para_home_csp_allows_blob_video_without_widening_fetch_policy(self):
        api_server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        gateway = (ROOT / "services/gateway/server.py").read_text(encoding="utf-8")

        media_directive = "media-src 'self' data: blob:;"
        self.assertEqual(api_server.count(media_directive), 3)
        self.assertEqual(gateway.count(media_directive), 2)
        self.assertNotIn("connect-src 'self' blob:", api_server)
        self.assertNotIn("connect-src 'self' blob:", gateway)
        self.assertIn(
            "img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-src 'self';",
            api_server,
        )

    def test_v58_capture_fidelity_rejects_wrong_surface_and_distorted_output(self):
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")

        for marker in [
            "captureVersion: 9",
            "RUNTIME_CAPTURE_FPS = 60",
            "runtimeVideoBitrate",
            "viewportCoverage",
            "aspectPenalty",
            "expectedWidth",
            "expectedHeight",
            "distorted aspect ratio",
            "unexpectedly dropped capture resolution",
        ]:
            self.assertIn(marker, server)
        self.assertIn("element.captureStream(RUNTIME_CAPTURE_FPS)", server)
        self.assertIn("captureCanvas.captureStream(RUNTIME_CAPTURE_FPS)", server)
        self.assertIn("videoBitsPerSecond: runtimeVideoBitrate(stream)", server)
        self.assertIn("videoBitsPerSecond: runtimeVideoBitrate(state.stream)", server)
        self.assertNotIn("element.captureStream(30)", server)
        self.assertNotIn("captureCanvas.captureStream(30)", server)

    def test_v59_music_player_is_local_only_and_integrated_with_para_media_session(self):
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        music = (ROOT / "apps/para-home/src/screens/music.js").read_text(encoding="utf-8")
        service = (ROOT / "apps/para-home/src/services/local-music.js").read_text(encoding="utf-8")
        registry = (ROOT / "apps/para-home/src/services/system-app-registry.js").read_text(encoding="utf-8")
        control = (ROOT / "apps/para-home/src/ui/control-center.js").read_text(encoding="utf-8")
        styles = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")

        self.assertIn('import { musicScreen, activateMusic } from "./screens/music.js";', app)
        self.assertIn('music: musicScreen', app)
        self.assertIn('route === "music"', app)
        self.assertIn('id: "para:music"', registry)
        self.assertIn('route: "music"', registry)
        self.assertIn('icon: "music"', registry)
        self.assertIn('data-route="music"', control)

        for marker in [
            'type="file"',
            'multiple accept="audio/*',
            'data-music-find-files',
            'data-music-drop-zone',
            'Files stay on this device.',
            'ready for PARA Files + USB on console',
        ]:
            self.assertIn(marker, music)

        for marker in [
            'para-music-library-v1',
            'indexedDB.open',
            'createObjectStore(TRACK_STORE',
            'registerMediaSession',
            'appId: "para:music"',
            'new MediaMetadata',
            'URL.createObjectURL(track.blob)',
        ]:
            self.assertIn(marker, service)

        self.assertNotIn('fetch(', service)
        self.assertNotIn('XMLHttpRequest', service)
        self.assertNotIn('/api/', service)
        self.assertIn('.music-import-zone', styles)
        self.assertIn('.music-now-playing', styles)

    def test_v59_2_music_route_is_registered_with_router_manifest(self):
        manifest = (ROOT / "apps/para-home/src/screen-manifest.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        registry = (ROOT / "apps/para-home/src/services/system-app-registry.js").read_text(encoding="utf-8")

        self.assertIn('{ id: "music", label: "Music", group: "library" }', manifest)
        self.assertIn('music: musicScreen', app)
        self.assertIn('route: "music"', registry)

    def test_v59_1_music_handoff_plays_in_web_games_and_stays_out_of_recordings(self):
        service = (ROOT / "apps/para-home/src/services/local-music.js").read_text(encoding="utf-8")
        media_session = (ROOT / "apps/para-home/src/services/media-session.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")

        for marker in [
            'para.music.handoff.v1',
            'persistMusicHandoff',
            'restoreLocalMusicSession',
            'window.addEventListener("pagehide"',
        ]:
            self.assertIn(marker, service)

        self.assertIn('session.appId === "para:music"', media_session)
        self.assertIn('localMusicOwnsBackground', media_session)

        for marker in [
            "PARA_MUSIC_DB_NAME = 'para-music-library-v1'",
            "PARA_MUSIC_HANDOFF_KEY = 'para.music.handoff.v1'",
            "restoreParaMusicFromHandoff",
            "para-game-local-music-audio",
            'data-context-action="music-previous"',
            'data-context-action="music-toggle"',
            'data-context-action="music-next"',
            'data-context-action="music-volume-down"',
            'data-context-action="music-volume-up"',
            "media === paraMusicAudio",
            "media?.dataset?.paraLocalMusic === 'true'",
            "const audioTrack = gameAudio || (!paraMusicTrack ? displayAudio : null);",
        ]:
            self.assertIn(marker, server)

        self.assertNotIn("No separate media session", server)


    def test_v59_3_para_music_holds_menu_soundtrack_suspension_across_navigation(self):
        menu_music = (ROOT / "apps/para-home/src/services/menu-music.js").read_text(encoding="utf-8")
        media_session = (ROOT / "apps/para-home/src/services/media-session.js").read_text(encoding="utf-8")
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")

        self.assertIn("let suspended = false", menu_music)
        self.assertIn("parentMusicOwnsBackground()", menu_music)
        self.assertIn("if (suspended || parentMusicOwnsBackground() || gameRunning || sound.menuMusic === false)", menu_music)
        self.assertIn("suspended = true", menu_music)
        self.assertIn("suspended = false", menu_music)
        self.assertIn("if (!suspended && !parentMusicOwnsBackground() && prefs().menuMusic !== false && unlocked)", menu_music)
        self.assertIn("if (suspended || parentMusicOwnsBackground() || !unlocked || prefs().menuMusic === false) return", menu_music)
        self.assertIn('session.appId === "para:music"', media_session)
        self.assertIn("suspendMenuMusic({ duration: 100 })", media_session)
        self.assertIn("syncMenuMusic({ gameRunning:", app)

    def test_v59_4_music_uses_single_parent_audio_host_and_living_player_ui(self):
        app = (ROOT / "apps/para-home/src/app.js").read_text(encoding="utf-8")
        music = (ROOT / "apps/para-home/src/screens/music.js").read_text(encoding="utf-8")
        service = (ROOT / "apps/para-home/src/services/local-music.js").read_text(encoding="utf-8")
        menu_music = (ROOT / "apps/para-home/src/services/menu-music.js").read_text(encoding="utf-8")
        server = (ROOT / "services/api/server.py").read_text(encoding="utf-8")
        styles = (ROOT / "apps/para-home/styles.css").read_text(encoding="utf-8")

        for marker in [
            'IS_SUSPENDED_HOME',
            'parentMusicHost',
            'window.parent?.PARA?.localMusicHost',
            'compensatedHandoffTime',
            'prepareLocalMusicHandoff',
            'metadataVersion: 1',
            'id3Metadata',
            'APIC',
            'artworkBlob',
        ]:
            self.assertIn(marker, service)
        self.assertIn('prepareLocalMusicHandoff();', app)
        self.assertIn('parentMusicOwnsBackground()', menu_music)

        for marker in [
            'window.PARA.localMusicHost = Object.freeze',
            'compensatedParaMusicTime',
            'PARA Music belongs to the persistent game runtime',
            'Home controls this same player through the',
            'writeParaMusicHandoff(true); location.href = destination',
        ]:
            self.assertIn(marker, server)
        self.assertNotIn("if (!media.paused) media.pause();\n          paraMusicSuppressPausePersist = false;\n          continue;", server)

        for marker in [
            'music-cover-shell',
            'music-vinyl',
            'music-equalizer',
            'YOUR CRATE',
            'Your soundtrack lives here',
            'data-music-art-image',
        ]:
            self.assertIn(marker, music)
        for marker in [
            '@keyframes paraMusicSpin',
            '@keyframes paraMusicEq',
            '.music-cover__generated',
            '.music-track__thumb',
        ]:
            self.assertIn(marker, styles)
