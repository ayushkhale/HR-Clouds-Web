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
//
// ── WHY THERE ARE TWO GOOGLE APIS HERE (2026-10-27) ─────────────────────────
//
// `/v4/geocode/address` is a GEOCODER: it resolves one complete address to one
// point. It answers NOTHING for "connaug". Since the search box fires on a
// 600ms debounce while someone types, nearly every request fell through to
// Nominatim and the dropdown people actually used was OpenStreetMap's — with a
// Google key configured and working the whole time. Verified against the live
// API on the demo key: "Connaught Place Delhi" → 1 result; a partial → none.
//
// So partial text now goes to PLACES AUTOCOMPLETE (`places:autocomplete`),
// which is built for it and returns 5 ranked predictions, and the picked
// prediction is resolved to a point by PLACE DETAILS (`places/{id}`). Both are
// confirmed working on the demo key. A prediction has no coordinates, hence
// `resolvePlace()` — see its note.
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
const PLACES = "https://places.googleapis.com/v1/places";

/* ─── Google, and when to stop asking it ─────────────────────────────────── */
//
// Places and Geocoding are separate SKUs on the same key, so they rest
// SEPARATELY: spending the Autocomplete allowance must not also stop the pin
// drag from naming where it landed (that is reverse geocoding), and vice versa.

let geocodeRestingUntil = 0;
let placesRestingUntil = 0;

const keyReady = () => !!ENV.GOOGLE_MAPS_API_KEY;
const geocodeReady = () => keyReady() && Date.now() >= geocodeRestingUntil;
const placesReady = () => keyReady() && Date.now() >= placesRestingUntil;

function restUntilTomorrow(which) {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  if (which === "places") placesRestingUntil = midnight.getTime();
  else geocodeRestingUntil = midnight.getTime();
}

/** A refusal that won't heal today, as opposed to a blip worth retrying. */
function restIfTerminal(which, status, data) {
  const reason = (data?.error?.details || []).find((d) => d?.reason)?.reason;
  if (status === 429 || status === 403 || reason === "API_KEY_INVALID") restUntilTomorrow(which);
}

// Autocomplete + the Details call that follows a pick are ONE billable session
// when they share a token, which on a demo allowance is the difference between
// a day's searching and a dead key by lunchtime. A new token starts after each
// resolved pick, because that is what ends a session.
const newSessionToken = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
let sessionToken = newSessionToken();

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
  if (!geocodeReady()) return null;
  const qs = new URLSearchParams({ ...params, languageCode: "en", key: ENV.GOOGLE_MAPS_API_KEY });
  try {
    const res = await fetch(`${GOOGLE}/${path}?${qs}`, { signal });
    const data = await res.json().catch(() => null);
    if (res.ok) return Array.isArray(data?.results) ? data.results : [];
    restIfTerminal("geocode", res.status, data);
    return null;
  } catch {
    // Includes the AbortError from a superseded keystroke, which is not a fault.
    return null;
  }
}

/* ─── Places: the one that actually answers half-typed text ──────────────── */

/**
 * Autocomplete predictions for a PARTIAL string. This is the piece the
 * geocoder cannot do: `/v4/geocode/address` resolves a complete address to one
 * point and answers nothing at all for "connaug", which is why every search
 * used to fall through to Nominatim while someone was still typing and the
 * dropdown was OpenStreetMap's despite the key being configured.
 *
 * Predictions carry NO coordinates — only a placeId. `resolvePlace()` turns the
 * one the person picks into a point, so a search costs one call, not five.
 *
 * @returns {Promise<Array|null>} suggestions ([] for "no match"), or null when
 *   Places couldn't be asked and the caller should try the next provider.
 */
async function askAutocomplete(q, signal) {
  if (!placesReady()) return null;
  try {
    const res = await fetch(`${PLACES}:autocomplete`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": ENV.GOOGLE_MAPS_API_KEY },
      body: JSON.stringify({ input: q, regionCode: "IN", languageCode: "en", sessionToken }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return Array.isArray(data?.suggestions) ? data.suggestions : [];
    restIfTerminal("places", res.status, data);
    return null;
  } catch {
    return null;
  }
}

/** One place by id, with the fields our location forms store. */
async function askPlaceDetails(placeId, signal) {
  if (!placesReady() || !placeId) return null;
  const url = `${PLACES}/${encodeURIComponent(placeId)}`
    + `?languageCode=en&sessionToken=${encodeURIComponent(sessionToken)}`;
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "X-Goog-Api-Key": ENV.GOOGLE_MAPS_API_KEY,
        // A field mask is REQUIRED on Places v1 — omit it and every call 400s.
        "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents",
      },
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return data || null;
    restIfTerminal("places", res.status, data);
    return null;
  } catch {
    return null;
  }
}

/**
 * A prediction as the Nominatim-shaped item every caller already reads, minus
 * the point. `lat`/`lon` are null on purpose: a caller that forgets to resolve
 * gets a visible "no coordinates" rather than a silent NaN written to a
 * geofence anchor. A `queryPrediction` (a search phrase, not a place) has no
 * placeId and is dropped.
 */
function fromPrediction(s) {
  const p = s?.placePrediction;
  if (!p?.placeId) return null;
  const full = p.text?.text || "";
  return {
    place_id: p.placeId,
    lat: null,
    lon: null,
    display_name: full,
    name: p.structuredFormat?.mainText?.text || full.split(",")[0].trim(),
    secondary: p.structuredFormat?.secondaryText?.text || "",
    address: {},
    provider: "google_places",
  };
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
    // A geocoder result calls it `placeId`; a Place Details result calls the
    // same thing `id`. Both land here, so read either.
    place_id: r?.placeId || r?.id || display,
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
 *
 * Three providers, in the order that answers the most queries:
 *   1. Places Autocomplete — the only one that handles half-typed text.
 *      Returns items with NO point; pass the picked one to `resolvePlace()`.
 *   2. The geocoder — a complete address resolved to a point, usually one hit.
 *   3. Nominatim.
 *
 * An item from (2) or (3) already carries `lat`/`lon`, so `resolvePlace()` is a
 * pass-through for those. Callers should always go through it rather than
 * reading `lat`/`lon` off a suggestion directly.
 *
 * @returns {Promise<Array>} Nominatim-shaped items ([] on any failure)
 */
export async function searchPlaces(query, { signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const key = `s:${q.toLowerCase()}`;
  if (memo.has(key)) return memo.get(key);

  const suggestions = await askAutocomplete(q, signal);
  const predictions = (suggestions || []).map(fromPrediction).filter(Boolean).slice(0, 5);
  if (predictions.length) {
    remember(key, predictions);
    return predictions;
  }

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
 * A picked suggestion as a normalized place, fetching its point if it hasn't
 * got one. THE ONLY correct way to read a suggestion: an Autocomplete
 * prediction has no coordinates, so `parseFloat(item.lat)` on one yields NaN,
 * and a NaN written into a latitude field is a geofence nobody can clock in at.
 *
 * Returns null when the point could not be established — the caller must leave
 * the form as it was rather than half-filling it (§7: "nothing on file" and
 * "couldn't load" are different things).
 *
 * @returns {Promise<{latitude, longitude, address, city, state, country, pincode}|null>}
 */
export async function resolvePlace(item, { signal } = {}) {
  if (!item) return null;

  // Already a point — the geocoder's and Nominatim's items both are.
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return normalizePlace(item);

  if (!item.place_id) return null;
  const key = `d:${item.place_id}`;
  if (memo.has(key)) return memo.get(key);

  const details = await askPlaceDetails(item.place_id, signal);
  if (!details || !hasPoint(details)) return null;

  const place = normalizePlace(fromGoogle(details));
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;
  remember(key, place);
  // The pick closed this session; the next keystroke starts a new one.
  sessionToken = newSessionToken();
  return place;
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
