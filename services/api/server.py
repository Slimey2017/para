#!/usr/bin/env python3
"""PARA API server for the hosted console UI and local system bridge."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
import os
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
import platform
import re
import urllib.error
import urllib.parse
import urllib.request
import io
import zipfile
from http.cookies import SimpleCookie
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
HOME_ROOT = REPO_ROOT / "apps" / "para-home"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import system_layer  # noqa: E402



AUTH_ACCESS_COOKIE = "para_access_token"
AUTH_REFRESH_COOKIE = "para_refresh_token"


def _clean_config_value(value: str | None, fallback: str = "") -> str:
    """Normalize dashboard/env values copied with whitespace or wrapping quotes."""
    text = str(value if value is not None else fallback).strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"\"", "'"}:
        text = text[1:-1].strip()
    return text


def _env_config(name: str, fallback: str = "") -> str:
    return _clean_config_value(os.environ.get(name), fallback)


EMAILJS_SERVICE_ID = _env_config("PARA_EMAILJS_SERVICE_ID", "service_rozuv2c")
EMAILJS_TEMPLATE_ID = _env_config("PARA_EMAILJS_TEMPLATE_ID", "template_xd50wdh")
EMAILJS_PUBLIC_KEY = _env_config("PARA_EMAILJS_PUBLIC_KEY", "Vcb2UJ9zNsxvhEajq")
EMAILJS_PRIVATE_KEY = _env_config("PARA_EMAILJS_PRIVATE_KEY", "")
EMAILJS_ORIGIN = _env_config("PARA_EMAILJS_ORIGIN", "")
EMAIL_VERIFICATION_TTL_SECONDS = 15 * 60
EMAIL_VERIFICATION_RESEND_SECONDS = 45
EMAIL_VERIFICATION_MAX_ATTEMPTS = 6
EMAIL_VERIFICATION_CLIENT_WINDOW_SECONDS = 10 * 60
EMAIL_VERIFICATION_CLIENT_MAX_SENDS = 5

# PARA Account auth is intentionally pinned to the production PARA Supabase
# project. Supabase publishable keys are public client credentials; pinning them
# here prevents a stale Render environment variable from authenticating against
# a different project while the rest of PARA still appears healthy.
PARA_ACCOUNT_SUPABASE_PROJECT_REF = "fqkbvxutsijruyawzxxo"
PARA_ACCOUNT_SUPABASE_URL = f"https://{PARA_ACCOUNT_SUPABASE_PROJECT_REF}.supabase.co"
PARA_ACCOUNT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aKSE87nlJmUddelmwAwa9Q_5sz5ZESY"
PARA_SUPABASE_SERVICE_ROLE_KEY = _env_config("PARA_SUPABASE_SERVICE_ROLE_KEY", "")
PARA_ACCOUNT_PUBLIC_URL = "https://para-wjvx.onrender.com/"
STEAM_OPENID_DISCOVERY_URL = "https://steamcommunity.com/openid/"
STEAM_OPENID_LOGIN_URL = "https://steamcommunity.com/openid/login"
STEAM_OPENID_VERIFY_URL = STEAM_OPENID_LOGIN_URL
STEAM_OPENID_STATE_COOKIE = "para_steam_openid_state"
STEAM_OPENID_STATE_TTL_SECONDS = 10 * 60
GOOGLE_OAUTH_CLIENT_ID = _env_config("PARA_GOOGLE_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = _env_config("PARA_GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
GOOGLE_YOUTUBE_UPLOAD_INIT_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
GOOGLE_YOUTUBE_THUMBNAIL_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"
YOUTUBE_UPLOAD_SESSION_COOKIE = "para_youtube_upload_session"
YOUTUBE_UPLOAD_SESSION_TTL_SECONDS = 45 * 60
YOUTUBE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024
CAPTURE_NORMALIZE_MAX_BYTES = 256 * 1024 * 1024
CAPTURE_NORMALIZE_TIMEOUT_SECONDS = 180
CAPTURE_NORMALIZE_CONTENT_TYPES = {"video/webm", "video/x-matroska", "application/octet-stream"}
CAPTURE_NORMALIZE_QUEUE_MAX = 8
CAPTURE_NORMALIZE_JOB_TTL_SECONDS = 30 * 60
GOOGLE_OAUTH_STATE_COOKIE = "para_google_oauth_state"
GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60
GOOGLE_OAUTH_SCOPES = (
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.readonly",
)
_youtube_upload_sessions: dict[str, dict] = {}
_youtube_upload_lock = threading.Lock()
_email_verifications: dict[str, dict] = {}
_email_verification_client_sends: dict[str, list[float]] = {}
_email_verification_lock = threading.Lock()
_capture_jobs: dict[str, dict] = {}
_capture_pending_jobs: list[str] = []
_capture_jobs_lock = threading.Lock()
_capture_jobs_ready = threading.Condition(_capture_jobs_lock)
_capture_worker_thread: threading.Thread | None = None


def _supabase_auth_request(path: str, *, method: str = "POST", payload: dict | None = None, bearer: str = "") -> tuple[int, dict]:
    """Call Supabase Auth without exposing the publishable key or session tokens to PARA Home."""
    base = PARA_ACCOUNT_SUPABASE_URL
    key = PARA_ACCOUNT_SUPABASE_PUBLISHABLE_KEY
    headers = {"apikey": key, "Accept": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": "PARA Account request failed."}
        if not isinstance(parsed, dict):
            parsed = {"message": "PARA Account request failed."}
        return error.code, parsed
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 502, {"error": "account_unavailable", "message": "PARA Account could not reach the account service."}


def _supabase_account_rest_request(
    path: str,
    *,
    method: str = "GET",
    payload: object | None = None,
    bearer: str = "",
    prefer: str = "",
) -> tuple[int, object]:
    """Read or write account-owned public tables with the signed-in user's JWT."""
    if not bearer:
        return 401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}
    headers = {
        "apikey": PARA_ACCOUNT_SUPABASE_PUBLISHABLE_KEY,
        "Authorization": f"Bearer {bearer}",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{PARA_ACCOUNT_SUPABASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            if not body:
                return response.status, {}
            try:
                return response.status, json.loads(body)
            except json.JSONDecodeError:
                return response.status, {"raw": body[:240]}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": "Connected account storage request failed."}
        if not isinstance(parsed, (dict, list)):
            parsed = {"message": "Connected account storage request failed."}
        return error.code, parsed
    except (urllib.error.URLError, TimeoutError):
        return 502, {"error": "account_storage_unavailable", "message": "PARA could not reach connected account storage."}



def _supabase_service_rest_request(
    path: str,
    *,
    method: str = "POST",
    payload: object | None = None,
    prefer: str = "",
) -> tuple[int, object]:
    """Call a service-role-only PostgREST RPC from PARA's trusted backend."""
    key = PARA_SUPABASE_SERVICE_ROLE_KEY
    if not key:
        return 503, {
            "error": "cloud_write_not_configured",
            "message": "PARA Cloud writes are not configured on this server yet.",
        }
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{PARA_ACCOUNT_SUPABASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            if not body:
                return response.status, {}
            try:
                return response.status, json.loads(body)
            except json.JSONDecodeError:
                return response.status, {"raw": body[:240]}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": "PARA Cloud write failed."}
        if not isinstance(parsed, (dict, list)):
            parsed = {"message": "PARA Cloud write failed."}
        return error.code, parsed
    except (urllib.error.URLError, TimeoutError):
        return 502, {"error": "cloud_storage_unavailable", "message": "PARA could not reach cloud storage."}


def achievement_progress_for_user(access_token: str) -> tuple[int, dict]:
    """Read the signed-in player's achievement progress from Supabase."""
    select = (
        "progress_value,unlocked_at,updated_at,"
        "achievement_definitions!inner("
        "id,project_id,achievement_key,name,description,points,kind,target_value,hidden,icon_path,status)"
    )
    path = "/rest/v1/player_achievement_progress?" + urllib.parse.urlencode({
        "select": select,
        "order": "updated_at.desc",
    })
    status, payload = _supabase_account_rest_request(path, bearer=access_token)
    if status >= 400:
        return status, {
            "error": "achievement_progress_unavailable",
            "message": "PARA could not load online achievement progress.",
        }
    rows = payload if isinstance(payload, list) else []
    items = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        definition = row.get("achievement_definitions")
        if not isinstance(definition, dict):
            continue
        icon_path = str(definition.get("icon_path") or "")
        items.append({
            "achievement_id": definition.get("id"),
            "project_id": definition.get("project_id"),
            "achievement_key": definition.get("achievement_key"),
            "name": definition.get("name"),
            "description": definition.get("description") or "",
            "points": int(definition.get("points") or 0),
            "kind": definition.get("kind") or "BINARY",
            "target": max(1, int(definition.get("target_value") or 1)),
            "hidden": bool(definition.get("hidden")),
            "icon_url": f"/api/v1/store/asset?path={urllib.parse.quote(icon_path, safe='')}" if icon_path else None,
            "progress": max(0, int(row.get("progress_value") or 0)),
            "unlocked_at": row.get("unlocked_at"),
            "updated_at": row.get("updated_at"),
            "sync_state": "cloud",
        })
    return 200, {"online": True, "items": items}


def update_online_achievement(user_id: str, project_id: str, achievement_key: str, progress_value: object) -> tuple[int, dict]:
    """Award/progress an achievement through a service-role-only trusted RPC."""
    try:
        parsed_project = str(project_id or "").strip()
        parsed_key = str(achievement_key or "").strip()
        parsed_progress = int(progress_value)
    except (TypeError, ValueError):
        return 400, {"error": "invalid_achievement_progress", "message": "Achievement progress must be a whole number."}
    uuid_pattern = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    if not re.fullmatch(uuid_pattern, str(user_id or "")):
        return 401, {"error": "not_signed_in", "message": "Sign in to save achievements online."}
    if not re.fullmatch(uuid_pattern, parsed_project):
        return 400, {"error": "invalid_project", "message": "This game does not have a valid PARA project id."}
    if not parsed_key or len(parsed_key) > 120 or parsed_progress < 0:
        return 400, {"error": "invalid_achievement_progress", "message": "Achievement progress is invalid."}

    status, payload = _supabase_service_rest_request(
        "/rest/v1/rpc/record_player_achievement_progress",
        payload={
            "target_user_id": str(user_id),
            "target_project_id": parsed_project,
            "target_achievement_key": parsed_key,
            "target_progress_value": parsed_progress,
        },
    )
    if status >= 400:
        message = "PARA could not save this achievement online."
        if isinstance(payload, dict) and payload.get("message"):
            message = str(payload.get("message"))
        return status, {"error": "achievement_cloud_write_failed", "message": message}

    result = payload if isinstance(payload, dict) else {}
    icon_path = str(result.get("icon_path") or "")
    if icon_path:
        result["icon_url"] = f"/api/v1/store/asset?path={urllib.parse.quote(icon_path, safe='')}"
    result["sync_state"] = "cloud"
    return 200, {"online": True, "achievement": result}


def _steam_callback_url(state: str) -> str:
    base = PARA_ACCOUNT_PUBLIC_URL.rstrip("/")
    return f"{base}/api/v1/integrations/steam/callback?state={urllib.parse.quote(str(state), safe='')}"


def steam_openid_login_url(state: str) -> str:
    """Build the browser redirect to Steam's documented OpenID 2.0 provider."""
    callback = _steam_callback_url(state)
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callback,
        "openid.realm": PARA_ACCOUNT_PUBLIC_URL,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_LOGIN_URL}?{urllib.parse.urlencode(params)}"


def verify_steam_openid(query: dict[str, list[str]], state: str) -> tuple[int, dict]:
    """Verify Steam's signed OpenID response server-side and return SteamID64."""
    fields = {key: values[0] for key, values in query.items() if key.startswith("openid.") and values}
    mode = str(fields.get("openid.mode") or "")
    if mode == "cancel":
        return 400, {"error": "steam_cancelled", "message": "Steam account connection was cancelled."}
    if mode != "id_res":
        return 400, {"error": "steam_invalid_response", "message": "Steam returned an invalid sign-in response."}
    if fields.get("openid.ns") != "http://specs.openid.net/auth/2.0":
        return 400, {"error": "steam_invalid_namespace", "message": "Steam returned an invalid OpenID namespace."}
    if fields.get("openid.return_to") != _steam_callback_url(state):
        return 400, {"error": "steam_return_mismatch", "message": "Steam returned to an unexpected PARA address."}
    op_endpoint = str(fields.get("openid.op_endpoint") or "")
    parsed_endpoint = urllib.parse.urlparse(op_endpoint)
    if parsed_endpoint.scheme != "https" or parsed_endpoint.hostname != "steamcommunity.com" or not parsed_endpoint.path.startswith("/openid/"):
        return 400, {"error": "steam_endpoint_mismatch", "message": "Steam returned an unexpected OpenID provider."}

    claimed_id = str(fields.get("openid.claimed_id") or "")
    identity = str(fields.get("openid.identity") or "")
    if claimed_id != identity:
        return 400, {"error": "steam_identity_mismatch", "message": "Steam identity verification did not match."}
    match = re.fullmatch(r"https?://steamcommunity\.com/openid/id/([0-9]{17})", claimed_id)
    if not match:
        return 400, {"error": "steam_id_invalid", "message": "Steam did not return a valid SteamID."}

    verification = dict(fields)
    verification["openid.mode"] = "check_authentication"
    body = urllib.parse.urlencode(verification).encode("utf-8")
    request = urllib.request.Request(
        STEAM_OPENID_VERIFY_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return 502, {"error": "steam_unavailable", "message": "PARA could not verify the Steam sign-in."}
    checks = {}
    for line in result.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            checks[key.strip()] = value.strip()
    if checks.get("is_valid") != "true":
        return 401, {"error": "steam_verification_failed", "message": "Steam could not verify this account connection."}
    return 200, {"verified": True, "provider": "steam", "provider_user_id": match.group(1)}


def gaming_account_status(access_token: str, provider: str = "steam") -> tuple[int, dict]:
    if provider != "steam":
        return 400, {"error": "provider_unsupported", "message": "That gaming account provider is not supported yet."}
    quoted = urllib.parse.quote(provider, safe="")
    status, payload = _supabase_account_rest_request(
        f"/rest/v1/gaming_accounts?select=provider,provider_user_id,display_name,avatar_url,connected_at&provider=eq.{quoted}&limit=1",
        bearer=access_token,
    )
    if status >= 400:
        return status, {"error": "gaming_account_storage_failed", "message": "PARA could not read connected gaming accounts."}
    rows = payload if isinstance(payload, list) else []
    if not rows:
        return 200, {"provider": provider, "connected": False}
    row = rows[0] if isinstance(rows[0], dict) else {}
    return 200, {
        "provider": provider,
        "connected": True,
        "provider_user_id": str(row.get("provider_user_id") or ""),
        "display_name": row.get("display_name"),
        "avatar_url": row.get("avatar_url"),
        "connected_at": row.get("connected_at"),
    }


def connect_gaming_account(access_token: str, para_user_id: str, provider: str, provider_user_id: str) -> tuple[int, dict]:
    if provider != "steam":
        return 400, {"error": "provider_unsupported", "message": "That gaming account provider is not supported yet."}
    record = {
        "para_user_id": str(para_user_id),
        "provider": provider,
        "provider_user_id": str(provider_user_id),
        "connected_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    status, payload = _supabase_account_rest_request(
        "/rest/v1/gaming_accounts?on_conflict=para_user_id,provider",
        method="POST",
        payload=record,
        bearer=access_token,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if status >= 400:
        return status, {"error": "gaming_account_link_failed", "message": "PARA could not save the Steam account connection."}
    return 200, {"provider": provider, "connected": True, "provider_user_id": str(provider_user_id)}


def disconnect_gaming_account(access_token: str, provider: str = "steam") -> tuple[int, dict]:
    if provider != "steam":
        return 400, {"error": "provider_unsupported", "message": "That gaming account provider is not supported yet."}
    quoted = urllib.parse.quote(provider, safe="")
    status, _ = _supabase_account_rest_request(
        f"/rest/v1/gaming_accounts?provider=eq.{quoted}",
        method="DELETE",
        bearer=access_token,
        prefer="return=minimal",
    )
    if status >= 400:
        return status, {"error": "gaming_account_disconnect_failed", "message": "PARA could not disconnect that Steam account."}
    return 200, {"provider": provider, "connected": False}


def google_oauth_configured() -> bool:
    return bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET)


def _google_callback_url() -> str:
    return PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/api/v1/integrations/google/callback"


def google_oauth_login_url(state: str, *, upload: bool = False) -> str:
    """Build Google OAuth for normal linking or an incremental YouTube upload grant."""
    if not google_oauth_configured():
        return ""
    scopes = list(GOOGLE_OAUTH_SCOPES)
    if upload and YOUTUBE_UPLOAD_SCOPE not in scopes:
        scopes.append(YOUTUBE_UPLOAD_SCOPE)
    params = {
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": _google_callback_url(),
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": str(state),
        "include_granted_scopes": "true",
        "access_type": "online",
        "prompt": "consent select_account" if upload else "select_account",
    }
    return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_google_oauth_code(code: str) -> tuple[int, dict]:
    if not google_oauth_configured():
        return 503, {"error": "google_not_configured", "message": "Google / YouTube connection is not configured yet."}
    code = str(code or "").strip()
    if not code:
        return 400, {"error": "google_code_missing", "message": "Google did not return an authorization code."}
    payload = urllib.parse.urlencode({
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": _google_callback_url(),
    }).encode("utf-8")
    request = urllib.request.Request(
        GOOGLE_OAUTH_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            result = json.loads(body)
        except json.JSONDecodeError:
            result = {}
        message = str(result.get("error_description") or result.get("error") or "Google rejected the account connection.")
        return error.code, {"error": "google_token_exchange_failed", "message": message[:240]}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 502, {"error": "google_unavailable", "message": "PARA could not reach Google sign-in."}
    access_token = str(result.get("access_token") or "") if isinstance(result, dict) else ""
    if not access_token:
        return 502, {"error": "google_token_missing", "message": "Google did not return a usable account session."}
    # V41 deliberately uses the access token only during this callback. It is not
    # persisted in public.external_accounts or returned to PARA Home.
    return 200, {"access_token": access_token, "scope": str(result.get("scope") or ""), "expires_in": int(result.get("expires_in") or 3600)}


def _google_bearer_json(url: str, access_token: str) -> tuple[int, dict]:
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body) if body else {}
            return response.status, payload if isinstance(payload, dict) else {}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload if isinstance(payload, dict) else {}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 502, {}


def google_identity(access_token: str) -> tuple[int, dict]:
    status, payload = _google_bearer_json(GOOGLE_USERINFO_URL, access_token)
    provider_user_id = str(payload.get("sub") or "") if isinstance(payload, dict) else ""
    if status >= 400 or not provider_user_id:
        return status if status >= 400 else 502, {"error": "google_identity_failed", "message": "PARA could not read the connected Google account."}
    return 200, {
        "provider_user_id": provider_user_id,
        "email": str(payload.get("email") or ""),
        "display_name": str(payload.get("name") or payload.get("email") or "Google User")[:120],
        "avatar_url": str(payload.get("picture") or "")[:1000],
    }


def youtube_channel(access_token: str) -> tuple[int, dict]:
    query = urllib.parse.urlencode({"part": "snippet,statistics", "mine": "true", "maxResults": "1"})
    status, payload = _google_bearer_json(f"{GOOGLE_YOUTUBE_CHANNELS_URL}?{query}", access_token)
    if status >= 400:
        return status, {"error": "youtube_channel_failed", "message": "PARA could not read this account's YouTube channel. Make sure the YouTube Data API is enabled."}
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return 200, {"found": False}
    channel = items[0] if isinstance(items[0], dict) else {}
    snippet = channel.get("snippet") if isinstance(channel.get("snippet"), dict) else {}
    statistics = channel.get("statistics") if isinstance(channel.get("statistics"), dict) else {}
    thumbnails = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
    avatar = ""
    for size in ("high", "medium", "default"):
        candidate = thumbnails.get(size) if isinstance(thumbnails.get(size), dict) else {}
        if candidate.get("url"):
            avatar = str(candidate.get("url"))
            break
    def number(name: str) -> int | None:
        value = statistics.get(name)
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None
    return 200, {
        "found": True,
        "youtube_channel_id": str(channel.get("id") or ""),
        "youtube_channel_title": str(snippet.get("title") or "")[:120],
        "youtube_custom_url": str(snippet.get("customUrl") or "")[:240],
        "youtube_avatar_url": avatar[:1000],
        "youtube_subscriber_count": number("subscriberCount"),
        "youtube_view_count": number("viewCount"),
        "youtube_video_count": number("videoCount"),
        "youtube_hidden_subscriber_count": bool(statistics.get("hiddenSubscriberCount", False)),
    }



def _prune_youtube_upload_sessions(now: float | None = None) -> None:
    now = float(now if now is not None else time.time())
    expired = [key for key, value in _youtube_upload_sessions.items() if float(value.get("expires_at") or 0) <= now]
    for key in expired:
        _youtube_upload_sessions.pop(key, None)


def create_youtube_upload_session(access_token: str, expires_in: int = 3600) -> str:
    """Keep a Google upload grant server-side behind an opaque, short-lived browser cookie."""
    token = str(access_token or "")
    if not token:
        return ""
    session_id = secrets.token_urlsafe(32)
    ttl = max(60, min(int(expires_in or 3600), YOUTUBE_UPLOAD_SESSION_TTL_SECONDS))
    with _youtube_upload_lock:
        _prune_youtube_upload_sessions()
        _youtube_upload_sessions[session_id] = {"access_token": token, "expires_at": time.time() + ttl}
    return session_id


def youtube_upload_session_access(session_id: str) -> str:
    session_id = str(session_id or "")
    if not session_id:
        return ""
    with _youtube_upload_lock:
        _prune_youtube_upload_sessions()
        record = _youtube_upload_sessions.get(session_id) or {}
        return str(record.get("access_token") or "")


def clear_youtube_upload_session(session_id: str) -> None:
    with _youtube_upload_lock:
        _youtube_upload_sessions.pop(str(session_id or ""), None)


def begin_youtube_resumable_upload(access_token: str, *, title: str, description: str, privacy_status: str, made_for_kids: bool, content_type: str, content_length: int, tags: list[str] | None = None, category_id: str = "20", publish_at: str = "") -> tuple[int, dict]:
    """Create a YouTube videos.insert resumable upload session and return its HTTPS Location."""
    privacy = str(privacy_status or "private").lower()
    if privacy not in {"private", "unlisted", "public"}:
        privacy = "private"
    clean_tags = [str(tag).strip()[:100] for tag in (tags or []) if str(tag).strip()][:40]
    snippet = {
        "title": str(title or "PARA Gameplay Capture")[:100],
        "description": str(description or "")[:5000],
        "categoryId": str(category_id or "20")[:8],
    }
    if clean_tags:
        snippet["tags"] = clean_tags
    status_payload = {"privacyStatus": privacy, "selfDeclaredMadeForKids": bool(made_for_kids)}
    if publish_at:
        status_payload["privacyStatus"] = "private"
        status_payload["publishAt"] = str(publish_at)
    metadata = {"snippet": snippet, "status": status_payload}
    query = urllib.parse.urlencode({"uploadType": "resumable", "part": "snippet,status", "notifySubscribers": "false"})
    data = json.dumps(metadata, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        f"{GOOGLE_YOUTUBE_UPLOAD_INIT_URL}?{query}",
        data=data,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "X-Upload-Content-Type": content_type,
            "X-Upload-Content-Length": str(content_length),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            location = str(response.headers.get("Location") or "")
            if not location:
                return 502, {"error": "youtube_upload_session_missing", "message": "YouTube did not return an upload session."}
            return response.status, {"location": location, "publish_at": str(publish_at or "")}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
        detail = payload.get("error") if isinstance(payload, dict) else {}
        message = detail.get("message") if isinstance(detail, dict) else ""
        return error.code, {"error": "youtube_upload_init_failed", "message": str(message or "YouTube rejected the upload request.")[:300]}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 502, {"error": "youtube_unavailable", "message": "PARA could not start the YouTube upload."}

def stream_youtube_resumable_upload(upload_url: str, source, *, content_type: str, content_length: int) -> tuple[int, dict]:
    """Stream the browser capture through PARA to a YouTube resumable upload URL."""
    parsed = urllib.parse.urlparse(str(upload_url or ""))
    host = str(parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "googleapis.com" or host.endswith(".googleapis.com") or host.endswith(".googleusercontent.com")):
        return 502, {"error": "youtube_upload_location_invalid", "message": "YouTube returned an invalid upload destination."}
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    connection = http.client.HTTPSConnection(host, parsed.port or 443, timeout=120)
    try:
        connection.putrequest("PUT", path)
        connection.putheader("Content-Type", content_type)
        connection.putheader("Content-Length", str(content_length))
        connection.endheaders()
        remaining = int(content_length)
        while remaining > 0:
            chunk = source.read(min(1024 * 1024, remaining))
            if not chunk:
                return 400, {"error": "youtube_upload_incomplete", "message": "The capture upload ended before the full video was received."}
            connection.send(chunk)
            remaining -= len(chunk)
        response = connection.getresponse()
        body = response.read().decode("utf-8", "replace")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {}
        if response.status not in {200, 201}:
            detail = payload.get("error") if isinstance(payload, dict) else {}
            message = detail.get("message") if isinstance(detail, dict) else ""
            return response.status, {"error": "youtube_upload_failed", "message": str(message or "YouTube could not finish the video upload.")[:300]}
        video_id = str(payload.get("id") or "") if isinstance(payload, dict) else ""
        actual_privacy = ((payload.get("status") or {}).get("privacyStatus") if isinstance(payload, dict) and isinstance(payload.get("status"), dict) else None)
        return 200, {
            "uploaded": True,
            "provider": "youtube",
            "video_id": video_id,
            "privacy_status": actual_privacy,
            "watch_url": f"https://www.youtube.com/watch?v={urllib.parse.quote(video_id, safe='')}" if video_id else "",
        }
    except (OSError, TimeoutError, http.client.HTTPException):
        return 502, {"error": "youtube_upload_unavailable", "message": "The connection to YouTube was interrupted during upload."}
    finally:
        connection.close()



def set_youtube_thumbnail(access_token: str, video_id: str, image_bytes: bytes, content_type: str = "image/jpeg") -> tuple[int, dict]:
    video_id = str(video_id or "").strip()
    if not video_id or not image_bytes:
        return 400, {"error": "youtube_thumbnail_invalid", "message": "Choose a valid YouTube video and thumbnail image."}
    query = urllib.parse.urlencode({"videoId": video_id, "uploadType": "media"})
    request = urllib.request.Request(
        f"{GOOGLE_YOUTUBE_THUMBNAIL_UPLOAD_URL}?{query}",
        data=image_bytes,
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json", "Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", "replace")
            payload = json.loads(body) if body else {}
            return response.status, {"thumbnail_set": True, "video_id": video_id, "youtube": payload}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
        detail = payload.get("error") if isinstance(payload, dict) else {}
        message = detail.get("message") if isinstance(detail, dict) else ""
        return error.code, {"error": "youtube_thumbnail_failed", "message": str(message or "YouTube could not set that custom thumbnail. Your channel may not be eligible for custom thumbnails.")[:300]}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return 502, {"error": "youtube_thumbnail_unavailable", "message": "PARA could not reach YouTube to set the thumbnail."}


def refresh_external_youtube_stats(para_access_token: str, channel: dict) -> tuple[int, dict]:
    if not isinstance(channel, dict) or not channel.get("found"):
        return 200, {}
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    patch = {
        "youtube_channel_id": str(channel.get("youtube_channel_id") or "") or None,
        "youtube_channel_title": str(channel.get("youtube_channel_title") or "") or None,
        "youtube_custom_url": str(channel.get("youtube_custom_url") or "") or None,
        "youtube_subscriber_count": channel.get("youtube_subscriber_count"),
        "youtube_view_count": channel.get("youtube_view_count"),
        "youtube_video_count": channel.get("youtube_video_count"),
        "youtube_hidden_subscriber_count": channel.get("youtube_hidden_subscriber_count"),
        "updated_at": timestamp,
    }
    status, _ = _supabase_account_rest_request(
        "/rest/v1/external_accounts?provider=eq.google",
        method="PATCH",
        payload=patch,
        bearer=para_access_token,
        prefer="return=minimal",
    )
    return status, patch if status < 400 else {}

def external_account_status(access_token: str, provider: str = "google") -> tuple[int, dict]:
    if provider != "google":
        return 400, {"error": "provider_unsupported", "message": "That external account provider is not supported yet."}
    quoted = urllib.parse.quote(provider, safe="")
    select = "provider,provider_user_id,email,display_name,avatar_url,youtube_channel_id,youtube_channel_title,youtube_custom_url,youtube_subscriber_count,youtube_view_count,youtube_video_count,youtube_hidden_subscriber_count,connected_at,updated_at"
    status, payload = _supabase_account_rest_request(
        f"/rest/v1/external_accounts?select={select}&provider=eq.{quoted}&limit=1",
        bearer=access_token,
    )
    if status >= 400:
        return status, {"error": "external_account_storage_failed", "message": "PARA could not read connected external accounts."}
    rows = payload if isinstance(payload, list) else []
    if not rows:
        return 200, {"provider": provider, "connected": False, "configured": google_oauth_configured()}
    row = rows[0] if isinstance(rows[0], dict) else {}
    return 200, {
        "provider": provider,
        "connected": True,
        "configured": google_oauth_configured(),
        "provider_user_id": str(row.get("provider_user_id") or ""),
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "avatar_url": row.get("avatar_url"),
        "youtube_channel_id": row.get("youtube_channel_id"),
        "youtube_channel_title": row.get("youtube_channel_title"),
        "youtube_custom_url": row.get("youtube_custom_url"),
        "youtube_subscriber_count": row.get("youtube_subscriber_count"),
        "youtube_view_count": row.get("youtube_view_count"),
        "youtube_video_count": row.get("youtube_video_count"),
        "youtube_hidden_subscriber_count": row.get("youtube_hidden_subscriber_count"),
        "connected_at": row.get("connected_at"),
        "updated_at": row.get("updated_at"),
    }


def connect_external_account(access_token: str, para_user_id: str, identity: dict, channel: dict) -> tuple[int, dict]:
    provider_user_id = str(identity.get("provider_user_id") or "")
    if not provider_user_id:
        return 400, {"error": "google_identity_missing", "message": "Google did not return a usable account identity."}
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    channel = channel if isinstance(channel, dict) else {}
    record = {
        "para_user_id": str(para_user_id),
        "provider": "google",
        "provider_user_id": provider_user_id,
        "email": str(identity.get("email") or "") or None,
        "display_name": str(identity.get("display_name") or "") or None,
        "avatar_url": str(channel.get("youtube_avatar_url") or identity.get("avatar_url") or "") or None,
        "youtube_channel_id": str(channel.get("youtube_channel_id") or "") or None,
        "youtube_channel_title": str(channel.get("youtube_channel_title") or "") or None,
        "youtube_custom_url": str(channel.get("youtube_custom_url") or "") or None,
        "youtube_subscriber_count": channel.get("youtube_subscriber_count"),
        "youtube_view_count": channel.get("youtube_view_count"),
        "youtube_video_count": channel.get("youtube_video_count"),
        "youtube_hidden_subscriber_count": channel.get("youtube_hidden_subscriber_count"),
        "connected_at": timestamp,
        "updated_at": timestamp,
    }
    status, payload = _supabase_account_rest_request(
        "/rest/v1/external_accounts?on_conflict=para_user_id,provider",
        method="POST",
        payload=record,
        bearer=access_token,
        prefer="resolution=merge-duplicates,return=representation",
    )
    if status >= 400:
        return status, {"error": "external_account_link_failed", "message": "PARA could not save the Google / YouTube account connection."}
    return 200, {
        "provider": "google",
        "connected": True,
        "provider_user_id": provider_user_id,
        "youtube_channel_id": record["youtube_channel_id"],
        "youtube_channel_title": record["youtube_channel_title"],
    }


def disconnect_external_account(access_token: str, provider: str = "google") -> tuple[int, dict]:
    if provider != "google":
        return 400, {"error": "provider_unsupported", "message": "That external account provider is not supported yet."}
    quoted = urllib.parse.quote(provider, safe="")
    status, _ = _supabase_account_rest_request(
        f"/rest/v1/external_accounts?provider=eq.{quoted}",
        method="DELETE",
        bearer=access_token,
        prefer="return=minimal",
    )
    if status >= 400:
        return status, {"error": "external_account_disconnect_failed", "message": "PARA could not disconnect that Google / YouTube account."}
    return 200, {"provider": provider, "connected": False}


def _public_auth_user(user: object) -> dict | None:
    if not isinstance(user, dict) or not user.get("id"):
        return None
    metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
    email = str(user.get("email") or "")
    display_name = str(metadata.get("display_name") or metadata.get("name") or (email.split("@", 1)[0] if email else "PARA User"))
    auth_email_confirmed = bool(user.get("email_confirmed_at") or user.get("confirmed_at"))
    para_email_verified = bool(metadata.get("para_email_verified"))
    return {
        "id": str(user.get("id")),
        "email": email,
        "display_name": display_name[:32],
        "email_confirmed": auth_email_confirmed,
        "para_email_verified": para_email_verified,
        "email_verified": auth_email_confirmed or para_email_verified,
        "created_at": user.get("created_at"),
    }


def _auth_message(payload: object, fallback: str) -> str:
    if not isinstance(payload, dict):
        return fallback
    for key in ("msg", "message", "error_description", "error"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            text = value.strip()
            # Do not leak internal URLs or raw server traces into the console UI.
            return text[:240]
    return fallback


def auth_sign_up(email: str, password: str, display_name: str) -> tuple[int, dict, dict | None]:
    email = str(email or "").strip().lower()
    display_name = str(display_name or "").strip()[:32]
    if "@" not in email or len(email) > 254:
        return 400, {"error": "invalid_email", "message": "Enter a valid email address."}, None
    if len(str(password or "")) < 8:
        return 400, {"error": "weak_password", "message": "Password must be at least 8 characters."}, None
    if not display_name:
        return 400, {"error": "invalid_display_name", "message": "Choose a display name."}, None
    status, payload = _supabase_auth_request(
        "/auth/v1/signup",
        payload={"email": email, "password": password, "data": {"display_name": display_name, "client": "PARA Console"}},
    )
    if status >= 400:
        return status, {"error": "signup_failed", "message": _auth_message(payload, "Could not create the PARA Account.")}, None
    raw_user = payload.get("user") if isinstance(payload, dict) else None
    if not isinstance(raw_user, dict) or not raw_user.get("id"):
        return 502, {"error": "signup_user_missing", "message": "Supabase did not create a usable PARA Account."}, None

    # Supabase may intentionally return an obfuscated, success-shaped user for an
    # email that already exists. In that response the identities array is empty.
    # Never tell the console that a new account was created in that case.
    identities = raw_user.get("identities")
    if isinstance(identities, list) and len(identities) == 0:
        return 409, {"error": "account_exists", "message": "That email already has a PARA Account. Sign in instead."}, None

    user = _public_auth_user(raw_user)
    if not user:
        return 502, {"error": "signup_user_invalid", "message": "Supabase returned an invalid PARA Account record."}, None

    tokens = None
    if isinstance(payload, dict) and payload.get("access_token") and payload.get("refresh_token"):
        tokens = {"access_token": payload["access_token"], "refresh_token": payload["refresh_token"], "expires_in": int(payload.get("expires_in") or 3600)}
    return 201, {"account_created": True, "persisted": True, "signed_in": bool(tokens), "requires_confirmation": not bool(tokens), "user": user}, tokens


def auth_sign_in(email: str, password: str) -> tuple[int, dict, dict | None]:
    email = str(email or "").strip().lower()
    if not email or not password:
        return 400, {"error": "credentials_required", "message": "Enter your email and password."}, None
    status, payload = _supabase_auth_request(
        "/auth/v1/token?grant_type=password",
        payload={"email": email, "password": password},
    )
    if status >= 400:
        return status, {
            "error": "signin_failed",
            "message": _auth_message(payload, "Email or password was not accepted."),
            "project_ref": PARA_ACCOUNT_SUPABASE_PROJECT_REF,
        }, None
    user = _public_auth_user(payload.get("user") if isinstance(payload, dict) else None)
    if not isinstance(payload, dict) or not payload.get("access_token") or not payload.get("refresh_token"):
        return 502, {"error": "session_missing", "message": "PARA Account did not return a usable session."}, None
    tokens = {"access_token": payload["access_token"], "refresh_token": payload["refresh_token"], "expires_in": int(payload.get("expires_in") or 3600)}
    return 200, {"signed_in": True, "user": user}, tokens



def auth_request_password_recovery(email: str) -> tuple[int, dict]:
    email = _normalize_verification_email(email)
    if not email:
        return 400, {"error": "invalid_email", "message": "Enter a valid email address."}
    recovery_path = "/auth/v1/recover?" + urllib.parse.urlencode({"redirect_to": PARA_ACCOUNT_PUBLIC_URL})
    status, payload = _supabase_auth_request(recovery_path, payload={"email": email})
    if status >= 400:
        return status, {"error": "recovery_failed", "message": _auth_message(payload, "Could not request password recovery.")}
    # Keep the response account-enumeration safe. Supabase intentionally does the same.
    return 202, {"requested": True, "message": "If that email has a PARA Account, a recovery link is on the way."}


def auth_complete_password_recovery(access_token: str, refresh_token: str, expires_in: object, password: str) -> tuple[int, dict, dict | None]:
    access_token = str(access_token or "").strip()
    refresh_token = str(refresh_token or "").strip()
    if not access_token:
        return 401, {"error": "recovery_session_missing", "message": "This recovery link is missing or expired. Request a new one."}, None
    if len(str(password or "")) < 8:
        return 400, {"error": "weak_password", "message": "Password must be at least 8 characters."}, None
    status, payload = _supabase_auth_request("/auth/v1/user", method="PUT", payload={"password": str(password)}, bearer=access_token)
    if status >= 400:
        return status, {"error": "recovery_update_failed", "message": _auth_message(payload, "Could not update the PARA Account password.")}, None
    user = _public_auth_user(payload)
    if not user:
        return 502, {"error": "recovery_user_missing", "message": "PARA Account recovery did not return a usable account."}, None
    try:
        ttl = int(expires_in or 3600)
    except (TypeError, ValueError):
        ttl = 3600
    tokens = {"access_token": access_token, "refresh_token": refresh_token, "expires_in": ttl}
    return 200, {"signed_in": True, "password_updated": True, "user": user}, tokens

def auth_refresh(refresh_token: str) -> tuple[int, dict, dict | None]:
    if not refresh_token:
        return 401, {"signed_in": False}, None
    status, payload = _supabase_auth_request("/auth/v1/token?grant_type=refresh_token", payload={"refresh_token": refresh_token})
    if status >= 400 or not isinstance(payload, dict) or not payload.get("access_token"):
        return 401, {"signed_in": False}, None
    user = _public_auth_user(payload.get("user"))
    tokens = {
        "access_token": payload.get("access_token"),
        "refresh_token": payload.get("refresh_token") or refresh_token,
        "expires_in": int(payload.get("expires_in") or 3600),
    }
    return 200, {"signed_in": True, "user": user}, tokens


def auth_user(access_token: str) -> tuple[int, dict]:
    if not access_token:
        return 401, {"signed_in": False}
    status, payload = _supabase_auth_request("/auth/v1/user", method="GET", bearer=access_token)
    if status >= 400:
        return status, {"signed_in": False}
    return 200, {"signed_in": True, "user": _public_auth_user(payload)}


def auth_update_user(access_token: str, *, display_name: str | None = None, password: str | None = None) -> tuple[int, dict]:
    if not access_token:
        return 401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}
    body: dict = {}
    if display_name is not None:
        clean = str(display_name).strip()[:32]
        if not clean:
            return 400, {"error": "invalid_display_name", "message": "Choose a display name."}
        body["data"] = {"display_name": clean}
    if password is not None:
        if len(str(password)) < 8:
            return 400, {"error": "weak_password", "message": "Password must be at least 8 characters."}
        body["password"] = str(password)
    if not body:
        return 400, {"error": "nothing_to_update", "message": "Nothing changed."}
    status, payload = _supabase_auth_request("/auth/v1/user", method="PUT", payload=body, bearer=access_token)
    if status >= 400:
        return status, {"error": "account_update_failed", "message": _auth_message(payload, "Could not update the PARA Account.")}
    return 200, {"signed_in": True, "user": _public_auth_user(payload)}


def _normalize_verification_email(email: str) -> str:
    clean = str(email or "").strip().lower()
    if "@" not in clean or len(clean) > 254:
        return ""
    local, _, domain = clean.partition("@")
    if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
        return ""
    return clean


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not local or not domain:
        return "email"
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(2, len(local) - len(visible))}@{domain}"


def _verification_digest(code: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{code}".encode("utf-8")).hexdigest()


def _emailjs_config_summary() -> dict:
    suffix = EMAILJS_PUBLIC_KEY[-4:] if EMAILJS_PUBLIC_KEY else ""
    return {
        "service_id": EMAILJS_SERVICE_ID,
        "template_id": EMAILJS_TEMPLATE_ID,
        "public_key_length": len(EMAILJS_PUBLIC_KEY),
        "public_key_suffix": suffix,
        "private_key_enabled": bool(EMAILJS_PRIVATE_KEY),
        "origin": EMAILJS_ORIGIN or None,
    }


def _emailjs_error_text(raw: bytes | str) -> str:
    if isinstance(raw, bytes):
        text = raw.decode("utf-8", "replace")
    else:
        text = str(raw or "")
    # EmailJS normally returns a short plain-text reason. Keep diagnostics useful
    # without allowing a provider to flood the console UI.
    return " ".join(text.strip().split())[:300]


def _emailjs_send_verification(email: str, code: str) -> tuple[int, dict]:
    if not EMAILJS_SERVICE_ID or not EMAILJS_TEMPLATE_ID or not EMAILJS_PUBLIC_KEY:
        return 503, {"error": "verification_not_configured", "message": "PARA Protection Services email is not configured.", "emailjs_config": _emailjs_config_summary()}
    payload = {
        "service_id": EMAILJS_SERVICE_ID,
        "template_id": EMAILJS_TEMPLATE_ID,
        "user_id": EMAILJS_PUBLIC_KEY,
        "template_params": {"email": email, "passcode": code},
    }
    # EmailJS only requires the public key by default. If Account > Security has
    # private-key authorization enabled, the secret stays server-side and is
    # supplied through PARA_EMAILJS_PRIVATE_KEY.
    if EMAILJS_PRIVATE_KEY:
        payload["accessToken"] = EMAILJS_PRIVATE_KEY
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/plain",
        "User-Agent": "PARA-Protection-Services/1.0",
    }
    if EMAILJS_ORIGIN:
        headers["Origin"] = EMAILJS_ORIGIN
    request = urllib.request.Request(
        "https://api.emailjs.com/api/v1.0/email/send",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = _emailjs_error_text(response.read(2048))
            return response.status, {"sent": True, "provider": body or "OK"}
    except urllib.error.HTTPError as error:
        detail = _emailjs_error_text(error.read(4096))
        message = f"EmailJS returned HTTP {error.code}."
        if detail:
            message += f" {detail}"
        return error.code, {
            "error": "verification_send_failed",
            "message": message,
            "emailjs_status": error.code,
            "emailjs_detail": detail,
            "emailjs_config": _emailjs_config_summary(),
        }
    except (urllib.error.URLError, TimeoutError) as error:
        detail = _emailjs_error_text(getattr(error, "reason", error))
        message = "PARA Protection Services could not reach EmailJS."
        if detail:
            message += f" {detail}"
        return 502, {"error": "verification_service_unavailable", "message": message, "emailjs_config": _emailjs_config_summary()}


def auth_request_email_verification(email: str, client_key: str = "local") -> tuple[int, dict]:
    clean = _normalize_verification_email(email)
    if not clean:
        return 400, {"error": "invalid_email", "message": "Enter a valid email address."}
    now = time.time()
    client_key = str(client_key or "local")[:128]
    with _email_verification_lock:
        recent = [stamp for stamp in _email_verification_client_sends.get(client_key, []) if now - stamp < EMAIL_VERIFICATION_CLIENT_WINDOW_SECONDS]
        _email_verification_client_sends[client_key] = recent
        if len(recent) >= EMAIL_VERIFICATION_CLIENT_MAX_SENDS:
            wait = max(1, int(EMAIL_VERIFICATION_CLIENT_WINDOW_SECONDS - (now - recent[0])))
            return 429, {"error": "verification_rate_limited", "message": "Too many verification emails were requested from this device. Try again later.", "retry_after": wait}
        current = _email_verifications.get(clean)
        if current and now - float(current.get("sent_at") or 0) < EMAIL_VERIFICATION_RESEND_SECONDS:
            wait = max(1, int(EMAIL_VERIFICATION_RESEND_SECONDS - (now - float(current.get("sent_at") or 0))))
            return 429, {"error": "verification_cooldown", "message": f"Wait {wait} seconds before requesting another code.", "retry_after": wait}
    code = f"{secrets.randbelow(1_000_000):06d}"
    salt = secrets.token_hex(16)
    status, result = _emailjs_send_verification(clean, code)
    if status >= 400:
        return status, result
    with _email_verification_lock:
        _email_verification_client_sends.setdefault(client_key, []).append(now)
        _email_verifications[clean] = {
            "digest": _verification_digest(code, salt),
            "salt": salt,
            "sent_at": now,
            "expires_at": now + EMAIL_VERIFICATION_TTL_SECONDS,
            "attempts": 0,
        }
    return 202, {"sent": True, "email": _mask_email(clean), "expires_in": EMAIL_VERIFICATION_TTL_SECONDS}


def auth_verify_email_code(email: str, code: str) -> tuple[int, dict]:
    clean = _normalize_verification_email(email)
    code = "".join(character for character in str(code or "") if character.isdigit())
    if not clean or len(code) != 6:
        return 400, {"error": "invalid_verification", "message": "Enter the 6-digit verification code."}
    now = time.time()
    with _email_verification_lock:
        current = _email_verifications.get(clean)
        if not current:
            return 400, {"error": "verification_missing", "message": "Request a new verification code."}
        if now >= float(current.get("expires_at") or 0):
            _email_verifications.pop(clean, None)
            return 400, {"error": "verification_expired", "message": "That verification code expired. Request a new one."}
        attempts = int(current.get("attempts") or 0)
        if attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS:
            _email_verifications.pop(clean, None)
            return 429, {"error": "verification_locked", "message": "Too many incorrect attempts. Request a new code."}
        expected = str(current.get("digest") or "")
        actual = _verification_digest(code, str(current.get("salt") or ""))
        if not hmac.compare_digest(expected, actual):
            current["attempts"] = attempts + 1
            remaining = EMAIL_VERIFICATION_MAX_ATTEMPTS - current["attempts"]
            return 400, {"error": "verification_incorrect", "message": f"That code is not correct. {remaining} attempt{'s' if remaining != 1 else ''} remaining."}
        _email_verifications.pop(clean, None)
    return 200, {"verified": True, "email": clean}


def auth_mark_para_email_verified(access_token: str) -> tuple[int, dict]:
    if not access_token:
        return 401, {"error": "not_signed_in", "message": "Sign in to finish email verification."}
    status, payload = _supabase_auth_request(
        "/auth/v1/user",
        method="PUT",
        payload={"data": {"para_email_verified": True, "para_email_verified_at": int(time.time())}},
        bearer=access_token,
    )
    if status >= 400:
        return status, {"error": "verification_update_failed", "message": _auth_message(payload, "Email was verified, but PARA could not update the account yet.")}
    return 200, {"signed_in": True, "user": _public_auth_user(payload)}


def _attach_store_pricing(items: list[dict]) -> list[dict]:
    """Attach public pricing to published catalog entries.

    Pricing is read server-side from project_pricing so ParaStore never relies
    on a hardcoded/storefront copy of the developer's price.
    """
    project_ids = [str(item.get("project_id") or "") for item in items if item.get("project_id")]
    if not project_ids:
        return items
    encoded_ids = ",".join(urllib.parse.quote(value, safe="-") for value in project_ids)
    status, pricing = _supabase_get_json(
        f"/rest/v1/project_pricing?select=project_id,model,price,currency,updated_at&project_id=in.({encoded_ids})"
    )
    if status >= 400 or not isinstance(pricing, list):
        return items
    by_project = {str(row.get("project_id")): row for row in pricing if row.get("project_id")}
    for item in items:
        row = by_project.get(str(item.get("project_id") or ""))
        if row:
            item["pricing"] = {
                "model": row.get("model") or "FREE",
                "price": row.get("price") or 0,
                "currency": (row.get("currency") or "USD").upper(),
                "updated_at": row.get("updated_at"),
            }
    return items


def store_catalog() -> tuple[int, dict]:
    """Read the public ParaStore catalog from Supabase without exposing keys to the browser."""
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, {"error": "catalog_not_configured", "items": []}
    url = f"{base}/rest/v1/catalog_entries?select=id,project_id,current_release_id,package_id,title,project_type,runtime,architectures,store_metadata,asset_references,download_reference,release_notes,published_at,status&status=eq.PUBLISHED&order=published_at.desc"
    request = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            items = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        return 502, {"error": "catalog_unavailable", "detail": str(error), "items": []}
    items = items if isinstance(items, list) else []
    return 200, {"source": "parastore", "items": _attach_store_pricing(items)}



def _supabase_get_json(path: str) -> tuple[int, object]:
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, {"error": "catalog_not_configured"}
    request = urllib.request.Request(f"{base}{path}", headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, {"error": "supabase_error", "detail": error.read().decode("utf-8", "replace")}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        return 502, {"error": "catalog_unavailable", "detail": str(error)}


def store_product(item_id: str) -> tuple[int, dict]:
    quoted = urllib.parse.quote(item_id, safe="")
    status, payload = _supabase_get_json(f"/rest/v1/catalog_entries?select=id,project_id,current_release_id,package_id,title,project_type,runtime,architectures,store_metadata,asset_references,download_reference,release_notes,published_at,status&id=eq.{quoted}&status=eq.PUBLISHED&limit=1")
    if status >= 400:
        return status, payload if isinstance(payload, dict) else {"error": "product_unavailable"}
    if not isinstance(payload, list) or not payload:
        return 404, {"error": "product_not_found"}
    item = payload[0]
    return 200, _attach_store_pricing([item])[0]



def store_achievements(item_id: str) -> tuple[int, dict]:
    """Return published achievement definitions for a published ParaStore title."""
    status, item = store_product(item_id)
    if status != 200:
        return status, item if isinstance(item, dict) else {"error": "product_unavailable"}
    project_id = str(item.get("project_id") or "")
    if not project_id:
        return 409, {"error": "project_missing", "items": []}
    quoted = urllib.parse.quote(project_id, safe="-")
    status, payload = _supabase_get_json(
        "/rest/v1/achievement_definitions"
        "?select=id,project_id,achievement_key,name,description,points,kind,target_value,hidden,icon_path,status,sort_order,published_at"
        f"&project_id=eq.{quoted}&status=in.(PUBLISHED,RETIRED)&order=sort_order.asc,created_at.asc"
    )
    if status >= 400:
        return status, payload if isinstance(payload, dict) else {"error": "achievements_unavailable", "items": []}
    rows = payload if isinstance(payload, list) else []
    for row in rows:
        icon_path = str(row.get("icon_path") or "")
        row["icon_url"] = f"/api/v1/store/asset?path={urllib.parse.quote(icon_path, safe='')}" if icon_path else None
    return 200, {"project_id": project_id, "store_id": item_id, "items": rows}


def store_checkout_quote(ids: list[str]) -> tuple[int, dict]:
    """Build an authoritative cart quote from published server-side prices.

    This intentionally does not create a charge. It is the safety boundary used
    before Stripe test-mode checkout is enabled.
    """
    clean = []
    for value in ids[:50]:
        value = str(value or "").strip()
        if value and value not in clean:
            clean.append(value)
    if not clean:
        return 400, {"error": "cart_empty"}
    items = []
    currency = None
    total = 0.0
    for item_id in clean:
        status, item = store_product(item_id)
        if status != 200:
            return 409, {"error": "product_unavailable", "id": item_id}
        pricing = item.get("pricing") or {}
        if str(pricing.get("model") or "FREE").upper() == "FREE":
            continue
        item_currency = str(pricing.get("currency") or "USD").upper()
        if currency and item_currency != currency:
            return 409, {"error": "mixed_currency_cart"}
        currency = item_currency
        try:
            amount = round(float(pricing.get("price") or 0), 2)
        except (TypeError, ValueError):
            return 409, {"error": "invalid_server_price", "id": item_id}
        if amount <= 0:
            return 409, {"error": "invalid_server_price", "id": item_id}
        total += amount
        items.append({"id": item.get("id"), "project_id": item.get("project_id"), "title": item.get("title"), "price": amount, "currency": item_currency})
    if not items:
        return 400, {"error": "no_paid_items"}
    return 200, {"mode": "quote_only", "currency": currency or "USD", "total": round(total, 2), "items": items}

def _storage_fetch(bucket: str, path: str) -> tuple[int, bytes, str]:
    base = os.environ.get("PARA_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("PARA_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        return 503, b"", "application/octet-stream"
    safe_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/") if part)
    request = urllib.request.Request(f"{base}/storage/v1/object/{bucket}/{safe_path}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read(), response.headers.get_content_type()
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers.get_content_type()
    except (urllib.error.URLError, TimeoutError):
        return 502, b"", "application/octet-stream"





def _ffmpeg_executable() -> str:
    """Resolve the server-side encoder used to normalize browser captures."""
    configured = _env_config("PARA_FFMPEG_PATH", "")
    if configured and Path(configured).is_file():
        return configured
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import imageio_ffmpeg  # type: ignore

        bundled = str(imageio_ffmpeg.get_ffmpeg_exe() or "")
        if bundled and Path(bundled).is_file():
            return bundled
    except Exception:
        pass
    return ""


def normalize_capture_file(input_path: Path, output_path: Path, *, timeout: int = CAPTURE_NORMALIZE_TIMEOUT_SECONDS) -> tuple[int, dict]:
    """Transcode a temporary browser WebM into a boring H.264/AAC MP4."""
    ffmpeg = _ffmpeg_executable()
    if not ffmpeg:
        return 503, {
            "error": "capture_encoder_unavailable",
            "message": "PARA capture processing is unavailable on this server.",
        }
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-fflags", "+genpts+discardcorrupt",
        "-err_detect", "ignore_err",
        "-i", str(input_path),
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "160k",
        "-ar", "48000",
        "-movflags", "+faststart",
        str(output_path),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return 504, {
            "error": "capture_processing_timeout",
            "message": "PARA capture processing took too long. Try a shorter clip.",
        }
    except OSError:
        return 503, {
            "error": "capture_encoder_unavailable",
            "message": "PARA could not start the capture encoder.",
        }
    if completed.returncode != 0 or not output_path.is_file() or output_path.stat().st_size < 1024:
        detail = re.sub(r"\s+", " ", str(completed.stderr or "").strip())[-500:]
        return 422, {
            "error": "capture_processing_failed",
            "message": "PARA could not normalize this gameplay recording.",
            "detail": detail,
        }
    return 200, {
        "normalized": True,
        "mime_type": "video/mp4",
        "video_codec": "h264",
        "audio_codec": "aac",
        "size": output_path.stat().st_size,
    }



def _capture_cleanup_locked(now: float | None = None) -> None:
    """Drop finished capture jobs after their short result-retention window."""
    current = time.time() if now is None else now
    stale: list[str] = []
    for job_id, job in _capture_jobs.items():
        if job.get("state") not in {"completed", "failed"}:
            continue
        finished = float(job.get("finished_at") or job.get("created_at") or current)
        if current - finished >= CAPTURE_NORMALIZE_JOB_TTL_SECONDS:
            stale.append(job_id)
    for job_id in stale:
        job = _capture_jobs.pop(job_id, None) or {}
        try:
            shutil.rmtree(str(job.get("temp_dir") or ""), ignore_errors=True)
        except Exception:
            pass


def _capture_ahead_locked(job_id: str) -> int:
    job = _capture_jobs.get(job_id) or {}
    if job.get("state") == "processing":
        return 0
    processing = 1 if any(candidate.get("state") == "processing" for candidate in _capture_jobs.values()) else 0
    try:
        pending_index = _capture_pending_jobs.index(job_id)
    except ValueError:
        pending_index = 0
    return max(0, processing + pending_index)


def _capture_queue_worker() -> None:
    while True:
        with _capture_jobs_ready:
            while not _capture_pending_jobs:
                _capture_jobs_ready.wait()
            job_id = _capture_pending_jobs.pop(0)
            job = _capture_jobs.get(job_id)
            if not job:
                continue
            job["state"] = "processing"
            job["started_at"] = time.time()
            input_path = Path(str(job["input_path"]))
            output_path = Path(str(job["output_path"]))

        try:
            status, payload = normalize_capture_file(input_path, output_path)
        except Exception as error:  # keep the worker alive if one encoder job crashes
            status, payload = 500, {
                "error": "capture_processing_failed",
                "message": "PARA capture processing failed unexpectedly.",
                "detail": str(error)[-300:],
            }

        with _capture_jobs_ready:
            current = _capture_jobs.get(job_id)
            if not current:
                continue
            current["status_code"] = int(status)
            current["result"] = payload
            current["finished_at"] = time.time()
            current["state"] = "completed" if status == 200 else "failed"
            _capture_cleanup_locked()
            _capture_jobs_ready.notify_all()


def _ensure_capture_worker_locked() -> None:
    global _capture_worker_thread
    if _capture_worker_thread and _capture_worker_thread.is_alive():
        return
    _capture_worker_thread = threading.Thread(
        target=_capture_queue_worker,
        name="para-capture-normalizer",
        daemon=True,
    )
    _capture_worker_thread.start()


def enqueue_capture_normalization(input_path: Path, output_path: Path, temp_dir: Path, owner: str) -> tuple[int, dict]:
    """Queue one uploaded capture instead of rejecting it when the encoder is busy."""
    with _capture_jobs_ready:
        _capture_cleanup_locked()
        if len(_capture_pending_jobs) >= CAPTURE_NORMALIZE_QUEUE_MAX:
            return 503, {
                "error": "capture_queue_full",
                "message": "PARA's capture queue is full. Your recording was not discarded; try saving again in a moment.",
            }
        _ensure_capture_worker_locked()
        job_id = secrets.token_urlsafe(18)
        now = time.time()
        _capture_jobs[job_id] = {
            "id": job_id,
            "owner": owner,
            "state": "queued",
            "created_at": now,
            "input_path": str(input_path),
            "output_path": str(output_path),
            "temp_dir": str(temp_dir),
            "status_code": 202,
            "result": {},
        }
        _capture_pending_jobs.append(job_id)
        ahead = _capture_ahead_locked(job_id)
        _capture_jobs_ready.notify()
        return 202, {
            "job_id": job_id,
            "state": "queued" if ahead else "processing",
            "ahead": ahead,
            "message": f"Queued capture · {ahead} ahead" if ahead else "Processing capture · creating MP4",
        }


def capture_normalization_status(job_id: str, owner: str) -> tuple[int, dict]:
    with _capture_jobs_ready:
        _capture_cleanup_locked()
        job = _capture_jobs.get(job_id)
        if not job or str(job.get("owner") or "") != owner:
            return 404, {"error": "capture_job_not_found", "message": "This capture job is no longer available."}
        state = str(job.get("state") or "queued")
        ahead = _capture_ahead_locked(job_id) if state == "queued" else 0
        payload = {
            "job_id": job_id,
            "state": state,
            "ahead": ahead,
            "message": (
                f"Queued capture · {ahead} ahead"
                if state == "queued"
                else "Processing capture · creating MP4"
                if state == "processing"
                else "Capture ready"
                if state == "completed"
                else str((job.get("result") or {}).get("message") or "Capture processing failed.")
            ),
        }
        if state == "failed":
            payload.update(job.get("result") or {})
            payload["state"] = "failed"
        return 200, payload


def consume_capture_normalization_result(job_id: str, owner: str) -> tuple[int, bytes | dict]:
    with _capture_jobs_ready:
        _capture_cleanup_locked()
        job = _capture_jobs.get(job_id)
        if not job or str(job.get("owner") or "") != owner:
            return 404, {"error": "capture_job_not_found", "message": "This capture job is no longer available."}
        state = str(job.get("state") or "queued")
        if state in {"queued", "processing"}:
            return 409, {
                "error": "capture_not_ready",
                "state": state,
                "ahead": _capture_ahead_locked(job_id) if state == "queued" else 0,
                "message": "PARA is still processing this capture.",
            }
        if state == "failed":
            return int(job.get("status_code") or 422), dict(job.get("result") or {})
        output_path = Path(str(job.get("output_path") or ""))
        temp_dir = str(job.get("temp_dir") or "")

    try:
        body = output_path.read_bytes()
    except OSError:
        return 500, {"error": "capture_result_missing", "message": "PARA finished the job but could not read the MP4 result."}

    with _capture_jobs_ready:
        _capture_jobs.pop(job_id, None)
    shutil.rmtree(temp_dir, ignore_errors=True)
    return 200, body


def _store_build_storage_prefix(item: dict) -> str:
    """Return the physical Storage prefix for a published developer build.

    Developer Portal build artifacts live under ``.../builds/<id>/files/``.
    Older catalog rows may store a virtual entry reference ending directly in
    ``/index.html``. Normalize both shapes so Play and Download resolve the
    actual object path.
    """
    reference = str(item.get("download_reference") or "").strip("/")
    if not reference:
        return ""
    if reference.endswith("/index.html"):
        reference = reference[:-len("/index.html")]
    if not reference.endswith("/files"):
        reference = f"{reference}/files"
    return reference

def store_download(item_id: str) -> tuple[int, bytes, str, str]:
    status, item = store_product(item_id)
    if status != 200:
        return status, json.dumps(item).encode(), "application/json", "parastore-error.json"
    release_id = str(item.get("current_release_id") or "")
    if not release_id:
        return 409, b'{"error":"release_missing"}', "application/json", "parastore-error.json"
    status, releases = _supabase_get_json(f"/rest/v1/releases?select=id,build_id,status&id=eq.{urllib.parse.quote(release_id, safe='')}&status=eq.PUBLISHED&limit=1")
    if status >= 400 or not isinstance(releases, list) or not releases:
        return 409, b'{"error":"release_unavailable"}', "application/json", "parastore-error.json"
    build_id = str(releases[0].get("build_id") or "")
    status, files = _supabase_get_json(f"/rest/v1/build_files?select=path,byte_size,checksum_sha256&build_id=eq.{urllib.parse.quote(build_id, safe='')}&order=path.asc")
    if status >= 400 or not isinstance(files, list) or not files:
        return 409, b'{"error":"build_files_missing"}', "application/json", "parastore-error.json"
    prefix = _store_build_storage_prefix(item)
    if not prefix:
        return 409, b'{"error":"download_reference_missing"}', "application/json", "parastore-error.json"
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in files:
            relative = str(entry.get("path") or "").lstrip("/")
            if not relative or ".." in Path(relative).parts:
                continue
            file_status, body, _ = _storage_fetch("developer-builds", f"{prefix}/{relative}")
            if file_status != 200:
                return 502, json.dumps({"error": "file_download_failed", "path": relative}).encode(), "application/json", "parastore-error.json"
            archive.writestr(relative, body)
    filename = f"{str(item.get('package_id') or item.get('title') or 'para-game').replace('/', '-')}.zip"
    return 200, memory.getvalue(), "application/zip", filename


def store_content(item_id: str, relative_path: str) -> tuple[int, bytes, str]:
    """Serve one file from a published WEB build for the sandboxed PARA web runtime."""
    status, item = store_product(item_id)
    if status != 200:
        return status, json.dumps(item).encode(), "application/json"
    if str(item.get("runtime") or "") not in {"WEB", "JAVASCRIPT", "UNITY_WEBGL"}:
        return 409, b'{"error":"runtime_not_web"}', "application/json"
    release_id = str(item.get("current_release_id") or "")
    if not release_id:
        return 409, b'{"error":"release_missing"}', "application/json"
    status, releases = _supabase_get_json(f"/rest/v1/releases?select=id,build_id,status&id=eq.{urllib.parse.quote(release_id, safe='')}&status=eq.PUBLISHED&limit=1")
    if status >= 400 or not isinstance(releases, list) or not releases:
        return 409, b'{"error":"release_unavailable"}', "application/json"
    build_id = str(releases[0].get("build_id") or "")
    relative = urllib.parse.unquote(relative_path or "index.html").lstrip("/")
    if not relative or ".." in Path(relative).parts:
        return 400, b'{"error":"invalid_path"}', "application/json"
    encoded = urllib.parse.quote(relative, safe="/")
    status, files = _supabase_get_json(f"/rest/v1/build_files?select=path&build_id=eq.{urllib.parse.quote(build_id, safe='')}&path=eq.{encoded}&limit=1")
    if status >= 400 or not isinstance(files, list) or not files:
        return 404, b'{"error":"file_not_found"}', "application/json"
    prefix = _store_build_storage_prefix(item)
    if not prefix:
        return 409, b'{"error":"download_reference_missing"}', "application/json"
    file_status, body, storage_type = _storage_fetch("developer-builds", f"{prefix}/{relative}")
    if file_status != 200:
        return file_status, body or b'{"error":"file_unavailable"}', storage_type or "application/octet-stream"
    guessed = mimetypes.guess_type(relative)[0] or storage_type or "application/octet-stream"

    # Keep WEB titles inside their PARA virtual game root instead of letting
    # ordinary root-relative links/network requests fall through to PARA Home.
    if guessed.startswith("text/html"):
        try:
            text = body.decode("utf-8")
            runtime_base = f"/api/v1/store/content/{urllib.parse.quote(item_id, safe='')}/"
            runtime_id = json.dumps(item_id)
            runtime_base_json = json.dumps(runtime_base)
            game_title_json = json.dumps(str(item.get("title") or "PARA Game"))
            project_id_json = json.dumps(str(item.get("project_id") or ""))
            asset_refs = item.get("asset_references") if isinstance(item.get("asset_references"), dict) else {}
            screenshots = asset_refs.get("screenshots") if isinstance(asset_refs.get("screenshots"), list) else []
            artwork_paths = []
            for candidate in [asset_refs.get("hero"), asset_refs.get("cover"), *screenshots, asset_refs.get("icon")]:
                candidate = str(candidate or "").strip()
                if candidate and candidate not in artwork_paths:
                    artwork_paths.append(candidate)
            artwork_urls = [f"/api/v1/store/asset?path={urllib.parse.quote(path, safe='')}" for path in artwork_paths[:8]]
            game_artwork_json = json.dumps(artwork_urls)
            injection = (
                f'<base href="{runtime_base}">\n'
                + (
                    r'''<script data-para-runtime>
(() => {
  const BASE = __PARA_BASE__;
  const RUNTIME_ID = __PARA_RUNTIME_ID__;
  const GAME_TITLE = __PARA_GAME_TITLE__;
  const PROJECT_ID = __PARA_PROJECT_ID__;
  const GAME_ARTWORK = __PARA_GAME_ARTWORK__;
  const GAME_RETURN_TRANSITION_KEY = 'para.game.transition.return';
  let paraGameTransitionLeaving = false;
  let gameSuspended = false;
  let gameClosing = false;
  let suspendShellHost = null;
  let paraGameDocumentTitle = GAME_TITLE;

  function rememberGameDocumentTitle() {
    const current = String(document.title || '').trim();
    if (current && current !== 'PARA Home') paraGameDocumentTitle = current;
    else if (!paraGameDocumentTitle) paraGameDocumentTitle = GAME_TITLE;
    return paraGameDocumentTitle;
  }

  function showParaHomeTabTitle() {
    try { rememberGameDocumentTitle(); document.title = 'PARA Home'; } catch (_) {}
  }

  function restoreGameTabTitle() {
    try { document.title = paraGameDocumentTitle || GAME_TITLE || 'PARA Game'; } catch (_) {}
  }
  const suspendedMediaState = new Map();
  const suspendedAudioContextState = new Map();
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  let paraFrameSequence = 1;
  const paraFrameRecords = new Map();

  // Keep the game JavaScript heap alive while PARA Home is open, but gate
  // requestAnimationFrame callbacks so the normal browser game loop actually
  // pauses instead of continuing behind Home. The queued frame is released
  // when the user resumes the title.
  window.requestAnimationFrame = (callback) => {
    const id = paraFrameSequence++;
    const record = { callback, nativeId: 0, waiting: false, cancelled: false, tick: null };
    record.tick = (time) => {
      if (record.cancelled) return;
      if (gameSuspended) {
        record.waiting = true;
        record.nativeId = 0;
        return;
      }
      paraFrameRecords.delete(id);
      callback(time);
    };
    record.nativeId = nativeRequestAnimationFrame(record.tick);
    paraFrameRecords.set(id, record);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const record = paraFrameRecords.get(id);
    if (!record) return;
    record.cancelled = true;
    if (record.nativeId) nativeCancelAnimationFrame(record.nativeId);
    paraFrameRecords.delete(id);
  };
  function releaseSuspendedFrames() {
    for (const record of paraFrameRecords.values()) {
      if (record.cancelled || !record.waiting || record.nativeId) continue;
      record.waiting = false;
      record.nativeId = nativeRequestAnimationFrame(record.tick);
    }
  }

  const transitionStyle = document.createElement('style');
  transitionStyle.dataset.paraGameTransition = 'true';
  transitionStyle.textContent = `
    .para-game-page-transition{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#030207;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;overflow:hidden;transition:opacity .28s ease}
    .para-game-page-transition::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 48%,rgba(124,54,235,.2),transparent 28%),radial-gradient(circle at 50% 50%,rgba(96,28,188,.08),transparent 54%),#030207;transform:scale(1.035);transition:transform .62s cubic-bezier(.2,.86,.24,1)}
    .para-game-page-transition .para-game-page-transition__slides{position:absolute;inset:0;z-index:0}
    .para-game-page-transition .para-game-page-transition__slides img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.035);transition:opacity .55s ease,transform 2.4s ease}
    .para-game-page-transition .para-game-page-transition__slides img.is-active{opacity:.56;transform:scale(1)}
    .para-game-page-transition .para-game-page-transition__shade{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(3,2,7,.28),rgba(3,2,7,.72)),radial-gradient(circle at 50% 50%,transparent 0,rgba(3,2,7,.55) 72%)}
    .para-game-page-transition>div:not(.para-game-page-transition__slides):not(.para-game-page-transition__shade){position:relative;z-index:2;display:grid;justify-items:center;gap:9px;text-align:center;opacity:0;transform:translateY(12px) scale(.985);transition:opacity .24s ease .08s,transform .42s cubic-bezier(.2,.86,.24,1) .04s}
    .para-game-page-transition b{width:46px;height:46px;display:grid;place-items:center;border:2px solid rgba(184,133,255,.38);border-top-color:#b66fff;border-radius:50%;box-shadow:0 0 26px rgba(142,74,255,.18);animation:paraGameSpin .9s linear infinite}
    .para-game-page-transition span{color:#aaa0b7;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    .para-game-page-transition strong{max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(20px,2.3vw,32px);letter-spacing:-.03em}
    .para-game-page-transition.is-visible{opacity:1;pointer-events:all}.para-game-page-transition.is-visible::before{transform:scale(1)}.para-game-page-transition.is-visible>div:not(.para-game-page-transition__slides):not(.para-game-page-transition__shade){opacity:1;transform:none}
    .para-game-page-transition.is-revealing{opacity:0;pointer-events:none}.para-game-page-transition.is-revealing>div:not(.para-game-page-transition__slides):not(.para-game-page-transition__shade){opacity:0;transform:translateY(-8px) scale(1.01)}
    @keyframes paraGameSpin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.para-game-page-transition,.para-game-page-transition::before,.para-game-page-transition>div{transition-duration:.001ms!important}.para-game-page-transition b{animation:none!important}}
  `;
  document.documentElement.appendChild(transitionStyle);

  function createGamePageTransition(label, title = GAME_TITLE) {
    const node = document.createElement('div');
    node.className = 'para-game-page-transition';
    node.setAttribute('role', 'status');
    if (Array.isArray(GAME_ARTWORK) && GAME_ARTWORK.length) {
      const slides = document.createElement('div');
      slides.className = 'para-game-page-transition__slides';
      GAME_ARTWORK.slice(0, 8).forEach((url, index) => {
        const image = document.createElement('img');
        image.src = url;
        image.alt = '';
        if (index === 0) image.classList.add('is-active');
        slides.append(image);
      });
      node.append(slides);
      const shade = document.createElement('div');
      shade.className = 'para-game-page-transition__shade';
      node.append(shade);
      if (GAME_ARTWORK.length > 1) {
        let index = 0;
        node.__paraArtworkTimer = setInterval(() => {
          const images = [...slides.querySelectorAll('img')];
          images[index]?.classList.remove('is-active');
          index = (index + 1) % images.length;
          images[index]?.classList.add('is-active');
        }, 1200);
      }
    }
    const content = document.createElement('div');
    const spinner = document.createElement('b');
    spinner.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.textContent = label;
    const heading = document.createElement('strong');
    heading.textContent = title || 'PARA Game';
    content.append(spinner, caption, heading);
    node.append(content);
    (document.body || document.documentElement).append(node);
    return node;
  }

  function revealGameAfterLaunch() {
    const node = createGamePageTransition('Launching');
    node.classList.add('is-visible');
    nativeRequestAnimationFrame(() => nativeRequestAnimationFrame(() => node.classList.add('is-revealing')));
    setTimeout(() => node.remove(), 620);
  }

  function suspendedShellSource(destination = '/#/home') {
    const hash = String(destination || '/#/home').startsWith('/#') ? String(destination).slice(1) : '#/home';
    return `/?para_suspended_shell=1&para_suspended_game=${encodeURIComponent(RUNTIME_ID)}${hash}`;
  }

  function pauseGameMedia() {
    suspendedMediaState.clear();
    for (const media of document.querySelectorAll('audio,video')) {
      try {
        suspendedMediaState.set(media, { wasPlaying: !media.paused });
        if (!media.paused) media.pause();
      } catch (_) {}
    }
    suspendedAudioContextState.clear();
    try {
      for (const destination of audioCaptureDestinations) {
        const context = destination?.context;
        if (!context || suspendedAudioContextState.has(context)) continue;
        suspendedAudioContextState.set(context, context.state);
        if (context.state === 'running') void context.suspend?.();
      }
    } catch (_) {}
  }

  function resumeGameMedia() {
    for (const [media, state] of suspendedMediaState) {
      try { if (state.wasPlaying) void media.play(); } catch (_) {}
    }
    suspendedMediaState.clear();
    for (const [context, state] of suspendedAudioContextState) {
      try { if (state === 'running' && context.state === 'suspended') void context.resume?.(); } catch (_) {}
    }
    suspendedAudioContextState.clear();
  }

  function createSuspendShell(destination = '/#/home') {
    suspendShellHost?.remove();
    const host = document.createElement('div');
    host.id = 'para-suspended-home-shell';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:#030207;opacity:0;transition:opacity .22s ease;';
    const frame = document.createElement('iframe');
    frame.title = 'PARA Home';
    frame.src = suspendedShellSource(destination);
    frame.allow = 'autoplay; fullscreen; clipboard-read; clipboard-write';
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#030207;';
    host.append(frame);
    document.documentElement.append(host);
    suspendShellHost = host;
    frame.addEventListener('load', () => {
      nativeRequestAnimationFrame(() => {
        if (suspendShellHost !== host) return;
        host.style.opacity = '1';
        try { frame.contentWindow?.focus(); } catch (_) {}
      });
    }, { once: true });
    return host;
  }

  function suspendGame(destination = '/#/home') {
    if (gameSuspended) {
      showParaHomeTabTitle();
      const frame = suspendShellHost?.querySelector('iframe');
      if (frame) frame.src = suspendedShellSource(destination);
      return;
    }
    showParaHomeTabTitle();
    closeShell?.();
    try { recordGameActivity(); } catch (_) {}
    gameSuspended = true;
    try { document.body && (document.body.inert = true); } catch (_) {}
    pauseGameMedia();
    try { recordGameActivity(); } catch (_) {}
    const node = createGamePageTransition('Suspending');
    nativeRequestAnimationFrame(() => node.classList.add('is-visible'));
    const host = createSuspendShell(destination);
    setTimeout(() => {
      if (suspendShellHost !== host) return;
      host.style.opacity = '1';
      node.classList.add('is-revealing');
      setTimeout(() => node.remove(), 360);
    }, 360);
  }

  function resumeSuspendedGame() {
    if (!gameSuspended) return;
    restoreGameTabTitle();
    const node = createGamePageTransition('Resuming');
    node.classList.add('is-visible');
    nativeRequestAnimationFrame(() => nativeRequestAnimationFrame(() => {
      suspendShellHost?.remove();
      suspendShellHost = null;
      try { document.body && (document.body.inert = false); } catch (_) {}
      try { recordGameActivity(); } catch (_) {}
      gameSuspended = false;
      releaseSuspendedFrames();
      resumeGameMedia();
      try { recordGameActivity(); } catch (_) {}
      try { window.focus(); } catch (_) {}
      node.classList.add('is-revealing');
      setTimeout(() => node.remove(), 520);
    }));
  }

  function closeGameRuntime() {
    try {
      const state = JSON.parse(localStorage.getItem('para.home.state.v5') || '{}');
      const profile = state.activeProfile || state.setupChoices?.profileName || 'P1';
      const profileRuntime = { ...(state.profileRuntime || {}) };
      const runtime = { recent: [], running: [], ...(profileRuntime[profile] || {}) };
      runtime.running = (runtime.running || []).filter((item) => item.id !== `store:${RUNTIME_ID}`);
      runtime.recent = (runtime.recent || []).map((item) => item.id === `store:${RUNTIME_ID}` ? { ...item, queueStatus: 'Closed', suspendedAt: null } : item);
      profileRuntime[profile] = runtime;
      state.profileRuntime = profileRuntime;
      localStorage.setItem('para.home.state.v5', JSON.stringify(state));
    } catch (_) {}
  }

  function closeSuspendedGame(destination = '/#/home') {
    if (paraGameTransitionLeaving) return;
    paraGameTransitionLeaving = true;
    gameClosing = true;
    showParaHomeTabTitle();
    closeGameRuntime();
    try { sessionStorage.setItem(GAME_RETURN_TRANSITION_KEY, JSON.stringify({ title: GAME_TITLE, at: Date.now() })); } catch (_) {}
    const node = createGamePageTransition('Closing Game');
    node.classList.add('is-visible');
    setTimeout(() => { location.href = destination; }, 430);
  }

  function switchSuspendedGame(storeId) {
    const id = String(storeId || '').trim();
    if (!id) return;
    if (id === String(RUNTIME_ID)) return resumeSuspendedGame();
    if (paraGameTransitionLeaving) return;
    paraGameTransitionLeaving = true;
    gameClosing = true;
    try { document.title = 'PARA'; } catch (_) {}
    closeGameRuntime();
    const node = createGamePageTransition('Switching Games');
    node.classList.add('is-visible');
    const next = `/api/v1/store/content/${encodeURIComponent(id)}/index.html?para_game_mode=1&para_build=v25`;
    setTimeout(() => { location.href = next; }, 430);
  }

  function leaveGame(destination = '/#/home') {
    suspendGame(destination);
  }

  function runShellPowerAction(command) {
    closeShell?.();
    suspendGame('/#/power');
    const frame = suspendShellHost?.querySelector('iframe');
    if (!frame) return;
    const send = () => {
      try {
        frame.contentWindow?.postMessage({ type: 'para-shell-power-command', command }, location.origin);
      } catch (_) {}
    };
    frame.addEventListener('load', () => setTimeout(send, 80), { once: true });
  }

  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== suspendShellHost?.querySelector('iframe')?.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'para-suspended-power-complete') {
      if (data.action === 'reboot') {
        closeGameRuntime();
        try { sessionStorage.setItem('para.restart.sequence', '1'); } catch (_) {}
        location.replace('/#/intro');
      } else if (data.action === 'poweroff') {
        closeGameRuntime();
        gameClosing = true;
      }
      return;
    }
    if (data.type !== 'para-suspended-game-command') return;
    if (data.command === 'resume') return resumeSuspendedGame();
    if (data.command === 'close') return closeSuspendedGame('/#/home');
    if (data.command === 'launch') return switchSuspendedGame(data.storeId);
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => { rememberGameDocumentTitle(); revealGameAfterLaunch(); }, { once: true });
  else { rememberGameDocumentTitle(); revealGameAfterLaunch(); }

  const map = (value) => {
    if (typeof value !== 'string') return value;
    if (value === '/') return BASE;
    if (value.startsWith('/') && !value.startsWith('/api/')) return BASE + value.replace(/^\/+/, '');
    return value;
  };

  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) window.fetch = (input, init) => nativeFetch(typeof input === 'string' ? map(input) : input, init);
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) { return nativeOpen.call(this, method, map(url), ...rest); };
  for (const method of ['pushState', 'replaceState']) {
    const native = history[method].bind(history);
    history[method] = (state, unused, url) => native(state, unused, map(url));
  }
  const nativeWindowOpen = window.open?.bind(window);
  if (nativeWindowOpen) window.open = (url, ...rest) => nativeWindowOpen(map(url), ...rest);

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (raw && raw.startsWith('/') && !raw.startsWith('/api/')) anchor.setAttribute('href', map(raw));
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const raw = form.getAttribute('action');
    if (raw && raw.startsWith('/') && !raw.startsWith('/api/')) form.setAttribute('action', map(raw));
  }, true);

  try { parent.postMessage({ type: 'para-game-runtime-ready', id: RUNTIME_ID }, location.origin); } catch (_) {}

  const DB_NAME = 'para-media-gallery';
  const DB_STORE = 'captures';
  let shellOpen = false;
  let contextName = '';
  let manualRecording = null;
  let replay = null;
  let gamepadPrevious = [];
  let paraPressedAt = 0;
  let paraHeld = false;
  let keyboardParaDown = false;
  let keyboardParaHeld = false;
  let keyboardParaTimer = 0;
  let focusedIndex = 0;
  let inputMaskInstalled = false;
  const HOME_STATE_KEY = 'para.home.state.v5';
  const GAME_ACTIVITY_ID = `store:${RUNTIME_ID}`;
  const gameSessionStartedAt = Date.now();
  const mirroredAudioNodes = new WeakSet();
  const audioCaptureDestinations = new Set();
  const maskedPadCache = new Map();

  function escapeMarkup(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function readHomeState() {
    try { return JSON.parse(localStorage.getItem(HOME_STATE_KEY) || '{}'); } catch (_) { return {}; }
  }

  function readProfileRuntime() {
    const state = readHomeState();
    const profile = state.activeProfile || state.setupChoices?.profileName || 'P1';
    return { recent: [], running: [], installedDemos: [], downloads: [], notifications: [], marks: [], achievements: [], ...(state.profileRuntime?.[profile] || {}) };
  }

  const ACHIEVEMENT_CACHE_KEY = `para.achievement.definitions:${RUNTIME_ID}`;
  let achievementDefinitionsPromise = null;

  async function loadAchievementDefinitions(force = false) {
    if (!force && achievementDefinitionsPromise) return achievementDefinitionsPromise;
    achievementDefinitionsPromise = (async () => {
      try {
        const response = await fetch(`/api/v1/store/achievements?id=${encodeURIComponent(RUNTIME_ID)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || `Achievement service returned ${response.status}`);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        try { sessionStorage.setItem(ACHIEVEMENT_CACHE_KEY, JSON.stringify(items)); } catch (_) {}
        seedAchievementCatalog(items);
        return items;
      } catch (error) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(ACHIEVEMENT_CACHE_KEY) || '[]');
          if (Array.isArray(cached) && cached.length) {
            seedAchievementCatalog(cached);
            return cached;
          }
        } catch (_) {}
        throw error;
      }
    })();
    try { return await achievementDefinitionsPromise; }
    catch (error) { achievementDefinitionsPromise = null; throw error; }
  }

  function seedAchievementCatalog(definitions) {
    if (!Array.isArray(definitions) || !definitions.length) return;
    const published = definitions.filter((definition) => definition && definition.status === 'PUBLISHED');
    if (!published.length) return;
    const state = readHomeState();
    const profile = state.activeProfile || state.setupChoices?.profileName || 'P1';
    const profileRuntime = { ...(state.profileRuntime || {}) };
    const runtime = {
      recent: [], running: [], installedDemos: [], downloads: [], notifications: [], marks: [], achievements: [],
      creator: { note: '', drawing: '' }, saveData: [],
      ...(profileRuntime[profile] || {})
    };
    const current = Array.isArray(runtime.achievements) ? runtime.achievements : [];
    let changed = false;
    const next = [...current];
    for (const definition of published) {
      const achievementId = `achievement:${PROJECT_ID || RUNTIME_ID}:${definition.achievement_key}`;
      if (next.some((item) => item.id === achievementId)) continue;
      next.push({
        id: achievementId,
        achievementId: definition.id,
        projectId: definition.project_id || PROJECT_ID,
        storeId: RUNTIME_ID,
        key: definition.achievement_key,
        name: definition.name,
        description: definition.description || '',
        points: Number(definition.points || 0),
        kind: definition.kind || 'BINARY',
        target: Math.max(1, Number(definition.target_value || 1)),
        hidden: Boolean(definition.hidden),
        iconUrl: definition.icon_url || '',
        progress: 0,
        unlockedAt: null,
        updatedAt: Date.now(),
        syncState: 'local'
      });
      changed = true;
    }
    if (!changed) return;
    runtime.achievements = next;
    profileRuntime[profile] = runtime;
    state.profileRuntime = profileRuntime;
    try { localStorage.setItem(HOME_STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function saveLocalAchievement(definition, requestedProgress, syncState = 'local', cloudRecord = null) {
    const state = readHomeState();
    const profile = state.activeProfile || state.setupChoices?.profileName || 'P1';
    const profileRuntime = { ...(state.profileRuntime || {}) };
    const runtime = {
      recent: [], running: [], installedDemos: [], downloads: [], notifications: [], marks: [], achievements: [],
      creator: { note: '', drawing: '' }, saveData: [],
      ...(profileRuntime[profile] || {})
    };
    const achievementId = `achievement:${PROJECT_ID || RUNTIME_ID}:${definition.achievement_key}`;
    const existing = (runtime.achievements || []).find((item) => item.id === achievementId) || {};
    const target = Math.max(1, Number(definition.target_value || 1));
    const previousProgress = Math.max(0, Number(existing.progress || 0));
    const requested = definition.kind === 'BINARY' ? 1 : Math.max(0, Number(requestedProgress || 0));
    const progress = Math.min(target, Math.max(previousProgress, requested));
    const unlocked = progress >= target;
    const cloudUnlockedAt = cloudRecord?.unlocked_at ? Date.parse(String(cloudRecord.unlocked_at)) : NaN;
    const authoritativeUnlockedAt = Number.isFinite(cloudUnlockedAt) ? cloudUnlockedAt : null;
    const newlyUnlocked = unlocked && !existing.unlockedAt;
    const now = Date.now();
    const record = {
      ...existing,
      id: achievementId,
      achievementId: definition.id,
      projectId: definition.project_id || PROJECT_ID,
      storeId: RUNTIME_ID,
      key: definition.achievement_key,
      name: definition.name,
      description: definition.description || '',
      points: Number(definition.points || 0),
      kind: definition.kind || 'BINARY',
      target,
      hidden: Boolean(definition.hidden),
      iconUrl: definition.icon_url || '',
      progress,
      unlockedAt: existing.unlockedAt || authoritativeUnlockedAt || (unlocked ? now : null),
      updatedAt: now,
      syncState
    };
    runtime.achievements = [record, ...(runtime.achievements || []).filter((item) => item.id !== achievementId)];
    if (newlyUnlocked) {
      runtime.notifications = [{ id: `achievement-unlocked:${achievementId}:${now}`, title: `Achievement unlocked · ${definition.name}`, createdAt: now, route: 'achievements' }, ...(runtime.notifications || [])].slice(0, 20);
    }
    profileRuntime[profile] = runtime;
    state.profileRuntime = profileRuntime;
    localStorage.setItem(HOME_STATE_KEY, JSON.stringify(state));
    if (newlyUnlocked) {
      try { showAchievementToast(record); } catch (_) {}
      try { document.dispatchEvent(new CustomEvent('para-achievementearned', { detail: record })); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('para-achievementearned', { detail: record })); } catch (_) {}
      try { window.parent?.postMessage?.({ type: 'para-achievementearned', detail: record }, location.origin); } catch (_) {}
    }
    return { ...record, unlocked, newlyUnlocked };
  }

  async function setAchievementProgress(key, value) {
    const achievementKey = String(key || '').trim();
    if (!achievementKey) throw new Error('Achievement key is required.');
    const definitions = await loadAchievementDefinitions();
    const definition = definitions.find((item) => item.achievement_key === achievementKey && item.status === 'PUBLISHED');
    if (!definition) throw new Error(`Achievement “${achievementKey}” is not published for this game.`);

    const requested = definition.kind === 'BINARY' ? 1 : Math.max(0, Number(value || 0));
    const local = saveLocalAchievement(definition, requested, PROJECT_ID ? 'pending' : 'local');
    if (!PROJECT_ID) return local;

    try {
      const endpoint = definition.kind === 'BINARY' ? '/api/v1/achievements/unlock' : '/api/v1/achievements/progress';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: PROJECT_ID, achievement_key: achievementKey, progress: requested })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallbackState = response.status === 401 ? 'local' : 'pending';
        return saveLocalAchievement(definition, local.progress, fallbackState);
      }
      const cloud = payload?.achievement || {};
      const record = saveLocalAchievement(definition, Number(cloud.progress ?? requested), 'cloud', cloud);
      return { ...record, online: true };
    } catch (_) {
      return local;
    }
  }

  const PARA_ACHIEVEMENT_QUEUE_KEY = '__PARA_ACHIEVEMENT_QUEUE__';

  async function processAchievementRequest(request) {
    if (!request || typeof request !== 'object') return null;
    const key = String(request.key || '').trim();
    if (!key) return null;
    const mode = request.mode === 'progress' ? 'progress' : 'unlock';
    const value = mode === 'progress' ? Number(request.value || 0) : 1;
    return setAchievementProgress(key, value);
  }

  function queueAchievementRequest(request) {
    const queue = Array.isArray(window[PARA_ACHIEVEMENT_QUEUE_KEY]) ? window[PARA_ACHIEVEMENT_QUEUE_KEY] : [];
    queue.push(request);
    window[PARA_ACHIEVEMENT_QUEUE_KEY] = queue.slice(-100);
  }

  async function drainAchievementRequests() {
    const queue = Array.isArray(window[PARA_ACHIEVEMENT_QUEUE_KEY]) ? [...window[PARA_ACHIEVEMENT_QUEUE_KEY]] : [];
    window[PARA_ACHIEVEMENT_QUEUE_KEY] = [];
    for (const request of queue) {
      try { await processAchievementRequest(request); }
      catch (_) { queueAchievementRequest(request); }
    }
  }

  const paraSdk = window.PARA && typeof window.PARA === 'object' ? window.PARA : {};
  paraSdk.achievements = {
    unlock: (key) => setAchievementProgress(key, 1),
    setProgress: (key, value) => setAchievementProgress(key, value),
    definitions: () => loadAchievementDefinitions(),
    status: () => ({ storeId: RUNTIME_ID, projectId: PROJECT_ID, queued: Array.isArray(window[PARA_ACHIEVEMENT_QUEUE_KEY]) ? window[PARA_ACHIEVEMENT_QUEUE_KEY].length : 0 }),
  };
  window.PARA = paraSdk;

  window.addEventListener('para-achievement-request', (event) => {
    const detail = event?.detail || {};
    void processAchievementRequest(detail).catch(() => queueAchievementRequest(detail));
  });

  void loadAchievementDefinitions()
    .then(() => drainAchievementRequests())
    .catch(() => {});

  // Achievement tracking must exist even when the game document is rendered in
  // a same-origin frame. Only the heavyweight console/capture shell is top-level.
  if (window.top !== window.self) return;

  function recordGameActivity() {
    if (gameClosing) return;
    try {
      const state = JSON.parse(localStorage.getItem(HOME_STATE_KEY) || '{}');
      const profile = state.activeProfile || state.setupChoices?.profileName || 'P1';
      const profileRuntime = { ...(state.profileRuntime || {}) };
      const runtime = {
        recent: [], running: [], installedDemos: [], downloads: [], notifications: [], marks: [],
        creator: { note: '', drawing: '' }, saveData: [],
        ...(profileRuntime[profile] || {})
      };
      const now = Date.now();
      const previous = (runtime.recent || []).find((item) => item.id === GAME_ACTIVITY_ID) || {};
      const checkpoint = Number(previous.sessionStartedAt) === gameSessionStartedAt ? Number(previous.lastSessionCheckpoint || gameSessionStartedAt) : gameSessionStartedAt;
      const activeDelta = gameSuspended ? 0 : Math.max(0, now - checkpoint);
      const entry = {
        ...previous,
        id: GAME_ACTIVITY_ID,
        storeId: RUNTIME_ID,
        projectId: PROJECT_ID,
        artwork: Array.isArray(GAME_ARTWORK) ? GAME_ARTWORK[0] || previous.artwork || '' : previous.artwork || '',
        title: GAME_TITLE,
        route: 'games',
        kind: 'Game',
        platform: 'PARA',
        accent: previous.accent || '#985dff',
        mark: previous.mark || (GAME_TITLE.trim().slice(0, 1).toUpperCase() || 'P'),
        lastOpened: now,
        queuedAt: now,
        queueStatus: gameSuspended ? 'Suspended' : 'Running',
        suspendedAt: gameSuspended ? (previous.suspendedAt || now) : null,
        sessionStartedAt: gameSessionStartedAt,
        playTimeMs: Number(previous.playTimeMs || 0) + activeDelta,
        lastSessionCheckpoint: now
      };
      runtime.recent = [entry, ...(runtime.recent || []).filter((item) => item.id !== GAME_ACTIVITY_ID)].slice(0, 10);
      runtime.running = [entry, ...(runtime.running || []).filter((item) => item.id !== GAME_ACTIVITY_ID)].slice(0, 6);
      profileRuntime[profile] = runtime;
      state.profileRuntime = profileRuntime;
      localStorage.setItem(HOME_STATE_KEY, JSON.stringify(state));
      sessionStorage.setItem('para.store.lastPlayed', RUNTIME_ID);
    } catch (_) {}
  }

  recordGameActivity();
  const activityTimer = setInterval(recordGameActivity, 30000);
  addEventListener('pagehide', () => {
    recordGameActivity();
    clearInterval(activityTimer);
  }, { once: true });

  // Mirror WebAudio into a capture stream before the game scripts initialize.
  try {
    const nativeAudioConnect = globalThis.AudioNode?.prototype?.connect;
    if (nativeAudioConnect) {
      globalThis.AudioNode.prototype.connect = function(destination, ...rest) {
        const result = nativeAudioConnect.call(this, destination, ...rest);
        try {
          if (this.context && destination === this.context.destination && !mirroredAudioNodes.has(this)) {
            let mirror = this.context.__paraCaptureDestination;
            if (!mirror) {
              mirror = this.context.createMediaStreamDestination();
              Object.defineProperty(this.context, '__paraCaptureDestination', { value: mirror });
              audioCaptureDestinations.add(mirror);
            }
            nativeAudioConnect.call(this, mirror);
            mirroredAudioNodes.add(this);
          }
        } catch (_) {}
        return result;
      };
    }
  } catch (_) {}

  const nativeGetGamepads = navigator.getGamepads?.bind(navigator);
  function installGamepadMask() {
    if (!nativeGetGamepads || inputMaskInstalled) return;
    try {
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => {
          const pads = [...(nativeGetGamepads() || [])];
          if (!shellOpen && !gameSuspended) return pads;
          return pads.map((pad) => {
            if (!pad) return pad;
            if (maskedPadCache.has(pad.index)) return maskedPadCache.get(pad.index);
            const neutralButtons = pad.buttons.map(() => ({ pressed: false, touched: false, value: 0 }));
            const neutralAxes = pad.axes.map(() => 0);
            const proxy = new Proxy(pad, {
              get(target, prop) {
                if (prop === 'buttons') return neutralButtons;
                if (prop === 'axes') return neutralAxes;
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
              }
            });
            maskedPadCache.set(pad.index, proxy);
            return proxy;
          });
        }
      });
      inputMaskInstalled = true;
    } catch (_) {}
  }
  installGamepadMask();

  // ===================== PARA INPUT V2 =====================
  // Controller-to-keyboard/mouse compatibility for web games. V2 fixes the
  // first version's edge-clamped aiming, hard deadzone jump, frame-rate based
  // pointer speed, and manual-enable/native-gamepad conflict.
  const PARA_INPUT_STORAGE_KEY = 'para.input.v2';
  const PARA_INPUT_LEGACY_STORAGE_KEY = 'para.input.v1';
  const PARA_INPUT_DEFAULTS = {
    version: 2,
    enabled: true,
    automaticWebGames: false,
    leftDeadzone: 0.22,
    rightDeadzone: 0.14,
    triggerThreshold: 0.28,
    pointerSpeed: 900,
    pointerCurve: 1.65,
    pointerAcceleration: 0.45,
    rightStickMode: 'relative',
    invertY: false,
    bindings: {
      left_up: 'KeyW', left_down: 'KeyS', left_left: 'KeyA', left_right: 'KeyD',
      button_0: 'Space', button_1: 'KeyC', button_2: 'KeyE', button_3: 'KeyR',
      button_4: 'KeyQ', button_5: 'KeyF', button_6: 'Mouse2', button_7: 'Mouse0',
      button_8: 'Tab', button_9: 'Escape', button_10: 'ShiftLeft', button_11: 'ControlLeft',
      button_12: 'ArrowUp', button_13: 'ArrowDown', button_14: 'ArrowLeft', button_15: 'ArrowRight'
    },
    games: {}
  };
  const PARA_INPUT_KEYS = {
    KeyW:['w','KeyW',87], KeyA:['a','KeyA',65], KeyS:['s','KeyS',83], KeyD:['d','KeyD',68],
    Space:[' ','Space',32], Escape:['Escape','Escape',27], Enter:['Enter','Enter',13], Tab:['Tab','Tab',9],
    ShiftLeft:['Shift','ShiftLeft',16], ControlLeft:['Control','ControlLeft',17], AltLeft:['Alt','AltLeft',18],
    KeyE:['e','KeyE',69], KeyF:['f','KeyF',70], KeyQ:['q','KeyQ',81], KeyR:['r','KeyR',82],
    KeyC:['c','KeyC',67], KeyV:['v','KeyV',86], KeyX:['x','KeyX',88], KeyZ:['z','KeyZ',90],
    KeyM:['m','KeyM',77], KeyI:['i','KeyI',73],
    Digit1:['1','Digit1',49], Digit2:['2','Digit2',50], Digit3:['3','Digit3',51], Digit4:['4','Digit4',52], Digit5:['5','Digit5',53],
    ArrowUp:['ArrowUp','ArrowUp',38], ArrowDown:['ArrowDown','ArrowDown',40], ArrowLeft:['ArrowLeft','ArrowLeft',37], ArrowRight:['ArrowRight','ArrowRight',39]
  };
  let paraInputGameUsesGamepad = false;
  let paraInputPreviousOutputs = new Set();
  let paraInputPointerX = Math.max(0, innerWidth / 2);
  let paraInputPointerY = Math.max(0, innerHeight / 2);
  let paraInputMouseButtons = 0;
  let paraInputLastTickAt = performance.now();
  let paraInputMoveLatch = { left:false, right:false, up:false, down:false };

  const paraInputGameVisibleGetGamepads = navigator.getGamepads?.bind(navigator);
  if (paraInputGameVisibleGetGamepads) {
    try {
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => {
          paraInputGameUsesGamepad = true;
          return paraInputGameVisibleGetGamepads();
        }
      });
    } catch (_) {}
  }

  function paraInputClamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function paraInputSettings() {
    let stored = {};
    try {
      const v2 = localStorage.getItem(PARA_INPUT_STORAGE_KEY);
      const raw = v2 || localStorage.getItem(PARA_INPUT_LEGACY_STORAGE_KEY) || '{}';
      stored = JSON.parse(raw) || {};
    } catch (_) {}
    const isV2 = Number(stored.version || 0) >= 2;
    const merged = {
      ...PARA_INPUT_DEFAULTS,
      ...stored,
      version: 2,
      pointerSpeed: isV2 ? stored.pointerSpeed : PARA_INPUT_DEFAULTS.pointerSpeed,
      bindings: { ...PARA_INPUT_DEFAULTS.bindings, ...(stored.bindings || {}) },
      games: stored.games && typeof stored.games === 'object' ? stored.games : {}
    };
    const gameOverride = merged.games?.[RUNTIME_ID];
    const manualOverride = typeof gameOverride?.enabled === 'boolean';
    const effective = gameOverride && typeof gameOverride === 'object' ? {
      ...merged,
      ...gameOverride,
      bindings: { ...merged.bindings, ...(gameOverride.bindings || {}) },
      games: merged.games
    } : merged;
    return {
      ...effective,
      requested: manualOverride ? gameOverride.enabled : Boolean(merged.automaticWebGames),
      forced: Boolean(manualOverride && gameOverride.enabled),
      leftDeadzone: paraInputClamp(effective.leftDeadzone ?? effective.deadzone, .10, .55, .22),
      rightDeadzone: paraInputClamp(effective.rightDeadzone ?? effective.deadzone, .06, .45, .14),
      triggerThreshold: paraInputClamp(effective.triggerThreshold, .08, .80, .28),
      pointerSpeed: paraInputClamp(effective.pointerSpeed, 250, 2200, 900),
      pointerCurve: paraInputClamp(effective.pointerCurve, .75, 2.75, 1.65),
      pointerAcceleration: paraInputClamp(effective.pointerAcceleration, 0, 1.5, .45),
      rightStickMode: effective.rightStickMode === 'cursor' ? 'cursor' : 'relative'
    };
  }

  function paraInputActive(settings = paraInputSettings()) {
    return Boolean(settings.enabled && settings.requested && (settings.forced || !paraInputGameUsesGamepad) && !shellOpen && !gameSuspended && !gameClosing);
  }

  function paraInputGameTarget(x = paraInputPointerX, y = paraInputPointerY) {
    return document.pointerLockElement || document.elementFromPoint?.(x, y) || document.querySelector('canvas') || document.activeElement || document.body || document.documentElement;
  }

  function paraInputDispatchKey(code, down) {
    const meta = PARA_INPUT_KEYS[code];
    if (!meta) return;
    const target = document.activeElement || document.querySelector('canvas') || document.body || document.documentElement;
    try {
      const event = new KeyboardEvent(down ? 'keydown' : 'keyup', {
        key: meta[0], code: meta[1], bubbles: true, cancelable: true, composed: true,
        repeat: false, location: code.endsWith('Left') ? 1 : 0
      });
      try { Object.defineProperty(event, 'keyCode', { get: () => meta[2] }); } catch (_) {}
      try { Object.defineProperty(event, 'which', { get: () => meta[2] }); } catch (_) {}
      target?.dispatchEvent(event);
    } catch (_) {}
  }

  function paraInputDispatchMouseButton(output, down) {
    const button = output === 'Mouse2' ? 2 : output === 'Mouse1' ? 1 : 0;
    const bit = button === 2 ? 2 : button === 1 ? 4 : 1;
    paraInputMouseButtons = down ? (paraInputMouseButtons | bit) : (paraInputMouseButtons & ~bit);
    const target = paraInputGameTarget();
    try {
      target?.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', {
        button, buttons: paraInputMouseButtons, clientX: paraInputPointerX, clientY: paraInputPointerY,
        bubbles: true, cancelable: true, composed: true, view: window
      }));
      if (!down && button === 0) target?.dispatchEvent(new MouseEvent('click', {
        button: 0, buttons: 0, clientX: paraInputPointerX, clientY: paraInputPointerY,
        bubbles: true, cancelable: true, composed: true, view: window
      }));
    } catch (_) {}
  }

  function paraInputDispatchWheel(output) {
    const target = paraInputGameTarget();
    const deltaY = output === 'WheelUp' ? -120 : 120;
    try {
      target?.dispatchEvent(new WheelEvent('wheel', {
        deltaY, deltaMode: 0, clientX: paraInputPointerX, clientY: paraInputPointerY,
        bubbles: true, cancelable: true, composed: true, view: window
      }));
    } catch (_) {}
  }

  function paraInputDispatchOutput(output, down) {
    if (!output || output === 'none') return;
    if (output === 'Mouse0' || output === 'Mouse1' || output === 'Mouse2') paraInputDispatchMouseButton(output, down);
    else if (output === 'WheelUp' || output === 'WheelDown') { if (down) paraInputDispatchWheel(output); }
    else paraInputDispatchKey(output, down);
  }

  function paraInputReleaseAll() {
    for (const output of paraInputPreviousOutputs) paraInputDispatchOutput(output, false);
    paraInputPreviousOutputs.clear();
    paraInputMouseButtons = 0;
    paraInputMoveLatch = { left:false, right:false, up:false, down:false };
  }

  function paraInputCurveStick(rawX, rawY, deadzone, curve) {
    const magnitude = Math.min(1, Math.hypot(rawX, rawY));
    if (magnitude <= deadzone) return { x:0, y:0, strength:0 };
    const normalized = Math.min(1, (magnitude - deadzone) / Math.max(.001, 1 - deadzone));
    const strength = Math.pow(normalized, curve);
    return { x:(rawX / magnitude) * strength, y:(rawY / magnitude) * strength, strength };
  }

  function paraInputDispatchRelativeMove(dx, dy) {
    if (!dx && !dy) return;
    const target = paraInputGameTarget();
    try {
      const event = new MouseEvent('mousemove', {
        clientX: paraInputPointerX, clientY: paraInputPointerY,
        buttons: paraInputMouseButtons, bubbles: true, cancelable: true, composed: true, view: window
      });
      try { Object.defineProperty(event, 'movementX', { get: () => dx }); } catch (_) {}
      try { Object.defineProperty(event, 'movementY', { get: () => dy }); } catch (_) {}
      target?.dispatchEvent(event);
    } catch (_) {}
  }

  function paraInputMovePointer(pad, settings, dt) {
    const rawX = Number(pad.axes?.[2] || 0);
    const sourceY = Number(pad.axes?.[3] || 0);
    const rawY = settings.invertY ? -sourceY : sourceY;
    const stick = paraInputCurveStick(rawX, rawY, settings.rightDeadzone, settings.pointerCurve);
    if (!stick.strength) return;
    const speed = settings.pointerSpeed * (1 + stick.strength * settings.pointerAcceleration);
    const dx = stick.x * speed * dt;
    const dy = stick.y * speed * dt;
    if (settings.rightStickMode === 'relative') {
      paraInputDispatchRelativeMove(dx, dy);
      return;
    }
    const previousX = paraInputPointerX;
    const previousY = paraInputPointerY;
    paraInputPointerX = Math.max(0, Math.min(innerWidth - 1, paraInputPointerX + dx));
    paraInputPointerY = Math.max(0, Math.min(innerHeight - 1, paraInputPointerY + dy));
    const target = paraInputGameTarget();
    try {
      const event = new MouseEvent('mousemove', {
        clientX: paraInputPointerX, clientY: paraInputPointerY,
        buttons: paraInputMouseButtons, bubbles: true, cancelable: true, composed: true, view: window
      });
      try { Object.defineProperty(event, 'movementX', { get: () => paraInputPointerX - previousX }); } catch (_) {}
      try { Object.defineProperty(event, 'movementY', { get: () => paraInputPointerY - previousY }); } catch (_) {}
      target?.dispatchEvent(event);
    } catch (_) {}
  }

  function paraInputUpdateAxisLatch(name, value, negative, settings) {
    const press = settings.leftDeadzone;
    const release = Math.max(.07, press * .68);
    const magnitude = negative ? -value : value;
    paraInputMoveLatch[name] = paraInputMoveLatch[name] ? magnitude >= release : magnitude >= press;
  }

  function paraInputCollectOutputs(pad, settings) {
    const outputs = new Set();
    const bind = (control) => {
      const output = settings.bindings?.[control];
      if (output && output !== 'none') outputs.add(output);
    };
    const x = Number(pad.axes?.[0] || 0);
    const y = Number(pad.axes?.[1] || 0);
    paraInputUpdateAxisLatch('left', x, true, settings);
    paraInputUpdateAxisLatch('right', x, false, settings);
    paraInputUpdateAxisLatch('up', y, true, settings);
    paraInputUpdateAxisLatch('down', y, false, settings);
    if (paraInputMoveLatch.left) bind('left_left');
    if (paraInputMoveLatch.right) bind('left_right');
    if (paraInputMoveLatch.up) bind('left_up');
    if (paraInputMoveLatch.down) bind('left_down');
    for (const index of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]) {
      const button = pad.buttons?.[index];
      const threshold = index === 6 || index === 7 ? settings.triggerThreshold : .45;
      if (button && (button.pressed || Number(button.value || 0) >= threshold)) bind(`button_${index}`);
    }
    return outputs;
  }

  function paraInputTick(now) {
    const dt = Math.max(.001, Math.min(.05, (now - paraInputLastTickAt) / 1000));
    paraInputLastTickAt = now;
    const settings = paraInputSettings();
    if (!paraInputActive(settings)) {
      if (paraInputPreviousOutputs.size) paraInputReleaseAll();
      window.requestAnimationFrame(paraInputTick);
      return;
    }
    const pad = [...(nativeGetGamepads?.() || [])].find(Boolean);
    if (!pad) {
      if (paraInputPreviousOutputs.size) paraInputReleaseAll();
      window.requestAnimationFrame(paraInputTick);
      return;
    }
    paraInputMovePointer(pad, settings, dt);
    const next = paraInputCollectOutputs(pad, settings);
    for (const output of paraInputPreviousOutputs) if (!next.has(output)) paraInputDispatchOutput(output, false);
    for (const output of next) if (!paraInputPreviousOutputs.has(output)) paraInputDispatchOutput(output, true);
    paraInputPreviousOutputs = next;
    window.requestAnimationFrame(paraInputTick);
  }

  window.PARA = window.PARA && typeof window.PARA === 'object' ? window.PARA : {};
  window.PARA.input = {
    status: () => {
      const settings = paraInputSettings();
      return { active: paraInputActive(settings), enabled: Boolean(settings.enabled), requested: Boolean(settings.requested), forced: Boolean(settings.forced), nativeGamepadDetected: paraInputGameUsesGamepad, profile: settings.rightStickMode === 'relative' ? 'Keyboard + Relative Aim' : 'Keyboard + Cursor' };
    },
    enableForThisGame: () => {
      const settings = paraInputSettings();
      settings.games = { ...(settings.games || {}), [RUNTIME_ID]: { ...(settings.games?.[RUNTIME_ID] || {}), enabled: true } };
      localStorage.setItem(PARA_INPUT_STORAGE_KEY, JSON.stringify({ ...settings, version:2 }));
      return true;
    },
    disableForThisGame: () => {
      const settings = paraInputSettings();
      settings.games = { ...(settings.games || {}), [RUNTIME_ID]: { ...(settings.games?.[RUNTIME_ID] || {}), enabled: false } };
      localStorage.setItem(PARA_INPUT_STORAGE_KEY, JSON.stringify({ ...settings, version:2 }));
      paraInputReleaseAll();
      return true;
    },
    configureForThisGame: (patch = {}) => {
      const settings = paraInputSettings();
      const previous = settings.games?.[RUNTIME_ID] || {};
      const next = { ...previous, ...patch, bindings: patch.bindings ? { ...(previous.bindings || {}), ...patch.bindings } : previous.bindings };
      settings.games = { ...(settings.games || {}), [RUNTIME_ID]: next };
      localStorage.setItem(PARA_INPUT_STORAGE_KEY, JSON.stringify({ ...settings, version:2 }));
      return true;
    }
  };
  window.requestAnimationFrame(paraInputTick);

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0, captureMode = '', sourceMimeType = '' }) {
    const db = await openDb();
    const item = {
      id: crypto.randomUUID?.() || `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type, blob, mimeType: blob.type, width, height, durationMs, captureMode,
      createdAt: Date.now(), source: 'PARA', captureVersion: 5,
      ...(type === 'clip' ? {
        playbackVerified: true,
        recorderMimeType: sourceMimeType || 'video/webm',
        sourceMimeType: sourceMimeType || 'video/webm',
        normalized: blob.type === 'video/mp4',
        videoCodec: blob.type === 'video/mp4' ? 'h264' : '',
        audioCodec: blob.type === 'video/mp4' ? 'aac' : '',
      } : {})
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return item;
  }

  function stopStream(stream) {
    try { stream?.__paraCleanup?.(); } catch (_) {}
    if (stream?.__paraKeepAlive) return;
    stream?.getTracks?.().forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
  }

  function captureVisualCandidates() {
    return [...document.querySelectorAll('canvas,video')]
      .map((element, order) => ({ element, order, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
      .filter(({ element, rect, style }) => {
        if (rect.width < 32 || rect.height < 32) return false;
        if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0) return false;
        if (element instanceof HTMLVideoElement && element.readyState < 2) return false;
        return true;
      })
      .sort((a, b) => {
        const za = Number.parseInt(a.style.zIndex, 10);
        const zb = Number.parseInt(b.style.zIndex, 10);
        const safeZa = Number.isFinite(za) ? za : 0;
        const safeZb = Number.isFinite(zb) ? zb : 0;
        return safeZa === safeZb ? a.order - b.order : safeZa - safeZb;
      });
  }

  function captureCanvasCandidates() {
    return captureVisualCandidates()
      .filter(({ element }) => element instanceof HTMLCanvasElement)
      .map(({ element: canvas, rect }) => ({ canvas, rect }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
  }

  function primaryGameCanvas() {
    return captureCanvasCandidates()[0]?.canvas || null;
  }

  function capturedGameAudioTracks() {
    const tracks = [];
    for (const destination of audioCaptureDestinations) {
      for (const track of destination.stream?.getAudioTracks?.() || []) tracks.push(track);
    }
    for (const media of document.querySelectorAll('audio,video')) {
      try {
        const stream = media.captureStream?.();
        for (const track of stream?.getAudioTracks?.() || []) tracks.push(track);
      } catch (_) {}
    }
    return [...new Map(tracks.map((track) => [track.id, track])).values()];
  }

  function directCaptureCandidates() {
    const viewportArea = Math.max(1, (innerWidth || 1) * (innerHeight || 1));
    return captureVisualCandidates()
      .filter(({ element }) => typeof element.captureStream === 'function')
      .map((candidate) => ({
        ...candidate,
        area: Math.max(0, candidate.rect.width * candidate.rect.height),
        viewportCoverage: Math.max(0, candidate.rect.width * candidate.rect.height) / viewportArea,
      }))
      .sort((a, b) => {
        const canvasBiasA = a.element instanceof HTMLCanvasElement ? 1 : 0;
        const canvasBiasB = b.element instanceof HTMLCanvasElement ? 1 : 0;
        if (canvasBiasA !== canvasBiasB) return canvasBiasB - canvasBiasA;
        return b.area - a.area;
      });
  }

  async function requestDirectGameSurfaceStream(audio = false) {
    const candidates = directCaptureCandidates();
    const candidate = candidates.find((item) => item.viewportCoverage >= .18) || candidates[0];
    if (!candidate) throw new Error('PARA found no game surface with a direct capture stream.');

    const { element, rect } = candidate;
    let rawStream;
    try {
      rawStream = element instanceof HTMLCanvasElement ? element.captureStream(30) : element.captureStream();
    } catch (_) {
      throw new Error('The game surface refused direct stream capture.');
    }
    const videoTrack = rawStream?.getVideoTracks?.()[0];
    if (!videoTrack) {
      rawStream?.getTracks?.().forEach((track) => { try { track.stop(); } catch (_) {} });
      throw new Error('The game surface did not expose a video track.');
    }
    try { videoTrack.contentHint = 'motion'; } catch (_) {}

    const tracks = [videoTrack];
    if (audio) {
      const audioTracks = [
        ...(rawStream.getAudioTracks?.() || []),
        ...capturedGameAudioTracks(),
      ].filter((track) => track?.readyState !== 'ended');
      const audioTrack = audioTracks[0];
      if (audioTrack) {
        try { tracks.push(audioTrack === rawStream.getAudioTracks?.()[0] ? audioTrack : audioTrack.clone()); } catch (_) {}
      }
    }

    const stream = new MediaStream(tracks);
    const settings = videoTrack.getSettings?.() || {};
    stream.__paraCaptureWidth = Math.max(2, Number(settings.width || element.videoWidth || element.width || rect.width || innerWidth || 1280));
    stream.__paraCaptureHeight = Math.max(2, Number(settings.height || element.videoHeight || element.height || rect.height || innerHeight || 720));
    stream.__paraCaptureMode = element instanceof HTMLCanvasElement ? 'direct-canvas-stream' : 'direct-video-stream';
    stream.__paraCleanup = () => {
      rawStream?.getTracks?.().forEach((track) => { try { track.stop(); } catch (_) {} });
      tracks.slice(1).forEach((track) => {
        if (!(rawStream?.getTracks?.() || []).includes(track)) { try { track.stop(); } catch (_) {} }
      });
    };
    return stream;
  }

  function canvasHasVisualVariation(canvas) {
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let min = 255;
    let max = 0;
    let sum = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 16) {
      const luma = Math.round(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722);
      min = Math.min(min, luma);
      max = Math.max(max, luma);
      sum += luma;
      samples += 1;
    }
    return { range: max - min, mean: samples ? sum / samples : 0 };
  }

  async function requestCompositedGameStream(audio = false) {
    const layers = captureVisualCandidates();
    if (!layers.length) throw new Error('PARA found no directly capturable game surfaces.');

    const viewportWidth = Math.max(2, innerWidth || document.documentElement.clientWidth || 1280);
    const viewportHeight = Math.max(2, innerHeight || document.documentElement.clientHeight || 720);
    const maxWidth = 1920;
    const maxHeight = 1080;
    const scale = Math.min(1, maxWidth / viewportWidth, maxHeight / viewportHeight);
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = Math.max(2, Math.round(viewportWidth * scale));
    captureCanvas.height = Math.max(2, Math.round(viewportHeight * scale));
    const context2d = captureCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context2d || !captureCanvas.captureStream) throw new Error('PARA could not create the gameplay encoder surface.');

    let frameHandle = 0;
    let stopped = false;
    const paintFrame = () => {
      if (stopped) return;
      const currentLayers = captureVisualCandidates();
      try {
        const bodyBackground = getComputedStyle(document.body || document.documentElement).backgroundColor;
        context2d.fillStyle = bodyBackground && bodyBackground !== 'rgba(0, 0, 0, 0)' ? bodyBackground : '#000';
        context2d.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        const sx = captureCanvas.width / viewportWidth;
        const sy = captureCanvas.height / viewportHeight;
        for (const { element, rect } of currentLayers) {
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(viewportWidth, rect.right);
          const bottom = Math.min(viewportHeight, rect.bottom);
          if (right <= left || bottom <= top) continue;
          const sourceWidth = Number(element.videoWidth || element.width || rect.width) || rect.width;
          const sourceHeight = Number(element.videoHeight || element.height || rect.height) || rect.height;
          const cropLeft = Math.max(0, left - rect.left) / Math.max(1, rect.width) * sourceWidth;
          const cropTop = Math.max(0, top - rect.top) / Math.max(1, rect.height) * sourceHeight;
          const cropWidth = (right - left) / Math.max(1, rect.width) * sourceWidth;
          const cropHeight = (bottom - top) / Math.max(1, rect.height) * sourceHeight;
          context2d.drawImage(element, cropLeft, cropTop, cropWidth, cropHeight, left * sx, top * sy, (right - left) * sx, (bottom - top) * sy);
        }
      } catch (_) {}
      frameHandle = requestAnimationFrame(paintFrame);
    };
    paintFrame();

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let variation;
    try { variation = canvasHasVisualVariation(captureCanvas); }
    catch (_) {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      throw new Error('The game renderer blocks direct frame capture.');
    }
    if (variation && variation.range < 6) {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      throw new Error('The game renderer returned a blank direct-capture surface.');
    }

    let rawStream;
    try { rawStream = captureCanvas.captureStream(30); }
    catch (_) {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      throw new Error('The game compositor cannot be captured by this browser.');
    }
    const videoTrack = rawStream.getVideoTracks()[0];
    if (!videoTrack) {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      throw new Error('PARA could not get gameplay video from the compositor.');
    }
    try { videoTrack.contentHint = 'motion'; } catch (_) {}

    const tracks = [videoTrack];
    if (audio) {
      const audioTrack = capturedGameAudioTracks()[0];
      if (audioTrack) {
        try { tracks.push(audioTrack.clone()); } catch (_) {}
      }
    }
    const stream = new MediaStream(tracks);
    stream.__paraCaptureWidth = captureCanvas.width;
    stream.__paraCaptureHeight = captureCanvas.height;
    stream.__paraCaptureMode = layers.length > 1 ? 'layer-compositor' : 'direct-game-surface';
    stream.__paraCleanup = () => {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      rawStream.getTracks().forEach((track) => {
        if (!tracks.includes(track)) {
          try { track.stop(); } catch (_) {}
        }
      });
    };
    return stream;
  }

  async function requestGameStream(audio = false) {
    // V51: capture the renderer's own stream before trying to redraw it into a
    // second canvas. WebGL canvases commonly use preserveDrawingBuffer=false;
    // drawImage/getImageData can look blank even while canvas.captureStream()
    // can capture the live renderer correctly. No tab/screen recorder fallback.
    let directError = null;
    try { return await requestDirectGameSurfaceStream(audio); }
    catch (error) { directError = error; }
    try { return await requestCompositedGameStream(audio); }
    catch (error) {
      const message = String(error?.message || 'PARA could not capture the game renderer.');
      if (directError && message.includes('blank direct-capture surface')) {
        throw new Error(`The renderer could not be captured directly. ${directError.message || ''}`.trim());
      }
      throw error;
    }
  }

  const RUNTIME_CAPTURE_SLICE_MS = 1000;
  const RUNTIME_CAPTURE_DECODE_TIMEOUT_MS = 7000;

  function runtimeRecorderMimeCandidates(hasAudio = false) {
    if (!globalThis.MediaRecorder) throw new Error('Gameplay recording is unavailable in this browser.');
    const types = hasAudio
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
    const supported = types.filter((type) => MediaRecorder.isTypeSupported?.(type));
    return supported.length ? supported : [''];
  }

  function runtimeRecorderOptions(mimeType = '', videoBitsPerSecond = 8_000_000) {
    return mimeType ? { mimeType, videoBitsPerSecond } : { videoBitsPerSecond };
  }

  function runtimeRecorderLabel(mimeType = '') {
    return mimeType || 'browser temporary WebM';
  }

  function runtimeMediaDecodeMessage(video) {
    const code = Number(video?.error?.code || 0);
    if (code === 1) return 'Chromium interrupted capture playback.';
    if (code === 2) return 'Chromium could not read this capture media data.';
    if (code === 3) return "Chromium rejected the normalized capture's video stream.";
    if (code === 4) return "Chromium does not support the normalized capture's encoded video stream.";
    return 'Chromium could not decode the normalized gameplay video.';
  }

  function startRuntimeRecorderSession(stream, mimeType, { timesliceMs = RUNTIME_CAPTURE_SLICE_MS, storeChunks = true, onChunk = null, videoBitsPerSecond = 8_000_000 } = {}) {
    const recorder = new MediaRecorder(stream, runtimeRecorderOptions(mimeType, videoBitsPerSecond));
    const session = { recorder, mimeType: recorder.mimeType || mimeType || 'video/webm', chunks: [], error: null };
    recorder.addEventListener('dataavailable', (event) => {
      if (!event.data?.size) return;
      if (storeChunks) session.chunks.push(event.data);
      onChunk?.(event.data);
    });
    recorder.addEventListener('error', () => {
      session.error = recorder.error || new Error('Gameplay recording failed.');
    });
    recorder.start(timesliceMs);
    return session;
  }

  async function finalizeRuntimeRecorderSession(session) {
    const recorder = session?.recorder;
    if (!recorder) throw new Error('PARA could not create a gameplay recording session.');
    if (recorder.state !== 'inactive') {
      await new Promise((resolve, reject) => {
        const onStop = () => { cleanup(); resolve(); };
        const onError = () => { const error = session.error || recorder.error || new Error('Gameplay encoder failed.'); cleanup(); reject(error); };
        const cleanup = () => {
          recorder.removeEventListener('stop', onStop);
          recorder.removeEventListener('error', onError);
        };
        recorder.addEventListener('stop', onStop);
        recorder.addEventListener('error', onError);
        try {
          recorder.requestData();
          recorder.stop();
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    }
    if (session.error) throw session.error;
    const blob = new Blob([...session.chunks], { type: recorder.mimeType || session.mimeType || 'video/webm' });
    if (!blob.size || blob.size < 1024) throw new Error('PARA did not receive enough gameplay video data.');
    return blob;
  }

  async function verifyNormalizedCapture(blob) {
    if (!blob?.size || blob.size < 1024) throw new Error('PARA capture processing returned an empty video.');
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let frameTimer = 0;
    try {
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        let timer = 0;
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
        };
        const onLoaded = () => {
          cleanup();
          if (!video.videoWidth || !video.videoHeight) {
            reject(new Error('The normalized capture contains no visible video frames.'));
            return;
          }
          resolve();
        };
        const onError = () => {
          const message = runtimeMediaDecodeMessage(video);
          cleanup();
          reject(new Error(message));
        };
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('The normalized MP4 could not be decoded.'));
        }, RUNTIME_CAPTURE_DECODE_TIMEOUT_MS);
        video.src = url;
        video.load();
      });
      const startTime = Number(video.currentTime || 0);
      let decodedFrame = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      let framePromise = Promise.resolve();
      if (typeof video.requestVideoFrameCallback === 'function') {
        framePromise = new Promise((resolve) => {
          frameTimer = setTimeout(resolve, 1200);
          video.requestVideoFrameCallback(() => {
            decodedFrame = true;
            clearTimeout(frameTimer);
            resolve();
          });
        });
      }
      try { await video.play(); }
      catch (_) { throw new Error(runtimeMediaDecodeMessage(video)); }
      const timelinePromise = new Promise((resolve, reject) => {
        const started = performance.now();
        const check = () => {
          if (video.error) { reject(new Error(runtimeMediaDecodeMessage(video))); return; }
          if (Number(video.currentTime || 0) > startTime + .04) { resolve(); return; }
          if (video.ended) { reject(new Error('The normalized capture ended before playback could advance.')); return; }
          if (performance.now() - started > 3500) { reject(new Error('The normalized capture decoded, but playback did not advance.')); return; }
          setTimeout(check, 50);
        };
        check();
      });
      await Promise.all([framePromise, timelinePromise]);
      const decodedFrames = Number(video.getVideoPlaybackQuality?.().totalVideoFrames || 0);
      if (!decodedFrame && decodedFrames <= 0) throw new Error('Chromium did not decode a frame from the normalized MP4.');
      video.pause();
      return { width: video.videoWidth, height: video.videoHeight, duration: Number(video.duration || 0) };
    } finally {
      clearTimeout(frameTimer);
      video.pause?.();
      video.removeAttribute?.('src');
      video.load?.();
      URL.revokeObjectURL(url);
    }
  }

  async function normalizeRuntimeCapture(rawBlob, captureMode = '', captureKind = 'capture') {
    const kind = captureKind === 'replay' ? 'replay' : 'capture';
    let response = null;
    let initialPayload = null;
    for (let submitAttempt = 0; submitAttempt < 60; submitAttempt += 1) {
      response = await fetch('/api/v1/capture/normalize', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': rawBlob.type || 'video/webm',
          'X-PARA-Capture-Mode': captureMode || 'game-frames',
        },
        body: rawBlob,
      });
      if (response.status !== 503) break;
      try { initialPayload = await response.json(); } catch (_) { initialPayload = null; }
      if (initialPayload?.error !== 'capture_queue_full') break;
      toast(`Capture queue is full · waiting to save ${kind}`);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      response = null;
      initialPayload = null;
    }
    if (!response) throw new Error('PARA capture processing stayed busy for too long.');

    let output = null;
    if (response.status === 202) {
      let queued = initialPayload;
      if (!queued) {
        try { queued = await response.json(); } catch (_) {}
      }
      const jobId = String(queued?.job_id || '');
      if (!jobId) throw new Error('PARA accepted the capture but did not return a processing job.');

      const deadline = Date.now() + (10 * 60 * 1000);
      let lastMessage = '';
      const showStatus = (message) => {
        const text = String(message || '');
        if (!text || text === lastMessage) return;
        lastMessage = text;
        toast(text);
      };
      if (Number(queued?.ahead || 0) > 0) showStatus(`Queued ${kind} · ${Number(queued.ahead)} ahead`);
      else showStatus(`Processing ${kind} · creating MP4`);

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const statusResponse = await fetch(`/api/v1/capture/normalize/status?id=${encodeURIComponent(jobId)}`, {
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
        });
        let statusPayload = null;
        try { statusPayload = await statusResponse.json(); } catch (_) {}
        if (!statusResponse.ok) {
          throw new Error(statusPayload?.message || `Capture queue status failed (${statusResponse.status}).`);
        }
        const state = String(statusPayload?.state || '');
        if (state === 'queued') {
          const ahead = Math.max(0, Number(statusPayload?.ahead || 0));
          showStatus(ahead > 0 ? `Queued ${kind} · ${ahead} ahead` : `Queued ${kind}`);
          continue;
        }
        if (state === 'processing') {
          showStatus(`Processing ${kind} · creating MP4`);
          continue;
        }
        if (state === 'failed') {
          const detail = statusPayload?.detail ? ` ${statusPayload.detail}` : '';
          throw new Error(`${statusPayload?.message || 'PARA could not process this gameplay recording.'}${detail}`.trim());
        }
        if (state === 'completed') break;
      }
      if (Date.now() >= deadline) throw new Error('PARA capture processing took too long in the queue.');

      const resultResponse = await fetch(`/api/v1/capture/normalize/result?id=${encodeURIComponent(jobId)}`, {
        credentials: 'same-origin',
        headers: { 'Accept': 'video/mp4' },
      });
      if (!resultResponse.ok) {
        let payload = null;
        try { payload = await resultResponse.json(); } catch (_) {}
        const detail = payload?.detail ? ` ${payload.detail}` : '';
        throw new Error(`${payload?.message || `Capture processing failed (${resultResponse.status}).`}${detail}`.trim());
      }
      output = await resultResponse.blob();
    } else {
      // Backward compatibility for a V50/V51 server during a rolling deploy.
      if (!response.ok) {
        let payload = initialPayload;
        if (!payload) {
          try { payload = await response.json(); } catch (_) {}
        }
        const detail = payload?.detail ? ` ${payload.detail}` : '';
        throw new Error(`${payload?.message || `Capture processing failed (${response.status}).`}${detail}`.trim());
      }
      output = await response.blob();
    }

    const mp4 = output?.type === 'video/mp4' ? output : new Blob([output], { type: 'video/mp4' });
    await verifyNormalizedCapture(mp4);
    return mp4;
  }

  function selectRuntimeRecorderMime(stream) {
    const hasAudio = stream.getAudioTracks().some((track) => track.readyState !== 'ended');
    return runtimeRecorderMimeCandidates(hasAudio)[0] || '';
  }

  async function requestVerifiedGameRecording(audio = false) {
    const stream = await requestGameStream(audio);
    const mimeType = selectRuntimeRecorderMime(stream);
    return { stream, mimeType, fallback: false };
  }

  const host = document.createElement('div');
  host.id = 'para-game-system-shell';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      button{font:inherit}
      #systemButton{display:none}
      #overlay{pointer-events:auto;position:fixed;inset:0;display:none;contain:layout paint style;color:#f8f5fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
      #overlay.open{display:block}
      .scrim{position:absolute;inset:0;background:rgba(1,1,7,.66)}
      .dock{position:absolute;left:50%;bottom:max(29px,5.2vh);width:min(1040px,calc(100vw - 40px));transform:translate3d(-50%,0,0);will-change:transform;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px}
      .context{width:min(760px,calc(100vw - 80px));min-height:108px;margin-bottom:4px;padding:16px 18px;display:none;align-items:center;justify-content:space-between;gap:18px;border:1px solid rgba(212,176,255,.25);border-radius:20px;background:rgba(10,7,15,.9);box-shadow:0 18px 55px rgba(0,0,0,.5);}
      .context.show{display:flex}
      .contextCopy{min-width:0;max-width:100%}
      .contextCopy span,.contextCopy strong,.contextCopy small{display:block;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
      .contextCopy span{color:#c89cff;font:850 10px/1 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase}
      .contextCopy strong{margin-top:5px;font-size:18px}
      .contextCopy small{margin-top:5px;color:rgba(235,227,242,.62);font-size:12px}
      .contextActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .contextActions button{min-height:42px;padding:0 14px;border:1px solid rgba(255,255,255,.13);border-radius:12px;color:#eee7f5;background:rgba(255,255,255,.045);cursor:pointer}
      .contextActions button:hover,.contextActions button:focus-visible{border-color:rgba(216,180,255,.7);background:rgba(131,52,224,.17);outline:none}
      .strip{width:max-content;max-width:100%;min-height:83px;padding:2px 9px;display:flex;align-items:center;justify-content:flex-start;gap:5px;overflow-x:auto;overflow-y:hidden;border:1px solid rgba(191,143,240,.34);border-radius:23px;background:rgba(7,5,11,.89);box-shadow:0 20px 65px rgba(0,0,0,.6),0 0 28px rgba(111,43,196,.08);;scrollbar-width:none}
      .strip::-webkit-scrollbar{display:none}
      .tile{flex:0 0 65px;min-width:65px;height:72px;padding:6px 2px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:1px solid transparent;border-radius:16px;color:rgba(217,207,226,.43);background:transparent;cursor:pointer;outline:none;transition:color .08s linear,border-color .08s linear,background .08s linear}
      .tile span{width:33px;height:33px;display:grid;place-items:center}
      .tile svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
      .tile svg .icon-fill{fill:currentColor;stroke:none}
      .tile strong{max-width:69px;overflow:hidden;font:720 9px/1.05 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap;opacity:.7}
      .tile:hover,.tile:focus-visible,.tile.focused{color:#fff;border-color:rgba(196,139,255,.73);background:linear-gradient(180deg,rgba(113,42,185,.22),rgba(92,28,154,.16));box-shadow:inset 0 0 0 1px rgba(213,174,255,.12),0 0 0 2px rgba(133,55,220,.11),0 0 24px rgba(153,73,241,.22)}
      .tile:hover strong,.tile:focus-visible strong,.tile.focused strong{opacity:1}
      .prompt{display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(217,207,226,.48);font:650 10px/1 system-ui,sans-serif}
      .prompt b{min-width:21px;height:19px;padding:0 5px;display:grid;place-items:center;border:1px solid rgba(205,165,255,.36);border-radius:6px;color:rgba(255,255,255,.82);font-size:9px}
      #toast{position:fixed;left:50%;bottom:138px;width:max-content;max-width:min(560px,calc(100vw - 24px));transform:translate(-50%,18px);padding:10px 14px;border:1px solid rgba(203,162,255,.28);border-radius:12px;color:#fff;background:rgba(8,6,12,.92);font:700 12px/1.35 system-ui,sans-serif;text-align:center;white-space:normal;overflow-wrap:anywhere;word-break:break-word;opacity:0;pointer-events:none;transition:.18s ease}
      #toast.show{opacity:1;transform:translate(-50%,0)}
      #achievementToast{position:fixed;top:max(24px,3vh);right:max(24px,3vw);width:min(390px,calc(100vw - 32px));min-height:92px;padding:14px 16px;display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:13px;align-items:center;border:1px solid rgba(213,177,255,.5);border-radius:18px;color:#fff;background:linear-gradient(135deg,rgba(18,12,27,.97),rgba(8,6,13,.97));box-shadow:0 22px 70px rgba(0,0,0,.58),0 0 32px rgba(147,72,237,.18);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transform:translate3d(24px,0,0) scale(.98);pointer-events:none;transition:opacity .2s ease,transform .22s ease}
      #achievementToast.show{opacity:1;transform:translate3d(0,0,0) scale(1)}
      .achievementTrophy{width:58px;height:58px;display:grid;place-items:center;border:1px solid rgba(218,187,255,.28);border-radius:15px;background:linear-gradient(145deg,rgba(138,69,225,.22),rgba(255,255,255,.035));font-size:29px;overflow:hidden}
      .achievementTrophy img{width:100%;height:100%;object-fit:cover}
      .achievementCopy{min-width:0}.achievementCopy span{display:block;color:#c994ff;font:850 9px/1.15 system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase}.achievementCopy strong{display:block;margin-top:6px;overflow:hidden;font:800 16px/1.15 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}.achievementCopy small{display:block;margin-top:5px;color:rgba(240,232,247,.62);font:600 11px/1.3 system-ui,sans-serif}.achievementPoints{align-self:start;margin-top:3px;color:#d9b9ff;font:850 11px/1 system-ui,sans-serif;white-space:nowrap}
      @media(max-width:820px){.dock{width:calc(100vw - 16px)}.strip{max-width:calc(100vw - 16px)}.tile{flex-basis:60px;min-width:60px}.context{width:calc(100vw - 24px);align-items:flex-start;flex-direction:column}.contextActions{justify-content:flex-start}}
    </style>
    <button id="systemButton" type="button" aria-label="Open PARA Control Center"></button>
    <div id="overlay" aria-hidden="true">
      <div class="scrim" data-action="resume"></div>
      <div class="dock" role="dialog" aria-modal="true" aria-label="PARA Control Center">
        <section id="context" class="context"></section>
        <nav id="strip" class="strip" aria-label="Quick controls">
          <button class="tile" data-action="home"><span><svg viewBox="0 0 24 24"><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></svg></span><strong>Home</strong></button>
          <button class="tile" data-action="switcher"><span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="11" rx="2"/><path d="M7 19h12a2 2 0 0 0 2-2V9"/></svg></span><strong>Switcher</strong></button>
          <button class="tile" data-action="notifications"><span><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 6 3 8H3c0-2 3-1 3-8Z"/><path d="M10 21h4"/></svg></span><strong>Notifications</strong></button>
          <button class="tile" data-action="downloads"><span><svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg></span><strong>Downloads</strong></button>
          <button class="tile" data-action="capture"><span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1.5-2h5L16 5"/></svg></span><strong>Captures</strong></button>
          <button class="tile" data-action="music"><span><svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></span><strong>Music</strong></button>
          <button class="tile" data-action="network"><span><svg viewBox="0 0 24 24"><path d="M4 10a12 12 0 0 1 16 0M7 14a8 8 0 0 1 10 0M10 18a3 3 0 0 1 4 0"/><circle cx="12" cy="21" r=".5" class="icon-fill"/></svg></span><strong>Network</strong></button>
          <button class="tile" data-action="sound"><span><svg viewBox="0 0 24 24"><path d="M4 10h4l5-4v12l-5-4H4zM16 9a5 5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg></span><strong>Sound</strong></button>
          <button class="tile" data-action="microphone"><span><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 12a6.5 6.5 0 0 0 13 0M12 18.5V22M8.5 22h7"/></svg></span><strong>Microphone</strong></button>
          <button class="tile" data-action="controller"><span><svg viewBox="0 0 24 24"><path d="M6.5 8h11c3 0 5.5 7.5 4 10-1 1.8-3.4-.3-5.2-2.5H7.7C5.9 17.7 3.5 19.8 2.5 18c-1.5-2.5 1-10 4-10Z"/><path d="M7 10v5M4.5 12.5h5M16.5 11.5h.01M19 14h.01"/></svg></span><strong>Controller</strong></button>
          <button class="tile" data-action="profile"><span><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-5 3.2-7 7.5-7s6.8 2 7.5 7"/></svg></span><strong>Profile</strong></button>
          <button class="tile" data-action="power"><span><svg viewBox="0 0 24 24"><path d="M12 2v10"/><path d="M6.3 5.4a9 9 0 1 0 11.4 0"/></svg></span><strong>Power</strong></button>
        </nav>
        <div class="prompt"><b>P</b><span>Close</span></div>
      </div>
    </div>
    <div id="toast"></div>
    <div id="achievementToast" role="status" aria-live="polite" aria-atomic="true">
      <div class="achievementTrophy" id="achievementTrophy">🏆</div>
      <div class="achievementCopy"><span>Achievement unlocked</span><strong id="achievementName">Achievement</strong><small id="achievementDescription">Added to your PARA profile</small></div>
      <div class="achievementPoints" id="achievementPoints">+0</div>
    </div>
  `;
  document.documentElement.appendChild(host);

  const $ = (selector) => shadow.querySelector(selector);
  const overlay = $('#overlay');
  const context = $('#context');
  const systemButton = $('#systemButton');
  const toastBox = $('#toast');
  const achievementToast = $('#achievementToast');
  const achievementTrophy = $('#achievementTrophy');
  const achievementName = $('#achievementName');
  const achievementDescription = $('#achievementDescription');
  const achievementPoints = $('#achievementPoints');
  let toastTimer = 0;
  let achievementToastTimer = 0;

  function toast(message) {
    clearTimeout(toastTimer);
    toastBox.textContent = message;
    toastBox.classList.add('show');
    toastTimer = setTimeout(() => toastBox.classList.remove('show'), 2600);
  }

  function showAchievementToast(record) {
    if (!achievementToast) return;
    clearTimeout(achievementToastTimer);
    const iconUrl = String(record?.iconUrl || '');
    achievementTrophy.innerHTML = iconUrl ? `<img src="${escapeMarkup(iconUrl)}" alt="">` : '🏆';
    achievementName.textContent = String(record?.name || 'Achievement unlocked');
    achievementDescription.textContent = String(record?.description || 'Added to your PARA profile');
    achievementPoints.textContent = `+${Math.max(0, Number(record?.points || 0))} pts`;
    achievementToast.classList.remove('show');
    void achievementToast.offsetWidth;
    achievementToast.classList.add('show');
    achievementToastTimer = setTimeout(() => achievementToast.classList.remove('show'), 5200);
  }

  let contextFocusActive = false;

  function stripTiles() {
    return [...shadow.querySelectorAll('#strip .tile:not([hidden])')];
  }

  function contextButtons() {
    return context.classList.contains('show') ? [...context.querySelectorAll('button:not([disabled])')] : [];
  }

  function focusables() {
    return contextFocusActive ? contextButtons() : stripTiles();
  }

  function syncFocus(index = focusedIndex, { refreshContext = true } = {}) {
    const items = focusables();
    if (!items.length) {
      if (contextFocusActive) {
        contextFocusActive = false;
        focusedIndex = Math.max(0, Math.min(focusedIndex, stripTiles().length - 1));
        return syncFocus(focusedIndex, { refreshContext });
      }
      return;
    }
    focusedIndex = Math.max(0, Math.min(index, items.length - 1));
    shadow.querySelectorAll('.focused').forEach((node) => node.classList.remove('focused'));
    const target = items[focusedIndex];
    target.classList.add('focused');
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (!contextFocusActive && refreshContext) showContext(target.dataset.action || '', false);
  }

  function enterContext() {
    const buttons = contextButtons();
    if (!buttons.length) return false;
    contextFocusActive = true;
    focusedIndex = 0;
    syncFocus(0, { refreshContext: false });
    return true;
  }

  function leaveContext() {
    if (!contextFocusActive) return false;
    const selected = stripTiles().findIndex((tile) => tile.dataset.action === contextName);
    contextFocusActive = false;
    focusedIndex = selected >= 0 ? selected : 0;
    syncFocus(focusedIndex, { refreshContext: false });
    return true;
  }

  function openShell() {
    if (shellOpen) return;
    shellOpen = true;
    const controllerTile = shadow.querySelector('[data-action="controller"]');
    if (controllerTile) controllerTile.hidden = ![...(nativeGetGamepads?.() || [])].find(Boolean);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    context.classList.remove('show');
    context.innerHTML = '';
    contextName = '';
    contextFocusActive = false;
    focusedIndex = 0;
    syncFocus(0);
  }

  function closeShell() {
    shellOpen = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    context.classList.remove('show');
    context.innerHTML = '';
    contextName = '';
    contextFocusActive = false;
    systemButton.focus({ preventScroll: true });
  }

  function toggleShell() {
    shellOpen ? closeShell() : openShell();
  }

  function showContext(name, focusContext = true) {
    contextName = name;
    if (!name || name === 'home') {
      context.classList.remove('show');
      context.innerHTML = '';
      contextName = '';
      contextFocusActive = false;
      return false;
    }
    if (name === 'capture') {
      const replayActive = Boolean(replay);
      context.innerHTML = `
        <div class="contextCopy"><span>PARA Capture</span><strong>${manualRecording ? 'Recording gameplay' : replayActive ? 'Replay is running' : 'Capture without leaving the game'}</strong><small>Captures save directly to PARA Media Gallery.</small></div>
        <div class="contextActions">
          <button data-context-action="screenshot">Screenshot</button>
          ${manualRecording ? '<button data-context-action="stop-recording">Stop & Save</button>' : '<button data-context-action="start-recording">Start Recording</button>'}
          ${replayActive ? '<button data-context-action="save-replay" data-ms="30000">Last 30s</button><button data-context-action="save-replay" data-ms="60000">Last 1m</button><button data-context-action="save-replay" data-ms="300000">Last 5m</button>' : '<button data-context-action="start-replay">Start Replay</button>'}
        </div>`;
    } else if (name === 'sound') {
      const media = [...document.querySelectorAll('audio,video')];
      const muted = media.length && media.every((el) => el.muted);
      context.innerHTML = `<div class="contextCopy"><span>Sound</span><strong>${muted ? 'Muted' : 'Playing'}</strong><small>${media.length ? 'Game audio output' : 'No HTML media output detected'}</small></div><div class="contextActions"><button data-context-action="toggle-mute">${muted ? 'Unmute' : 'Mute'}</button></div>`;
    } else if (name === 'controller') {
      const pad = [...(nativeGetGamepads?.() || [])].find(Boolean);
      const inputStatus = window.PARA?.input?.status?.() || { active: false, requested: false, nativeGamepadDetected: false };
      const inputState = inputStatus.active ? 'PARA Input active' : inputStatus.nativeGamepadDetected ? 'Native controller support detected' : inputStatus.requested ? 'PARA Input waiting' : 'PARA Input off';
      context.innerHTML = pad
        ? `<div class="contextCopy"><span>Controller</span><strong>${escapeMarkup(pad.id || 'Controller')}</strong><small>${escapeMarkup(inputState)}</small></div><div class="contextActions"><button data-context-action="para-input-toggle">${inputStatus.requested ? 'Disable PARA Input' : 'Enable PARA Input'}</button><button data-context-action="para-input-settings">PARA Input Settings</button><button data-context-action="controller-settings">Controller Settings</button></div>`
        : `<div class="contextCopy"><span>Controller</span><strong>No controller connected</strong><small>Keyboard controls remain available.</small></div><div class="contextActions"><button data-context-action="para-input-settings">PARA Input Settings</button></div>`;
    } else if (name === 'profile') {
      const state = readHomeState();
      const profile = state.activeProfile || state.setupChoices?.profileName || '';
      context.innerHTML = profile
        ? `<div class="contextCopy"><span>Profile</span><strong>${escapeMarkup(profile)}</strong></div><div class="contextActions"><button data-context-action="account-settings">Account Settings</button></div>`
        : `<div class="contextCopy"><span>Profile</span><strong>Profile unavailable</strong></div>`;
    } else if (name === 'downloads') {
      const runtime = readProfileRuntime();
      const allDownloads = runtime.downloads || [];
      const downloads = allDownloads.filter((item) => ['downloading','paused','Queued','Downloading','Paused'].includes(item.status || item.queueStatus));
      const completed = [...allDownloads].filter((item) => item.status === 'complete').sort((a, b) => Number(b.completedAt || b.startedAt || 0) - Number(a.completedAt || a.startedAt || 0))[0];
      context.innerHTML = downloads.length
        ? `<div class="contextCopy"><span>Downloading</span><strong>${escapeMarkup(downloads[0].title || 'Download')}</strong><small>${Number(downloads[0].progress || 0)}%</small></div><div class="contextActions"><button data-context-action="downloads-open">Open Downloads</button></div>`
        : completed
          ? `<div class="contextCopy"><span>Downloads</span><strong>${escapeMarkup(completed.title || 'Install')} installed</strong><small>Most recent completed download</small></div><div class="contextActions"><button data-context-action="downloads-open">Open Downloads</button></div>`
          : `<div class="contextCopy"><span>Downloads</span><strong>No active downloads</strong></div><div class="contextActions"><button data-context-action="downloads-open">Open Downloads</button></div>`;
    } else if (name === 'notifications') {
      const runtime = readProfileRuntime();
      const notifications = runtime.notifications || [];
      const unread = notifications.filter((item) => !item.readAt);
      context.innerHTML = `<div class="contextCopy"><span>Notifications</span><strong>${unread.length ? `${unread.length} new` : 'You’re all caught up'}</strong><small>${notifications.length ? `${notifications.length} in history` : 'No notifications yet'}</small></div>${notifications.length ? '<div class="contextActions"><button data-context-action="notifications-open">View Notifications</button></div>' : ''}`;
    } else if (name === 'switcher') {
      const runtime = readProfileRuntime();
      const running = (runtime.running || []).filter((item) => item.id !== GAME_ACTIVITY_ID);
      context.innerHTML = running.length
        ? `<div class="contextCopy"><span>Running</span><strong>${running.length} other ${running.length === 1 ? 'experience' : 'experiences'}</strong><small>Open Switcher to change experiences.</small></div><div class="contextActions"><button data-context-action="switcher-open">Open Switcher</button></div>`
        : `<div class="contextCopy"><span>Switcher</span><strong>No other apps running</strong></div>`;
    } else if (name === 'network') {
      context.innerHTML = `<div class="contextCopy"><span>Network</span><strong>Checking connection…</strong></div>`;
      fetch('/api/v1/network', { headers: { Accept: 'application/json' } }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
        if (contextName !== 'network') return;
        const active = data?.interfaces?.find((item) => item.connected);
        const available = active || data?.interfaces?.[0];
        context.innerHTML = `<div class="contextCopy"><span>Network</span><strong>${active ? 'Connected' : available ? 'Available connections' : 'Unavailable'}</strong>${available ? `<small>${escapeMarkup(available.name || 'Network')}</small>` : ''}</div><div class="contextActions"><button data-context-action="network-settings">Network Settings</button></div>`;
        if (contextFocusActive) syncFocus(focusedIndex, { refreshContext: false });
      }).catch(() => {
        if (contextName !== 'network') return;
        context.innerHTML = `<div class="contextCopy"><span>Network</span><strong>Network status unavailable</strong></div><div class="contextActions"><button data-context-action="network-settings">Network Settings</button></div>`;
        if (contextFocusActive) syncFocus(focusedIndex, { refreshContext: false });
      });
    } else if (name === 'music') {
      context.innerHTML = `<div class="contextCopy"><span>Now Playing</span><strong>No separate media session</strong><small>Game audio remains under Sound.</small></div><div class="contextActions"><button data-context-action="audio-settings">Audio Settings</button></div>`;
    } else if (name === 'microphone') {
      context.innerHTML = `<div class="contextCopy"><span>Microphone</span><strong>Open microphone controls</strong><small>PARA does not invent microphone state when host data is unavailable.</small></div><div class="contextActions"><button data-context-action="audio-settings">Audio Settings</button></div>`;
    } else if (name === 'power') {
      context.innerHTML = `<div class="contextCopy"><span>Power</span><strong>Choose a system action</strong><small>PARA protects restart and shutdown from accidental activation.</small></div><div class="contextActions"><button data-context-action="power-home">Return Home</button><button data-context-action="power-sleep">Sleep</button><button data-context-action="power-restart">Restart PARA</button><button data-context-action="power-shutdown">Shut Down</button><button data-context-action="power-signout">Sign Out</button><button data-context-action="power-recovery">Recovery</button></div>`;
    }
    context.classList.add('show');
    if (focusContext && contextButtons().length) {
      enterContext();
    }
    return true;
  }

  async function screenshot() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const canvas = primaryGameCanvas();
      if (!canvas) throw new Error('No gameplay canvas was found to capture.');
      const blob = await new Promise((resolve, reject) => {
        try { canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Screenshot failed.')), 'image/webp', .94); }
        catch (_) { reject(new Error('This game canvas blocks screenshots.')); }
      });
      await saveCapture({ type: 'screenshot', blob, width: canvas.width || innerWidth, height: canvas.height || innerHeight });
      toast('Screenshot saved to PARA Media');
    } catch (error) {
      toast(error?.message || 'Screenshot failed');
    }
  }

  async function startRecording() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const prepared = await requestVerifiedGameRecording(true);
      const { stream, mimeType } = prepared;
      const session = startRuntimeRecorderSession(stream, mimeType, { timesliceMs: RUNTIME_CAPTURE_SLICE_MS, videoBitsPerSecond: 8_000_000 });
      const startedAt = Date.now();
      session.recorder.addEventListener('error', () => toast('PARA recording encountered an encoder error'));
      manualRecording = {
        stream, recorder: session.recorder, session, startedAt, stopping: false, mimeType,
        width: stream.__paraCaptureWidth || 0,
        height: stream.__paraCaptureHeight || 0,
        captureMode: stream.__paraCaptureMode || ''
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording(true), { once: true });
      toast('Recording started · direct game frames');
    } catch (error) {
      toast(error?.message || 'Recording could not start');
    }
  }

  async function stopRecording(fromTrackEnd = false) {
    const active = manualRecording;
    if (!active || active.stopping) return;
    active.stopping = true;
    try {
      const rawBlob = await finalizeRuntimeRecorderSession(active.session);
      toast('Processing capture · creating MP4');
      const blob = await normalizeRuntimeCapture(rawBlob, active.captureMode || 'game-frames', 'capture');
      await saveCapture({
        type: 'clip',
        blob,
        width: active.width || 0,
        height: active.height || 0,
        durationMs: Date.now() - active.startedAt,
        captureMode: active.captureMode || '',
        sourceMimeType: rawBlob.type || active.mimeType || 'video/webm'
      });
      toast('Gameplay capture verified and saved');
    } catch (error) {
      toast(error?.message || 'Recording could not be saved');
    } finally {
      manualRecording = null;
      stopStream(active.stream);
    }
  }

  async function startReplay() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      if (replay) { toast('PARA Replay is already running'); return; }
      const prepared = await requestVerifiedGameRecording(true);
      const { stream, mimeType } = prepared;
      const hasAudio = stream.getAudioTracks().length > 0;
      const chunks = [];
      const session = startRuntimeRecorderSession(stream, mimeType, {
        timesliceMs: RUNTIME_CAPTURE_SLICE_MS,
        storeChunks: false,
        videoBitsPerSecond: 7_000_000,
        onChunk: (blob) => {
          chunks.push({ blob, at: Date.now() });
          const cutoff = Date.now() - 30 * 60 * 1000;
          while (chunks.length > 2 && chunks[1].at < cutoff) chunks.splice(1, 1);
        }
      });
      replay = {
        stream, recorder: session.recorder, session, chunks, mimeType, startedAt: Date.now(),
        width: stream.__paraCaptureWidth || 0,
        height: stream.__paraCaptureHeight || 0,
        captureMode: stream.__paraCaptureMode || ''
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (replay?.recorder.state !== 'inactive') replay.recorder.stop();
        replay = null;
        toast('PARA Replay stopped');
      }, { once: true });
      toast(`${hasAudio ? 'PARA Replay is running' : 'PARA Replay is running · video only'} · direct game frames`);
    } catch (error) {
      toast(error?.message || 'Replay could not start');
    }
  }

  async function saveReplay(durationMs) {
    if (!replay) { toast('Start PARA Replay first'); return; }
    try {
      replay.recorder.requestData();
      await new Promise((resolve) => setTimeout(resolve, 220));
      const cutoff = Date.now() - durationMs;
      const selected = replay.chunks.filter((part, index) => index === 0 || part.at >= cutoff);
      const rawBlob = new Blob(selected.map((part) => part.blob), { type: replay.recorder.mimeType || 'video/webm' });
      toast('Processing replay · creating MP4');
      const blob = await normalizeRuntimeCapture(rawBlob, replay.captureMode || 'game-frames', 'replay');
      await saveCapture({
        type: 'clip',
        blob,
        width: replay.width || 0,
        height: replay.height || 0,
        durationMs: Math.min(durationMs, Date.now() - replay.startedAt),
        captureMode: replay.captureMode || '',
        sourceMimeType: rawBlob.type || replay.mimeType || 'video/webm'
      });
      toast('Recent gameplay verified and saved to PARA Media');
    } catch (error) {
      toast(error?.message || 'Replay could not be saved');
    }
  }

  async function action(name, button) {
    const contextAction = button?.dataset?.contextAction;
    if (name === 'resume') return closeShell();
    if (name === 'home') return leaveGame('/#/home');
    if (['switcher','notifications','downloads','capture','music','network','sound','microphone','controller','profile','power'].includes(name)) return showContext(name, true);
    if (contextAction === 'switcher-open') { sessionStorage.setItem('para-open-switcher', '1'); return leaveGame('/#/home'); }
    if (contextAction === 'notifications-open') return leaveGame('/#/notifications');
    if (contextAction === 'downloads-open') return leaveGame('/#/downloads');
    if (contextAction === 'network-settings') return leaveGame('/#/network');
    if (contextAction === 'audio-settings') return leaveGame('/#/audio-settings');
    if (contextAction === 'para-input-toggle') {
      const status = window.PARA?.input?.status?.() || {};
      if (status.requested) window.PARA?.input?.disableForThisGame?.();
      else window.PARA?.input?.enableForThisGame?.();
      showContext('controller', true);
      return;
    }
    if (contextAction === 'para-input-settings') return leaveGame('/#/para-input');
    if (contextAction === 'controller-settings') return leaveGame('/#/controller');
    if (contextAction === 'account-settings') return leaveGame('/#/account');
    if (contextAction === 'power-home') return leaveGame('/#/home');
    if (contextAction === 'power-signout') return leaveGame('/#/profiles');
    if (contextAction === 'power-recovery') return leaveGame('/#/recovery');
    if (contextAction === 'power-sleep') return runShellPowerAction('sleep');
    if (contextAction === 'power-restart') return runShellPowerAction('restart');
    if (contextAction === 'power-shutdown') return runShellPowerAction('shutdown');
    if (name === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        toast(document.fullscreenElement ? 'Fullscreen on' : 'Fullscreen off');
      } catch (_) { toast('Fullscreen is unavailable'); }
      return;
    }
    if (contextAction === 'screenshot') return screenshot();
    if (contextAction === 'start-recording') return startRecording();
    if (contextAction === 'stop-recording') { closeShell(); return stopRecording(); }
    if (contextAction === 'start-replay') return startReplay();
    if (contextAction === 'save-replay') { closeShell(); return saveReplay(Number(button.dataset.ms || 30000)); }
    if (contextAction === 'toggle-mute') {
      const media = [...document.querySelectorAll('audio,video')];
      const shouldMute = !media.length || !media.every((el) => el.muted);
      media.forEach((el) => { el.muted = shouldMute; });
      showContext('sound');
      return;
    }
  }

  shadow.addEventListener('click', (event) => {
    const target = event.target.closest?.('button,[data-action]');
    if (!target) return;
    if (target === systemButton) return toggleShell();
    const name = target.dataset.action || target.dataset.contextAction;
    if (target.dataset.contextAction) return action('', target);
    if (name) action(name, target);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key?.toLowerCase() === 'p' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!keyboardParaDown) {
        keyboardParaDown = true;
        keyboardParaHeld = false;
        keyboardParaTimer = setTimeout(() => {
          keyboardParaTimer = 0;
          if (!keyboardParaDown) return;
          keyboardParaHeld = true;
          leaveGame('/#/home');
        }, 650);
      }
      return;
    }
    if (!shellOpen) return;
    if (['Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (event.key === 'Escape') {
      if (!leaveContext()) closeShell();
    } else if (event.key === 'Enter') {
      focusables()[focusedIndex]?.click();
    } else if (event.key === 'ArrowUp') {
      if (!contextFocusActive) enterContext();
      else syncFocus(focusedIndex - 1, { refreshContext: false });
    } else if (event.key === 'ArrowDown') {
      if (!leaveContext()) syncFocus(focusedIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      syncFocus(focusedIndex - 1, { refreshContext: !contextFocusActive });
    } else if (event.key === 'ArrowRight') {
      syncFocus(focusedIndex + 1, { refreshContext: !contextFocusActive });
    }
  }, true);

  window.addEventListener('keyup', (event) => {
    if (event.key?.toLowerCase() !== 'p' || !keyboardParaDown) return;
    event.preventDefault(); event.stopImmediatePropagation();
    keyboardParaDown = false;
    if (keyboardParaTimer) { clearTimeout(keyboardParaTimer); keyboardParaTimer = 0; }
    if (!keyboardParaHeld) toggleShell();
    keyboardParaHeld = false;
  }, true);

  function gamepadLoop() {
    const pad = [...(nativeGetGamepads?.() || [])].find(Boolean);
    if (pad) {
      const pressed = pad.buttons.map((button) => button.pressed);
      const edge = (index) => Boolean(pressed[index] && !gamepadPrevious[index]);
      const now = performance.now();
      const paraIndex = pad.buttons.length > 16 ? 16 : 9;

      if (pressed[paraIndex] && !gamepadPrevious[paraIndex]) {
        paraPressedAt = now; paraHeld = false;
      }
      if (pressed[paraIndex] && !paraHeld && now - paraPressedAt >= 650) {
        paraHeld = true;
        leaveGame('/#/home');
      }
      if (!pressed[paraIndex] && gamepadPrevious[paraIndex] && !paraHeld) toggleShell();

      if (shellOpen) {
        if (edge(0)) focusables()[focusedIndex]?.click();
        if (edge(1) && !leaveContext()) closeShell();
        const x = pad.axes?.[0] || 0;
        const y = pad.axes?.[1] || 0;
        const prevX = window.__paraShellPrevX || 0;
        const prevY = window.__paraShellPrevY || 0;
        const moveLeft = edge(14) || (x < -.55 && prevX >= -.55);
        const moveRight = edge(15) || (x > .55 && prevX <= .55);
        const moveUp = edge(12) || (y < -.55 && prevY >= -.55);
        const moveDown = edge(13) || (y > .55 && prevY <= .55);
        if (moveUp) {
          if (!contextFocusActive) enterContext();
          else syncFocus(focusedIndex - 1, { refreshContext: false });
        }
        if (moveDown) {
          if (!leaveContext()) syncFocus(focusedIndex + 1);
        }
        if (moveLeft) syncFocus(focusedIndex - 1, { refreshContext: !contextFocusActive });
        if (moveRight) syncFocus(focusedIndex + 1, { refreshContext: !contextFocusActive });
        window.__paraShellPrevX = x; window.__paraShellPrevY = y;
      }
      gamepadPrevious = pressed;
    }
    requestAnimationFrame(gamepadLoop);
  }
  requestAnimationFrame(gamepadLoop);
})();
</script>'''
                    .replace('__PARA_BASE__', runtime_base_json)
                    .replace('__PARA_RUNTIME_ID__', runtime_id)
                    .replace('__PARA_GAME_TITLE__', game_title_json)
                    .replace('__PARA_PROJECT_ID__', project_id_json)
                    .replace('__PARA_GAME_ARTWORK__', game_artwork_json)
                )
            )
            # Rewrite the most common inline root navigations used by small
            # single-file web games. Without this, `location.href = "/"`
            # loads PARA Home inside the game frame. The runtime base keeps
            # restart/menu actions inside the published title.
            replacements = {
                'location.href = "/"': f'location.href = {runtime_base_json}',
                "location.href = '/'": f'location.href = {runtime_base_json}',
                'window.location.href = "/"': f'window.location.href = {runtime_base_json}',
                "window.location.href = '/'": f'window.location.href = {runtime_base_json}',
                'document.location.href = "/"': f'document.location.href = {runtime_base_json}',
                "document.location.href = '/'": f'document.location.href = {runtime_base_json}',
                'location.assign("/")': f'location.assign({runtime_base_json})',
                "location.assign('/')": f'location.assign({runtime_base_json})',
                'location.replace("/")': f'location.replace({runtime_base_json})',
                "location.replace('/')": f'location.replace({runtime_base_json})',
            }
            for old_nav, new_nav in replacements.items():
                text = text.replace(old_nav, new_nav)

            lower = text.lower()
            head_at = lower.find('<head')
            if head_at >= 0:
                close = text.find('>', head_at)
                if close >= 0:
                    text = text[:close + 1] + injection + text[close + 1:]
                else:
                    text = injection + text
            else:
                text = injection + text
            body = text.encode("utf-8")
            guessed = "text/html; charset=utf-8"
        except UnicodeDecodeError:
            pass

    return 200, body, guessed


def resolve(path: str, query: dict[str, list[str]] | None = None) -> tuple[int, dict]:
    routes = {
        "/api/v1/health": system_layer.health,
        "/api/v1/system": system_layer.system_information,
        "/api/v1/storage": system_layer.storage,
        "/api/v1/network": system_layer.network,
        "/api/v1/audio": system_layer.audio,
        "/api/v1/capabilities": system_layer.capabilities,
        "/api/v1/directories": system_layer.directories,
        "/api/v1/apps": system_layer.applications,
    }
    if path == "/api/v1/files/browse":
        location = (query or {}).get("path", ["home"])[0]
        return system_layer.browse_files(location)
    if path == "/api/v1/files/search":
        location = (query or {}).get("path", ["home"])[0]
        term = (query or {}).get("q", [""])[0]
        return system_layer.search_files(location, term)
    if path == "/api/v1/store/catalog":
        return store_catalog()
    if path == "/api/v1/store/product":
        return store_product((query or {}).get("id", [""])[0])
    if path == "/api/v1/store/achievements":
        return store_achievements((query or {}).get("id", [""])[0])
    if path == "/api/v1/personalization":
        profile = (query or {}).get("profile", [""])[0]
        return system_layer.personalization(profile)
    if path in routes:
        return 200, routes[path]()
    return 404, {"error": "not_found", "path": path}


class ParaHandler(SimpleHTTPRequestHandler):
    server_version = "PARA/0.7.2"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HOME_ROOT), **kwargs)

    def log_message(self, format_string: str, *args) -> None:
        sys.stdout.write(f"[para] {self.address_string()} {format_string % args}\n")

    def end_headers(self) -> None:
        is_store_game = self.path.startswith("/api/v1/store/content/")
        # v18: the suspended-game Home shell is intentionally framed by a same-origin
        # game runtime. Keep normal PARA Home protected from framing, but allow this
        # narrowly-scoped shell route to render inside the game's suspend overlay.
        parsed_path = urlparse(self.path)
        suspended_shell_query = parse_qs(parsed_path.query)
        is_suspended_home_shell = (
            parsed_path.path == "/"
            and suspended_shell_query.get("para_suspended_shell", [""])[0] == "1"
        )
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        if is_store_game:
            self.send_header("Content-Security-Policy", "sandbox allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
            self.send_header("X-Frame-Options", "SAMEORIGIN")
        elif is_suspended_home_shell:
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
            self.send_header("X-Frame-Options", "SAMEORIGIN")
        else:
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(), usb=()")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None

    def _send_json(self, status: int, payload: dict, extra_headers: list[tuple[str, str]] | None = None) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, status: int, body: bytes, content_type: str, extra_headers: list[tuple[str, str]] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "private, no-store")
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_redirect(self, location: str, *, status: int = 302, extra_headers: list[tuple[str, str]] | None = None) -> None:
        self.send_response(status)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _steam_state_cookie_headers(self, state: str = "", *, clear: bool = False) -> list[tuple[str, str]]:
        secure = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        suffix = "; Path=/api/v1/integrations/steam/callback; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")
        if clear:
            return [("Set-Cookie", f"{STEAM_OPENID_STATE_COOKIE}=; Max-Age=0{suffix}")]
        return [("Set-Cookie", f"{STEAM_OPENID_STATE_COOKIE}={state}; Max-Age={STEAM_OPENID_STATE_TTL_SECONDS}{suffix}")]

    def _google_state_cookie_headers(self, state: str = "", *, clear: bool = False) -> list[tuple[str, str]]:
        secure = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        suffix = "; Path=/api/v1/integrations/google/callback; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")
        if clear:
            return [("Set-Cookie", f"{GOOGLE_OAUTH_STATE_COOKIE}=; Max-Age=0{suffix}")]
        return [("Set-Cookie", f"{GOOGLE_OAUTH_STATE_COOKIE}={state}; Max-Age={GOOGLE_OAUTH_STATE_TTL_SECONDS}{suffix}")]

    def _youtube_upload_cookie_headers(self, session_id: str = "", *, clear: bool = False) -> list[tuple[str, str]]:
        secure = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        suffix = "; Path=/api/v1/integrations/google/youtube; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")
        if clear:
            return [("Set-Cookie", f"{YOUTUBE_UPLOAD_SESSION_COOKIE}=; Max-Age=0{suffix}")]
        return [("Set-Cookie", f"{YOUTUBE_UPLOAD_SESSION_COOKIE}={session_id}; Max-Age={YOUTUBE_UPLOAD_SESSION_TTL_SECONDS}{suffix}")]

    def _cookies(self) -> dict[str, str]:
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
        except Exception:
            return {}
        return {key: morsel.value for key, morsel in jar.items()}

    def _auth_cookie_headers(self, tokens: dict | None = None, *, clear: bool = False) -> list[tuple[str, str]]:
        secure = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        # Lax keeps the HttpOnly session available on top-level authentication
        # callbacks such as Steam OpenID while still withholding it from cross-site POSTs.
        suffix = "; Path=/; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")
        if clear:
            return [("Set-Cookie", f"{AUTH_ACCESS_COOKIE}=; Max-Age=0{suffix}"), ("Set-Cookie", f"{AUTH_REFRESH_COOKIE}=; Max-Age=0{suffix}")]
        if not tokens:
            return []
        access = str(tokens.get("access_token") or "")
        refresh = str(tokens.get("refresh_token") or "")
        access_age = max(60, min(int(tokens.get("expires_in") or 3600), 86_400))
        return [
            ("Set-Cookie", f"{AUTH_ACCESS_COOKIE}={access}; Max-Age={access_age}{suffix}"),
            ("Set-Cookie", f"{AUTH_REFRESH_COOKIE}={refresh}; Max-Age=2592000{suffix}"),
        ]

    def _auth_session(self) -> tuple[int, dict, list[tuple[str, str]]]:
        cookies = self._cookies()
        access = cookies.get(AUTH_ACCESS_COOKIE, "")
        refresh = cookies.get(AUTH_REFRESH_COOKIE, "")
        if access:
            status, payload = auth_user(access)
            if status == 200:
                return status, payload, []
        if refresh:
            status, payload, tokens = auth_refresh(refresh)
            if status == 200 and tokens:
                return status, payload, self._auth_cookie_headers(tokens)
        return 200, {"signed_in": False, "user": None}, self._auth_cookie_headers(clear=True) if access or refresh else []

    def _authenticated_access(self) -> tuple[int, dict, str, list[tuple[str, str]]]:
        status, session, refreshed_headers = self._auth_session()
        if status != 200 or not session.get("signed_in") or not isinstance(session.get("user"), dict):
            return 401, {"signed_in": False, "user": None}, "", refreshed_headers
        access = self._cookies().get(AUTH_ACCESS_COOKIE, "")
        if refreshed_headers:
            for key, value in refreshed_headers:
                if key.lower() == "set-cookie" and value.startswith(AUTH_ACCESS_COOKIE + "="):
                    access = value.split(";", 1)[0].split("=", 1)[1]
                    break
        if not access:
            return 401, {"signed_in": False, "user": None}, "", refreshed_headers
        return 200, session, access, refreshed_headers

    def _capture_access_owner(self) -> tuple[int, str, list[tuple[str, str]]]:
        """Return a stable owner id for capture queue jobs.

        Hosted PARA requires a signed-in account. Loopback/local PARA keeps the
        capture pipeline available without cloud auth.
        """
        server_host = str(self.server.server_address[0] if self.server and self.server.server_address else "")
        try:
            local_server = ipaddress.ip_address(server_host).is_loopback
        except ValueError:
            local_server = False
        if local_server:
            return 200, "local", []
        status, session, _, refreshed_headers = self._authenticated_access()
        if status != 200:
            return 401, "", refreshed_headers
        owner = str(session.get("user", {}).get("id") or "")
        if not owner:
            return 401, "", refreshed_headers
        return 200, owner, refreshed_headers

    def _send_file(self, path: Path, content_type: str | None = None) -> None:
        try:
            body = path.read_bytes()
        except OSError:
            self._send_json(404, {"error": "not_found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self, maximum: int = 65_536) -> dict | None:
        if self.headers.get_content_type() != "application/json":
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length < 2 or length > maximum:
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def do_GET(self) -> None:  # noqa: N802
        request = urlparse(self.path)
        if request.path in {"/privacy", "/privacy/"}:
            self._send_file(HOME_ROOT / "privacy" / "index.html", "text/html; charset=utf-8")
            return
        if request.path in {"/api/v1/capture/normalize/status", "/api/v1/capture/normalize/result"}:
            access_status, owner, refreshed_headers = self._capture_access_owner()
            if access_status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to process PARA gameplay captures."}, refreshed_headers)
                return
            job_id = str(parse_qs(request.query).get("id", [""])[0] or "")
            if request.path.endswith("/status"):
                job_status, payload = capture_normalization_status(job_id, owner)
                self._send_json(job_status, payload, refreshed_headers)
                return
            result_status, result = consume_capture_normalization_result(job_id, owner)
            if result_status != 200 or not isinstance(result, (bytes, bytearray)):
                self._send_json(result_status, result if isinstance(result, dict) else {"error": "capture_result_missing"}, refreshed_headers)
                return
            headers = [
                *refreshed_headers,
                ("X-PARA-Capture-Normalized", "1"),
                ("X-PARA-Video-Codec", "h264"),
                ("X-PARA-Audio-Codec", "aac"),
            ]
            self._send_bytes(200, bytes(result), "video/mp4", headers)
            return
        if request.path == "/api/v1/achievements/progress":
            status, _, access, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to load online achievements.", "online": False, "items": []}, refreshed_headers)
                return
            progress_status, result = achievement_progress_for_user(access)
            self._send_json(progress_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/integrations/google/connect":
            status, _, _, refreshed_headers = self._authenticated_access()
            destination_base = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/setup?integration=google"
            if status != 200:
                self._send_redirect(destination_base + "&status=signin_required", extra_headers=refreshed_headers)
                return
            if not google_oauth_configured():
                self._send_redirect(destination_base + "&status=config_required", extra_headers=refreshed_headers)
                return
            state = secrets.token_urlsafe(32)
            headers = [*refreshed_headers, *self._google_state_cookie_headers(state)]
            self._send_redirect(google_oauth_login_url(state), extra_headers=headers)
            return
        if request.path == "/api/v1/integrations/google/youtube/authorize":
            status, _, _, refreshed_headers = self._authenticated_access()
            destination_base = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/media-gallery?youtube_upload="
            if status != 200:
                self._send_redirect(destination_base + "signin_required", extra_headers=refreshed_headers)
                return
            if not google_oauth_configured():
                self._send_redirect(destination_base + "config_required", extra_headers=refreshed_headers)
                return
            state = "ytup_" + secrets.token_urlsafe(32)
            headers = [*refreshed_headers, *self._google_state_cookie_headers(state)]
            self._send_redirect(google_oauth_login_url(state, upload=True), extra_headers=headers)
            return
        if request.path == "/api/v1/integrations/google/callback":
            query = parse_qs(request.query, keep_blank_values=True)
            state = str(query.get("state", [""])[0] or "")
            cookie_state = self._cookies().get(GOOGLE_OAUTH_STATE_COOKIE, "")
            clear_state = self._google_state_cookie_headers(clear=True)
            upload_flow = state.startswith("ytup_")
            setup_destination = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/setup?integration=google"
            upload_destination = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/media-gallery?youtube_upload="
            def callback_destination(status_name: str, reason: str = "") -> str:
                if upload_flow:
                    return upload_destination + urllib.parse.quote(status_name, safe="") + (("&reason=" + urllib.parse.quote(reason, safe="")) if reason else "")
                result = setup_destination + "&status=" + urllib.parse.quote(status_name, safe="")
                return result + (("&reason=" + urllib.parse.quote(reason, safe="")) if reason else "")
            if not state or not cookie_state or not hmac.compare_digest(state, cookie_state):
                self._send_redirect(callback_destination("error", "state"), extra_headers=clear_state)
                return
            status, session, access, refreshed_headers = self._authenticated_access()
            callback_headers = [*refreshed_headers, *clear_state]
            if status != 200:
                self._send_redirect(callback_destination("signin_required"), extra_headers=callback_headers)
                return
            oauth_error = str(query.get("error", [""])[0] or "")
            if oauth_error:
                result_status = "cancelled" if oauth_error in {"access_denied", "interaction_required"} else "error"
                self._send_redirect(callback_destination(result_status, "oauth"), extra_headers=callback_headers)
                return
            token_status, token_payload = exchange_google_oauth_code(str(query.get("code", [""])[0] or ""))
            if token_status != 200:
                self._send_redirect(callback_destination("error", "token"), extra_headers=callback_headers)
                return
            google_access = str(token_payload.get("access_token") or "")
            granted_scopes = set(str(token_payload.get("scope") or "").split())
            if upload_flow and YOUTUBE_UPLOAD_SCOPE not in granted_scopes:
                self._send_redirect(callback_destination("scope_required", "youtube_upload"), extra_headers=callback_headers)
                return
            identity_status, identity = google_identity(google_access)
            if identity_status != 200:
                self._send_redirect(callback_destination("error", "identity"), extra_headers=callback_headers)
                return
            youtube_status, channel = youtube_channel(google_access)
            if youtube_status != 200:
                self._send_redirect(callback_destination("error", "youtube"), extra_headers=callback_headers)
                return
            user_id = str(session.get("user", {}).get("id") or "")
            save_status, _ = connect_external_account(access, user_id, identity, channel)
            if save_status != 200:
                self._send_redirect(callback_destination("error", "storage"), extra_headers=callback_headers)
                return
            if upload_flow:
                upload_session = create_youtube_upload_session(google_access, int(token_payload.get("expires_in") or 3600))
                if not upload_session:
                    self._send_redirect(callback_destination("error", "upload_session"), extra_headers=callback_headers)
                    return
                self._send_redirect(callback_destination("authorized"), extra_headers=[*callback_headers, *self._youtube_upload_cookie_headers(upload_session)])
                return
            channel_state = "found" if channel.get("found") else "none"
            self._send_redirect(callback_destination("connected") + f"&youtube={channel_state}", extra_headers=callback_headers)
            return
        if request.path == "/api/v1/integrations/google/status":
            status, _, access, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "provider": "google", "connected": False, "configured": google_oauth_configured()}, refreshed_headers)
                return
            account_status, result = external_account_status(access, "google")
            self._send_json(account_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/integrations/steam/connect":
            status, session, _, refreshed_headers = self._authenticated_access()
            if status != 200:
                destination = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/setup?integration=steam&status=signin_required"
                self._send_redirect(destination, extra_headers=refreshed_headers)
                return
            state = secrets.token_urlsafe(32)
            headers = [*refreshed_headers, *self._steam_state_cookie_headers(state)]
            self._send_redirect(steam_openid_login_url(state), extra_headers=headers)
            return
        if request.path == "/api/v1/integrations/steam/callback":
            query = parse_qs(request.query, keep_blank_values=True)
            state = str(query.get("state", [""])[0] or "")
            cookie_state = self._cookies().get(STEAM_OPENID_STATE_COOKIE, "")
            clear_state = self._steam_state_cookie_headers(clear=True)
            destination_base = PARA_ACCOUNT_PUBLIC_URL.rstrip("/") + "/#/setup?integration=steam"
            if not state or not cookie_state or not hmac.compare_digest(state, cookie_state):
                self._send_redirect(destination_base + "&status=error&reason=state", extra_headers=clear_state)
                return
            status, session, access, refreshed_headers = self._authenticated_access()
            callback_headers = [*refreshed_headers, *clear_state]
            if status != 200:
                self._send_redirect(destination_base + "&status=signin_required", extra_headers=callback_headers)
                return
            verify_status, verified = verify_steam_openid(query, state)
            if verify_status != 200:
                result_status = "cancelled" if verified.get("error") == "steam_cancelled" else "error"
                self._send_redirect(destination_base + f"&status={result_status}&reason=verification", extra_headers=callback_headers)
                return
            user_id = str(session.get("user", {}).get("id") or "")
            save_status, _ = connect_gaming_account(access, user_id, "steam", str(verified.get("provider_user_id") or ""))
            if save_status != 200:
                self._send_redirect(destination_base + "&status=error&reason=storage", extra_headers=callback_headers)
                return
            self._send_redirect(destination_base + "&status=connected", extra_headers=callback_headers)
            return
        if request.path == "/api/v1/integrations/steam/status":
            status, _, access, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "provider": "steam", "connected": False}, refreshed_headers)
                return
            account_status, result = gaming_account_status(access, "steam")
            self._send_json(account_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/auth/session":
            status, payload, headers = self._auth_session()
            self._send_json(status, payload, headers)
            return
        if request.path == "/api/v1/backgrounds/custom":
            profile = parse_qs(request.query).get("profile", [""])[0]
            path, content_type = system_layer.custom_background_path(profile)
            if path is None:
                self._send_json(404, {"error": "not_found"})
            else:
                self._send_file(path, content_type)
            return
        if request.path.startswith("/api/v1/store/content/"):
            rest = request.path[len("/api/v1/store/content/"):]
            item_id, _, relative = rest.partition("/")
            status, body, content_type = store_content(urllib.parse.unquote(item_id), relative or "index.html")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if request.path == "/api/v1/store/asset":
            path = parse_qs(request.query).get("path", [""])[0]
            status, body, content_type = _storage_fetch("developer-assets", path)
            if status != 200:
                self._send_json(status, {"error": "asset_unavailable"})
            else:
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=300")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        if request.path == "/api/v1/store/download":
            item_id = parse_qs(request.query).get("id", [""])[0]
            status, body, content_type, filename = store_download(item_id)
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if request.path.startswith("/api/"):
            status, payload = resolve(request.path.rstrip("/"), parse_qs(request.query))
            self._send_json(status, payload)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        request = urlparse(self.path)
        if request.path == "/api/v1/capture/normalize":
            access_status, owner, refreshed_headers = self._capture_access_owner()
            if access_status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to process PARA gameplay captures."}, refreshed_headers)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length < 1024 or length > CAPTURE_NORMALIZE_MAX_BYTES:
                self._send_json(413, {
                    "error": "capture_size_invalid",
                    "message": "Choose a non-empty gameplay capture smaller than 256 MB.",
                }, refreshed_headers)
                return
            content_type = str(self.headers.get("Content-Type") or "video/webm").split(";", 1)[0].strip().lower()
            if content_type not in CAPTURE_NORMALIZE_CONTENT_TYPES:
                self._send_json(415, {
                    "error": "capture_format_invalid",
                    "message": "PARA capture processing currently accepts temporary WebM recordings only.",
                }, refreshed_headers)
                return

            temporary = Path(tempfile.mkdtemp(prefix="para-capture-job-"))
            input_path = temporary / "capture.webm"
            output_path = temporary / "capture.mp4"
            remaining = length
            try:
                with input_path.open("wb") as destination:
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        destination.write(chunk)
                        remaining -= len(chunk)
                if remaining != 0 or input_path.stat().st_size != length:
                    shutil.rmtree(temporary, ignore_errors=True)
                    self._send_json(400, {
                        "error": "capture_upload_incomplete",
                        "message": "The capture upload ended before PARA received the complete recording.",
                    }, refreshed_headers)
                    return
            except OSError:
                shutil.rmtree(temporary, ignore_errors=True)
                self._send_json(500, {
                    "error": "capture_upload_failed",
                    "message": "PARA could not stage this capture for processing.",
                }, refreshed_headers)
                return

            queue_status, payload = enqueue_capture_normalization(input_path, output_path, temporary, owner)
            if queue_status != 202:
                shutil.rmtree(temporary, ignore_errors=True)
                self._send_json(queue_status, payload, refreshed_headers)
                return
            self._send_json(202, payload, [*refreshed_headers, ("Retry-After", "1")])
            return

        if request.path == "/api/v1/integrations/google/youtube/upload":
            status, _, para_access, refreshed_headers = self._authenticated_access()
            clear_upload_cookie = self._youtube_upload_cookie_headers(clear=True)
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}, refreshed_headers)
                return
            upload_session_id = self._cookies().get(YOUTUBE_UPLOAD_SESSION_COOKIE, "")
            google_access = youtube_upload_session_access(upload_session_id)
            if not google_access:
                self._send_json(401, {"error": "youtube_upload_authorization_required", "message": "Authorize YouTube upload access and try again."}, [*refreshed_headers, *clear_upload_cookie])
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length < 1 or length > YOUTUBE_UPLOAD_MAX_BYTES:
                self._send_json(413, {"error": "youtube_video_size_invalid", "message": "Choose a non-empty capture smaller than 2 GB."}, refreshed_headers)
                return
            content_type = str(self.headers.get("Content-Type") or "video/webm").split(";", 1)[0].strip().lower()
            if not content_type.startswith("video/"):
                self._send_json(415, {"error": "youtube_video_required", "message": "YouTube direct upload only supports PARA video captures."}, refreshed_headers)
                return
            query = parse_qs(request.query, keep_blank_values=True)
            title = str(query.get("title", [""])[0] or "").strip()
            description = str(query.get("description", [""])[0] or "")
            privacy = str(query.get("privacy", ["private"])[0] or "private").lower()
            audience = str(query.get("made_for_kids", [""])[0] or "").lower()
            tags = [tag.strip() for tag in str(query.get("tags", [""])[0] or "").split(",") if tag.strip()][:40]
            category_id = str(query.get("category_id", ["20"])[0] or "20").strip()
            publish_at = str(query.get("publish_at", [""])[0] or "").strip()
            thumbnail_pending = str(query.get("thumbnail_pending", ["false"])[0] or "false").lower() == "true"
            if not title or len(title) > 100:
                self._send_json(400, {"error": "youtube_title_invalid", "message": "Enter a YouTube title between 1 and 100 characters."}, refreshed_headers)
                return
            if len(description) > 5000:
                self._send_json(400, {"error": "youtube_description_invalid", "message": "YouTube descriptions can be up to 5,000 characters."}, refreshed_headers)
                return
            if privacy not in {"private", "unlisted", "public"}:
                self._send_json(400, {"error": "youtube_privacy_invalid", "message": "Choose Private, Unlisted, or Public."}, refreshed_headers)
                return
            if audience not in {"true", "false"}:
                self._send_json(400, {"error": "youtube_audience_required", "message": "Choose whether this video is made for kids."}, refreshed_headers)
                return
            if len(",".join(tags)) > 500:
                self._send_json(400, {"error": "youtube_tags_invalid", "message": "YouTube tags can total up to 500 characters."}, refreshed_headers)
                return
            if not category_id.isdigit() or len(category_id) > 8:
                self._send_json(400, {"error": "youtube_category_invalid", "message": "Choose a valid YouTube video category."}, refreshed_headers)
                return
            if publish_at:
                try:
                    parsed_publish = datetime.fromisoformat(publish_at.replace("Z", "+00:00"))
                    if parsed_publish.tzinfo is None:
                        parsed_publish = parsed_publish.replace(tzinfo=timezone.utc)
                    if parsed_publish.timestamp() < time.time() + 60:
                        raise ValueError
                    publish_at = parsed_publish.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                    privacy = "private"
                except ValueError:
                    self._send_json(400, {"error": "youtube_publish_time_invalid", "message": "Choose a scheduled publish time at least one minute in the future."}, refreshed_headers)
                    return
            init_status, init_payload = begin_youtube_resumable_upload(
                google_access, title=title, description=description, privacy_status=privacy, made_for_kids=(audience == "true"), content_type=content_type, content_length=length,
                tags=tags, category_id=category_id, publish_at=publish_at,
            )
            if init_status not in {200, 201}:
                self._send_json(init_status, init_payload, refreshed_headers)
                return
            upload_status, result = stream_youtube_resumable_upload(str(init_payload.get("location") or ""), self.rfile, content_type=content_type, content_length=length)
            if upload_status == 200:
                result["publish_at"] = publish_at or None
                channel_status, channel = youtube_channel(google_access)
                if channel_status == 200 and channel.get("found"):
                    refresh_external_youtube_stats(para_access, channel)
                    result["creator_stats"] = {
                        "youtube_subscriber_count": channel.get("youtube_subscriber_count"),
                        "youtube_view_count": channel.get("youtube_view_count"),
                        "youtube_video_count": channel.get("youtube_video_count"),
                    }
                if thumbnail_pending:
                    self._send_json(upload_status, result, refreshed_headers)
                else:
                    clear_youtube_upload_session(upload_session_id)
                    self._send_json(upload_status, result, [*refreshed_headers, *clear_upload_cookie])
            else:
                self._send_json(upload_status, result, refreshed_headers)
            return

        if request.path == "/api/v1/integrations/google/youtube/thumbnail":
            status, _, _, refreshed_headers = self._authenticated_access()
            clear_upload_cookie = self._youtube_upload_cookie_headers(clear=True)
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}, refreshed_headers)
                return
            upload_session_id = self._cookies().get(YOUTUBE_UPLOAD_SESSION_COOKIE, "")
            google_access = youtube_upload_session_access(upload_session_id)
            if not google_access:
                self._send_json(401, {"error": "youtube_upload_authorization_required", "message": "Authorize YouTube upload access before setting a thumbnail."}, [*refreshed_headers, *clear_upload_cookie])
                return
            query = parse_qs(request.query, keep_blank_values=True)
            video_id = str(query.get("video_id", [""])[0] or "").strip()
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            content_type = str(self.headers.get("Content-Type") or "image/jpeg").split(";", 1)[0].strip().lower()
            if not video_id or length < 1 or length > 2 * 1024 * 1024 or content_type not in {"image/jpeg", "image/png"}:
                clear_youtube_upload_session(upload_session_id)
                self._send_json(400, {"error": "youtube_thumbnail_invalid", "message": "Custom thumbnails must be a JPEG or PNG image no larger than 2 MB."}, [*refreshed_headers, *clear_upload_cookie])
                return
            image_bytes = self.rfile.read(length)
            thumb_status, thumb_result = set_youtube_thumbnail(google_access, video_id, image_bytes, content_type)
            clear_youtube_upload_session(upload_session_id)
            self._send_json(thumb_status, thumb_result, [*refreshed_headers, *clear_upload_cookie])
            return

        if request.path == "/api/v1/backgrounds/custom":
            profile = parse_qs(request.query).get("profile", [""])[0]
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length < 1 or length > 12_000_000:
                self._send_json(400, {"error": "invalid_image"})
                return
            status, result = system_layer.save_custom_background(profile, self.headers.get_content_type(), self.rfile.read(length))
            self._send_json(status, result)
            return

        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"error": "invalid_request"})
            return
        if request.path in {"/api/v1/achievements/unlock", "/api/v1/achievements/progress"}:
            status, session, _, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to save achievements online.", "online": False}, refreshed_headers)
                return
            user_id = str(session.get("user", {}).get("id") or "")
            value = 1 if request.path.endswith("/unlock") else payload.get("progress", 0)
            progress_status, result = update_online_achievement(
                user_id,
                str(payload.get("project_id", "")),
                str(payload.get("achievement_key", "")),
                value,
            )
            self._send_json(progress_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/integrations/google/disconnect":
            status, _, access, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}, refreshed_headers)
                return
            disconnect_status, result = disconnect_external_account(access, "google")
            self._send_json(disconnect_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/integrations/steam/disconnect":
            status, _, access, refreshed_headers = self._authenticated_access()
            if status != 200:
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}, refreshed_headers)
                return
            disconnect_status, result = disconnect_gaming_account(access, "steam")
            self._send_json(disconnect_status, result, refreshed_headers)
            return
        if request.path == "/api/v1/auth/signup":
            status, result, tokens = auth_sign_up(str(payload.get("email", "")), str(payload.get("password", "")), str(payload.get("display_name", "")))
            self._send_json(status, result, self._auth_cookie_headers(tokens))
            return
        if request.path == "/api/v1/auth/signin":
            status, result, tokens = auth_sign_in(str(payload.get("email", "")), str(payload.get("password", "")))
            self._send_json(status, result, self._auth_cookie_headers(tokens))
            return
        if request.path == "/api/v1/auth/recovery/request":
            status, result = auth_request_password_recovery(str(payload.get("email", "")))
            self._send_json(status, result)
            return
        if request.path == "/api/v1/auth/recovery/complete":
            status, result, tokens = auth_complete_password_recovery(
                str(payload.get("access_token", "")),
                str(payload.get("refresh_token", "")),
                payload.get("expires_in", 3600),
                str(payload.get("password", "")),
            )
            self._send_json(status, result, self._auth_cookie_headers(tokens))
            return
        if request.path == "/api/v1/auth/verification/request":
            status, result = auth_request_email_verification(str(payload.get("email", "")), self.client_address[0] if self.client_address else "local")
            self._send_json(status, result)
            return
        if request.path == "/api/v1/auth/verification/verify":
            email = str(payload.get("email", ""))
            status, result = auth_verify_email_code(email, str(payload.get("code", "")))
            extra_headers: list[tuple[str, str]] = []
            if status == 200:
                session_status, session, refreshed_headers = self._auth_session()
                extra_headers = refreshed_headers
                if session_status == 200 and session.get("signed_in") and str(session.get("user", {}).get("email") or "").strip().lower() == _normalize_verification_email(email):
                    access = self._cookies().get(AUTH_ACCESS_COOKIE, "")
                    if refreshed_headers:
                        for key, value in refreshed_headers:
                            if key.lower() == "set-cookie" and value.startswith(AUTH_ACCESS_COOKIE + "="):
                                access = value.split(";", 1)[0].split("=", 1)[1]
                                break
                    mark_status, mark_result = auth_mark_para_email_verified(access)
                    if mark_status == 200:
                        result["user"] = mark_result.get("user")
                        result["account_updated"] = True
                    else:
                        result["account_updated"] = False
            self._send_json(status, result, extra_headers)
            return
        if request.path == "/api/v1/auth/signout":
            cookies = self._cookies()
            access = cookies.get(AUTH_ACCESS_COOKIE, "")
            if access:
                _supabase_auth_request("/auth/v1/logout", method="POST", bearer=access)
            self._send_json(200, {"signed_in": False, "user": None}, self._auth_cookie_headers(clear=True))
            return
        if request.path in {"/api/v1/auth/profile", "/api/v1/auth/password"}:
            session_status, session, refreshed_headers = self._auth_session()
            if session_status != 200 or not session.get("signed_in"):
                self._send_json(401, {"error": "not_signed_in", "message": "Sign in to your PARA Account first."}, refreshed_headers)
                return
            cookies = self._cookies()
            access = cookies.get(AUTH_ACCESS_COOKIE, "")
            if refreshed_headers:
                # A refresh happened; parse the newly issued access token directly from the header.
                for key, value in refreshed_headers:
                    if key.lower() == "set-cookie" and value.startswith(AUTH_ACCESS_COOKIE + "="):
                        access = value.split(";", 1)[0].split("=", 1)[1]
                        break
            if request.path == "/api/v1/auth/profile":
                status, result = auth_update_user(access, display_name=str(payload.get("display_name", "")))
            else:
                status, result = auth_update_user(access, password=str(payload.get("password", "")))
            self._send_json(status, result, refreshed_headers)
            return
        if request.path == "/api/v1/apps/launch":
            status, result = system_layer.launch_application(str(payload.get("id", "")))
        elif request.path == "/api/v1/store/checkout/quote":
            ids = payload.get("ids") if isinstance(payload.get("ids"), list) else []
            status, result = store_checkout_quote(ids)
        elif request.path == "/api/v1/audio":
            status, result = system_layer.set_audio(str(payload.get("kind", "")), volume=payload.get("volume"), muted=payload.get("muted"))
        elif request.path == "/api/v1/personalization":
            status, result = system_layer.save_personalization(str(payload.get("profile", "")), payload.get("preferences"))
        elif request.path == "/api/v1/power":
            status, result = system_layer.request_power_action(str(payload.get("action", "")))
        elif request.path == "/api/v1/files/action":
            status, result = system_layer.file_action(str(payload.get("action", "")), payload)
        elif request.path == "/api/v1/volumes/action":
            status, result = system_layer.volume_action(str(payload.get("action", "")), str(payload.get("device", "")))
        else:
            self._send_json(404, {"error": "not_found"})
            return
        self._send_json(status, result)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve PARA Home and the PARA API")
    parser.add_argument("--host", default="127.0.0.1", help="Numeric bind address")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--allow-nonlocal", action="store_true", help="Permit a hosted public bind")
    parser.add_argument("--enable-app-launch", action="store_true", help="Expose and launch discovered local applications and games")
    parser.add_argument("--enable-power-actions", action="store_true", help="Permit fixed suspend, reboot, and poweroff requests on a local bind")
    parser.add_argument("--enable-file-operations", action="store_true", help="Permit file opening, file changes, Trash, and volume actions on a local bind")
    return parser.parse_args()


def validate_bind(host: str, allow_nonlocal: bool = False):
    try:
        address = ipaddress.ip_address(host)
    except ValueError as error:
        raise ValueError(f"PARA server requires a numeric address: {error}") from error
    if not address.is_loopback and not allow_nonlocal:
        raise ValueError("Refusing a non-loopback bind without --allow-nonlocal")
    return address


def main() -> int:
    args = parse_args()
    validate_bind(args.host, args.allow_nonlocal)
    env_launch = os.environ.get("PARA_ENABLE_APP_LAUNCH", "").strip().casefold() in {"1", "true", "yes", "on"}
    launch_enabled = (args.enable_app_launch or env_launch) and not args.allow_nonlocal
    power_enabled = args.enable_power_actions and not args.allow_nonlocal
    file_operations_enabled = args.enable_file_operations and not args.allow_nonlocal
    controls_enabled = not args.allow_nonlocal
    system_layer.configure(
        launch_enabled=launch_enabled,
        controls_enabled=controls_enabled,
        power_enabled=power_enabled,
        file_operations_enabled=file_operations_enabled,
        web_edition=args.allow_nonlocal,
    )
    server = ThreadingHTTPServer((args.host, args.port), ParaHandler)
    print(f"PARA API + Home: http://{args.host}:{args.port}")
    host_os = platform.system()
    print(f"{host_os} application/game launch is enabled." if launch_enabled else f"{host_os} application/game launch is off.")
    print("Linux power actions are enabled." if power_enabled else "Linux power actions are off.")
    print("Linux file operations are enabled." if file_operations_enabled else "Linux file operations are read-only.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
