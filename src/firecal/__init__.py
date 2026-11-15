"""firecal — entorno del equipo InnovaSoft para NASA Space Apps 2026.

CLI (descarga genérica de datos NASA FIRMS):
    uv run firecal download --country El_Salvador --start 2000 --end 2026
    uv run firecal recent            # año en curso (requiere FIRMS_MAP_KEY)
    uv run firecal build
    uv run firecal clean
"""

from __future__ import annotations

import argparse
from datetime import date


def main() -> None:
    p = argparse.ArgumentParser(prog="firecal")
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("download", help="Descarga CSV anuales FIRMS por país (sin llave)")
    d.add_argument("--country", default="El_Salvador", help="Nombre FIRMS con _ (ej. Guatemala, Ecuador)")
    d.add_argument("--start", type=int, default=2000)
    d.add_argument("--end", type=int, default=date.today().year)
    d.add_argument("--force", action="store_true")
    r = sub.add_parser("recent", help="Año en curso por la API de FIRMS (requiere FIRMS_MAP_KEY)")
    r.add_argument("--end", type=date.fromisoformat, default=None, help="Fecha final (default: fin del último mes)")
    sub.add_parser("build", help="Combina data/raw/*.csv en data/processed/hotspots.parquet")
    sub.add_parser("clean", help="Filtro de calidad + fuentes persistentes -> hotspots_clean.parquet")
    sub.add_parser("features", help="Dataset celda x mes -> cell_month.parquet")
    sub.add_parser("harmonize", help="Competencia de métodos (LOYO) + serie armonizada")
    a = p.parse_args()

    from . import download

    if a.cmd == "download":
        download.download_country(a.country, a.start, a.end, a.force)
    elif a.cmd == "recent":
        download.download_recent(a.end)
    elif a.cmd == "build":
        download.build_parquet()
    elif a.cmd == "clean":
        from . import clean

        clean.run()
    elif a.cmd == "features":
        from . import features

        features.run()
    elif a.cmd == "harmonize":
        from . import harmonize

        harmonize.run()
