// ─────────────────────────────────────────────────────────────────────────────
// attendance/geolocation.js — Promise wrapper around navigator.geolocation that
// never rejects. Punches must not be hard-blocked on location (the backend
// accepts punches without coordinates and flags anomalies itself), but the
// user must be told explicitly when location could not be captured.
// ─────────────────────────────────────────────────────────────────────────────

export const GEO_STATUS = Object.freeze({
  GRANTED: "granted",
  DENIED: "denied",
  UNSUPPORTED: "unsupported",
  TIMEOUT: "timeout",
  UNAVAILABLE: "unavailable",
  INSECURE: "insecure",
});

const MESSAGES = {
  denied: "Location permission is blocked for this site. Allow location in your browser settings so your punch can be verified against your office location.",
  unsupported: "This browser can't share your location.",
  timeout: "Getting your location took too long.",
  unavailable: "Your device couldn't determine its location.",
  insecure: "Location is only available on a secure (https) connection.",
};

/**
 * @returns {Promise<{status: string, coords?: {latitude: number, longitude: number, accuracy: number}, message?: string}>}
 */
export function getBrowserLocation({ timeout = 10000, maximumAge = 30000, enableHighAccuracy = true } = {}) {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return Promise.resolve({ status: GEO_STATUS.INSECURE, message: MESSAGES.insecure });
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: GEO_STATUS.UNSUPPORTED, message: MESSAGES.unsupported });
  }
  return new Promise((resolve) => {
    let settled = false;
    // Some browsers never call back when the permission prompt is dismissed.
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: GEO_STATUS.TIMEOUT, message: MESSAGES.timeout });
    }, timeout + 2000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        const { latitude, longitude, accuracy } = pos.coords;
        const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
        resolve(valid
          ? { status: GEO_STATUS.GRANTED, coords: { latitude, longitude, accuracy } }
          : { status: GEO_STATUS.UNAVAILABLE, message: MESSAGES.unavailable });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        const status = err?.code === 1 ? GEO_STATUS.DENIED : err?.code === 3 ? GEO_STATUS.TIMEOUT : GEO_STATUS.UNAVAILABLE;
        resolve({ status, message: MESSAGES[status] });
      },
      { timeout, maximumAge, enableHighAccuracy }
    );
  });
}
