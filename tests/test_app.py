"""Tests for the loopback-only launcher; no camera or GUI required."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

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


if __name__ == '__main__':
    unittest.main()
