#!/usr/bin/env python3
"""PARA API server for the hosted console UI and local system bridge."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
import os
import platform
import urllib.error
import urllib.parse
import urllib.request
import io
import zipfile
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
HOME_ROOT = REPO_ROOT / "apps" / "para-home"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import system_layer  # noqa: E402



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
            injection = (
                f'<base href="{runtime_base}">\n'
                + (
                    r'''<script data-para-runtime>
(() => {
  const BASE = __PARA_BASE__;
  const RUNTIME_ID = __PARA_RUNTIME_ID__;
  const GAME_TITLE = __PARA_GAME_TITLE__;
  const GAME_RETURN_TRANSITION_KEY = 'para.game.transition.return';
  let paraGameTransitionLeaving = false;
  let gameSuspended = false;
  let gameClosing = false;
  let suspendShellHost = null;
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
    .para-game-page-transition{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#030207;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transition:opacity .28s ease}
    .para-game-page-transition::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 48%,rgba(124,54,235,.2),transparent 28%),radial-gradient(circle at 50% 50%,rgba(96,28,188,.08),transparent 54%),#030207;transform:scale(1.035);transition:transform .62s cubic-bezier(.2,.86,.24,1)}
    .para-game-page-transition>div{position:relative;display:grid;justify-items:center;gap:9px;text-align:center;opacity:0;transform:translateY(12px) scale(.985);transition:opacity .24s ease .08s,transform .42s cubic-bezier(.2,.86,.24,1) .04s}
    .para-game-page-transition b{width:46px;height:46px;display:grid;place-items:center;border:2px solid rgba(184,133,255,.38);border-top-color:#b66fff;border-radius:50%;box-shadow:0 0 26px rgba(142,74,255,.18);animation:paraGameSpin .9s linear infinite}
    .para-game-page-transition span{color:#aaa0b7;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    .para-game-page-transition strong{max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(20px,2.3vw,32px);letter-spacing:-.03em}
    .para-game-page-transition.is-visible{opacity:1;pointer-events:all}.para-game-page-transition.is-visible::before{transform:scale(1)}.para-game-page-transition.is-visible>div{opacity:1;transform:none}
    .para-game-page-transition.is-revealing{opacity:0;pointer-events:none}.para-game-page-transition.is-revealing>div{opacity:0;transform:translateY(-8px) scale(1.01)}
    @keyframes paraGameSpin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.para-game-page-transition,.para-game-page-transition::before,.para-game-page-transition>div{transition-duration:.001ms!important}.para-game-page-transition b{animation:none!important}}
  `;
  document.documentElement.appendChild(transitionStyle);

  function createGamePageTransition(label, title = GAME_TITLE) {
    const node = document.createElement('div');
    node.className = 'para-game-page-transition';
    node.setAttribute('role', 'status');
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
      const frame = suspendShellHost?.querySelector('iframe');
      if (frame) frame.src = suspendedShellSource(destination);
      return;
    }
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
    closeGameRuntime();
    const node = createGamePageTransition('Switching Games');
    node.classList.add('is-visible');
    const next = `/api/v1/store/content/${encodeURIComponent(id)}/index.html?para_game_mode=1&para_build=v17`;
    setTimeout(() => { location.href = next; }, 430);
  }

  function leaveGame(destination = '/#/home') {
    suspendGame(destination);
  }

  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== suspendShellHost?.querySelector('iframe')?.contentWindow) return;
    const data = event.data || {};
    if (data.type !== 'para-suspended-game-command') return;
    if (data.command === 'resume') return resumeSuspendedGame();
    if (data.command === 'close') return closeSuspendedGame('/#/home');
    if (data.command === 'launch') return switchSuspendedGame(data.storeId);
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', revealGameAfterLaunch, { once: true });
  else revealGameAfterLaunch();

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

  if (window.top !== window.self) return;

  const PARA_CAPTURE_HANDLE = `para-self-capture:${location.origin}`;
  const DB_NAME = 'para-media-gallery';
  const DB_STORE = 'captures';
  let shellOpen = false;
  let contextName = '';
  let manualRecording = null;
  let replay = null;
  let sessionSelfCapture = null;
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
    return { recent: [], running: [], installedDemos: [], downloads: [], notifications: [], marks: [], ...(state.profileRuntime?.[profile] || {}) };
  }

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
    try { sessionSelfCapture?.getTracks?.().forEach((track) => track.stop()); } catch (_) {}
    sessionSelfCapture = null;
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

  function configureCaptureHandle() {
    try {
      navigator.mediaDevices?.setCaptureHandleConfig?.({
        handle: PARA_CAPTURE_HANDLE,
        exposeOrigin: false,
        permittedOrigins: ['*']
      });
    } catch (_) {}
  }
  configureCaptureHandle();

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

  async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0, captureMode = '' }) {
    const db = await openDb();
    const item = {
      id: crypto.randomUUID?.() || `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type, blob, mimeType: blob.type, width, height, durationMs, captureMode,
      createdAt: Date.now(), source: 'PARA', captureVersion: 3
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

  function liveSessionSelfCapture() {
    if (!sessionSelfCapture) return null;
    if (sessionSelfCapture.getVideoTracks().some((track) => track.readyState === 'live')) return sessionSelfCapture;
    sessionSelfCapture = null;
    return null;
  }

  async function requestSessionSelfCapture(audio = false) {
    const existing = liveSessionSelfCapture();
    if (existing) {
      const stream = new MediaStream([
        ...existing.getVideoTracks(),
        ...(audio ? existing.getAudioTracks() : [])
      ]);
      stream.__paraCaptureWidth = Number(existing.getVideoTracks()[0]?.getSettings?.().width || innerWidth || 0);
      stream.__paraCaptureHeight = Number(existing.getVideoTracks()[0]?.getSettings?.().height || innerHeight || 0);
      stream.__paraCaptureMode = 'self-tab-element';
      stream.__paraKeepAlive = true;
      return stream;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This game needs browser self-tab capture, which is unavailable here.');
    toast('This renderer needs one Chrome permission once. Choose This Tab.');
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude'
    });
    const videoTrack = display.getVideoTracks()[0];
    if (!videoTrack) {
      display.getTracks().forEach((track) => track.stop());
      throw new Error('Chrome did not provide a game video track.');
    }
    const captureHandle = videoTrack.getCaptureHandle?.();
    if (captureHandle?.handle && captureHandle.handle !== PARA_CAPTURE_HANDLE) {
      display.getTracks().forEach((track) => track.stop());
      throw new Error('Choose This Tab so PARA records the game instead of another tab or window.');
    }

    // Chromium 132+ can remove PARA's system shell from the recording and
    // capture only the game document body. This still needs the browser's
    // one-time self-tab permission because a hosted web app cannot bypass it.
    try {
      if (globalThis.RestrictionTarget?.fromElement && typeof videoTrack.restrictTo === 'function' && document.body) {
        document.body.style.isolation ||= 'isolate';
        document.body.style.transformStyle = 'flat';
        const target = await RestrictionTarget.fromElement(document.body);
        await videoTrack.restrictTo(target);
      }
    } catch (_) {}
    try { videoTrack.contentHint = 'motion'; } catch (_) {}
    sessionSelfCapture = display;
    videoTrack.addEventListener('ended', () => { if (sessionSelfCapture === display) sessionSelfCapture = null; }, { once: true });

    const stream = new MediaStream([
      videoTrack,
      ...(audio ? display.getAudioTracks() : [])
    ]);
    const settings = videoTrack.getSettings?.() || {};
    stream.__paraCaptureWidth = Number(settings.width || innerWidth || 0);
    stream.__paraCaptureHeight = Number(settings.height || innerHeight || 0);
    stream.__paraCaptureMode = 'self-tab-element';
    stream.__paraKeepAlive = true;
    return stream;
  }

  async function requestGameStream(audio = false) {
    try {
      return await requestCompositedGameStream(audio);
    } catch (directError) {
      const stream = await requestSessionSelfCapture(audio);
      stream.__paraFallbackReason = directError?.message || 'Direct game capture was blank.';
      return stream;
    }
  }

  function recorderMimeType(hasAudio = false) {
    const probe = document.createElement('video');
    const types = hasAudio
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((type) => MediaRecorder.isTypeSupported?.(type) && probe.canPlayType(type) !== '') || '';
  }

  async function verifyRecordedBlob(blob) {
    if (!blob?.size || blob.size < 1024) throw new Error('PARA did not receive enough gameplay video data.');
    const url = URL.createObjectURL(blob);
    try {
      await new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const timer = setTimeout(() => reject(new Error('The gameplay recording could not be decoded.')), 7000);
        const done = () => {
          clearTimeout(timer);
          if (!video.videoWidth || !video.videoHeight) {
            reject(new Error('The gameplay recording contains no visible video frames.'));
            return;
          }
          resolve();
        };
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.addEventListener('loadeddata', done, { once: true });
        video.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new Error('Chrome could not decode the gameplay recording.'));
        }, { once: true });
        video.src = url;
        video.load();
      });
    } finally {
      URL.revokeObjectURL(url);
    }
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
      .contextCopy span,.contextCopy strong,.contextCopy small{display:block}
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
      #recording{pointer-events:auto;position:fixed;top:16px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:9px;padding:9px 13px;border:1px solid rgba(255,105,121,.4);border-radius:999px;color:#fff;background:rgba(17,7,11,.86);box-shadow:0 12px 36px rgba(0,0,0,.35);;cursor:pointer;font:750 11px/1 system-ui,sans-serif}
      #recording.show{display:flex}
      #recording i{width:8px;height:8px;border-radius:50%;background:#ff5266;box-shadow:0 0 12px #ff5266}
      #toast{position:fixed;left:50%;bottom:138px;transform:translate(-50%,18px);padding:10px 14px;border:1px solid rgba(203,162,255,.28);border-radius:12px;color:#fff;background:rgba(8,6,12,.92);font:700 12px/1.3 system-ui,sans-serif;opacity:0;pointer-events:none;transition:.18s ease}
      #toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:820px){.dock{width:calc(100vw - 16px)}.strip{max-width:calc(100vw - 16px)}.tile{flex-basis:60px;min-width:60px}.context{width:calc(100vw - 24px);align-items:flex-start;flex-direction:column}.contextActions{justify-content:flex-start}}
    </style>
    <button id="systemButton" type="button" aria-label="Open PARA Control Center"></button>
    <button id="recording" type="button" aria-label="Stop and save recording"><i></i><span>Recording · Stop & Save</span></button>
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
  `;
  document.documentElement.appendChild(host);

  const $ = (selector) => shadow.querySelector(selector);
  const overlay = $('#overlay');
  const context = $('#context');
  const recordingPill = $('#recording');
  const systemButton = $('#systemButton');
  const toastBox = $('#toast');
  let toastTimer = 0;

  function toast(message) {
    clearTimeout(toastTimer);
    toastBox.textContent = message;
    toastBox.classList.add('show');
    toastTimer = setTimeout(() => toastBox.classList.remove('show'), 2600);
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
      context.innerHTML = pad
        ? `<div class="contextCopy"><span>Controller</span><strong>${escapeMarkup(pad.id || 'Controller')}</strong><small>Connected</small></div><div class="contextActions"><button data-context-action="controller-settings">Controller Settings</button></div>`
        : `<div class="contextCopy"><span>Controller</span><strong>No controller connected</strong><small>Keyboard controls remain available.</small></div>`;
    } else if (name === 'profile') {
      const state = readHomeState();
      const profile = state.activeProfile || state.setupChoices?.profileName || '';
      context.innerHTML = profile
        ? `<div class="contextCopy"><span>Profile</span><strong>${escapeMarkup(profile)}</strong></div><div class="contextActions"><button data-context-action="account-settings">Account Settings</button></div>`
        : `<div class="contextCopy"><span>Profile</span><strong>Profile unavailable</strong></div>`;
    } else if (name === 'downloads') {
      const runtime = readProfileRuntime();
      const downloads = (runtime.downloads || []).filter((item) => ['Queued','Downloading','Paused'].includes(item.queueStatus));
      context.innerHTML = downloads.length
        ? `<div class="contextCopy"><span>Downloading</span><strong>${escapeMarkup(downloads[0].title || 'Download')}</strong><small>${Number(downloads[0].progress || 0)}%</small></div><div class="contextActions"><button data-context-action="downloads-open">Open Downloads</button></div>`
        : `<div class="contextCopy"><span>Downloads</span><strong>No active downloads</strong></div>`;
    } else if (name === 'notifications') {
      const runtime = readProfileRuntime();
      const notifications = runtime.notifications || [];
      context.innerHTML = `<div class="contextCopy"><span>Notifications</span><strong>${notifications.length ? `${notifications.length} new` : 'You’re all caught up'}</strong></div>${notifications.length ? '<div class="contextActions"><button data-context-action="notifications-open">View Notifications</button></div>' : ''}`;
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
      context.innerHTML = `<div class="contextCopy"><span>Power</span><strong>Power options</strong><small>Sleep, restart, and shut down remain confirmation-protected.</small></div><div class="contextActions"><button data-context-action="power-menu">Open Power Menu</button></div>`;
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
      const stream = await requestGameStream(true);
      const hasAudio = stream.getAudioTracks().length > 0;
      const type = recorderMimeType(hasAudio);
      const options = type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 };
      const recorder = new MediaRecorder(stream, options);
      const chunks = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => toast('PARA recording encountered an encoder error');
      recorder.start(1000);
      manualRecording = {
        stream, recorder, chunks, startedAt, stopping: false,
        width: stream.__paraCaptureWidth || 0,
        height: stream.__paraCaptureHeight || 0,
        captureMode: stream.__paraCaptureMode || ''
      };
      recordingPill.classList.add('show');
      const modeLabel = stream.__paraCaptureMode === 'self-tab-element' ? 'full renderer' : 'game frames';
      toast(`${hasAudio ? 'Gameplay recording started' : 'Gameplay recording started · video only'} · ${modeLabel}`);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording(true), { once: true });
    } catch (error) {
      toast(error?.message || 'Recording could not start');
    }
  }

  async function stopRecording(fromTrackEnd = false) {
    const active = manualRecording;
    if (!active || active.stopping) return;
    active.stopping = true;
    recordingPill.classList.remove('show');
    try {
      if (active.recorder.state !== 'inactive') {
        const stopped = new Promise((resolve, reject) => {
          active.recorder.addEventListener('stop', resolve, { once: true });
          active.recorder.addEventListener('error', () => reject(active.recorder.error || new Error('Video encoder failed.')), { once: true });
        });
        try { active.recorder.requestData(); } catch (_) {}
        active.recorder.stop();
        await stopped;
      }
      // Let Chromium deliver the final dataavailable event before assembling.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const blob = new Blob(active.chunks, { type: active.recorder.mimeType || 'video/webm' });
      await verifyRecordedBlob(blob);
      await saveCapture({
        type: 'clip',
        blob,
        width: active.width || 0,
        height: active.height || 0,
        durationMs: Date.now() - active.startedAt,
        captureMode: active.captureMode || ''
      });
      toast('Video verified and saved to PARA Media');
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
      const stream = await requestGameStream(true);
      const hasAudio = stream.getAudioTracks().length > 0;
      const type = recorderMimeType(hasAudio);
      const options = type ? { mimeType: type, videoBitsPerSecond: 7_000_000 } : { videoBitsPerSecond: 7_000_000 };
      const recorder = new MediaRecorder(stream, options);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        chunks.push({ blob: event.data, at: Date.now() });
        const cutoff = Date.now() - 30 * 60 * 1000;
        while (chunks.length > 2 && chunks[1].at < cutoff) chunks.splice(1, 1);
      };
      recorder.start(1000);
      replay = {
        stream, recorder, chunks, startedAt: Date.now(),
        width: stream.__paraCaptureWidth || 0,
        height: stream.__paraCaptureHeight || 0,
        captureMode: stream.__paraCaptureMode || ''
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (replay?.recorder.state !== 'inactive') replay.recorder.stop();
        replay = null;
        toast('PARA Replay stopped');
      }, { once: true });
      const modeLabel = stream.__paraCaptureMode === 'self-tab-element' ? 'full renderer' : 'game frames';
      toast(`${hasAudio ? 'PARA Replay is running' : 'PARA Replay is running · video only'} · ${modeLabel}`);
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
      const blob = new Blob(selected.map((part) => part.blob), { type: replay.recorder.mimeType || 'video/webm' });
      await verifyRecordedBlob(blob);
      await saveCapture({
        type: 'clip',
        blob,
        width: replay.width || 0,
        height: replay.height || 0,
        durationMs: Math.min(durationMs, Date.now() - replay.startedAt),
        captureMode: replay.captureMode || ''
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
    if (contextAction === 'controller-settings') return leaveGame('/#/controller');
    if (contextAction === 'account-settings') return leaveGame('/#/account');
    if (contextAction === 'power-menu') return leaveGame('/#/power');
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
    if (target === recordingPill) return stopRecording();
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
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        if is_store_game:
            self.send_header("Content-Security-Policy", "sandbox allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
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

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
