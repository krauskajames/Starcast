"""Serve a directory with HTTP Range support (like S3), and answer NOMADS-style
grib filter requests (/cgi-bin/filter_gfs_*.pl?dir=..&file=..) with the whole file."""
import http.server, os, re, sys, urllib.parse
root = os.path.abspath(sys.argv[1]); port = int(sys.argv[2])
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path.startswith('/cgi-bin/filter_gfs'):
            q = urllib.parse.parse_qs(u.query); rel = q['dir'][0].lstrip('/') + '/' + q['file'][0]
        else:
            rel = urllib.parse.unquote(u.path).lstrip('/')
        p = os.path.normpath(os.path.join(root, rel))
        if not p.startswith(root) or not os.path.isfile(p):
            self.send_response(404); self.end_headers(); return
        data = open(p, 'rb').read()
        m = re.match(r'bytes=(\d+)-(\d*)$', self.headers.get('Range', ''))
        if m:
            a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else len(data) - 1
            body = data[a:b + 1]; self.send_response(206)
            self.send_header('Content-Range', f'bytes {a}-{b}/{len(data)}')
        else:
            body = data; self.send_response(200)
        self.send_header('Content-Length', str(len(body))); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers()
        self.wfile.write(body)
http.server.ThreadingHTTPServer.allow_reuse_address = True
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
