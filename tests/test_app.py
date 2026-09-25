"""Tests for the loopback-only launcher; no camera or GUI required."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import app


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name) / 'web'
        root.mkdir()
        (root / 'index.html').write_text('<h1>Gesture Party</h1>', encoding='utf-8')
        (root / 'test.wasm').write_bytes(b'\x00asm')
        (Path(self.directory.name) / 'secret.txt').write_text('private', encoding='utf-8')
        self.server = app.LocalServer(('127.0.0.1', 0), root)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown()
        self.thread.join(timeout=2)
        self.server.server_close()

    def request(self, path='/', method='GET', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        try:
            connection.request(method, path, headers=headers or {})
            result = connection.getresponse()
            return result.status, dict(result.getheaders()), result.read()
        finally:
            connection.close()

    def test_page_and_security_headers(self):
        status, headers, body = self.request()
        self.assertEqual(status, 200)
        self.assertIn(b'Gesture Party', body)
        self.assertIn("connect-src 'self'", headers['Content-Security-Policy'])
        self.assertIn("img-src 'self' data: blob:", headers['Content-Security-Policy'])
        self.assertEqual(headers['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()')
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_session(self):
        status, _, body = self.request('/api/session')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['app'], app.APP_ID)
        self.assertEqual(json.loads(body)['token'], self.server.token)

    def test_running_server_port_cannot_be_shared_by_another_instance(self):
        with self.assertRaises(OSError):
            with app.LocalServer(('127.0.0.1', self.server.server_port), self.server.root):
                pass

    def test_host_rebinding_rejected(self):
        self.assertEqual(self.request(headers={'Host': 'attacker.example'})[0], 403)
        self.assertEqual(self.request(method='HEAD', headers={'Host': 'attacker.example'})[0], 403)

    def test_traversal_and_directory_listing_rejected(self):
        for path in ('/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%5csecret.txt', '/.git/config', '/missing/'):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)

    def test_wasm_mime_and_head(self):
        status, headers, body = self.request('/test.wasm', method='HEAD')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-type'], 'application/wasm')
        self.assertEqual(body, b'')

    def test_heartbeat_requires_session_and_origin(self):
        self.assertEqual(self.request('/api/heartbeat', 'POST')[0], 403)
        self.assertEqual(self.request('/api/heartbeat', 'POST', {'Origin': self.server.origin})[0], 403)
        headers = {'Origin': self.server.origin, 'X-Session-Token': self.server.token}
        self.assertEqual(self.request('/api/heartbeat', 'POST', headers)[0], 200)
        headers['Origin'] = 'https://attacker.example'
        self.assertEqual(self.request('/api/heartbeat', 'POST', headers)[0], 403)

    def test_quit_stops_server(self):
        headers = {'Origin': self.server.origin, 'X-Session-Token': self.server.token}
        self.assertEqual(self.request('/api/quit', 'POST', headers)[0], 200)
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())


class BrowserLaunchTests(unittest.TestCase):
    def test_windows_prefers_edge_without_using_default_browser(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
                path = root / relative
                path.parent.mkdir(parents=True)
                path.touch()
            with patch.dict(app.os.environ, {'ProgramFiles': directory}, clear=True), \
                    patch.object(app.sys, 'platform', 'win32'), \
                    patch.object(app.subprocess, 'Popen') as launch, \
                    patch.object(app.webbrowser, 'open') as default:
                app.open_app_browser('http://127.0.0.1:8765')
                launch.assert_called_once_with([str(root / 'Microsoft/Edge/Application/msedge.exe'),
                                               '--new-window', 'http://127.0.0.1:8765'])
                default.assert_not_called()

    def test_chrome_is_tried_if_edge_cannot_launch(self):
        with patch.object(app.sys, 'platform', 'win32'), \
                patch.object(app, 'supported_browser_paths', return_value=[Path('edge.exe'), Path('chrome.exe')]), \
                patch.object(app.subprocess, 'Popen', side_effect=[OSError('Unavailable'), None]) as launch:
            app.open_app_browser('http://127.0.0.1:8765')
            self.assertEqual(launch.call_count, 2)
            self.assertEqual(launch.call_args.args[0][0], 'chrome.exe')

    def test_missing_supported_browser_is_actionable_and_does_not_open_firefox(self):
        with patch.object(app.sys, 'platform', 'win32'), \
                patch.object(app, 'supported_browser_paths', return_value=[]), \
                patch.object(app.webbrowser, 'open') as default:
            with self.assertRaisesRegex(RuntimeError, 'Edge / Chrome'):
                app.open_app_browser('http://127.0.0.1:8765')
            default.assert_not_called()


if __name__ == '__main__':
    unittest.main()
