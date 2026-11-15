"""Reporte PDF (fpdf2) del área consultada: KPIs, calendario con rampa Ember y anomalías recientes."""

from __future__ import annotations

import math

import pandas as pd
from fpdf import FPDF

from firecal import contracts as C
from firecal.api import queries
from firecal.api.areas import resolve

# Rampa "Ember" (identidad FireCal), secuencial poco -> mucho: la luminosidad baja de forma monótona,
# así que se lee también en escala de grises y con daltonismo. Tema claro de impresión: claro = poco.
EMBER_RAMP = [
    (0xFF, 0xF4, 0xDC), (0xFB, 0xD3, 0x8D), (0xF5, 0x9E, 0x4C), (0xE2, 0x63, 0x2B),
    (0xB2, 0x3A, 0x2A), (0x6E, 0x1F, 0x35), (0x2E, 0x0F, 0x2B),
]
EMBER = (0xFF, 0x6A, 0x2B)  # acento
EMBER_TEXT = (0xB5, 0x47, 0x1B)  # Ember oscurecido: legible como texto sobre blanco
NIGHT = (0x0E, 0x17, 0x14)  # títulos
# Niveles de alerta: mismo fondo que las fichas de la app (texto según luminancia).
LEVEL_FILL = {
    "normal": (0xDC, 0xEB, 0xF7), "elevated": (0xFB, 0xE3, 0xA8), "high": (0xE2, 0x63, 0x2B),
    "extreme": (0x6E, 0x1F, 0x35), "no_data": (255, 255, 255),
}


def ember(t: float) -> tuple[int, int, int]:
    """Color de la rampa Ember en t ∈ [0, 1] (interpolación lineal entre paradas)."""
    t = min(max(t, 0.0), 1.0) * (len(EMBER_RAMP) - 1)
    i = min(int(t), len(EMBER_RAMP) - 2)
    f = t - i
    a, b = EMBER_RAMP[i], EMBER_RAMP[i + 1]
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))  # type: ignore[return-value]


def _latin1(text: str) -> str:
    """Las fuentes núcleo de PDF solo cubren latin-1."""
    return text.replace("—", "-").replace("–", "-").encode("latin-1", "replace").decode("latin-1")


class _PDF(FPDF):
    def footer(self) -> None:
        self.set_y(-10)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(90, 90, 90)
        self.cell(0, 5, f"InnovaSoft - NASA Space Apps 2026 - Data: NASA FIRMS - page {self.page_no()}", align="C")


def build_pdf(req: C.QueryRequest) -> bytes:
    region = resolve(req.area)
    cal = queries.calendar(req)
    anom = queries.anomalies(req)
    try:
        stat = queries.status(req)
    except queries.QueryError:
        stat = None

    pdf = _PDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(True, margin=14)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*NIGHT)
    pdf.cell(0, 9, "Harmonized Burning Activity Report", new_x="LMARGIN", new_y="NEXT")
    # Franja de acento Ember bajo el título.
    pdf.set_fill_color(*EMBER)
    pdf.rect(pdf.l_margin, pdf.get_y(), 40, 1.2, style="F")
    pdf.ln(2.5)
    pdf.set_font("Helvetica", "", 10)
    period_end = req.end or queries.data.get_store().last_date.date()
    for line in (
        f"Area: {region.label}",
        f"Period: {req.start:%Y-%m-%d} to {period_end:%Y-%m-%d}",
        f"Method: {cal.method} (values in VIIRS-equivalent fire detections)",
    ):
        pdf.cell(0, 5, _latin1(line), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # ---- KPIs
    harm_total = sum(v for row in cal.harmonized for v in row if v is not None)
    kpis = [
        ("Harmonized detections", f"{harm_total:,.0f}"),
        ("Raw hotspots (MODIS+VIIRS)", f"{cal.total_raw_hotspots:,}"),
        ("Peak month (median)", stat.peak_month if stat else "-"),
        ("Most active year", str(stat.most_active_year) if stat else "-"),
        ("Latest month level", (stat.level.replace("_", " ").upper() if stat else "-")),
    ]
    w = (pdf.w - pdf.l_margin - pdf.r_margin) / len(kpis)
    pdf.set_fill_color(240, 240, 240)
    x0, y0 = pdf.get_x(), pdf.get_y()
    for i, (k, v) in enumerate(kpis):
        pdf.set_xy(x0 + i * w, y0)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(w - 2, 5, k, fill=True)
        pdf.set_xy(x0 + i * w, y0 + 5)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(w - 2, 7, v, fill=True)
    pdf.set_xy(x0, y0 + 14)
    if stat:
        pdf.set_font("Helvetica", "B", 10)
        pdf.multi_cell(0, 5, _latin1(stat.message), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # ---- calendario año x mes
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*EMBER_TEXT)
    pdf.cell(0, 6, "Monthly calendar (harmonized detections)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    vals = [v for row in cal.harmonized for v in row if v is not None]
    vmax = max(vals) if vals else 0.0
    cw, ch, yw, tw = 18.0, 4.6, 14.0, 22.0

    def header() -> None:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(yw, ch, "Year", border=1, align="C")
        for m in C.MONTHS:
            pdf.cell(cw, ch, m, border=1, align="C")
        pdf.cell(tw, ch, "Total", border=1, align="C", new_x="LMARGIN", new_y="NEXT")

    header()
    for y, row in zip(cal.years, cal.harmonized, strict=True):
        if pdf.will_page_break(ch):
            pdf.add_page()
            header()
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(yw, ch, str(y), border=1, align="C")
        pdf.set_font("Helvetica", "", 7)
        for v in row:
            if v is None:
                pdf.set_fill_color(255, 255, 255)
                pdf.set_text_color(150, 150, 150)
                pdf.cell(cw, ch, "-", border=1, align="C", fill=True)
                continue
            # Escala raíz cuadrada, igual que la app web.
            t = math.sqrt(v / vmax) if vmax > 0 and v > 0 else 0.0
            rgb = ember(t)
            pdf.set_fill_color(*rgb)
            lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
            pdf.set_text_color(*((0, 0, 0) if lum > 128 else (255, 255, 255)))
            pdf.cell(cw, ch, f"{v:,.0f}", border=1, align="C", fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "B", 7)
        total = sum(v for v in row if v is not None)
        pdf.cell(tw, ch, f"{total:,.0f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "I", 7)
    pdf.cell(0, 5, "Color: Ember ramp on a square-root scale (light = few detections, dark = many). '-' = outside period.",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # ---- anomalías de los últimos 12 meses
    recent = anom.series[-12:]
    if pdf.will_page_break(6 + ch * (len(recent) + 1)):
        pdf.add_page()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*EMBER_TEXT)
    pdf.cell(0, 6, _latin1(f"Anomalies, last 12 months (reference years {anom.reference_years[0]}-"
                           f"{anom.reference_years[1]}, same month)"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    cols = [("Month", 28), ("Detections", 28), ("Median", 28), ("Anomaly", 28), ("Ratio", 22),
            ("Percentile", 24), ("Level", 30)]
    pdf.set_font("Helvetica", "B", 8)
    for name, cwid in cols:
        pdf.cell(cwid, ch, name, border=1, align="C")
    pdf.ln(ch)
    pdf.set_font("Helvetica", "", 8)

    def fmt(v: float | None, spec: str) -> str:
        return "-" if v is None else format(v, spec)

    for p in recent:
        cells = [f"{pd.Timestamp(p.month):%b %Y}", fmt(p.value, ",.0f"), fmt(p.median, ",.0f"),
                 fmt(p.anomaly, "+,.0f"), fmt(p.ratio, ".2f"), fmt(p.percentile, ".0f")]
        pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(0, 0, 0)
        for (_, cwid), txt in zip(cols[:-1], cells, strict=True):
            pdf.cell(cwid, ch, txt, border=1, align="C")
        fill = LEVEL_FILL[p.level]
        pdf.set_fill_color(*fill)
        lum = 0.299 * fill[0] + 0.587 * fill[1] + 0.114 * fill[2]
        pdf.set_text_color(*((0, 0, 0) if lum > 128 else (255, 255, 255)))
        pdf.cell(cols[-1][1], ch, p.level.replace("_", " ").upper(), border=1, align="C", fill=True)
        pdf.ln(ch)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    # ---- nota de método
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*EMBER_TEXT)
    pdf.cell(0, 5, "Method", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 8)
    note = (
        "MODIS (Terra/Aqua, 1 km, since 2000) and VIIRS S-NPP (375 m, since Jan 2012) hotspots are not directly "
        "comparable. The harmonized series is expressed in VIIRS-equivalent detections: VIIRS hotspots are used "
        "from 2012 on, and earlier MODIS hotspots are weighted by a model calibrated on the 2012+ overlap "
        "(validated leave-one-year-out). Levels compare each month with the same calendar month in the reference "
        "years: normal (< p75), elevated (p75-p90), high (p90-p97.5), extreme (> p97.5). "
        f"Months with fewer than {queries.MIN_ALERT_DETECTIONS:g} detections are always normal."
    )
    if cal.method == "provisional":
        note += (" PROVISIONAL: the harmonization model output was not available, so MODIS counts before 2012 "
                 "are shown unweighted (weight = 1).")
    pdf.multi_cell(0, 4, _latin1(note), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(0, 5, "Data: NASA FIRMS (Fire Information for Resource Management System), MODIS C6.1 and VIIRS S-NPP.",
             new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
