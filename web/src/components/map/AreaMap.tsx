import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import L from "./leafletGlobal";
import "@geoman-io/leaflet-geoman-free";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { AreaState, DrawnShape } from "../../api/requests";
import { normalizeBbox } from "../../api/requests";
import type { AreaInfo, PersistentSourcesGeoJSON } from "../../api/types";

interface Props {
  area: AreaState;
  countries: AreaInfo[];
  onDraw: (shape: DrawnShape) => void;
  onPickPoint: (lat: number, lon: number) => void;
  persistent: PersistentSourcesGeoJSON | null;
}

// Contorno del área en Ember (identidad FireCal), relleno suave para no tapar el mapa.
const AREA_STYLE = { color: "#FF6A2B", weight: 3, fillColor: "#FF6A2B", fillOpacity: 0.1 };

function FitTo({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  const key = bounds ? JSON.stringify(bounds) : "";
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 11 });
    // `key` captura el contenido de bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Geoman toolbar (rectangle + polygon) shown only in "draw" mode. */
function DrawControls({ onDraw }: { onDraw: (s: DrawnShape) => void }) {
  const map = useMap();
  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawCircle: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({ pathOptions: AREA_STYLE });
    // Accesibilidad: los botones de geoman son <a> sin nombre accesible.
    map
      .getContainer()
      .querySelectorAll<HTMLAnchorElement>(".leaflet-pm-toolbar a.leaflet-buttons-control-button")
      .forEach((a) => {
        const title = a.getAttribute("title") || a.parentElement?.getAttribute("title") || "Draw";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", title);
        a.setAttribute("tabindex", "0");
      });

    const onCreate = (e: { shape: string; layer: L.Layer }) => {
      const layer = e.layer as L.Polygon;
      if (e.shape === "Rectangle") {
        const b = layer.getBounds();
        const bbox = normalizeBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        if (bbox) onDraw({ kind: "bbox", bbox });
      } else {
        const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
        onDraw({ kind: "polygon", polygon: { type: "Polygon", coordinates: gj.geometry.coordinates } });
      }
      // La forma la dibuja React a partir del estado; quitamos la capa temporal de geoman.
      map.removeLayer(e.layer);
    };
    map.on("pm:create", onCreate as unknown as L.LeafletEventHandlerFn);
    return () => {
      map.off("pm:create", onCreate as unknown as L.LeafletEventHandlerFn);
      map.pm.disableDraw();
      map.pm.removeControls();
    };
  }, [map, onDraw]);
  return null;
}

function PointPicker({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(Math.round(e.latlng.lat * 1e4) / 1e4, Math.round(e.latlng.lng * 1e4) / 1e4);
    },
  });
  return null;
}

function bboxToBounds(b: [number, number, number, number]): L.LatLngBoundsExpression {
  return [
    [b[1], b[0]],
    [b[3], b[2]],
  ];
}

export function AreaMap({ area, countries, onDraw, onPickPoint, persistent }: Props) {
  const country = countries.find((c) => c.id === area.country);
  const lat = Number(area.lat);
  const lon = Number(area.lon);
  const radius = Number(area.radiusKm);
  const pointOk = area.lat.trim() !== "" && area.lon.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  const fit = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (area.mode === "country" && country) return bboxToBounds(country.bbox);
    if (area.mode === "draw" && area.drawn) {
      if (area.drawn.kind === "bbox") return bboxToBounds(area.drawn.bbox);
      return L.geoJSON(area.drawn.polygon as GeoJSON.Geometry).getBounds();
    }
    if (area.mode === "point" && pointOk && radius > 0) return L.latLng(lat, lon).toBounds(radius * 2000 * 1.3);
    return null;
  }, [area.mode, area.drawn, country, pointOk, lat, lon, radius]);

  const hint =
    area.mode === "draw"
      ? "Use the rectangle or polygon tool (top left) to draw your area."
      : area.mode === "point"
        ? "Click the map to set the center point."
        : null;

  return (
    <div className="map-wrap">
      <MapContainer
        center={[13.8, -88.9]}
        zoom={7}
        scrollWheelZoom
        className="map"
        attributionControl
        aria-label="Map of the area of interest"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
        />
        <FitTo bounds={fit} />
        {area.mode === "country" && country && <Rectangle bounds={bboxToBounds(country.bbox)} pathOptions={AREA_STYLE} />}
        {area.mode === "draw" && area.drawn?.kind === "bbox" && <Rectangle bounds={bboxToBounds(area.drawn.bbox)} pathOptions={AREA_STYLE} />}
        {area.mode === "draw" && area.drawn?.kind === "polygon" && (
          <GeoJSON key={JSON.stringify(area.drawn.polygon)} data={area.drawn.polygon as GeoJSON.Geometry} style={AREA_STYLE} />
        )}
        {area.mode === "draw" && <DrawControls onDraw={onDraw} />}
        {area.mode === "point" && <PointPicker onPick={onPickPoint} />}
        {area.mode === "point" && pointOk && radius > 0 && <Circle center={[lat, lon]} radius={radius * 1000} pathOptions={AREA_STYLE} />}
        {persistent?.features.map((f, i) => {
          if (f.geometry.type !== "Point") return null;
          const [x, y] = f.geometry.coordinates as [number, number];
          const p = f.properties ?? {};
          return (
            <CircleMarker
              key={i}
              center={[y, x]}
              radius={7}
              pathOptions={{ color: "#0E1714", weight: 2, fillColor: "#F2D9A6", fillOpacity: 0.95, dashArray: "3 2" }}
            >
              <Tooltip className="map-tooltip">
                <strong>{String(p.name ?? "Persistent heat source")}</strong>
                <br />
                {String(p.kind ?? "static source")} · excluded from counts
                {typeof p.n_detections === "number" ? ` · ${p.n_detections} detections` : ""}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {hint && (
        <p className="map-hint" role="note">
          {hint}
        </p>
      )}
    </div>
  );
}
