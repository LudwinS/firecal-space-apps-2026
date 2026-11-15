// Idiomas de la interfaz (inglés / español) sin dependencias.
// La llave de cada texto es el propio texto en inglés: `t("Download PDF report")`.
// En español se busca en `es.ts`; si falta, se muestra el inglés.
import { useSyncExternalStore } from "react";
import { ES } from "./es";

export type Lang = "en" | "es";
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "es", label: "ES", name: "Español" },
];

const STORAGE_KEY = "firecal:lang";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "es";
}

/** `?lang=es` gana; luego la última elección guardada; por defecto inglés. */
function initialLang(): Lang {
  try {
    const p = new URLSearchParams(window.location.search).get("lang");
    if (isLang(p)) return p;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* sin ventana (tests) o sin almacenamiento */
  }
  return "en";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

function syncDocument(): void {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}
syncDocument();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignorar */
  }
  syncDocument();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the component when the language changes and returns it. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "en" as Lang);
}

/** Translates `text` (English) to the current language and fills `{name}` placeholders. */
export function t(text: string, params?: Record<string, string | number>): string {
  let out = current === "es" ? (ES[text] ?? text) : text;
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
