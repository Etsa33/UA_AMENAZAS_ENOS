"""Genera un único HTML portable con aplicación, datos y dependencias embebidos."""

import base64
import mimetypes
import re
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "mapa_autocontenido.html"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"

STYLES = [
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css",
]

SCRIPTS = [
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js",
    "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
]

DATA = {
    "ua": ROOT / "data" / "ua.json",
    "provincias": ROOT / "data" / "provincias.json",
    "cantones": ROOT / "data" / "cantones.json",
    "parroquias": ROOT / "data" / "parroquias.json",
    "diccionario": ROOT / "data" / "diccionario.json",
    "ua-matriz": ROOT / "data" / "ua_matriz.json",
}


def download(url, binary=False):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=120) as response:
        content = response.read()
    return content if binary else content.decode("utf-8")


def data_uri(content, source):
    mime = mimetypes.guess_type(source)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def inline_css_assets(css, css_url):
    def replace(match):
        quote, value = match.groups()
        if value.startswith(("data:", "#")):
            return match.group(0)
        asset_url = urljoin(css_url, value)
        return f"url({quote}{data_uri(download(asset_url, binary=True), asset_url)}{quote})"

    return re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", replace, css)


def safe_script(text):
    return re.sub(r"</script", r"<\\/script", text, flags=re.IGNORECASE)


def image_uri(path):
    return data_uri(path.read_bytes(), path.name)


def build():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)

    for url in STYLES:
        css = inline_css_assets(download(url), url)
        link = re.compile(rf'<link[^>]+href="{re.escape(url)}"[^>]*>')
        html, count = link.subn(f"<style>\n{css}\n</style>", html, count=1)
        if count != 1:
            raise RuntimeError(f"No se encontró la hoja de estilo: {url}")

    local_css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/styles.css">', f"<style>\n{local_css}\n</style>")

    html = html.replace('src="img/logo_mtdh.png"', f'src="{image_uri(ROOT / "img" / "logo_mtdh.png")}"')
    html = html.replace('src="img/logo_gobierno.png"', f'src="{image_uri(ROOT / "img" / "logo_gobierno.png")}"')

    for url in SCRIPTS:
        javascript = safe_script(download(url))
        tag = f'<script src="{url}"></script>'
        if tag not in html:
            raise RuntimeError(f"No se encontró la librería: {url}")
        html = html.replace(tag, f"<script>\n{javascript}\n</script>", 1)

    embedded = []
    for name, path in DATA.items():
        text = safe_script(path.read_text(encoding="utf-8"))
        embedded.append(f'<script type="application/json" id="embedded-{name}">{text}</script>')

    banner = base64.b64encode((ROOT / "data" / "banner.png").read_bytes()).decode("ascii")
    embedded.append(f'<script type="application/octet-stream" id="embedded-banner">{banner}</script>')

    app = safe_script((ROOT / "js" / "app.js").read_text(encoding="utf-8"))
    app_tag = '<script src="js/app.js"></script>'
    if app_tag not in html:
        raise RuntimeError("No se encontró js/app.js en index.html")
    html = html.replace(app_tag, "\n".join(embedded) + f"\n<script>\n{app}\n</script>", 1)

    if re.search(r'(?:src|href)="(?:css|js|img|data)/', html):
        raise RuntimeError("El resultado aún contiene referencias a archivos locales")

    OUTPUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"Generado: {OUTPUT}")
    print(f"Tamaño: {OUTPUT.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    build()
