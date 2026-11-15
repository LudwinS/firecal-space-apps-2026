"""Consultas de la API: agregación mensual por área (numpy vectorizado), calendario, anomalías, estado, comparación y exportación."""

from __future__ import annotations

import threading
from calendar import monthrange
from collections import OrderedDict
from datetime import date

import numpy as np
import pandas as pd

from firecal import contracts as C
from firecal.api import data
from firecal.api.areas import Region, resolve

LEVEL_LABEL = {"normal": "NORMAL", "elevated": "ELEVATED", "high": "HIGH", "extreme": "EXTREME", "no_data": "NO DATA"}
MIN_ALERT_DETECTIONS = 5.0  # por debajo de esto el nivel es siempre "normal"
EXPORT_COLUMNS = ["latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp", "weight"]


class QueryError(ValueError):
    """Petición válida en forma pero imposible de responder -> HTTP 422."""


class AreaNotFound(LookupError):
    """País desconocido -> HTTP 404."""


# ------------------------------------------------------------------ caché por área
_cache_lock = threading.Lock()
_monthly_cache: OrderedDict[tuple, pd.DataFrame] = OrderedDict()
_key_locks: dict[tuple, threading.Lock] = {}
_CACHE_MAX = 256


def clear_cache() -> None:
    with _cache_lock:
        _monthly_cache.clear()
        _key_locks.clear()


# ------------------------------------------------------------------ filtro y agregación
def _rows(pts: data.Points, region: Region, start: date | None = None, end: date | None = None) -> np.ndarray | None:
    """Índices de las filas dentro del área y las fechas; None = todas las filas.

    Filtro grueso vectorizado (país / bbox / fechas) y luego máscara fina (polígono / radio)
    solo sobre las filas que pasaron el grueso.
    """
    mask: np.ndarray | None = None

    def also(cond: np.ndarray) -> None:
        nonlocal mask
        mask = cond if mask is None else np.logical_and(mask, cond, out=mask)

    if region.country is not None:
        also(pts.country == pts.country_code.get(region.country, -1))
    if region.bbox is not None:
        w, s, e, n = region.bbox
        also(pts.lon >= w)
        also(pts.lon <= e)
        also(pts.lat >= s)
        also(pts.lat <= n)
    if start is not None:
        also(pts.date >= np.datetime64(start, "D"))
    if end is not None:
        also(pts.date < np.datetime64(end, "D") + np.timedelta64(1, "D"))
    if mask is None:
        if region.mask is None:
            return None
        idx = np.arange(len(pts.lat))
    else:
        idx = np.flatnonzero(mask)
    if region.mask is not None and len(idx):
        idx = idx[region.mask(pts.lat[idx], pts.lon[idx])]
    return idx


def _take(arr: np.ndarray, idx: np.ndarray | None) -> np.ndarray:
    return arr if idx is None else arr[idx]


def _month_sum(month: np.ndarray, n: int, weights: np.ndarray | None = None) -> np.ndarray:
    """Suma (o conteo) por mes; ignora los meses fuera de la cobertura [0, n)."""
    ok = (month >= 0) & (month < n)
    if not ok.all():
        month = month[ok]
        weights = None if weights is None else weights[ok]
    return np.bincount(month, weights=weights, minlength=n).astype(float)


def _month_aligned(start: date | None, end: date | None) -> bool:
    """True si el rango cubre meses completos (empieza un día 1 y termina a fin de mes)."""
    return (start is None or start.day == 1) and (end is None or end.day == monthrange(end.year, end.month)[1])


def _monthly_table(st: data.Store, region: Region, start: date | None, end: date | None) -> pd.DataFrame:
    n = len(st.months)
    hi = _rows(st.harm, region, start, end)
    hm = _take(st.harm.month, hi)
    hdf = st.harm.df
    out = pd.DataFrame({
        "harmonized": _month_sum(hm, n, _take(hdf["weight"].to_numpy(), hi)),
        "lo": _month_sum(hm, n, _take(hdf["weight_lo"].to_numpy(), hi)),
        "hi": _month_sum(hm, n, _take(hdf["weight_hi"].to_numpy(), hi)),
    }, index=st.months)
    ri = _rows(st.raw, region, start, end)
    rm = _take(st.raw.month, ri)
    sensor = st.raw.df["sensor"].cat
    codes = _take(sensor.codes.to_numpy(), ri)
    for name, col in (("MODIS", "raw_modis"), ("VIIRS", "raw_viirs")):
        lo, hi_m = st.sensor_cover.get(name, (None, None))
        if lo is None:
            out[col] = np.nan
            continue
        out[col] = _month_sum(rm[codes == list(sensor.categories).index(name)], n)
        out.loc[(out.index < lo) | (out.index > hi_m), col] = np.nan
    return out


def area_monthly(region: Region, start: date | None = None, end: date | None = None) -> pd.DataFrame:
    """Tabla mensual del área: harmonized, lo, hi, raw_modis, raw_viirs.

    Índice: todos los meses de la cobertura global; 0 = sin detecciones, NaN = sensor sin cobertura ese mes.
    Con un rango de meses completos devuelve la tabla de TODO el periodo (una sola pasada por área, que
    comparten calendario, anomalías, estado y PDF): el llamador se queda con los meses que le interesan.
    """
    st = data.get_store()
    if region.country is not None and region.country not in set(st.countries["country"]):
        raise AreaNotFound(f"Unknown country '{region.country}'. See GET /api/areas")
    # Un límite que cae fuera de los datos no filtra nada: se trata como "sin límite".
    if start is not None and start <= st.first_month.date():
        start = None
    if end is not None and end >= st.last_date.date():
        end = None
    if _month_aligned(start, end):
        start = end = None
    ck = (st.key, region.key, start, end)
    with _cache_lock:
        if ck in _monthly_cache:
            _monthly_cache.move_to_end(ck)
            return _monthly_cache[ck]
        key_lock = _key_locks.setdefault(ck, threading.Lock())
    # Un candado por área: si llegan a la vez /status y /calendar de la misma área, se calcula una sola vez.
    with key_lock:
        with _cache_lock:
            if ck in _monthly_cache:
                return _monthly_cache[ck]
        out = _monthly_table(st, region, start, end)
        with _cache_lock:
            _monthly_cache[ck] = out
            _key_locks.pop(ck, None)
            while len(_monthly_cache) > _CACHE_MAX:
                _monthly_cache.popitem(last=False)
    return out


def warm_up() -> None:
    """Carga los datos y precalcula la tabla mensual de cada país (las consultas más comunes)."""
    st = data.get_store()
    for country in st.countries["country"]:
        area_monthly(resolve(C.AreaSpec(country=country)))


# ------------------------------------------------------------------ helpers
def _month_start(d: date) -> pd.Timestamp:
    return pd.Timestamp(d.year, d.month, 1)


def _window(start: date, end: date | None) -> tuple[date, date, pd.Timestamp, pd.Timestamp]:
    """Rango efectivo: (start, end) en días y (primer, último) mes dentro de la cobertura."""
    st = data.get_store()
    if end is not None and end < start:
        raise QueryError("end must be on or after start")
    # Sin `end`, un inicio posterior al último dato no es un error: es un periodo sin datos (m0 > m1).
    end_d = end or max(st.last_date.date(), start)
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
    base = tab.index[0].year * 12 + tab.index[0].month - 1
    p0, p1 = m0.year * 12 + m0.month - 1 - base, m1.year * 12 + m1.month - 1 - base
    mats: dict[str, list[list]] = {}
    for k, conv in (("harmonized", _num), ("lo", _num), ("hi", _num), ("raw_modis", _int), ("raw_viirs", _int)):
        col = tab[k].to_numpy()
        mats[k] = [[conv(col[p]) if p0 <= (p := y * 12 + m - base) <= p1 else None for m in range(12)] for y in years]
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
    med, q75, q90, q975 = (float(q) for q in np.percentile(ref, [50, 75, 90, 97.5]))
    pct = float((np.sum(ref < value) + 0.5 * np.sum(ref == value)) / ref.size * 100)
    # Con muy pocas detecciones no se declara anomalía: si la referencia es casi todo ceros
    # (área pequeña, época lluviosa), un solo hotspot superaría cualquier percentil.
    if value < MIN_ALERT_DETECTIONS or value <= q75:
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
    h = full["harmonized"].to_numpy(dtype=float)
    years = full.index.year.to_numpy()
    months = full.index.month.to_numpy()
    if reference_years is not None and reference_years[0] > reference_years[1]:
        raise QueryError("reference_years must be [first, last] with first <= last")
    ref_range = reference_years or (int(years.min()), int(years.max()))
    in_ref = (years >= ref_range[0]) & (years <= ref_range[1])
    base = int(years[0]) * 12 + int(months[0]) - 1
    p0 = max(m0.year * 12 + m0.month - 1 - base, 0)
    p1 = min(m1.year * 12 + m1.month - 1 - base, len(h) - 1)
    pts: list[C.AnomalyPoint] = []
    for p in range(p0, p1 + 1):
        value = float(h[p])
        # Referencia: mismo mes del calendario en los años de referencia, sin contar el propio año.
        ref = h[(months == months[p]) & in_ref & (years != years[p])]
        med, pct, lvl, ratio = _level(value, ref)
        pts.append(C.AnomalyPoint(
            month=date(int(years[p]), int(months[p]), 1), value=round(value, 2), median=_num(med),
            anomaly=_num(value - med) if med is not None else None,
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
    """CSV de los puntos del área en trozos de un año, para no armar el archivo completo en memoria.

    Valida todo ANTES de devolver el generador, así los errores siguen siendo 404/422 y no un stream roto.
    """
    region = resolve(req.area)
    start, end, _, _ = _window(req.start, req.end)
    st = data.get_store()
    if region.country is not None and region.country not in set(st.countries["country"]):
        raise AreaNotFound(f"Unknown country '{region.country}'. See GET /api/areas")
    harm = st.harm
    cols = [c for c in EXPORT_COLUMNS if c in harm.df.columns]

    def gen():
        yield ",".join(cols) + "\n"
        idx = _rows(harm, region, start, end)
        if idx is None:
            idx = np.arange(len(harm.df))
        # Los puntos "virtual" son aporte estimado del modelo en celdas-mes sin MODIS: no son detecciones reales.
        if "satellite" in harm.df:
            sat = harm.df["satellite"].cat
            if "virtual" in sat.categories:
                idx = idx[sat.codes.to_numpy()[idx] != list(sat.categories).index("virtual")]
        dates = harm.date[idx]
        order = np.argsort(dates, kind="stable")
        idx, dates = idx[order], dates[order]
        years = dates.astype("datetime64[Y]")
        cuts = np.flatnonzero(years[1:] != years[:-1]) + 1
        for part in np.split(idx, cuts):
            if len(part):
                df = harm.df.take(part)[cols]
                df["acq_date"] = df["acq_date"].dt.strftime("%Y-%m-%d")
                yield df.to_csv(index=False, header=False)

    return gen()
