// ─────────────────────────────────────────────────────────────────────────────
// pincode.api.js — Indian PIN code → city and state, for address forms.
//
// The one call in shared/api that isn't our backend: India Post's public lookup
// (api.postalpincode.in). It needs no key, answers CORS with `*`, and returns
// every post office under a PIN — we take the first one's District as the city
// and its State. That is why it doesn't go through client.js's request(): no
// token must ever be sent to a third party.
//
// It is a convenience, never a gate: a failed or empty lookup leaves the form
// exactly as the person typed it. The only thing sent is the six digits.
// ─────────────────────────────────────────────────────────────────────────────

const PINCODE_URL = "https://api.postalpincode.in/pincode/";

/** A six-digit Indian PIN code (the first digit is never 0). */
export const isIndianPincode = (value) => /^[1-9]\d{5}$/.test(String(value || "").trim());

/**
 * @returns {Promise<{ city: string, state: string, country: string } | null>}
 *   null when India Post has no office for that PIN. Network errors throw.
 */
export async function lookupIndianPincode(pin, { signal } = {}) {
  const code = String(pin || "").trim();
  if (!isIndianPincode(code)) return null;
  const res = await fetch(PINCODE_URL + code, { signal });
  if (!res.ok) throw new Error(`PIN lookup failed (${res.status})`);
  const body = await res.json();
  const office = Array.isArray(body) && body[0]?.Status === "Success" ? body[0].PostOffice?.[0] : null;
  if (!office) return null;
  const state = String(office.State || "").trim();
  // Delhi's districts ("Central Delhi", "South West Delhi") aren't what anyone
  // writes as a city on an address.
  const city = /^delhi$/i.test(state)
    ? (/new delhi/i.test(office.Block || "") ? "New Delhi" : "Delhi")
    : String(office.District || office.Block || "").trim();
  return {
    city,
    state,
    country: String(office.Country || "India").trim(),
  };
}
