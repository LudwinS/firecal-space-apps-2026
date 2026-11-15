import { ICON_DATA, type IconName } from "./iconData";

/** Mismo ícono como cadena SVG, para HTML que no es React (tooltips de ECharts). */
export function iconSvg(name: IconName, size = 14, color = "currentColor"): string {
  const body = ICON_DATA[name]
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px">${body}</svg>`;
}
