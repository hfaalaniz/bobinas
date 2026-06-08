#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Descarga todos los PDFs del indice de publicaciones de Editores SRL.
URL fuente: https://editores-srl.com.ar/revistas/novedades

Uso:
    python descargar_revistas.py                     guarda en ./revistas/
    python descargar_revistas.py -o D:\\Revistas      carpeta destino personalizada
    python descargar_revistas.py --dry-run            solo lista, no descarga
    python descargar_revistas.py --delay 2.0          pausa de 2 s entre descargas
"""

import sys
import io

# Forzar salida UTF-8 en Windows para evitar UnicodeEncodeError
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import time
import argparse
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from html.parser import HTMLParser

# ── Configuracion ──────────────────────────────────────────────────────────────
SOURCE_URL  = "https://editores-srl.com.ar/revistas/novedades"
BASE_HOST   = "https://editores-srl.com.ar"
ALT_HOST    = "https://www.editores.com.ar"
DELAY_SEC   = 1.5
TIMEOUT_SEC = 60
USER_AGENT  = "Mozilla/5.0 (compatible; revista-downloader/1.0)"


# ── Parser HTML minimal ────────────────────────────────────────────────────────
class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for name, value in attrs:
                if name == "href" and value:
                    self.links.append(value)


# ── Normalizar href a URL absoluta ─────────────────────────────────────────────
def normalizar_url(href):
    href = href.strip()

    if not href.lower().endswith(".pdf"):
        return None

    # Caso raro: /sites/default/files/https://www.editores.com.ar/sites/...
    if href.startswith("/sites/default/files/https://"):
        href = href[len("/sites/default/files/"):]

    if href.startswith("http://") or href.startswith("https://"):
        href = href.replace(ALT_HOST, BASE_HOST)
        href = href.replace("http://", "https://")
        return href

    if href.startswith("/"):
        return BASE_HOST + href

    return None


# ── Subcarpeta segun tipo de publicacion ───────────────────────────────────────
def subcarpeta(filename):
    f = filename.lower()
    if "luminotecnia" in f:
        return "Luminotecnia"
    if "aadeca" in f:
        return "AADECA"
    if "anuario" in f:
        return "Anuario"
    return "Ingenieria_Electrica"


# ── Descargar un PDF ───────────────────────────────────────────────────────────
def descargar(url, destino):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
            datos = resp.read()
        destino.write_bytes(datos)
        size_kb = len(datos) // 1024
        print(f"  OK   {destino.name}  ({size_kb} KB)")
        return True
    except urllib.error.HTTPError as e:
        print(f"  FAIL HTTP {e.code}  -> {url}")
        return False
    except urllib.error.URLError as e:
        print(f"  FAIL Red: {e.reason}  -> {url}")
        return False
    except Exception as e:
        print(f"  FAIL {e}  -> {url}")
        return False


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(
        description="Descarga todas las revistas PDF de editores-srl.com.ar"
    )
    ap.add_argument("-o", "--output", default="revistas",
                    help="Carpeta destino (default: ./revistas)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Solo listar PDFs, sin descargar")
    ap.add_argument("--delay", type=float, default=DELAY_SEC,
                    help=f"Pausa entre descargas en segundos (default: {DELAY_SEC})")
    args = ap.parse_args()

    output_root = Path(args.output)

    # 1. Obtener HTML del indice
    print(f"\nObteniendo indice: {SOURCE_URL}\n")
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Error al obtener la pagina: {e}")
        sys.exit(1)

    # 2. Extraer y deduplicar URLs de PDF
    lp = LinkParser()
    lp.feed(html)

    urls_pdf = []
    vistos   = set()
    for href in lp.links:
        url = normalizar_url(href)
        if url and url not in vistos:
            vistos.add(url)
            urls_pdf.append(url)

    print(f"PDFs unicos encontrados: {len(urls_pdf)}\n")

    if not urls_pdf:
        print("No se encontraron PDFs. Verificar conectividad.")
        sys.exit(1)

    # 3. Resumen por categoria
    por_cat = {}
    for url in urls_pdf:
        fn  = urllib.parse.unquote(url.split("/")[-1])
        cat = subcarpeta(fn)
        por_cat.setdefault(cat, []).append(url)

    for cat in sorted(por_cat):
        print(f"  {cat:<30} {len(por_cat[cat]):3d} archivos")
    print()

    # 4. Dry-run: solo mostrar
    if args.dry_run:
        print("DRY RUN - lista de URLs:")
        for url in urls_pdf:
            print(" ", url)
        return

    # 5. Crear carpetas
    output_root.mkdir(parents=True, exist_ok=True)
    for cat in por_cat:
        (output_root / cat).mkdir(exist_ok=True)

    # 6. Descargar
    ok = fail = skip = 0

    for i, url in enumerate(urls_pdf, 1):
        fn      = urllib.parse.unquote(url.split("/")[-1])
        cat     = subcarpeta(fn)
        destino = output_root / cat / fn

        print(f"[{i:3d}/{len(urls_pdf)}] {cat}/{fn}")

        if destino.exists():
            print("  SKIP  ya existe")
            skip += 1
            continue

        if descargar(url, destino):
            ok += 1
        else:
            fail += 1

        if i < len(urls_pdf):
            time.sleep(args.delay)

    # 7. Resumen final
    sep = "-" * 50
    print(f"\n{sep}")
    print(f"  Descargados : {ok}")
    print(f"  Omitidos    : {skip}  (ya existian)")
    print(f"  Fallidos    : {fail}")
    print(f"  Carpeta     : {output_root.resolve()}")
    print(f"{sep}\n")


if __name__ == "__main__":
    main()
