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
  let gamepadPrevious = [];
  let paraPressedAt = 0;
  let paraHeld = false;
  let focusedIndex = 0;
  let inputMaskInstalled = false;

  const nativeGetGamepads = navigator.getGamepads?.bind(navigator);
  function installGamepadMask() {
    if (!nativeGetGamepads || inputMaskInstalled) return;
    try {
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => {
          const pads = [...(nativeGetGamepads() || [])];
          if (!shellOpen) return pads;
          return pads.map((pad) => {
            if (!pad) return pad;
            return new Proxy(pad, {
              get(target, prop) {
                if (prop === 'buttons') return target.buttons.map((button) => ({ pressed: false, touched: false, value: 0 }));
                if (prop === 'axes') return target.axes.map(() => 0);
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
              }
            });
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

  async function saveCapture({ type, blob, width = 0, height = 0, durationMs = 0 }) {
    const db = await openDb();
    const item = {
      id: crypto.randomUUID?.() || `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type, blob, mimeType: blob.type, width, height, durationMs,
      createdAt: Date.now(), source: 'PARA'
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
    stream?.getTracks?.().forEach((track) => track.stop());
  }

  async function requestParaStream(audio = false) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is unavailable in this browser.');
    configureCaptureHandle();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 }, displaySurface: 'browser' },
      audio: audio ? { suppressLocalAudioPlayback: false } : false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude',
      systemAudio: 'exclude'
    });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopStream(stream);
      throw new Error('PARA did not receive a video track.');
    }
    const surface = track.getSettings?.().displaySurface;
    if (surface && surface !== 'browser') {
      stopStream(stream);
      throw new Error('Choose This Tab (PARA), not your whole screen or another window.');
    }
    const handle = typeof track.getCaptureHandle === 'function' ? track.getCaptureHandle() : null;
    if (handle && handle.handle !== PARA_CAPTURE_HANDLE) {
      stopStream(stream);
      throw new Error('Choose This Tab (PARA), not another Chrome tab.');
    }
    if (document.body && globalThis.RestrictionTarget?.fromElement && typeof track.restrictTo === 'function') {
      try {
        const restriction = await globalThis.RestrictionTarget.fromElement(document.body);
        await track.restrictTo(restriction);
      } catch (_) {}
    }
    return stream;
  }

  function recorderMimeType() {
    const probe = document.createElement('video');
    return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported?.(type) && probe.canPlayType(type) !== '') || '';
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
      #systemButton{
        pointer-events:auto;position:fixed;top:14px;left:14px;width:42px;height:42px;border:1px solid rgba(211,174,255,.22);
        border-radius:50%;display:grid;place-items:center;background:rgba(8,6,13,.42);color:rgba(255,255,255,.46);
        box-shadow:0 6px 28px rgba(0,0,0,.26);backdrop-filter:blur(12px);cursor:pointer;opacity:.32;
        transition:opacity .16s ease,transform .16s ease,border-color .16s ease,background .16s ease
      }
      #systemButton:hover,#systemButton:focus-visible{opacity:1;transform:scale(1.07);border-color:rgba(207,164,255,.68);background:rgba(25,13,39,.78);outline:none}
      #systemButton span{font:900 18px/1 system-ui,sans-serif;letter-spacing:-.12em;transform:translateX(-1px)}
      #systemButton::after{
        content:"Control Center";position:absolute;left:50px;top:8px;padding:7px 10px;border-radius:9px;white-space:nowrap;
        color:#fff;background:rgba(9,6,14,.92);font:700 11px/1 system-ui,sans-serif;opacity:0;transform:translateX(-5px);pointer-events:none;transition:.14s ease
      }
      #systemButton:hover::after,#systemButton:focus-visible::after{opacity:1;transform:none}
      #overlay{pointer-events:auto;position:fixed;inset:0;display:none;color:#f8f5fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
      #overlay.open{display:block}
      .scrim{position:absolute;inset:0;background:rgba(1,1,5,.28);backdrop-filter:blur(3px)}
      .dock{position:absolute;left:50%;bottom:max(24px,3vh);width:min(1040px,calc(100vw - 56px));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:12px}
      .context{width:min(760px,calc(100vw - 80px));min-height:108px;padding:16px 18px;display:none;align-items:center;justify-content:space-between;gap:18px;border:1px solid rgba(212,176,255,.25);border-radius:20px;background:rgba(10,7,15,.88);box-shadow:0 18px 55px rgba(0,0,0,.5);backdrop-filter:blur(18px)}
      .context.show{display:flex}
      .contextCopy span,.contextCopy strong,.contextCopy small{display:block}
      .contextCopy span{color:#c89cff;font:850 10px/1 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase}
      .contextCopy strong{margin-top:5px;font-size:18px}
      .contextCopy small{margin-top:5px;color:rgba(235,227,242,.62);font-size:12px}
      .contextActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .contextActions button{min-height:42px;padding:0 14px;border:1px solid rgba(255,255,255,.13);border-radius:12px;color:#eee7f5;background:rgba(255,255,255,.045);cursor:pointer}
      .contextActions button:hover,.contextActions button:focus-visible{border-color:rgba(216,180,255,.7);background:rgba(131,52,224,.17);outline:none}
      .strip{max-width:100%;padding:9px 14px 8px;display:flex;gap:6px;overflow:auto;border:1px solid rgba(210,175,255,.22);border-radius:25px;background:rgba(8,6,12,.9);box-shadow:0 24px 70px rgba(0,0,0,.58);backdrop-filter:blur(18px);scrollbar-width:none}
      .strip::-webkit-scrollbar{display:none}
      .tile{flex:0 0 74px;height:74px;padding:6px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;border-radius:17px;color:rgba(239,232,246,.58);background:transparent;cursor:pointer;outline:none;transition:.14s ease}
      .tile b{width:34px;height:34px;display:grid;place-items:center;font:700 19px/1 system-ui,sans-serif}
      .tile strong{font:720 10px/1 system-ui,sans-serif;white-space:nowrap}
      .tile:hover,.tile:focus-visible,.tile.focused{transform:translateY(-4px) scale(1.06);color:#fff;border-color:rgba(214,177,255,.5);background:rgba(130,48,225,.14);box-shadow:0 0 23px rgba(147,65,243,.2)}
      .prompt{color:rgba(239,232,246,.58);font:650 11px/1 system-ui,sans-serif}
      .prompt b{margin:0 5px;padding:4px 7px;border:1px solid rgba(205,165,255,.36);border-radius:8px;color:#fff}
      #recording{pointer-events:auto;position:fixed;top:16px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:9px;padding:9px 13px;border:1px solid rgba(255,105,121,.4);border-radius:999px;color:#fff;background:rgba(17,7,11,.86);box-shadow:0 12px 36px rgba(0,0,0,.35);backdrop-filter:blur(16px);cursor:pointer;font:750 11px/1 system-ui,sans-serif}
      #recording.show{display:flex}
      #recording i{width:8px;height:8px;border-radius:50%;background:#ff5266;box-shadow:0 0 12px #ff5266}
      #toast{position:fixed;left:50%;bottom:138px;transform:translate(-50%,18px);padding:10px 14px;border:1px solid rgba(203,162,255,.28);border-radius:12px;color:#fff;background:rgba(8,6,12,.92);font:700 12px/1.3 system-ui,sans-serif;opacity:0;pointer-events:none;transition:.18s ease}
      #toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:720px){.dock{width:calc(100vw - 20px)}.context{width:100%;align-items:flex-start;flex-direction:column}.strip{width:100%}.tile{flex-basis:66px}.contextActions{justify-content:flex-start}}
    </style>
    <button id="systemButton" type="button" aria-label="Open PARA Control Center" title="PARA Control Center"><span>P</span></button>
    <button id="recording" type="button" aria-label="Stop and save recording"><i></i><span>Recording · Stop & Save</span></button>
    <div id="overlay" aria-hidden="true">
      <div class="scrim" data-action="resume"></div>
      <div class="dock" role="dialog" aria-modal="true" aria-label="PARA Control Center">
        <section id="context" class="context"></section>
        <nav id="strip" class="strip" aria-label="Quick controls">
          <button class="tile" data-action="resume"><b>▶</b><strong>Resume</strong></button>
          <button class="tile" data-action="home"><b>⌂</b><strong>Home</strong></button>
          <button class="tile" data-action="games"><b>▦</b><strong>Games</strong></button>
          <button class="tile" data-action="capture"><b>◉</b><strong>Capture</strong></button>
          <button class="tile" data-action="media"><b>▣</b><strong>Media</strong></button>
          <button class="tile" data-action="fullscreen"><b>⛶</b><strong>Fullscreen</strong></button>
          <button class="tile" data-action="sound"><b>♫</b><strong>Sound</strong></button>
          <button class="tile" data-action="settings"><b>⚙</b><strong>Settings</strong></button>
        </nav>
        <div class="prompt"><b>PARA / F1</b>Close <b>A / Enter</b>Select <b>B / Esc</b>Back</div>
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

  function focusables() {
    const contextButtons = context.classList.contains('show') ? [...context.querySelectorAll('button')] : [];
    return contextButtons.length ? contextButtons : [...shadow.querySelectorAll('#strip .tile')];
  }

  function syncFocus(index = focusedIndex) {
    const items = focusables();
    if (!items.length) return;
    focusedIndex = Math.max(0, Math.min(index, items.length - 1));
    shadow.querySelectorAll('.focused').forEach((node) => node.classList.remove('focused'));
    const target = items[focusedIndex];
    target.classList.add('focused');
    target.focus({ preventScroll: true });
  }

  function openShell() {
    if (shellOpen) return;
    shellOpen = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    context.classList.remove('show');
    context.innerHTML = '';
    contextName = '';
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
    systemButton.focus({ preventScroll: true });
  }

  function toggleShell() {
    shellOpen ? closeShell() : openShell();
  }

  function showContext(name) {
    contextName = name;
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
      context.innerHTML = `<div class="contextCopy"><span>Game Audio</span><strong>${muted ? 'Muted' : 'Playing'}</strong><small>Controls HTML audio and video used by this game.</small></div><div class="contextActions"><button data-context-action="toggle-mute">${muted ? 'Unmute' : 'Mute'}</button></div>`;
    }
    context.classList.add('show');
    focusedIndex = 0;
    syncFocus(0);
  }

  async function screenshot() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let stream;
    try {
      stream = await requestParaStream(false);
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || innerWidth;
      canvas.height = video.videoHeight || innerHeight;
      canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Screenshot failed.')), 'image/webp', .94));
      await saveCapture({ type: 'screenshot', blob, width: canvas.width, height: canvas.height });
      toast('Screenshot saved to PARA Media');
    } catch (error) {
      toast(error?.message || 'Screenshot failed');
    } finally {
      stopStream(stream);
    }
  }

  async function startRecording() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const stream = await requestParaStream(true);
      const type = recorderMimeType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.start(1000);
      manualRecording = { stream, recorder, chunks, startedAt };
      recordingPill.classList.add('show');
      toast('Recording started');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording(true), { once: true });
    } catch (error) {
      toast(error?.message || 'Recording could not start');
    }
  }

  async function stopRecording(fromTrackEnd = false) {
    const active = manualRecording;
    if (!active) return;
    manualRecording = null;
    recordingPill.classList.remove('show');
    try {
      if (active.recorder.state !== 'inactive') {
        active.recorder.requestData();
        await new Promise((resolve) => {
          active.recorder.addEventListener('stop', resolve, { once: true });
          active.recorder.stop();
        });
      }
      const blob = new Blob(active.chunks, { type: active.recorder.mimeType || 'video/webm' });
      if (blob.size) {
        await saveCapture({ type: 'clip', blob, durationMs: Date.now() - active.startedAt });
        toast('Video saved to PARA Media');
      } else {
        toast('Recording was empty');
      }
    } catch (error) {
      toast(error?.message || 'Recording could not be saved');
    } finally {
      if (!fromTrackEnd) stopStream(active.stream);
    }
  }

  async function startReplay() {
    closeShell();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const stream = await requestParaStream(true);
      const type = recorderMimeType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        chunks.push({ blob: event.data, at: Date.now() });
        const cutoff = Date.now() - 30 * 60 * 1000;
        while (chunks.length > 2 && chunks[1].at < cutoff) chunks.splice(1, 1);
      };
      recorder.start(1000);
      replay = { stream, recorder, chunks, startedAt: Date.now() };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (replay?.recorder.state !== 'inactive') replay.recorder.stop();
        replay = null;
        toast('PARA Replay stopped');
      }, { once: true });
      toast('PARA Replay is running');
    } catch (error) {
      toast(error?.message || 'Replay could not start');
    }
  }

  async function saveReplay(durationMs) {
    if (!replay) { toast('Start PARA Replay first'); return; }
    try {
      replay.recorder.requestData();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const cutoff = Date.now() - durationMs;
      const selected = replay.chunks.filter((part, index) => index === 0 || part.at >= cutoff);
      const blob = new Blob(selected.map((part) => part.blob), { type: replay.recorder.mimeType || 'video/webm' });
      if (!blob.size) throw new Error('Replay has not buffered enough gameplay yet.');
      await saveCapture({ type: 'clip', blob, durationMs: Math.min(durationMs, Date.now() - replay.startedAt) });
      toast('Recent gameplay saved to PARA Media');
    } catch (error) {
      toast(error?.message || 'Replay could not be saved');
    }
  }

  async function action(name, button) {
    if (name === 'resume') return closeShell();
    if (name === 'home') return location.href = '/#/home';
    if (name === 'games') return location.href = '/#/games';
    if (name === 'media') return location.href = '/#/media';
    if (name === 'settings') return location.href = '/#/settings';
    if (name === 'capture') return showContext('capture');
    if (name === 'sound') return showContext('sound');
    if (name === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        toast(document.fullscreenElement ? 'Fullscreen on' : 'Fullscreen off');
      } catch (_) { toast('Fullscreen is unavailable'); }
      return;
    }
    const contextAction = button?.dataset?.contextAction;
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
    if (event.key === 'F1') {
      event.preventDefault(); event.stopImmediatePropagation(); toggleShell(); return;
    }
    if (!shellOpen) return;
    if (['Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (event.key === 'Escape') {
      if (contextName) { context.classList.remove('show'); context.innerHTML = ''; contextName = ''; focusedIndex = 0; syncFocus(0); }
      else closeShell();
    } else if (event.key === 'Enter') {
      focusables()[focusedIndex]?.click();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      syncFocus(focusedIndex - 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      syncFocus(focusedIndex + 1);
    }
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
        location.href = '/#/home';
      }
      if (!pressed[paraIndex] && gamepadPrevious[paraIndex] && !paraHeld) toggleShell();

      if (shellOpen) {
        if (edge(0)) focusables()[focusedIndex]?.click();
        if (edge(1)) {
          if (contextName) { context.classList.remove('show'); context.innerHTML = ''; contextName = ''; focusedIndex = 0; syncFocus(0); }
          else closeShell();
        }
        const x = pad.axes?.[0] || 0;
        const y = pad.axes?.[1] || 0;
        const prevX = window.__paraShellPrevX || 0;
        const prevY = window.__paraShellPrevY || 0;
        if (edge(14) || (x < -.55 && prevX >= -.55) || edge(12) || (y < -.55 && prevY >= -.55)) syncFocus(focusedIndex - 1);
        if (edge(15) || (x > .55 && prevX <= .55) || edge(13) || (y > .55 && prevY <= .55)) syncFocus(focusedIndex + 1);
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
