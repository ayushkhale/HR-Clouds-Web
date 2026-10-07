// ─────────────────────────────────────────────────────────────────────────────
// geocoding.js — turning what someone types into a pin, and a pin back into an
// address. OpenStreetMap's Nominatim, called straight from the browser.
//
// WHY NOT A KEYED SERVICE: `AttendanceLocationsPage` has used Nominatim this way
// since office locations were built. Keeping the same provider means a site and
// an office resolve the same place to the same coordinates — two providers would
// disagree by tens of metres, which matters when the number is a geofence anchor.
//
// Nominatim asks callers not to hammer it: every search here is debounced by the
// caller, capped at 5 results, and never fired on an empty string. Failures are
// SOFT — geocoding is a convenience on top of the map, so a dead network leaves
// the person dragging the pin themselves rather than facing an error.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://nominatim.openstreetmap.org";

/**
 * One Nominatim hit, flattened to the fields our location forms store.
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
 * @returns {Promise<Array>} raw Nominatim items ([] on any failure)
 */
export async function searchPlaces(query, { signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
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
  try {
    const res = await fetch(`${BASE}/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.address ? normalizePlace(data) : null;
  } catch {
    return null;
  }
}
