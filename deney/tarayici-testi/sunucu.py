"""COOP/COEP başlıklı yerel statik sunucu (wasm thread testi için).

wasm iş parçacıkları SharedArrayBuffer ister; tarayıcı bunu yalnız
"cross-origin isolated" sayfalarda açar, o da şu iki başlıkla sağlanır:
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
Python'un yerleşik sunucusu bu başlıkları göndermez; bu betik ekler.

Çalıştırma (bu klasörün içinden):  python3 sunucu.py
Sonra tarayıcıda:                  http://localhost:8437
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8437


class IzoleBasliklarla(SimpleHTTPRequestHandler):
    """Her yanıta cross-origin isolation başlıklarını ve .wasm/.pb MIME türlerini ekler."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".pb": "application/octet-stream",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()


if __name__ == "__main__":
    print(f"http://localhost:{PORT} — durdurmak için Ctrl+C")
    ThreadingHTTPServer(("127.0.0.1", PORT), IzoleBasliklarla).serve_forever()
