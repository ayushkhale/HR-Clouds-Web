// ─────────────────────────────────────────────────────────────────────────────
// googleMapsLoader — one shared, memoised load of the Google Maps JS SDK.
//
// Shape of the deal: a promise that resolves with `window.google.maps` once
// `Map`, `Marker` and `Circle` are callable, OR rejects. Callers are expected
// to `.catch` into a Leaflet fallback (see GeofenceMapPicker, LocationPinMap,
// AttendanceLocationsPage) — never show a blank div.
//
// WHY THE FAIL-FAST PATHS. With no key, Google returns 200 OK on the script
// but never fires `callback=`, so a naive loader hangs forever and the
// fallback never runs — which is what broke the office-location dialog.
// The three failure modes we guard against:
//   • Empty VITE_GOOGLE_MAPS_API_KEY → reject synchronously.
//   • Script network error → reject on `script.onerror`.
//   • Script loads but callback never fires (bad key, blocked by extension,
//     Google billing refusal) → reject on timeout.
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from "../../config/env";

const CALLBACK_NAME = "__initGoogleMapsSdkCallback";
const SCRIPT_ID = "google-maps-js-sdk";
const LOAD_TIMEOUT_MS = 8000;

/** Dispatched when Google refuses the key (gm_authFailure). Mounted maps
 *  listen for this and swap themselves to Leaflet instead of staring at
 *  Google's grey "This page can't load Google Maps correctly" overlay. */
export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = "hrclouds:gmaps-auth-failure";

let googleMapsPromise = null;
let authFailed = false;

// Install the auth-failure hook once per page. Google calls this global if the
// key is invalid, referer-restricted, Maps JS isn't enabled on the project, or
// billing is refused — the only moment we can hear about any of those.
if (typeof window !== "undefined" && !window.gm_authFailure) {
  window.gm_authFailure = () => {
    authFailed = true;
    googleMapsPromise = null;
    try {
      // Break the "already loaded" fast path so future callers go to the
      // fallback even if Google left the namespace half-populated.
      if (window.google?.maps) delete window.google.maps.Map;
    } catch { /* noop */ }
    try { window.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE_EVENT)); } catch { /* noop */ }
    // One line, not an error — Google already logs its own.
    console.warn("[googleMapsLoader] Google refused the Maps JS key; switching to Leaflet.");
  };
}

export function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is not defined"));
  }

  if (authFailed) {
    return Promise.reject(new Error("Google Maps auth previously failed"));
  }

  // Already loaded and the constructors we actually use are ready.
  if (window.google?.maps?.Map && window.google.maps.Marker && window.google.maps.Circle) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  // No key → don't bother asking Google. The caller's fallback runs instead.
  if (!ENV.GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("Google Maps API key is not configured"));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try { delete window[CALLBACK_NAME]; } catch { /* noop */ }
    };

    const succeed = (maps) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(maps);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      googleMapsPromise = null; // let a later caller retry
      reject(err instanceof Error ? err : new Error(String(err?.message || err || "Google Maps failed to load")));
    };

    window[CALLBACK_NAME] = () => {
      // The classic `callback=` entry preloads Map/Marker/Circle synchronously.
      if (window.google?.maps?.Map && window.google.maps.Marker && window.google.maps.Circle) {
        succeed(window.google.maps);
      } else {
        fail(new Error("Google Maps loaded, but required constructors are missing"));
      }
    };

    timeoutId = setTimeout(() => {
      fail(new Error("Google Maps load timed out"));
    }, LOAD_TIMEOUT_MS);

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // A previous attempt was torn down (promise reset) but the tag is still
      // on the page. If Google is already present we are done; otherwise wait
      // for the existing script's load/error, bounded by our timeout above.
      if (window.google?.maps?.Map) {
        succeed(window.google.maps);
        return;
      }
      existing.addEventListener("load", () => {
        if (window.google?.maps?.Map) succeed(window.google.maps);
      }, { once: true });
      existing.addEventListener("error", (e) => fail(e), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    const keyParam = `&key=${encodeURIComponent(ENV.GOOGLE_MAPS_API_KEY)}`;
    script.src = `https://maps.googleapis.com/maps/api/js?callback=${CALLBACK_NAME}${keyParam}&libraries=geometry`;
    script.onerror = (err) => fail(err);
    document.head.appendChild(script);
  });

  // If this attempt fails, clear the memo so a later open can retry (e.g. the
  // extension that blocked it was disabled). Keep success memoised forever.
  googleMapsPromise.catch(() => {
    googleMapsPromise = null;
  });

  return googleMapsPromise;
}
