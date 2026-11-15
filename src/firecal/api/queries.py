"""Consultas de la API: agregación mensual por área (DuckDB), calendario, anomalías, estado, comparación y exportación."""

from __future__ import annotations

import threading
from collections import OrderedDict
from datetime import date, timedelta

import duckdb
import numpy as np
import pandas as pd

from firecal import contracts as C
from firecal.api import data
from firecal.api.areas import Region, resolve

LEVEL_LABEL = {"normal": "NORMAL", "elevated": "ELEVATED", "high": "HIGH", "extreme": "EXTREME", "no_data": "NO DATA"}
EXPORT_COLUMNS = ["latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp", "weight"]


class QueryError(ValueError):
    """Petición válida en forma pero imposible de responder -> HTTP 422."""


class AreaNotFound(LookupError):
    """País desconocido -> HTTP 404."""


# ------------------------------------------------------------------ caché por área
_cache_lock = threading.Lock()
_monthly_cache: OrderedDict[tuple, pd.DataFrame] = OrderedDict()
_CACHE_MAX = 256


def clear_cache() -> None:
    with _cache_lock:
        _monthly_cache.clear()


# ------------------------------------------------------------------ filtro y agregación
def _where(region: Region, start: date | None, end: date | None) -> tuple[str, list]:
    conds, params = [], []
    if region.country is not None:
        conds.append("country = ?")
        params.append(region.country)
    if region.bbox is not None:
        w, s, e, n = region.bbox
        conds.append("longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?")
        params += [w, e, s, n]
    if start is not None:
        conds.append("acq_date >= ?")
        params.append(pd.Timestamp(start).to_pydatetime())
    if end is not None:
        conds.append("acq_date < ?")
        params.append(pd.Timestamp(end + timedelta(days=1)).to_pydatetime())
    return (" WHERE " + " AND ".join(conds)) if conds else "", params


def select_points(df: pd.DataFrame, region: Region, cols: list[str],
                  start: date | None = None, end: date | None = None) -> pd.DataFrame:
    """Filtro grueso en DuckDB (país/bbox/fechas) y luego máscara fina vectorizada (polígono/radio)."""
    need = list(dict.fromkeys(cols + (["latitude", "longitude"] if region.mask else [])))
    where, params = _where(region, start, end)
    con = duckdb.connect()
    try:
        con.register("pts", df)
        sub = con.execute(f"SELECT {', '.join(need)} FROM pts{where}", params).df()
    finally:
        con.close()
    if region.mask is not None and len(sub):
        sub = sub.loc[region.mask(sub["latitude"].to_numpy(), sub["longitude"].to_numpy())]
    return sub[cols].reset_index(drop=True)


def _aggregate(df: pd.DataFrame, region: Region, agg_sql: str, cols: list[str],
               start: date | None, end: date | None) -> pd.DataFrame:
    """Agrega por mes en DuckDB. Sin máscara fina, filtra y agrega en una sola consulta."""
    con = duckdb.connect()
    try:
        if region.mask is None:
            con.register("pts", df)
            where, params = _where(region, start, end)
        else:
            con.register("pts", select_points(df, region, cols, start, end))
            where, params = "", []
        sql = f"SELECT date_trunc('month', acq_date) AS month, {agg_sql} FROM pts{where} GROUP BY 1"
        out = con.execute(sql, params).df()
    finally:
        con.close()
    out["month"] = pd.to_datetime(out["month"]).astype("datetime64[us]")
    return out.set_index("month")


def area_monthly(region: Region, start: date | None = None, end: date | None = None) -> pd.DataFrame:
    """Tabla mensual del área: harmonized, lo, hi, raw_modis, raw_viirs.

    Índice: todos los meses de la cobertura global; 0 = sin detecciones, NaN = sensor sin cobertura ese mes.
    """
    st = data.get_store()
    if region.country is not None and region.country not in set(st.countries["country"]):
        raise AreaNotFound(f"Unknown country '{region.country}'. See GET /api/areas")
    ck = (st.key, region.key, start, end)
    with _cache_lock:
        if ck in _monthly_cache:
            _monthly_cache.move_to_end(ck)
            return _monthly_cache[ck]

    harm = _aggregate(st.harm, region,
                      "sum(weight) AS harmonized, sum(weight_lo) AS lo, sum(weight_hi) AS hi",
                      ["acq_date", "weight", "weight_lo", "weight_hi"], start, end)
    raw = _aggregate(st.raw, region,
                     "count(*) FILTER (WHERE sensor = 'MODIS') AS raw_modis, "
                     "count(*) FILTER (WHERE sensor = 'VIIRS') AS raw_viirs",
                     ["acq_date", "sensor"], start, end)
    idx = pd.date_range(st.first_month, st.last_month, freq="MS").astype("datetime64[us]")
    out = harm.reindex(idx).fillna(0.0).join(raw.reindex(idx).fillna(0.0).astype(float))
    for sensor, col in (("MODIS", "raw_modis"), ("VIIRS", "raw_viirs")):
        lo, hi = st.sensor_cover.get(sensor, (None, None))
        if lo is None:
            out[col] = np.nan
        else:
            out.loc[(out.index < lo) | (out.index > hi), col] = np.nan
    with _cache_lock:
        _monthly_cache[ck] = out
        while len(_monthly_cache) > _CACHE_MAX:
            _monthly_cache.popitem(last=False)
    return out


# ------------------------------------------------------------------ helpers
def _month_start(d: date) -> pd.Timestamp:
    return pd.Timestamp(d.year, d.month, 1)


def _window(start: date, end: date | None) -> tuple[date, date, pd.Timestamp, pd.Timestamp]:
    """Rango efectivo: (start, end) en días y (primer, último) mes dentro de la cobertura."""
    st = data.get_store()
    end_d = end or st.last_date.date()
    if end_d < start:
        raise QueryError("end must be on or after start")
    m0 = max(_month_start(start), st.first_month)
    m1 = min(_month_start(end_d), st.last_month)
    return start, end_d, m0, m1


def _num(v: float, nd: int = 2) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), nd)


def _int(v: float) -> int | None:
    return None if v is None or pd.isna(v) else round(float(v))


# ------------------------------------------------------------------ endpoints
def areas() -> list[C.AreaInfo]:
    st = data.get_store()
    return [
        C.AreaInfo(id=r.country, name=r.country.replace("_", " "), kind="country",
                   bbox=(round(r.west, 4), round(r.south, 4), round(r.east, 4), round(r.north, 4)))
        for r in st.countries.sort_values("country").itertuples()
    ]


def calendar(req: C.QueryRequest) -> C.CalendarResponse:
    region = resolve(req.area)
    start, end, m0, m1 = _window(req.start, req.end)
    st = data.get_store()
    if m0 > m1:
        return C.CalendarResponse(years=[], harmonized=[], harmonized_lo=[], harmonized_hi=[],
                                  raw_modis=[], raw_viirs=[], total_raw_hotspots=0, method=st.method)
    tab = area_monthly(region, start, end)
    years = list(range(m0.year, m1.year + 1))
    mats: dict[str, list[list]] = {k: [] for k in ("harmonized", "lo", "hi", "raw_modis", "raw_viirs")}
    for y in years:
        rows = {k: [] for k in mats}
        for m in range(1, 13):
            ts = pd.Timestamp(y, m, 1)
            inside = m0 <= ts <= m1
            rec = tab.loc[ts] if inside and ts in tab.index else None
            for k in ("harmonized", "lo", "hi"):
                rows[k].append(_num(rec[k]) if rec is not None else None)
            for k in ("raw_modis", "raw_viirs"):
                rows[k].append(_int(rec[k]) if rec is not None else None)
        for k, row in rows.items():
            mats[k].append(row)
    in_range = tab.loc[m0:m1]
    total = int(np.nansum(in_range["raw_modis"].to_numpy()) + np.nansum(in_range["raw_viirs"].to_numpy()))
    return C.CalendarResponse(
        years=years, harmonized=mats["harmonized"], harmonized_lo=mats["lo"], harmonized_hi=mats["hi"],
        raw_modis=mats["raw_modis"], raw_viirs=mats["raw_viirs"], total_raw_hotspots=total, method=st.method,
    )


def _level(value: float, ref: np.ndarray) -> tuple[float | None, float | None, C.AlertLevel, float | None]:
    """(mediana, percentil, nivel, ratio) de un valor contra los valores de referencia del mismo mes."""
    if ref.size == 0:
        return None, None, "no_data", None
    med = float(np.median(ref))
    pct = float((np.sum(ref < value) + 0.5 * np.sum(ref == value)) / ref.size * 100)
    q75, q90, q975 = np.percentile(ref, [75, 90, 97.5])
    if value <= med or value <= q75:
        lvl = "normal"
    elif value > q975:
        lvl = "extreme"
    elif value > q90:
        lvl = "high"
    else:
        lvl = "elevated"
    ratio = value / med if med > 0 else None
    return med, pct, lvl, ratio



def anomaly_points(region: Region, m0: pd.Timestamp, m1: pd.Timestamp,
                   reference_years: tuple[int, int] | None) -> tuple[list[C.AnomalyPoint], tuple[int, int]]:
    full = area_monthly(region)
    h = full["harmonized"]
    years = full.index.year
    ref_range = reference_years or (int(years.min()), int(years.max()))
    pts: list[C.AnomalyPoint] = []
    for ts in pd.date_range(m0, m1, freq="MS"):
        ts = pd.Timestamp(ts)
        if ts not in full.index:
            continue
        value = float(h.loc[ts])
        same = full.index.month == ts.month
        sel = same & (years != ts.year) & (years >= ref_range[0]) & (years <= ref_range[1])
        ref = h[sel].dropna().to_numpy(dtype=float)
        med, pct, lvl, ratio = _level(value, ref)
        pts.append(C.AnomalyPoint(
            month=ts.date(), value=round(value, 2), median=_num(med), anomaly=_num(value - med) if med is not None else None,
            ratio=_num(ratio, 3), percentile=_num(pct, 1), level=lvl,
        ))
    return pts, ref_range


def anomalies(req: C.QueryRequest) -> C.AnomalyResponse:
    region = resolve(req.area)
    _, _, m0, m1 = _window(req.start, req.end)
    pts, ref = anomaly_points(region, m0, m1, req.reference_years)
    return C.AnomalyResponse(series=pts, reference_years=ref)


def _monthly_medians(full: pd.DataFrame) -> list[float]:
    h = full["harmonized"]
    med = h.groupby(full.index.month).median()
    return [round(float(med.get(m, 0.0)), 2) if not pd.isna(med.get(m, np.nan)) else 0.0 for m in range(1, 13)]


def status_message(p: C.AnomalyPoint, partial_through: date | None = None) -> str:
    ts = pd.Timestamp(p.month)
    when = f"{ts:%B %Y}"
    mon = f"{ts:%B}"
    label = LEVEL_LABEL[p.level]
    note = f" (data through {partial_through:%b} {partial_through.day})" if partial_through else ""
    n = f"{p.value:,.0f}"
    if p.level == "no_data" or p.median is None:
        return f"{when}{note}: {n} fire detections; not enough history to compare — {label}"
    if p.median > 0:
        return (f"{when}{note}: {p.value / p.median:.1f}× the usual for {mon} "
                f"({n} vs. typical {p.median:,.0f} detections) — {label}")
    return f"{when}{note}: {n} fire detections; usually none in {mon} — {label}"


def status(req: C.QueryRequest) -> C.StatusResponse:
    region = resolve(req.area)
    _, _, m0, m1 = _window(req.start, req.end)
    if m0 > m1:
        raise QueryError("No data in the requested period")
    pts, _ = anomaly_points(region, m1, m1, req.reference_years)
    if not pts:
        raise QueryError("No data in the requested period")
    p = pts[-1]
    st = data.get_store()
    ts = pd.Timestamp(p.month)
    month_end = ts + pd.offsets.MonthEnd(0)
    partial = st.last_date.date() if ts == st.last_month and st.last_date < month_end else None

    full = area_monthly(region)
    medians = _monthly_medians(full)
    peak = C.MONTHS[int(np.argmax(medians))]
    annual = full.loc[m0:m1, "harmonized"].groupby(full.loc[m0:m1].index.year).sum()
    most_active = int(annual.idxmax()) if len(annual) else ts.year
    return C.StatusResponse(
        month=p.month, value=p.value, median=p.median, level=p.level,
        message=status_message(p, partial), peak_month=peak, most_active_year=most_active,
    )


def compare(req: C.CompareRequest) -> C.CompareResponse:
    cal_a = calendar(C.QueryRequest(area=req.area_a, start=req.start, end=req.end))
    cal_b = calendar(C.QueryRequest(area=req.area_b, start=req.start, end=req.end))

    def medians(cal: C.CalendarResponse) -> list[float]:
        out = []
        for m in range(12):
            vals = [row[m] for row in cal.harmonized if row[m] is not None]
            out.append(round(float(np.median(vals)), 2) if vals else 0.0)
        return out

    a = np.array([v for row in cal_a.harmonized for v in row], dtype=object)
    b = np.array([v for row in cal_b.harmonized for v in row], dtype=object)
    ok = np.array([x is not None and y is not None for x, y in zip(a, b, strict=True)], dtype=bool)
    corr = None
    if ok.sum() >= 3:
        xa, xb = a[ok].astype(float), b[ok].astype(float)
        if xa.std() > 0 and xb.std() > 0:
            corr = round(float(np.corrcoef(xa, xb)[0, 1]), 4)
    return C.CompareResponse(a=cal_a, b=cal_b, monthly_a=medians(cal_a), monthly_b=medians(cal_b), correlation=corr)


def export_chunks(req: C.QueryRequest):
    """Igual que export_points pero en trozos de un año, para no armar el CSV completo en memoria.

    Valida todo ANTES de devolver el generador, así los errores siguen siendo 404/422 y no un stream roto.
    """
    region = resolve(req.area)
    start, end, _, _ = _window(req.start, req.end)
    st = data.get_store()
    if region.country is not None and region.country not in set(st.countries["country"]):
        raise AreaNotFound(f"Unknown country '{region.country}'. See GET /api/areas")
    cols = [c for c in EXPORT_COLUMNS if c in st.harm.columns]

    def gen():
        yield ",".join(cols) + "\n"
        for year in range(start.year, end.year + 1):
            y0 = max(start, date(year, 1, 1))
            y1 = min(end, date(year, 12, 31))
            df = select_points(st.harm, region, cols, y0, y1).sort_values("acq_date", kind="stable")
            if "satellite" in df:
                df = df[df["satellite"] != "virtual"]
            if len(df):
                df["acq_date"] = pd.to_datetime(df["acq_date"]).dt.strftime("%Y-%m-%d")
                yield df.to_csv(index=False, header=False)

    return gen()


def export_points(req: C.QueryRequest) -> pd.DataFrame:
    region = resolve(req.area)
    start, end, _, _ = _window(req.start, req.end)
    st = data.get_store()
    if region.country is not None and region.country not in set(st.countries["country"]):
        raise AreaNotFound(f"Unknown country '{region.country}'. See GET /api/areas")
    cols = [c for c in EXPORT_COLUMNS if c in st.harm.columns]
    df = select_points(st.harm, region, cols, start, end).sort_values("acq_date", kind="stable")
    # Los puntos "virtual" son aporte estimado del modelo en celdas-mes sin MODIS: no son detecciones reales.
    if "satellite" in df:
        df = df[df["satellite"] != "virtual"]
    df["acq_date"] = pd.to_datetime(df["acq_date"]).dt.strftime("%Y-%m-%d")
    return df.reset_index(drop=True)

