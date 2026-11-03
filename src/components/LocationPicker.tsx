"use client";

// Leaflet map for choosing (or showing) a garden's coordinates. Leaflet needs
// `window`, so always load this through next/dynamic with `ssr: false`.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Loader2, LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// Dhaka — a sensible starting view before any point is chosen.
const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];
const DEFAULT_ZOOM = 11;
const PICKED_ZOOM = 15;

const LAYERS = {
  map: {
    label: "Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    className: "map-tiles-street",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    className: "",
  },
} as const;

// An inline SVG pin avoids Leaflet's default marker images, which bundlers
// don't resolve.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">
    <path d="M17 1C8.2 1 1 8.1 1 16.9 1 29 17 43 17 43s16-14 16-26.1C33 8.1 25.8 1 17 1Z" fill="#059669" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="17" r="6" fill="#fff"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
});

export interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  /** Called when the user clicks the map or drags the pin. Omit for read-only. */
  onPick?: (lat: number, lng: number) => void;
  /** Shows a GPS button under the zoom controls that calls this. */
  onLocate?: () => void;
  locating?: boolean;
  className?: string;
}

export default function LocationPicker({
  lat,
  lng,
  onPick,
  onLocate,
  locating = false,
  className = "h-56",
}: LocationPickerProps) {
  const [layer, setLayer] = useState<keyof typeof LAYERS>("map");
  const hasPoint = lat != null && lng != null;
  const position: [number, number] | null = hasPoint ? [lat, lng] : null;
  const tiles = LAYERS[layer];
  const readOnly = !onPick;

  return (
    // `isolate` keeps Leaflet's high z-index panes below sticky headers.
    <div className={`relative isolate overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <MapContainer
        center={position ?? DEFAULT_CENTER}
        zoom={position ? PICKED_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom={!readOnly}
        dragging={true}
        className="h-full w-full"
        attributionControl={true}
      >
        <TileLayer
          key={layer}
          url={tiles.url}
          attribution={tiles.attribution}
          maxZoom={tiles.maxZoom}
          className={tiles.className}
        />
        {position ? (
          <Marker
            position={position}
            icon={pinIcon}
            draggable={!readOnly}
            eventHandlers={
              onPick
                ? {
                    dragend: (event) => {
                      const next = (event.target as L.Marker).getLatLng();
                      onPick(round(next.lat), round(next.lng));
                    },
                  }
                : undefined
            }
          />
        ) : null}
        {onPick ? <ClickToPick onPick={onPick} /> : null}
        <FollowPosition position={position} />
      </MapContainer>

      <div className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-md dark:border-slate-700 dark:bg-slate-900">
        {(Object.keys(LAYERS) as (keyof typeof LAYERS)[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setLayer(key)}
            aria-pressed={layer === key}
            className={`px-2.5 py-1.5 transition ${
              layer === key
                ? "bg-emerald-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {LAYERS[key].label}
          </button>
        ))}
      </div>

      {onLocate ? (
        // Sits directly under Leaflet's zoom control (10px inset, 2 x 30px buttons).
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="Use my current location"
          title="Use my current location"
          className="absolute left-[10px] top-[84px] z-[1000] grid h-[34px] w-[34px] place-items-center rounded border-2 border-black/20 bg-white bg-clip-padding text-slate-700 hover:bg-slate-50 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-wait"
        >
          {locating ? <Loader2 size={17} className="animate-spin" /> : <LocateFixed size={17} />}
        </button>
      ) : null}

      {!readOnly && !hasPoint ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-[1000] mx-auto w-fit rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-white">
          Click the map to drop a pin
        </p>
      ) : null}
    </div>
  );
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => onPick(round(event.latlng.lat), round(event.latlng.lng)),
  });
  return null;
}

/** Keep the pin in view when coordinates change from outside (typed, search, GPS). */
function FollowPosition({ position }: { position: [number, number] | null }) {
  const map = useMap();
  const lat = position?.[0];
  const lng = position?.[1];
  useEffect(() => {
    if (lat == null || lng == null) return;
    const target = L.latLng(lat, lng);
    if (!map.getBounds().pad(-0.2).contains(target)) {
      map.flyTo(target, Math.max(map.getZoom(), PICKED_ZOOM), { duration: 0.6 });
    }
  }, [map, lat, lng]);
  return null;
}

function round(value: number) {
  return Number(value.toFixed(6));
}
