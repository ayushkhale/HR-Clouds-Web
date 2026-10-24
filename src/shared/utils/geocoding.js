// ─────────────────────────────────────────────────────────────────────────────
// geocoding.js — turning what someone types into a pin, and a pin back into an
// address. Google Geocoding v4 first, OpenStreetMap's Nominatim behind it.
//
// ONE PROVIDER CHAIN FOR EVERY MAP: `AttendanceLocationsPage` (offices),
// `AddressSearchField` and `FieldLocationsView` (sites) all come through here,
// so a site and an office resolve the same place to the same coordinates — two
// providers would disagree by tens of metres, which matters when the number is
// a geofence anchor. The employee app's `lib/geocoding.js` is a port of this
// file and was switched in the same sitting (2026-10-24), so the address on a
// clock-in photo comes from the provider HR used to place the office.
//
// ── GOOGLE IS A DEMO KEY, SO IT IS ALLOWED TO RUN OUT (user, 2026-10-24) ────
//
// "for now use it on app and on frontend only, we'll upgrade later, it's a demo
// key so kindly manage." A Maps Demo Key needs no billing but has a small daily
// allowance per API, and it only works with the NEW Geocoding API v4
// (geocode.googleapis.com/v4) — the classic maps/api/geocode/json endpoint
// answers REQUEST_DENIED "enable billing" for the same key. So:
//
//   • Google first. Nominatim when Google has no answer, fails, or is resting.
//   • A refusal that won't heal today (429 — the day's allowance is spent; 403;
//     an invalid key) RESTS Google until local midnight, so the rest of the day
//     goes straight to Nominatim instead of paying a dead round trip each time.
//   • Every answer is kept in memory for the page's life, so searching the same
//     text twice or nudging a pin back costs nothing.
//
// Google results are reshaped into a NOMINATIM-SHAPED item (`fromGoogle`), so
// every caller still reads `lat`/`lon`/`display_name`/`address.*` and none of
// them changed. On the upgrade to a billed key: point VITE_GOOGLE_MAPS_API_KEY at
// it (or move the call behind the backend) and nothing else here moves.
//
// GOOGLE'S TERMS: its results may not be drawn on a non-Google map. The Leaflet
// maps are still OpenStreetMap tiles. Fine for a demo; the billed upgrade should
// move those maps to Google's.
//
// Nominatim asks callers not to hammer it: every search here is debounced by the
// caller, capped at 5 results, and never fired on an empty string. Failures are
// SOFT — geocoding is a convenience on top of the map, so a dead network leaves
// the person dragging the pin themselves rather than facing an error.
// ─────────────────────────────────────────────────────────────────────────────

import ENV from "../../config/env";

const BASE = "https://nominatim.openstreetmap.org";
const GOOGLE = "https://geocode.googleapis.com/v4/geocode";

/* ─── Google, and when to stop asking it ─────────────────────────────────── */

let googleRestingUntil = 0;

const googleReady = () => !!ENV.GOOGLE_MAPS_API_KEY && Date.now() >= googleRestingUntil;

function restGoogleUntilTomorrow() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  googleRestingUntil = midnight.getTime();
}

const memo = new Map();
const MEMO_MAX = 100;
function remember(key, value) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, value);
}

/**
 * One Google call. The results array ([] for "no match"), or null when Google
 * couldn't be asked — the caller then tries Nominatim.
 */
async function askGoogle(path, params, signal) {
  if (!googleReady()) return null;
  const qs = new URLSearchParams({ ...params, languageCode: "en", key: ENV.GOOGLE_MAPS_API_KEY });
  try {
    const res = await fetch(`${GOOGLE}/${path}?${qs}`, { signal });
    const data = await res.json().catch(() => null);
    if (res.ok) return Array.isArray(data?.results) ? data.results : [];
    const reason = (data?.error?.details || []).find((d) => d?.reason)?.reason;
    if (res.status === 429 || res.status === 403 || reason === "API_KEY_INVALID") restGoogleUntilTomorrow();
    return null;
  } catch {
    // Includes the AbortError from a superseded keystroke, which is not a fault.
    return null;
  }
}

/**
 * A Google v4 result as the Nominatim item every caller already reads —
 * `lat`/`lon` strings, `display_name`, `name`, and an `address` object with
 * Nominatim's key names. In India Google files the sector under
 * sublocality_level_1 and the block or industrial area under level 2/3.
 */
function fromGoogle(r) {
  const comps = r?.addressComponents || [];
  const pick = (...types) => {
    for (const t of types) {
      const c = comps.find((x) => x.types?.includes(t));
      if (c?.longText) return c.longText;
    }
    return "";
  };
  const pa = r?.postalAddress || {};
  const display = r?.formattedAddress || "";
  return {
    place_id: r?.placeId || display,
    lat: String(r?.location?.latitude),
    lon: String(r?.location?.longitude),
    display_name: display,
    name: display.split(",")[0].trim(),
    address: {
      building: pick("premise"),
      amenity: pick("establishment", "point_of_interest"),
      house_number: pick("street_number"),
      road: pick("route"),
      neighbourhood: pick("sublocality_level_2", "neighborhood"),
      suburb: pick("sublocality_level_1", "sublocality"),
      city: pick("locality", "postal_town") || pa.locality || "",
      county: pick("administrative_area_level_2"),
      state: pick("administrative_area_level_1") || pa.administrativeArea || "",
      country: pick("country"),
      postcode: pick("postal_code") || pa.postalCode || "",
    },
    provider: "google",
  };
}

const hasPoint = (r) => Number.isFinite(r?.location?.latitude) && Number.isFinite(r?.location?.longitude);

/* ─── The shared surface ─────────────────────────────────────────────────── */

/**
 * One search hit (either provider), flattened to the fields our location forms store.
 * `city` falls through town/village/suburb because Nominatim names the same
 * administrative level differently depending on how rural the place is — a
 * plant on a village edge has no `city` key at all.
 */
export function normalizePlace(item) {
  const a = item?.address || {};
  return {
    latitude: Number(parseFloat(item.lat).toFixed(6)),
    longitude: Number(parseFloat(item.lon).toFixed(6)),
    address: item.display_name || "",
    city: a.city || a.town || a.village || a.suburb || a.county || "",
    state: a.state || "",
    country: a.country || "",
    pincode: a.postcode || "",
  };
}

/**
 * Places matching free text, best first, at most 5.
 * @returns {Promise<Array>} Nominatim-shaped items ([] on any failure)
 */
export async function searchPlaces(query, { signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const key = `s:${q.toLowerCase()}`;
  if (memo.has(key)) return memo.get(key);

  const google = await askGoogle("address", { addressQuery: q, regionCode: "IN" }, signal);
  const hits = (google || []).filter(hasPoint).slice(0, 5).map(fromGoogle);
  if (hits.length) {
    remember(key, hits);
    return hits;
  }
  try {
    const res = await fetch(`${BASE}/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    // Includes the AbortError from a superseded keystroke, which is not a fault.
    return [];
  }
}

/**
 * The address at a coordinate, for when someone drops the pin first.
 * @returns {Promise<object|null>} a normalized place, or null
 */
export async function reverseGeocode(latitude, longitude, { signal } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const key = `r:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (memo.has(key)) return memo.get(key);

  // Google lists the most specific match first; a bare plus code ("J9GF+R3")
  // is not an address anyone recognises, so it never wins.
  const results = await askGoogle(`location/${latitude},${longitude}`, {}, signal);
  const best = (results || []).find((r) => hasPoint(r) && !r.types?.includes("plus_code"));
  if (best) {
    const place = normalizePlace(fromGoogle(best));
    remember(key, place);
    return place;
  }
  try {
    const res = await fetch(`${BASE}/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data && data.address ? normalizePlace(data) : null;
    if (place) remember(key, place);
    return place;
  } catch {
    return null;
  }
}
