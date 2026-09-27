from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Timer
import hashlib
import subprocess
import webbrowser

root = Path(__file__).resolve().parent

def read(name):
    return (root / name).read_text(encoding="utf-8-sig")

core = read("src/core.js")
app = read("src/app.js")
html = read("index.html")
css = read("style.css")

if "export function correctEventTime" not in core:
    raise SystemExit("Abbruch: Die reparierte Zeitkorrektur fehlt.")

if "Eintrag liegt vor dem Erfassungsbeginn." in core:
    raise SystemExit("Abbruch: core.js enthaelt noch die alte Pruefung.")

worker_start = (
    "if ('serviceWorker' in navigator && "
    "location.protocol !== 'file:') {"
)

checks = [
    (app, worker_start),
    (app, "from './core.js'"),
    (html, 'src="./src/app.js"'),
    (html, 'href="./style.css"'),
]

for text, needle in checks:
    if text.count(needle) != 1:
        raise SystemExit(
            "Abbruch: Unerwarteter Quellcode. Bitte diese Ausgabe schicken."
        )

# Nur die erzeugte Entwicklungskopie verwendet keinen Offline-Worker.
app = app[:app.index(worker_start)]
app += (
    "\n$('offline').textContent = "
    "'Entwicklungsbetrieb auf diesem PC';\n"
)

tag = hashlib.sha256(
    (core + app + html + css).encode("utf-8")
).hexdigest()[:12]

core_name = f"dev-core-{tag}.js"
app_name = f"dev-app-{tag}.js"
css_name = f"dev-style-{tag}.css"
page_name = f"dev-{tag}.html"

app = app.replace(
    "from './core.js'",
    f"from './{core_name}'"
)
html = html.replace(
    'src="./src/app.js"',
    f'src="./src/{app_name}"'
)
html = html.replace(
    'href="./style.css"',
    f'href="./{css_name}"'
)
html = html.replace(
    'class="badge">',
    'class="badge">Entwicklung | '
)

generated = {
    f"src/{core_name}": core,
    f"src/{app_name}": app,
    css_name: css,
    page_name: html,
}

for name, content in generated.items():
    (root / name).write_text(content, encoding="utf-8")

for name in [f"src/{core_name}", f"src/{app_name}"]:
    subprocess.run(["node", "--check", str(root / name)], check=True)

class DevelopmentHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

address = ("127.0.0.1", 8765)
handler = partial(DevelopmentHandler, directory=str(root))

try:
    server = ThreadingHTTPServer(address, handler)
except OSError:
    raise SystemExit(
        "Port 8765 ist belegt. Alten Server mit Strg+C stoppen "
        "und den Entwicklungsstart erneut ausfuehren."
    )

url = f"http://127.0.0.1:8765/{page_name}"
print("\nENTWICKLUNGSSERVER GESTARTET", flush=True)
print(url, flush=True)
print("Dieses Fenster offen lassen. Beenden: Strg+C.", flush=True)

Timer(0.8, lambda: webbrowser.open(url)).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()