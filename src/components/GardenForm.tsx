"use client";

// Garden model, type metadata and the create/edit form fields, shared by the
// Gardens list and the garden details page.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import dynamic from "next/dynamic";
import {
  Droplets,
  House,
  Loader2,
  MapPin,
  Search,
  Trees,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/Input";
import { useDismiss } from "@/components/HeaderMenus";

export interface Garden {
  id: string;
  name: string;
  type: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
  _count: { pots: number; plants: number; devices: number };
}

export interface GardenForm {
  name: string;
  type: string;
  location: string;
  lat: string;
  lng: string;
}

export interface GardenOverview {
  id: string;
  deviceSummary: { online: number; stale?: number; offline: number };
  pumpsOn: number;
}

export const emptyForm: GardenForm = {
  name: "",
  type: "outdoor",
  location: "",
  lat: "",
  lng: "",
};

export const GARDEN_TYPES: Record<string, { label: string; icon: LucideIcon; iconClass: string }> = {
  outdoor: {
    label: "Outdoor",
    icon: Trees,
    iconClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  greenhouse: {
    label: "Greenhouse",
    icon: Warehouse,
    iconClass: "bg-lime-50 text-lime-700 dark:bg-lime-500/10 dark:text-lime-400",
  },
  indoor: {
    label: "Indoor",
    icon: House,
    iconClass: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  hydroponic: {
    label: "Hydroponic",
    icon: Droplets,
    iconClass: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  },
};

export function gardenType(type: string) {
  return GARDEN_TYPES[type] ?? GARDEN_TYPES.outdoor;
}

export function parseGardenForm(form: GardenForm) {
  return {
    name: form.name,
    type: form.type,
    location: form.location || undefined,
    lat: Number(form.lat),
    lng: Number(form.lng),
  };
}

// Map is client-only (Leaflet touches `window`), so load it lazily.
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});

interface PlaceResult {
  label: string;
  detail: string;
  lat: number;
  lng: number;
}

function parseCoordinate(value: string, limit: number) {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function GardenFields({
  value,
  onChange,
  withPlaceholders = false,
}: {
  value: GardenForm;
  onChange: Dispatch<SetStateAction<GardenForm>>;
  withPlaceholders?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: PlaceResult[]; failed?: boolean }>({ q: "", items: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  // The last area name we filled in automatically, so a user-typed name is
  // never overwritten but our own suggestion keeps following the pin.
  const autoLocation = useRef("");
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useDismiss(searchOpen, closeSearch, searchRef, searchInputRef);

  const lat = parseCoordinate(value.lat, 90);
  const lng = parseCoordinate(value.lng, 180);
  const trimmedQuery = query.trim();
  // Bias search towards the current pin, or Dhaka before one is set. Rounded
  // so small pin moves don't re-run the search.
  const near = lat != null && lng != null ? `${lat.toFixed(1)},${lng.toFixed(1)}` : "23.8,90.4";
  const searching = trimmedQuery.length >= 3 && results.q !== trimmedQuery;
  const visibleResults = results.q === trimmedQuery ? results.items : [];

  // Debounced place search.
  useEffect(() => {
    if (trimmedQuery.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}&near=${near}`, {
          signal: controller.signal,
        });
        const items = response.ok ? ((await response.json()) as PlaceResult[]) : [];
        setResults({ q: trimmedQuery, items, failed: !response.ok });
      } catch {
        if (!controller.signal.aborted) setResults({ q: trimmedQuery, items: [], failed: true });
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, near]);

  function applyAreaName(label: string | null) {
    if (!label) return;
    const previousAuto = autoLocation.current;
    autoLocation.current = label;
    onChange((form) =>
      form.location.trim() === "" || form.location === previousAuto ? { ...form, location: label } : form,
    );
  }

  function setPoint(nextLat: number, nextLng: number, areaName?: string) {
    onChange((form) => ({ ...form, lat: String(nextLat), lng: String(nextLng) }));
    if (areaName) {
      applyAreaName(areaName);
      return;
    }
    fetch(`/api/geocode?lat=${nextLat}&lng=${nextLng}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { label: string | null } | null) => applyAreaName(data?.label ?? null))
      .catch(() => undefined);
  }

  function fillMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setPoint(Number(position.coords.latitude.toFixed(6)), Number(position.coords.longitude.toFixed(6)));
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Pick it on the map or enter coordinates.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function choosePlace(place: PlaceResult) {
    setPoint(Number(place.lat.toFixed(6)), Number(place.lng.toFixed(6)), place.label);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <div className="space-y-4">
      <Input
        label="Name"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        placeholder={withPlaceholders ? "North Field" : undefined}
        required
      />
      <SelectField label="Type" value={value.type} onChange={(type) => onChange({ ...value, type })} />

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Garden location</legend>

        {/* Place search */}
        <div ref={searchRef} className="relative">
          <label className="relative block">
            <span className="sr-only">Search for a place</span>
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                // Don't submit the garden form from the search box.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (visibleResults[0]) choosePlace(visibleResults[0]);
                }
              }}
              placeholder="Search a place, e.g. Savar, Dhaka"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 [&::-webkit-search-cancel-button]:hidden"
            />
            {searching ? (
              <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
            ) : null}
          </label>
          {searchOpen && trimmedQuery.length >= 3 && !searching ? (
            <ul
              role="listbox"
              className="animate-fade-in absolute inset-x-0 top-full z-[1100] mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {visibleResults.length ? (
                visibleResults.map((place) => (
                  <li key={`${place.lat},${place.lng}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => choosePlace(place)}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{place.label}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {place.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  {results.failed ? "Search is unavailable right now." : "No places found."}
                </li>
              )}
            </ul>
          ) : null}
        </div>

        <LocationPicker
          lat={lat}
          lng={lng}
          onPick={(nextLat, nextLng) => setPoint(nextLat, nextLng)}
          onLocate={fillMyLocation}
          locating={locating}
        />
        {locateError ? <p className="text-xs font-bold text-amber-600">{locateError}</p> : null}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Latitude"
            value={value.lat}
            onChange={(next) => onChange({ ...value, lat: next })}
            placeholder={withPlaceholders ? "23.81" : undefined}
            type="number"
            step="any"
            required
          />
          <Input
            label="Longitude"
            value={value.lng}
            onChange={(next) => onChange({ ...value, lng: next })}
            placeholder={withPlaceholders ? "90.41" : undefined}
            type="number"
            step="any"
            required
          />
        </div>
        <Input
          label="Area name"
          value={value.location}
          onChange={(location) => onChange({ ...value, location })}
          placeholder={withPlaceholders ? "Filled in from the pin, e.g. Savar, Dhaka" : undefined}
        />
      </fieldset>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
      >
        {Object.entries(GARDEN_TYPES).map(([key, type]) => (
          <option key={key} value={key}>
            {type.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function gardenToForm(garden: Garden): GardenForm {
  return {
    name: garden.name,
    type: garden.type,
    location: garden.location ?? "",
    lat: garden.lat != null ? String(garden.lat) : "",
    lng: garden.lng != null ? String(garden.lng) : "",
  };
}
