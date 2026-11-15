// Isotipo FireCal (versión oscura): dos mitades de llama (MODIS y VIIRS) sobre celdas de calendario.

interface MarkProps {
  size?: number;
  /** Fondo del cuadro; por defecto Forest para que destaque sobre el header Night. */
  background?: string;
  className?: string;
}

/** Solo el isotipo (decorativo: el nombre lo da el wordmark). */
export function LogoMark({ size = 40, background = "#17241F", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <rect width="64" height="64" rx="16" fill={background} />
      <path d="M32 7 C25 16 15 23 17 34 C18.5 41 24.5 45 32 45 Z" fill="#FF6A2B" />
      <path d="M32 7 C35 15 47 22 47 33 C47 40 41 45 32 45 Z" fill="#F2D9A6" />
      <path d="M32 22 C28.5 27.5 26.5 31 27.5 35.5 C28.3 38.8 30 40 32 40 C34.4 40 36.5 38 36.5 34.6 C36.5 30 33.5 27 32 22 Z" fill={background} />
      <rect x="12" y="49" width="11" height="6" rx="2" fill="#F2D9A6" />
      <rect x="26.5" y="49" width="11" height="6" rx="2" fill="#F59E4C" />
      <rect x="41" y="49" width="11" height="6" rx="2" fill="#FF6A2B" />
    </svg>
  );
}

/** Isotipo + wordmark "Fire" + "Cal" (Cal en Ember). */
export function Logo({ size = 40, tagline, asHeading = false }: { size?: number; tagline?: string; asHeading?: boolean }) {
  // En el header el wordmark es el <h1> de la página; el nombre completo queda para lectores de pantalla.
  const Word = asHeading ? "h1" : "span";
  return (
    <div className="logo">
      <LogoMark size={size} className="logo-mark" />
      <div className="logo-text">
        <Word className="logo-word">
          Fire<span className="logo-accent">Cal</span>
          {asHeading && <span className="sr-only"> — Harmonized Burning Activity Calendar</span>}
        </Word>
        {tagline && <span className="logo-tagline">{tagline}</span>}
      </div>
    </div>
  );
}
