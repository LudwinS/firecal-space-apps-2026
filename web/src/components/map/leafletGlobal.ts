// Geoman busca Leaflet en la variable global `L`; debe importarse antes que geoman.
import L from "leaflet";

declare global {
  interface Window {
    L: typeof L;
  }
}

window.L = L;

export default L;
