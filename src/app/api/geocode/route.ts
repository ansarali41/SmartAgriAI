// TASK: Place search + reverse geocoding for the garden location picker.
// Proxies OpenStreetMap Nominatim so the browser never calls it directly; the
// server identifies itself, caches answers and spaces requests >= 1s apart as
// the Nominatim usage policy requires.
//   GET /api/geocode?q=Savar[&near=23.8,90.4] -> [{ label, detail, lat, lng }]
//   GET /api/geocode?lat=23.8&lng=90.4 -> { label }
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

const BASE_URL = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const USER_AGENT = "SmartAgri/0.1 (garden location picker)";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
// Half-width (degrees) of the box around `near` that search results favour.
const NEAR_BIAS_DEGREES = 1.5;

const cache = new Map<string, { at: number; value: unknown }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

/** Run upstream calls one at a time, at most one per MIN_INTERVAL_MS. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await throttled(load);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("format", "jsonv2");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
  return response.json() as Promise<T>;
}

/** Short, human label such as "Savar, Dhaka" from a Nominatim address. */
function shortLabel(place: NominatimPlace) {
  const a = place.address ?? {};
  const clean = (part?: string) => part?.replace(/\s+(Subdistrict|District|Division|Upazila)$/i, "").trim();
  const candidates = [
    a.suburb || a.village || a.town || a.neighbourhood || a.hamlet || a.city_district,
    a.city,
    a.state_district,
    a.county,
    a.state,
  ].map(clean);
  const parts: string[] = [];
  for (const part of candidates) {
    if (!part) continue;
    // Skip names already covered, e.g. "Savar" then "Savar Subdistrict".
    if (parts.some((kept) => kept.includes(part) || part.includes(kept))) continue;
    parts.push(part);
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(", ") : place.display_name.split(",").slice(0, 2).join(",").trim();
}

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  try {
    if (q) {
      if (q.length < 3 || q.length > 120) return NextResponse.json([]);
      const search: Record<string, string> = { q, limit: "5", addressdetails: "1" };
      // Prefer (not restrict to) places near the map's current point.
      const [nearLat, nearLng] = (params.get("near") ?? "").split(",").map(Number);
      const hasNear = Number.isFinite(nearLat) && Number.isFinite(nearLng) && Math.abs(nearLat) <= 90 && Math.abs(nearLng) <= 180;
      if (hasNear) {
        const d = NEAR_BIAS_DEGREES;
        search.viewbox = [nearLng - d, nearLat + d, nearLng + d, nearLat - d].map((n) => n.toFixed(2)).join(",");
        search.bounded = "0";
      }
      const places = await cached(`q:${q.toLowerCase()}:${search.viewbox ?? ""}`, () =>
        nominatim<NominatimPlace[]>("/search", search),
      );
      return NextResponse.json(
        places.map((place) => ({
          label: shortLabel(place),
          detail: place.display_name,
          lat: Number(place.lat),
          lng: Number(place.lon),
        })),
      );
    }

    if (params.has("lat") && params.has("lng")) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
      }
      // ~100 m precision is plenty for an area name and improves cache hits.
      const key = `r:${lat.toFixed(3)},${lng.toFixed(3)}`;
      const place = await cached(key, () =>
        nominatim<NominatimPlace & { error?: string }>("/reverse", {
          lat: String(lat),
          lon: String(lng),
          zoom: "14",
          addressdetails: "1",
        }),
      );
      return NextResponse.json({ label: place.error ? null : shortLabel(place) });
    }

    return NextResponse.json({ error: "Provide q, or lat and lng" }, { status: 400 });
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json({ error: "Place lookup is unavailable right now" }, { status: 503 });
  }
}
