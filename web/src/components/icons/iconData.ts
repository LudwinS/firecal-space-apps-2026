// Íconos propios de FireCal (24×24, trazo currentColor 1.75), copiados de marca/iconos/*.svg.
// Cada ícono es una lista de elementos SVG [etiqueta, atributos].

export type IconElement = readonly ["path" | "circle" | "rect", Readonly<Record<string, string>>];

export const ICON_DATA = {
  "hotspot": [["path", {"d": "M12 3c-1.8 2.6-5 5-5 9a5 5 0 0 0 10 0c0-4-3.2-6.4-5-9z"}], ["path", {"d": "M12 12c-.9 1.2-2 2.2-2 3.5a2 2 0 0 0 4 0c0-1.3-1.1-2.3-2-3.5z"}]],
  "satellite": [["rect", {"x": "9", "y": "9", "width": "6", "height": "6", "rx": "1"}], ["path", {"d": "M9 12H3l1.5-3H9"}], ["path", {"d": "M15 12h6l-1.5 3H15"}], ["path", {"d": "M12 15v3"}], ["path", {"d": "M9.5 20.5a3.5 3.5 0 0 1 5 0"}], ["path", {"d": "M12 9V6"}]],
  "calendar": [["rect", {"x": "3.5", "y": "5", "width": "17", "height": "15", "rx": "2.5"}], ["path", {"d": "M3.5 10h17"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M16 3v4"}], ["rect", {"x": "7", "y": "13", "width": "3", "height": "3", "rx": ".6", "fill": "currentColor", "stroke": "none"}], ["path", {"d": "M14 14.5h3"}]],
  "draw-area": [["path", {"d": "M5 7l9-3 6 7-4 9-11-3z"}], ["circle", {"cx": "5", "cy": "7", "r": "1.6", "fill": "currentColor"}], ["circle", {"cx": "14", "cy": "4", "r": "1.6", "fill": "currentColor"}], ["circle", {"cx": "20", "cy": "11", "r": "1.6", "fill": "currentColor"}], ["circle", {"cx": "16", "cy": "20", "r": "1.6", "fill": "currentColor"}], ["circle", {"cx": "5", "cy": "17", "r": "1.6", "fill": "currentColor"}]],
  "coordinates": [["circle", {"cx": "12", "cy": "12", "r": "7"}], ["path", {"d": "M12 2v4"}], ["path", {"d": "M12 18v4"}], ["path", {"d": "M2 12h4"}], ["path", {"d": "M18 12h4"}], ["circle", {"cx": "12", "cy": "12", "r": "2"}]],
  "harmonize": [["path", {"d": "M3 9c3-3 6 3 9 0s6-3 9 0"}], ["path", {"d": "M3 15c3-3 6 3 9 0s6-3 9 0"}], ["path", {"d": "M12 5v14"}]],
  "anomaly": [["path", {"d": "M4 12h16"}], ["path", {"d": "M6 12V6"}], ["path", {"d": "M10 12V9"}], ["path", {"d": "M14 12v5"}], ["path", {"d": "M18 12v3"}]],
  "compare": [["rect", {"x": "3", "y": "4", "width": "7.5", "height": "16", "rx": "2"}], ["rect", {"x": "13.5", "y": "4", "width": "7.5", "height": "16", "rx": "2"}], ["path", {"d": "M6 9h1.5"}], ["path", {"d": "M6 13h1.5"}], ["path", {"d": "M16.5 11h1.5"}], ["path", {"d": "M16.5 15h1.5"}]],
  "history": [["path", {"d": "M3.5 12a8.5 8.5 0 1 0 2.5-6"}], ["path", {"d": "M3 3.5V8h4.5"}], ["path", {"d": "M12 8v4l2.5 2.5"}]],
  "volcano": [["path", {"d": "M3 20h18"}], ["path", {"d": "M5 20l5.5-10 2 2.5L15 9l4 11"}], ["path", {"d": "M10 5.5c.5-1 1.5-1.5 2.5-1"}], ["path", {"d": "M14 4.5c1 0 1.8.6 2 1.5"}]],
  "level-normal": [["circle", {"cx": "12", "cy": "12", "r": "9"}], ["path", {"d": "M8 12.5l2.5 2.5L16 9.5"}]],
  "level-elevated": [["path", {"d": "M12 3.5l9 16H3z"}], ["path", {"d": "M12 10v4"}], ["path", {"d": "M12 17h.01"}]],
  "level-high": [["path", {"d": "M12 3.5l9 16H3z"}], ["path", {"d": "M12 9c-1 1.4-2.4 2.6-2.4 4.4a2.4 2.4 0 0 0 4.8 0c0-1.8-1.4-3-2.4-4.4z"}]],
  "level-extreme": [["path", {"d": "M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"}], ["path", {"d": "M12 7.5v6"}], ["path", {"d": "M12 16.5h.01"}]],
  "validation": [["circle", {"cx": "12", "cy": "12", "r": "8.5"}], ["circle", {"cx": "12", "cy": "12", "r": "4.5"}], ["path", {"d": "M12 12l6-6"}], ["path", {"d": "M16 6h2v2"}]],
  "csv": [["path", {"d": "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"}], ["path", {"d": "M14 3v5h5"}], ["path", {"d": "M8.5 13h7"}], ["path", {"d": "M8.5 16.5h7"}], ["path", {"d": "M12 10.5v9"}]],
  "report": [["path", {"d": "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"}], ["path", {"d": "M14 3v5h5"}], ["path", {"d": "M9 12h6"}], ["path", {"d": "M9 15.5h4"}], ["path", {"d": "M9 19h2"}]],
  "download": [["path", {"d": "M12 4v11"}], ["path", {"d": "M7.5 10.5L12 15l4.5-4.5"}], ["path", {"d": "M5 19.5h14"}]],
  "waking": [["path", {"d": "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"}], ["path", {"d": "M16 3.5h3l-3 3.5h3"}]],
  "layers": [["path", {"d": "M12 3l9 4.5-9 4.5-9-4.5z"}], ["path", {"d": "M3 12l9 4.5 9-4.5"}], ["path", {"d": "M3 16.5l9 4.5 9-4.5"}]],
} as const satisfies Record<string, readonly IconElement[]>;

export type IconName = keyof typeof ICON_DATA;
