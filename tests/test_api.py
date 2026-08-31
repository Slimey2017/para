from __future__ import annotations

import sys
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))
from server import resolve, validate_bind, _store_build_storage_prefix, auth_sign_in, auth_sign_up, auth_update_user, auth_request_email_verification, auth_verify_email_code  # noqa: E402
import system_layer  # noqa: E402


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        system_layer.configure(launch_enabled=False)

    def test_health_reports_api(self):
        status, payload = resolve("/api/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["name"], "para-api")

    def test_system_and_storage_come_from_host(self):
        system_status, system = resolve("/api/v1/system")
        storage_status, storage = resolve("/api/v1/storage")
        self.assertEqual(system_status, 200)
        self.assertTrue(system["os"])
        self.assertEqual(storage_status, 200)
        self.assertGreater(storage["primary"]["total_gb"], 0)

    def test_web_edition_sanitizes_host_network_storage_and_identity(self):
        system_layer.configure(launch_enabled=False, web_edition=True)
        try:
            _, system = resolve("/api/v1/system")
            _, storage = resolve("/api/v1/storage")
            _, network = resolve("/api/v1/network")
            self.assertTrue(system["web_edition"])
            self.assertEqual(system["hostname"], "PARA Cloud Session")
            self.assertEqual(system["machine"], "Web Edition")
            self.assertTrue(storage["web_edition"])
            self.assertEqual(storage["mounts"], [])
            self.assertFalse(storage["primary"]["capacity_known"])
            self.assertTrue(network["web_edition"])
            self.assertEqual(network["interfaces"], [{"name": "Browser connection", "kind": "web", "state": "online", "connected": True}])
            browse_status, browse = system_layer.browse_files("home")
            self.assertEqual(browse_status, 403)
            self.assertEqual(browse["error"], "files_unavailable")
        finally:
            system_layer.configure(launch_enabled=False)

    def test_application_launch_is_hidden_by_default(self):
        status, payload = resolve("/api/v1/apps")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in payload["applications"]], ["para:files"])
        self.assertEqual(payload["applications"][0]["launch"], {"kind": "route", "route": "files"})
        launch_status, _ = system_layer.launch_application("linux:any.desktop")
        self.assertEqual(launch_status, 404)

    def test_files_is_the_local_builtin_application(self):
        system_layer.configure(launch_enabled=False, controls_enabled=True)
        status, payload = resolve("/api/v1/apps")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in payload["applications"]], ["para:files"])
        self.assertEqual(payload["applications"][0]["launch"], {"kind": "route", "route": "files"})

    def test_application_roles_come_from_desktop_metadata(self):
        self.assertEqual(system_layer._application_roles("Development;IDE;", "Code Studio"), ["creator"])
        self.assertEqual(system_layer._application_roles("Game;", "Installed Game"), ["game"])
        self.assertEqual(system_layer._application_roles("Utility;", "Calculator"), [])

    def test_store_build_storage_prefix_targets_physical_files_directory(self):
        item = {"download_reference": "developers/dev/projects/project/builds/build/index.html"}
        self.assertEqual(
            _store_build_storage_prefix(item),
            "developers/dev/projects/project/builds/build/files",
        )
        already_physical = {"download_reference": "developers/dev/projects/project/builds/build/files/index.html"}
        self.assertEqual(
            _store_build_storage_prefix(already_physical),
            "developers/dev/projects/project/builds/build/files",
        )

    def test_windows_steam_games_are_discovered_and_launchable(self):
        with tempfile.TemporaryDirectory() as temporary:
            steam = Path(temporary) / "Steam"
            steamapps = steam / "steamapps"
            steamapps.mkdir(parents=True)
            (steamapps / "appmanifest_123.acf").write_text('"AppState"\n{\n  "appid" "123"\n  "name" "Test Game"\n}', encoding="utf-8")
            environment = {"ProgramFiles(x86)": temporary, "ProgramFiles": str(Path(temporary) / "Other"), "ProgramData": str(Path(temporary) / "Data"), "APPDATA": str(Path(temporary) / "Roaming")}
            with patch.dict(os.environ, environment, clear=False), patch("system_layer.platform.system", return_value="Windows"), patch.object(system_layer.os, "startfile", create=True) as startfile:
                system_layer.configure(launch_enabled=True, controls_enabled=True)
                payload = system_layer.applications()
                game = next(item for item in payload["applications"] if item["id"] == "windows:steam:123")
                self.assertEqual(game["roles"], ["game"])
                self.assertEqual(game["launch"]["store"], "Steam")
                status, result = system_layer.launch_application(game["id"])
                self.assertEqual(status, 202)
                self.assertTrue(result["accepted"])
                startfile.assert_called_once_with("steam://rungameid/123")

    def test_store_achievements_exposes_published_definitions(self):
        definition = {
            "id": "achievement-1",
            "project_id": "11111111-1111-1111-1111-111111111111",
            "achievement_key": "first_win",
            "name": "First Victory",
            "status": "PUBLISHED",
            "icon_path": "developers/user/projects/11111111-1111-1111-1111-111111111111/achievements/icon.png",
        }
        with patch("server.store_product", return_value=(200, {"project_id": definition["project_id"]})), patch("server._supabase_get_json", return_value=(200, [definition])):
            status, payload = resolve("/api/v1/store/achievements", {"id": ["catalog-1"]})
        self.assertEqual(status, 200)
        self.assertEqual(payload["project_id"], definition["project_id"])
        self.assertEqual(payload["items"][0]["achievement_key"], "first_win")
        self.assertIn("/api/v1/store/asset?path=", payload["items"][0]["icon_url"])

    def test_para_account_signup_validates_console_credentials(self):
        status, payload, tokens = auth_sign_up("not-an-email", "short", "Player")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "invalid_email")
        self.assertIsNone(tokens)

    def test_para_account_signup_rejects_supabase_duplicate_obfuscated_user(self):
        remote = {
            "user": {
                "id": "obfuscated-user",
                "email": "player@example.com",
                "identities": [],
                "user_metadata": {"display_name": "Player"},
            }
        }
        with patch("server._supabase_auth_request", return_value=(200, remote)):
            status, payload, tokens = auth_sign_up("player@example.com", "password123", "Player")
        self.assertEqual(status, 409)
        self.assertEqual(payload["error"], "account_exists")
        self.assertIsNone(tokens)

    def test_para_account_signup_accepts_real_supabase_identity(self):
        remote = {
            "user": {
                "id": "new-user",
                "email": "new@example.com",
                "identities": [{"id": "identity-1", "provider": "email"}],
                "user_metadata": {"display_name": "New Player"},
                "created_at": "2026-08-30T00:00:00Z",
            }
        }
        with patch("server._supabase_auth_request", return_value=(200, remote)):
            status, payload, tokens = auth_sign_up("new@example.com", "password123", "New Player")
        self.assertEqual(status, 201)
        self.assertTrue(payload["account_created"])
        self.assertTrue(payload["persisted"])
        self.assertEqual(payload["user"]["id"], "new-user")
        self.assertIsNone(tokens)

    def test_para_account_signin_normalizes_supabase_session(self):
        remote = {
            "access_token": "access", "refresh_token": "refresh", "expires_in": 3600,
            "user": {"id": "user-1", "email": "player@example.com", "user_metadata": {"display_name": "Slimey"}, "email_confirmed_at": "2026-08-30T00:00:00Z"},
        }
        with patch("server._supabase_auth_request", return_value=(200, remote)):
            status, payload, tokens = auth_sign_in("player@example.com", "password123")
        self.assertEqual(status, 200)
        self.assertTrue(payload["signed_in"])
        self.assertEqual(payload["user"]["display_name"], "Slimey")
        self.assertEqual(tokens["refresh_token"], "refresh")



    def test_emailjs_config_values_strip_dashboard_quotes_and_spaces(self):
        import server
        self.assertEqual(server._clean_config_value('  "template_xd50wdh"  '), 'template_xd50wdh')
        self.assertEqual(server._clean_config_value(" 'service_rozuv2c' "), 'service_rozuv2c')

    def test_emailjs_diagnostic_summary_masks_public_key(self):
        import server
        summary = server._emailjs_config_summary()
        self.assertEqual(summary["template_id"], server.EMAILJS_TEMPLATE_ID)
        self.assertEqual(summary["service_id"], server.EMAILJS_SERVICE_ID)
        self.assertEqual(summary["public_key_length"], len(server.EMAILJS_PUBLIC_KEY))
        self.assertNotIn(server.EMAILJS_PUBLIC_KEY, str(summary))

    def test_para_email_verification_sends_emailjs_code_without_returning_code(self):
        import server
        server._email_verifications.clear()
        with patch("server._emailjs_send_verification", return_value=(200, {"sent": True})) as sender:
            status, payload = auth_request_email_verification("player@example.com")
        self.assertEqual(status, 202)
        self.assertTrue(payload["sent"])
        self.assertNotIn("code", payload)
        sent_email, sent_code = sender.call_args.args
        self.assertEqual(sent_email, "player@example.com")
        self.assertRegex(sent_code, r"^\d{6}$")

    def test_para_email_verification_accepts_only_matching_code(self):
        import server
        server._email_verifications.clear()
        captured = {}
        def fake_send(email, code):
            captured["code"] = code
            return 200, {"sent": True}
        with patch("server._emailjs_send_verification", side_effect=fake_send):
            status, _ = auth_request_email_verification("player@example.com")
        self.assertEqual(status, 202)
        bad_status, _ = auth_verify_email_code("player@example.com", "000000" if captured["code"] != "000000" else "111111")
        self.assertEqual(bad_status, 400)
        good_status, payload = auth_verify_email_code("player@example.com", captured["code"] )
        self.assertEqual(good_status, 200)
        self.assertTrue(payload["verified"])

    def test_para_account_password_requires_eight_characters(self):
        status, payload = auth_update_user("token", password="1234567")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "weak_password")

    def test_unknown_route_returns_not_found(self):
        status, payload = resolve("/api/v1/does-not-exist")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"], "not_found")

    def test_capabilities_do_not_invent_switcher_or_notifications(self):
        status, payload = resolve("/api/v1/capabilities")
        self.assertEqual(status, 200)
        for capability in ["switcher", "notifications", "friends", "downloads", "music"]:
            self.assertFalse(payload[capability])

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

    def test_files_browse_and_search_actual_entries(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "Documents").mkdir()
            (root / "Documents" / "notes.txt").write_text("PARA", encoding="utf-8")
            (root / "picture.png").write_bytes(b"image")
            system_layer.configure(launch_enabled=False, controls_enabled=True)
            with patch("system_layer._block_volumes", return_value=[]):
                status, payload = system_layer.browse_files(str(root))
                search_status, search = system_layer.search_files(str(root), "notes")
            self.assertEqual(status, 200)
            self.assertEqual({item["name"] for item in payload["items"]}, {"Documents", "picture.png"})
            self.assertFalse(payload["capabilities"]["write"])
            self.assertEqual(search_status, 200)
            self.assertEqual([item["name"] for item in search["items"]], ["notes.txt"])

    def test_file_changes_require_explicit_local_opt_in(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.txt"
            source.write_text("source", encoding="utf-8")
            destination = root / "destination"
            destination.mkdir()
            denied, _ = system_layer.file_action("rename", {"paths": [str(source)], "name": "renamed.txt"})
            self.assertEqual(denied, 403)

            system_layer.configure(launch_enabled=False, controls_enabled=True, file_operations_enabled=True)
            created, result = system_layer.file_action("create-folder", {"destination": str(root), "name": "New Folder"})
            renamed, rename_result = system_layer.file_action("rename", {"paths": [str(source)], "name": "renamed.txt"})
            copied, _ = system_layer.file_action("copy", {"paths": [rename_result["renamed"]], "destination": str(destination)})
            moved, _ = system_layer.file_action("move", {"paths": [rename_result["renamed"]], "destination": str(root / "New Folder")})
            self.assertEqual(created, 201)
            self.assertTrue(Path(result["created"]).is_dir())
            self.assertEqual(renamed, 200)
            self.assertEqual(copied, 200)
            self.assertTrue((destination / "renamed.txt").is_file())
            self.assertEqual(moved, 200)
            self.assertTrue((root / "New Folder" / "renamed.txt").is_file())

    def test_file_routes_replace_collection_route(self):
        system_layer.configure(launch_enabled=False, controls_enabled=True)
        with patch("system_layer._block_volumes", return_value=[]):
            status, payload = resolve("/api/v1/files/browse", {"path": ["home"]})
        old_status, _ = resolve("/api/v1/files", {"collection": ["documents"]})
        self.assertEqual(status, 200)
        self.assertIn("items", payload)
        self.assertEqual(old_status, 404)

    def test_permanent_delete_is_limited_to_trash(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            trash_root = root / "Trash"
            (trash_root / "files").mkdir(parents=True)
            (trash_root / "info").mkdir()
            trashed = trash_root / "files" / "discard.txt"
            trashed.write_text("discard", encoding="utf-8")
            (trash_root / "info" / "discard.txt.trashinfo").write_text("[Trash Info]", encoding="utf-8")
            outside = root / "keep.txt"
            outside.write_text("keep", encoding="utf-8")
            system_layer.configure(launch_enabled=False, controls_enabled=True, file_operations_enabled=True)
            with patch("system_layer._trash_root", return_value=trash_root):
                denied, _ = system_layer.file_action("delete", {"paths": [str(outside)]})
                deleted, _ = system_layer.file_action("delete", {"paths": [str(trashed)]})
            self.assertEqual(denied, 400)
            self.assertTrue(outside.exists())
            self.assertEqual(deleted, 200)
            self.assertFalse(trashed.exists())
            self.assertFalse((trash_root / "info" / "discard.txt.trashinfo").exists())


if __name__ == "__main__":
    unittest.main()
