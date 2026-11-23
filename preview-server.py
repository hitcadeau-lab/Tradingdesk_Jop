#!/usr/bin/env python3
"""Lokale preview-server voor Tradingdesk.

Serveert de app op http://localhost:8765 en geeft koersdata door voor bronnen die de
browser zelf niet mag ophalen (CORS), zoals Kraken Futures en Yahoo Finance.
Alleen GET-verzoeken naar de toegestane adressen hieronder worden doorgegeven.
Gebruik: python3 preview-server.py [poort]
"""
import http.server
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

ALLOWED_HOSTS = {
    "futures.kraken.com",
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
}
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # stil

    def end_headers(self):
        # Altijd de nieuwste bestanden tonen in de preview.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/proxy?"):
            return self.proxy()
        return super().do_GET()

    def proxy(self):
        query = urllib.parse.urlparse(self.path).query
        target = urllib.parse.parse_qs(query).get("url", [""])[0]
        parsed = urllib.parse.urlparse(target)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            self.send_error(403, "Bron niet toegestaan")
            return
        req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0 Tradingdesk-Preview", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read()
                status = resp.status
        except urllib.error.HTTPError as e:
            body, status = e.read(), e.code
        except Exception as e:  # netwerkfout
            self.send_error(502, str(e))
            return
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()
