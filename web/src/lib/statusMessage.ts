import type { StatusResponse } from "../api/types";
import { getLang } from "../i18n";
import { fmtMonthLong, monthLong } from "./format";
import { MONTHS } from "../api/types";

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const LEVEL_ES: Record<string, string> = { normal: "NORMAL", elevated: "ELEVADO", high: "ALTO", extreme: "EXTREMO", no_data: "SIN DATOS" };

/**
 * Status sentence shown in the responder card. The API writes it in English; in Spanish it is
 * rebuilt here from the same numbers (the API message is only parsed for the "data through" note).
 */
export function statusMessage(s: StatusResponse): string {
  // Con cero detecciones la tarjeta dice "No detections"; la etiqueta final del mensaje debe coincidir.
  if (getLang() !== "es") return s.value === 0 ? s.message.replace(/ — [A-Z ]+$/, " — NO DETECTIONS") : s.message;
  const monthIndex = Number(s.month.split("-")[1] || 1) - 1;
  const mes = monthLong(monthIndex);
  const cuando = fmtMonthLong(s.month);
  const cuandoCap = cuando[0].toUpperCase() + cuando.slice(1);
  const partial = /\(data through ([A-Za-z]{3}) (\d+)\)/.exec(s.message);
  const partialMonth = partial ? MONTHS.findIndex((m) => m === partial[1]) : -1;
  const nota = partial && partialMonth >= 0 ? ` (datos hasta el ${partial[2]} de ${monthLong(partialMonth)})` : "";
  const n = nf0.format(s.value);
  const nivel = s.value === 0 ? "SIN DETECCIONES" : (LEVEL_ES[s.level] ?? s.level.toUpperCase());
  if (s.level === "no_data" || s.median === null) {
    return `${cuandoCap}${nota}: ${n} detecciones de fuego; no hay historial suficiente para comparar — ${nivel}`;
  }
  if (s.median > 0) {
    return `${cuandoCap}${nota}: ${(s.value / s.median).toFixed(1)}× lo habitual para ${mes} (${n} frente a ${nf0.format(s.median)} detecciones típicas) — ${nivel}`;
  }
  return `${cuandoCap}${nota}: ${n} detecciones de fuego; normalmente no hay en ${mes} — ${nivel}`;
}
