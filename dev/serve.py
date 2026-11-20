"""Local test server (never deployed: only site/ is published). Serves site/ with the production security headers, plus the developer's own
Assets.zip at /__assets.zip with Range support so the editor can be tested without a file dialog (open /?devzip).
Usage: python dev/serve.py [port]"""
import os, re, sys, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
DEV = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(os.path.dirname(DEV), 'site')
ZIP = os.path.join(os.environ.get('APPDATA', ''), 'Hytale', 'install', 'release', 'package', 'game', 'latest', 'Assets.zip')
HEADERS = [l.strip().split(': ', 1) for l in open(os.path.join(ROOT, '_headers'), encoding='utf-8') if l.startswith('  ') and ': ' in l]
mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('font/woff2', '.woff2')
class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def out(self, code, body, ctype, extra=()):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        for k, v in list(HEADERS) + list(extra): self.send_header(k, v)
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/__assets.zip':
            size = os.path.getsize(ZIP); m = re.match(r'bytes=(\d+)-(\d+)', self.headers.get('Range', ''))
            if not m: return self.out(200, b'', 'application/zip', [('X-Size', str(size))])
            a, b = int(m.group(1)), min(int(m.group(2)), size - 1)
            with open(ZIP, 'rb') as f: f.seek(a); data = f.read(b - a + 1)
            return self.out(206, data, 'application/zip', [('Content-Range', f'bytes {a}-{b}/{size}')])
        rel = 'index.html' if p == '/' else p.lstrip('/'); full = os.path.normpath(os.path.join(ROOT, rel))
        if not os.path.isfile(full) and os.path.isfile(full + '.html'): full += '.html'   # /auth/callback -> auth/callback.html, as the host does
        if p == '/dev/devsource.js': full = os.path.join(DEV, 'devsource.js')
        elif not full.startswith(ROOT + os.sep) or not os.path.isfile(full): return self.out(404, b'not found', 'text/plain')
        self.out(200, open(full, 'rb').read(), mimetypes.guess_type(full)[0] or 'application/octet-stream')
    do_HEAD = do_GET
if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print(f'http://localhost:{port}/?devzip', flush=True); ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
