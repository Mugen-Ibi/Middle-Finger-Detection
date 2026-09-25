"""Local-only launcher. Camera capture and inference run inside the browser."""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / "web"
APP_ID = "gesture-party-v2"


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    # SO_REUSEADDR permits multiple listeners on one port on Windows.
    allow_reuse_address = sys.platform != "win32"

    def __init__(self, address, root=ROOT):
        self.root = Path(root).resolve()
        self.token = secrets.token_urlsafe(32)
        self.last_seen = time.monotonic()
        super().__init__(address, partial(Handler, directory=str(self.root)))

    def server_bind(self):
        if sys.platform == "win32":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    @property
    def origin(self):
        return f"http://127.0.0.1:{self.server_port}"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".js": "text/javascript",
                      ".wasm": "application/wasm", ".task": "application/octet-stream"}

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
                         "style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "
                         "connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def valid_host(self):
        return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

    def send_json(self, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def static_path(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            path = "/index.html"
        target = (self.server.root / path.lstrip("/")).resolve()
        if not target.is_relative_to(self.server.root) or not target.is_file():
            return None
        return path

    def do_GET(self):
        if not self.valid_host():
            self.send_error(403)
            return
        if urlsplit(self.path).path == "/api/session":
            self.server.last_seen = time.monotonic()
            self.send_json({"app": APP_ID, "token": self.server.token})
            return
        path = self.static_path()
        if path is None:
            self.send_error(404)
            return
        self.path = path
        super().do_GET()

    def do_HEAD(self):
        if not self.valid_host():
            self.send_error(403)
            return
        path = self.static_path()
        if path is None:
            self.send_error(404)
            return
        self.path = path
        super().do_HEAD()

    def do_POST(self):
        if (not self.valid_host() or self.headers.get("Origin") != self.server.origin
                or self.headers.get("X-Session-Token") != self.server.token):
            self.send_error(403)
            return
        if self.path not in ("/api/heartbeat", "/api/quit"):
            self.send_error(404)
            return
        self.server.last_seen = time.monotonic()
        self.send_json({"ok": True})
        if self.path == "/api/quit":
            threading.Thread(target=self.server.shutdown, daemon=True).start()


def required_assets(root=ROOT):
    return [root / "index.html", root / "vendor/vision_bundle.mjs",
            root / "vendor/wasm/vision_wasm_internal.wasm",
            root / "models/hand_landmarker.task"]


def supported_browser_paths():
    # Prefer Edge, then Chrome; never change the user's default browser.
    for relative in ("Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"):
        for variable in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base = os.environ.get(variable)
            if base:
                candidate = Path(base) / relative
                if candidate.is_file():
                    yield candidate


def open_app_browser(url):
    if sys.platform != "win32":
        if webbrowser.open(url):
            return
    else:
        for executable in supported_browser_paths():
            try:
                subprocess.Popen([str(executable), "--new-window", url])
                return
            except OSError:
                continue
    raise RuntimeError(f"Microsoft Edge / Google Chrome を起動できません。\n"
                       f"対応ブラウザーをインストールして再起動するか、\n"
                       f"--no-browser で起動し、Edge / Chrome で {url} を開いてください。")


def run(port=8765, open_browser=True, idle_seconds=300):
    missing = [str(p) for p in required_assets() if not p.is_file()]
    if missing:
        raise RuntimeError("実行ファイルが不足しています。npm ci と npm run prepare:assets を実行してください。\n"
                           + "\n".join(missing))
    try:
        server = LocalServer(("127.0.0.1", port))
    except OSError:
        if port == 0:
            raise
        server = LocalServer(("127.0.0.1", 0))

    finished = threading.Event()

    def idle_shutdown():
        while not finished.wait(5):
            if idle_seconds and time.monotonic() - server.last_seen > idle_seconds:
                server.shutdown()
                return

    with server:
        try:
            if open_browser:
                open_app_browser(server.origin)
            threading.Thread(target=idle_shutdown, daemon=True).start()
            if sys.stdout is not None:
                print(f"Gesture Party: {server.origin}", flush=True)
            server.serve_forever(poll_interval=0.25)
        finally:
            finished.set()
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--idle-seconds", type=int, default=300)
    args = parser.parse_args()
    try:
        return run(args.port, not args.no_browser, args.idle_seconds)
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        if sys.stderr is not None:
            print(str(error), file=sys.stderr)
        if sys.platform == "win32" and getattr(sys, "frozen", False):
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, str(error), "Gesture Party — 起動エラー", 0x10)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
