"""Local preview only. Python 3. No external packages or public network binding."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import webbrowser

folder = Path(__file__).resolve().parent
url = 'http://127.0.0.1:8765/'
try:
    server = ThreadingHTTPServer(('127.0.0.1', 8765), partial(SimpleHTTPRequestHandler, directory=str(folder)))
except OSError as error:
    raise SystemExit(f'Start nicht möglich: {error}. Bitte prüfen, ob diese Vorschau bereits läuft.')
print(f'Rauchfrei Testversion: {url}\nDieses Fenster geöffnet lassen. Beenden: Strg+C.', flush=True)
Timer(0.8, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
