#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hermes Web Chat — a clean, mobile-friendly, RTL-correct web chat UI for the
Hermes Agent's OpenAI-compatible endpoint (e.g. `hermes proxy`).

Why this exists: chatting with Hermes in a terminal mangles Persian text
(bidi / shaping issues). This serves a proper browser UI where Persian renders
correctly, you can pick a profile (mirroring `hermes -p <name>`), and it works
nicely on the phone too.

Dependencies: none. Python 3.8+ standard library only.

Run:
    python3 server.py                 # uses config.json next to this file
    python3 server.py --port 9000     # override port
    PORT=9000 python3 server.py       # or via environment

Then open http://<server-ip>:<port>/ in a browser.
"""

import argparse
import json
import os
import sys
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.environ.get("HERMES_WEB_CONFIG", os.path.join(HERE, "config.json"))

# Talk to the configured endpoint DIRECTLY. The endpoint is chosen by the user
# (usually a local `hermes proxy`), so system HTTP(S)_PROXY env vars must not
# hijack these calls — that would break localhost backends.
DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

DEFAULT_CONFIG = {
    "host": "0.0.0.0",
    "port": 8787,
    # Optional shared secret. If non-empty, the UI must be opened with
    # ?token=THE_TOKEN and it will be sent on every API call. Protects the
    # app when bound to 0.0.0.0 on a LAN.
    "access_token": "",
    "default_profile": "conduit",
    "profiles": {
        "conduit": {
            "label": "Conduit",
            # Base URL of an OpenAI-compatible server. `hermes proxy` defaults
            # to port 8645. Include the /v1 suffix.
            "base_url": "http://127.0.0.1:8645/v1",
            # Many local proxies ignore the key; leave empty or set as needed.
            "api_key": "",
            # Model name the endpoint expects. Adjust to your setup; you can
            # also switch models live in the UI (populated from /v1/models).
            "model": "hermes",
            "temperature": 0.7,
            # Optional system prompt. Either inline text here, or point
            # soul_file at a SOUL.md to load it from disk.
            "system_prompt": "",
            "soul_file": ""
        }
    }
}


def load_config():
    if not os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)
        sys.stderr.write(
            "[hermes-web] No config found; wrote default to %s\n"
            "[hermes-web] Edit it to match your Hermes setup, then restart.\n"
            % CONFIG_PATH
        )
        return dict(DEFAULT_CONFIG)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # Fill in any missing top-level keys from defaults.
    for k, v in DEFAULT_CONFIG.items():
        cfg.setdefault(k, v)
    return cfg


def resolve_system_prompt(profile):
    """Return the system prompt for a profile, loading soul_file if given."""
    soul = profile.get("soul_file") or ""
    if soul:
        path = os.path.expanduser(soul)
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except OSError:
            pass
    return (profile.get("system_prompt") or "").strip()


class Handler(BaseHTTPRequestHandler):
    # Silence default noisy logging; keep it to one concise line.
    def log_message(self, fmt, *args):
        sys.stderr.write("[hermes-web] %s - %s\n" % (self.address_string(), fmt % args))

    server_version = "HermesWeb/1.0"

    # ---- helpers -------------------------------------------------------
    @property
    def cfg(self):
        return self.server.cfg

    def _token_ok(self):
        token = self.cfg.get("access_token") or ""
        if not token:
            return True
        supplied = self.headers.get("X-Access-Token") or ""
        if not supplied:
            qs = parse_qs(urlparse(self.path).query)
            supplied = (qs.get("token") or [""])[0]
        return supplied == token

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, ctype="text/html; charset=utf-8", status=200):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # ---- routing -------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self._send_text(INDEX_HTML)
            return
        # API endpoints require token (page itself does not, it's just HTML).
        if path == "/api/config":
            if not self._token_ok():
                return self._send_json({"error": "unauthorized"}, 401)
            return self._api_config()
        if path == "/api/models":
            if not self._token_ok():
                return self._send_json({"error": "unauthorized"}, 401)
            return self._api_models()
        if path == "/healthz":
            return self._send_json({"ok": True})
        self._send_text("Not found", "text/plain; charset=utf-8", 404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/chat":
            if not self._token_ok():
                return self._send_json({"error": "unauthorized"}, 401)
            return self._api_chat()
        self._send_text("Not found", "text/plain; charset=utf-8", 404)

    # ---- API implementations ------------------------------------------
    def _api_config(self):
        profiles = self.cfg.get("profiles", {})
        out = []
        for name, p in profiles.items():
            out.append({
                "name": name,
                "label": p.get("label") or name,
                "model": p.get("model") or "",
            })
        out.sort(key=lambda x: x["label"].lower())
        self._send_json({
            "profiles": out,
            "default_profile": self.cfg.get("default_profile") or (out[0]["name"] if out else ""),
            "requires_token": bool(self.cfg.get("access_token")),
        })

    def _api_models(self):
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get("profile") or [""])[0]
        profile = self.cfg.get("profiles", {}).get(name)
        if not profile:
            return self._send_json({"models": []})
        base = (profile.get("base_url") or "").rstrip("/")
        url = base + "/models"
        req = urllib.request.Request(url, method="GET")
        key = profile.get("api_key") or ""
        if key:
            req.add_header("Authorization", "Bearer " + key)
        try:
            with DIRECT_OPENER.open(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("id") for m in data.get("data", []) if m.get("id")]
            self._send_json({"models": models})
        except Exception as e:  # best-effort; UI falls back to config model
            self._send_json({"models": [], "error": str(e)})

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _sse(self, obj):
        """Write one SSE event; return False if the client has gone away."""
        try:
            self.wfile.write(b"data: " + json.dumps(obj, ensure_ascii=False).encode("utf-8") + b"\n\n")
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError):
            return False

    def _api_chat(self):
        try:
            body = self._read_json_body()
        except Exception:
            return self._send_json({"error": "bad request body"}, 400)

        name = body.get("profile") or self.cfg.get("default_profile")
        profile = self.cfg.get("profiles", {}).get(name)
        if not profile:
            return self._send_json({"error": "unknown profile: %s" % name}, 400)

        messages = body.get("messages") or []
        # Prepend the system prompt unless the client already supplied one.
        sys_prompt = resolve_system_prompt(profile)
        if sys_prompt and not (messages and messages[0].get("role") == "system"):
            messages = [{"role": "system", "content": sys_prompt}] + messages

        model = body.get("model") or profile.get("model") or "hermes"
        temperature = body.get("temperature")
        if temperature is None:
            temperature = profile.get("temperature", 0.7)

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
        }

        base = (profile.get("base_url") or "").rstrip("/")
        url = base + "/chat/completions"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        key = profile.get("api_key") or ""
        if key:
            req.add_header("Authorization", "Bearer " + key)

        # Start SSE response to the browser.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        try:
            upstream = DIRECT_OPENER.open(req, timeout=300)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")[:1000]
            except Exception:
                pass
            self._sse({"error": "upstream %s: %s" % (e.code, detail or e.reason)})
            return
        except Exception as e:
            self._sse({"error": "cannot reach endpoint: %s" % e})
            return

        try:
            for raw in upstream:
                line = raw.decode("utf-8", "replace").strip()
                if not line or not line.startswith("data:"):
                    continue
                chunk = line[len("data:"):].strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                piece = delta.get("content")
                if piece:
                    if not self._sse({"delta": piece}):
                        break  # client disconnected
        except Exception as e:
            self._sse({"error": "stream error: %s" % e})
        finally:
            try:
                upstream.close()
            except Exception:
                pass
            self._sse({"done": True})


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Hermes Web Chat server")
    parser.add_argument("--host", default=None, help="Bind host (default from config)")
    parser.add_argument("--port", type=int, default=None, help="Bind port (default from config or $PORT)")
    args = parser.parse_args()

    host = args.host or cfg.get("host") or "0.0.0.0"
    port = args.port or int(os.environ.get("PORT") or cfg.get("port") or 8787)

    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.cfg = cfg
    httpd.daemon_threads = True

    shown_host = "localhost" if host in ("0.0.0.0", "") else host
    sys.stderr.write("[hermes-web] serving on http://%s:%d/\n" % (shown_host, port))
    if cfg.get("access_token"):
        sys.stderr.write("[hermes-web] access token is ON — open with ?token=...\n")
    profiles = ", ".join(cfg.get("profiles", {}).keys()) or "(none)"
    sys.stderr.write("[hermes-web] profiles: %s\n" % profiles)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\n[hermes-web] bye\n")


# The single-page UI is defined in index_html.py to keep this file readable.
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from index_html import INDEX_HTML  # noqa: E402

if __name__ == "__main__":
    main()
