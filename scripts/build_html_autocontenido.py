"""Genera un único HTML portable con aplicación, datos y dependencias embebidos."""

import base64
import json
import mimetypes
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "ua_amenazas.html"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"

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


def local_path(source):
    path = (ROOT / unquote(urlsplit(source).path)).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise RuntimeError(f"No se encontró el recurso local del proyecto: {source}")
    return path


def resource(source, binary=False):
    if source.startswith(("https://", "http://")):
        return download(source, binary=binary)
    path = local_path(source)
    return path.read_bytes() if binary else path.read_text(encoding="utf-8")


def data_uri(content, source):
    mime = mimetypes.guess_type(urlsplit(source).path)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def inline_css_assets(css, css_url, ancestors=()):
    if css_url in ancestors:
        raise RuntimeError(f"Importación CSS circular: {css_url}")

    def resolve(value):
        return urljoin(css_url, value)

    def replace_import(match):
        source = resolve(match.group(2))
        nested = inline_css_assets(resource(source), source, (*ancestors, css_url))
        media = match.group(3).strip()
        return f"@media {media} {{\n{nested}\n}}" if media else nested

    css = re.sub(
        r"@import\s+(?:url\(\s*)?(['\"])(.*?)\1\s*\)?\s*([^;]*);",
        replace_import, css, flags=re.IGNORECASE,
    )

    def replace(match):
        quote, value = match.groups()
        value = value.strip()
        if value.startswith(("data:", "#")):
            return match.group(0)
        asset_url = resolve(value)
        fragment = urlsplit(asset_url).fragment
        uri = data_uri(resource(asset_url, binary=True), asset_url)
        if fragment:
            uri += "#" + fragment
        return f"url({quote}{uri}{quote})"

    return re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", replace, css)


def safe_script(text):
    return re.sub(r"</script", r"<\\/script", text, flags=re.IGNORECASE)


class TagAttributes(HTMLParser):
    def handle_starttag(self, tag, attrs):
        self.attrs = dict(attrs)


class PortableResources(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        attribute = "src" if tag in ("script", "img") else "href" if tag == "link" else None
        source = attrs.get(attribute) if attribute else None
        if source and not source.startswith(("data:", "#")):
            raise RuntimeError(f"El resultado contiene un recurso sin incrustar: {source}")


def attributes(tag):
    parser = TagAttributes()
    parser.feed(tag)
    return parser.attrs


def inline_local_images(html):
    def replace(match):
        tag = match.group(0)
        source = attributes(tag).get("src")
        if not source or source.startswith("data:"):
            return tag
        uri = data_uri(resource(source, binary=True), source)
        return re.sub(r"\bsrc\s*=\s*(['\"])(.*?)\1", lambda _: f'src="{uri}"', tag, count=1, flags=re.IGNORECASE)

    return re.sub(r"<img\b[^>]*>", replace, html, flags=re.IGNORECASE)


def validate_data():
    data = {name: json.loads(path.read_text(encoding="utf-8")) for name, path in DATA.items()}
    ua, matrix = data["ua"], data["ua-matriz"]
    if not ua.get("corte") or not ua.get("rows"):
        raise RuntimeError("El archivo de UA no contiene corte o registros")
    if len(ua["rows"]) != len(matrix["rows"]):
        raise RuntimeError("La matriz Excel y el mapa tienen distinta cantidad de UA")
    code_index = matrix["cols"].index("co_siimdh")
    for i, (row, full_row) in enumerate(zip(ua["rows"], matrix["rows"]), 1):
        if len(row) != 24 or len(full_row) != len(matrix["cols"]):
            raise RuntimeError(f"Cantidad de columnas inesperada en la fila {i}")
        if str(row[0]) != str(full_row[code_index]):
            raise RuntimeError(f"El orden de UA del mapa y la matriz no coincide en la fila {i}")
    for name in ("provincias", "cantones", "parroquias"):
        if data[name].get("type") != "FeatureCollection" or not data[name].get("features"):
            raise RuntimeError(f"Límites territoriales inválidos: {name}")
    if not data["diccionario"].get("variables"):
        raise RuntimeError("El diccionario no contiene variables")
    return ua


def build():
    ua = validate_data()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    def replace_link(match):
        tag = match.group(0)
        attrs = attributes(tag)
        rel = (attrs.get("rel") or "").lower().split()
        if any(value in rel for value in ("preconnect", "dns-prefetch")):
            return ""
        source = attrs.get("href")
        if "stylesheet" in rel and source:
            print(f"CSS: {source}")
            css = inline_css_assets(resource(source), source)
            css = re.sub(r"</style", r"<\\/style", css, flags=re.IGNORECASE)
            media = attrs.get("media")
            if media:
                css = f"@media {media} {{\n{css}\n}}"
            return f"<style>\n{css}\n</style>"
        if "icon" in rel and source and not source.startswith("data:"):
            uri = data_uri(resource(source, binary=True), source)
            return re.sub(r"\bhref\s*=\s*(['\"])(.*?)\1", lambda _: f'href="{uri}"', tag, count=1, flags=re.IGNORECASE)
        return tag

    html = re.sub(r"<link\b[^>]*>", replace_link, html, flags=re.IGNORECASE)
    html = inline_local_images(html)

    embedded = []
    for name, path in DATA.items():
        text = safe_script(path.read_text(encoding="utf-8"))
        embedded.append(f'<script type="application/json" id="embedded-{name}">{text}</script>')

    banner = base64.b64encode((ROOT / "data" / "banner.png").read_bytes()).decode("ascii")
    embedded.append(f'<script type="application/octet-stream" id="embedded-banner">{banner}</script>')

    app_count = 0

    def replace_script(match):
        nonlocal app_count
        tag = match.group(0)
        attrs = attributes(tag[:tag.index(">") + 1])
        source = attrs.get("src")
        if not source:
            return tag
        if attrs.get("type", "").lower() == "module":
            raise RuntimeError(f"El empaquetado de módulos requiere resolver sus importaciones: {source}")
        print(f"JS: {source}")
        javascript = safe_script(resource(source))
        prefix = ""
        if urlsplit(source).path.removeprefix("./") == "js/app.js":
            app_count += 1
            prefix = "\n".join(embedded) + "\n"
        return prefix + f"<script>\n{javascript}\n</script>"

    html = re.sub(r"<script\b[^>]*>.*?</script\s*>", replace_script, html, flags=re.IGNORECASE | re.DOTALL)
    if app_count != 1:
        raise RuntimeError("Se esperaba una única referencia a js/app.js en index.html")

    PortableResources().feed(html)

    OUTPUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"Generado: {OUTPUT}")
    print(f"Tamaño: {OUTPUT.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"Corte: {ua['corte']} · UA: {len(ua['rows'])}")


if __name__ == "__main__":
    build()
