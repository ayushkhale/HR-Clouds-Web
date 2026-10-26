// ─────────────────────────────────────────────────────────────────────────────
// lib/location.js — where the punch's coordinates come from.
//
// Ported from shared/attendance/geolocation.js, which wraps
// navigator.geolocation. Same contract, native plumbing:
//
//   IT NEVER REJECTS, AND IT NEVER BLOCKS A PUNCH.
//
// The backend accepts a punch with no coordinates and flags the anomaly itself
// (geofence outcome `missing_coordinates`, which is tone amber and NOT an
// error — see lib/geofence.js). So every failure here resolves to a status the
// punch screen states plainly, and the Clock in button stays live. A location
// failure that disables the punch button is the single worst bug this screen
// can have: somebody is standing at the gate unable to start their day.
//
// WHAT'S NATIVE-ONLY HERE, and why each one matters:
//
//   • PERMISSIONS ARE A FLOW, not a prompt. iOS asks once, ever; a second
//     request after a denial resolves instantly as denied, so the only way
//     back is Settings. Android 11+ can "Deny and don't ask again" the same
//     way, and Android 12+ can grant COARSE only — a 2km-accurate fix that
//     will fail a 200m geofence. Each of those is a different sentence.
//
//   • GPS CAN BE OFF while permission is granted (Location Services / the
//     Android location toggle). That is a device setting, not a permission,
//     and it needs its own message — "allow location" is useless advice to
//     someone who already allowed it.
//
//   • MOCK LOCATIONS EXIST. `position.mocked` (Android) / a developer-set
//     location is how an attendance app gets gamed from a sofa. We do NOT
//     block the punch for it — we send the coordinates and let the server
//     decide, and we record the flag so the payload tells the truth.
//
//   • THE FIRST FIX IS SLOW. A cold GPS start indoors can take 20s+. We ask
//     for a cached fix first (instant, good enough to confirm the office) and
//     only then a high-accuracy one.
//
// Native setup — Info.plist keys, AndroidManifest permissions and the
// play-services dependency — is in 60-ops/02-permissions-and-native.md. The
// strings there are user-visible; they are not boilerplate.
// ─────────────────────────────────────────────────────────────────────────────

import { Linking, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {
  PERMISSIONS, RESULTS, check, openSettings, request,
} from 'react-native-permissions';

export const GEO_STATUS = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',          // refused, but can still be asked again
  BLOCKED: 'blocked',        // refused permanently — only Settings can fix it
  COARSE_ONLY: 'coarse_only', // Android 12+ "approximate" — too vague for a geofence
  SERVICES_OFF: 'services_off', // permission fine, device location switched off
  UNSUPPORTED: 'unsupported',
  TIMEOUT: 'timeout',
  UNAVAILABLE: 'unavailable',
});

/**
 * The sentence the punch screen shows. Each one says what is wrong, who can
 * fix it, and what happens anyway — because the punch still goes through
 * (CLAUDE.md §6: say the consequence).
 */
const MESSAGES = {
  [GEO_STATUS.DENIED]:
    'Location access is off, so this punch won’t be matched to your work location. Allow it to have your attendance verified automatically.',
  [GEO_STATUS.BLOCKED]:
    'Location access is blocked. Turn it on for HR Clouds in your phone’s settings so your punch can be matched to your work location.',
  [GEO_STATUS.COARSE_ONLY]:
    'Only approximate location is allowed, which isn’t precise enough to confirm you’re at your work location. Switch it to Precise in settings.',
  [GEO_STATUS.SERVICES_OFF]:
    'Location is switched off on this phone. Turn it on so your punch can be matched to your work location.',
  [GEO_STATUS.UNSUPPORTED]: 'This phone can’t share its location.',
  [GEO_STATUS.TIMEOUT]:
    'Finding your location took too long. You can still punch — it just won’t be matched to a work location.',
  [GEO_STATUS.UNAVAILABLE]:
    'Your phone couldn’t work out where it is. You can still punch — it just won’t be matched to a work location.',
};

export const locationMessage = (status) => MESSAGES[status] || null;

/** Does this status still allow an automatic geofence match? Only GRANTED does. */
export const hasUsableLocation = (status) => status === GEO_STATUS.GRANTED;

/* ─── Permission ──────────────────────────────────────────────────────────── */

const FINE = Platform.select({
  ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
});
const COARSE = Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION : null;

function mapResult(result) {
  if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) return GEO_STATUS.GRANTED;
  if (result === RESULTS.BLOCKED) return GEO_STATUS.BLOCKED;
  if (result === RESULTS.UNAVAILABLE) return GEO_STATUS.UNSUPPORTED;
  return GEO_STATUS.DENIED; // RESULTS.DENIED — askable
}

/**
 * What we have RIGHT NOW, without prompting. Use this to decide whether the
 * punch screen shows the "allow location" nudge before anyone presses anything.
 */
export async function checkLocationPermission() {
  if (!FINE) return GEO_STATUS.UNSUPPORTED;
  const fine = mapResult(await check(FINE));
  if (fine === GEO_STATUS.GRANTED) return GEO_STATUS.GRANTED;
  // Android 12+ can hold COARSE while FINE is denied. That is granted-but-vague,
  // which is a different problem from denied and gets its own message.
  if (COARSE && (await check(COARSE)) === RESULTS.GRANTED) return GEO_STATUS.COARSE_ONLY;
  return fine;
}

/**
 * Ask, once. Prompting again after a denial does nothing on either platform
 * (iOS never re-asks; Android's "don't ask again" is permanent), so a BLOCKED
 * result must send the person to Settings instead of showing the same dialog.
 *
 * Call it from a BUTTON PRESS, never on mount: a permission sheet thrown at
 * somebody the instant the app opens is the most-denied prompt there is, and a
 * denial is close to irreversible.
 */
export async function requestLocationPermission() {
  if (!FINE) return GEO_STATUS.UNSUPPORTED;
  const current = await checkLocationPermission();
  if (current === GEO_STATUS.GRANTED) return GEO_STATUS.GRANTED;
  if (current === GEO_STATUS.BLOCKED) return GEO_STATUS.BLOCKED;

  const result = mapResult(await request(FINE));
  if (result !== GEO_STATUS.GRANTED && COARSE && (await check(COARSE)) === RESULTS.GRANTED) {
    return GEO_STATUS.COARSE_ONLY;
  }
  return result;
}

/** Open the OS settings page for this app — the only exit from BLOCKED. */
export async function openLocationSettings() {
  try {
    await openSettings();
    return true;
  } catch {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
}

/* ─── A fix ───────────────────────────────────────────────────────────────── */

const validCoords = (c) =>
  Number.isFinite(c?.latitude)
  && Number.isFinite(c?.longitude)
  && Math.abs(c.latitude) <= 90
  && Math.abs(c.longitude) <= 180
  // 0,0 is in the Atlantic. Every platform emits it at some point as a
  // "no fix yet" placeholder, and it would land as a real punch location.
  && !(c.latitude === 0 && c.longitude === 0);

function getPosition(options) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // The platform callback is not guaranteed to fire — a dismissed sheet or a
    // sleeping GPS can leave it hanging. Always carry our own ceiling.
    const guard = setTimeout(() => done({ status: GEO_STATUS.TIMEOUT }), (options.timeout || 10000) + 2000);

    Geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(guard);
        const { latitude, longitude, accuracy } = pos?.coords || {};
        if (!validCoords(pos?.coords)) {
          done({ status: GEO_STATUS.UNAVAILABLE });
          return;
        }
        done({
          status: GEO_STATUS.GRANTED,
          coords: {
            latitude,
            longitude,
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            // Android only; undefined on iOS. Sent as-is so the record is honest.
            mocked: pos.mocked === true,
            at: pos.timestamp || Date.now(),
          },
        });
      },
      (err) => {
        clearTimeout(guard);
        // react-native-geolocation-service codes: 1 denied, 2 position
        // unavailable (this is the "location services are off" case),
        // 3 timeout, 4 play-services missing, 5 settings dialog refused.
        const code = err?.code;
        if (code === 1) done({ status: GEO_STATUS.DENIED });
        else if (code === 2 || code === 5) done({ status: GEO_STATUS.SERVICES_OFF });
        else if (code === 3) done({ status: GEO_STATUS.TIMEOUT });
        else if (code === 4) done({ status: GEO_STATUS.UNSUPPORTED });
        else done({ status: GEO_STATUS.UNAVAILABLE });
      },
      options,
    );
  });
}

/**
 * The coordinates for a punch. NEVER rejects.
 *
 * TWO ATTEMPTS, on purpose:
 *   1. a cached fix up to 60s old, returned in milliseconds — plenty to confirm
 *      a 200m office radius, and it means the Clock in button doesn't sit
 *      spinning for twenty seconds in a lobby
 *   2. only if that produced nothing, a real high-accuracy fix
 *
 * @param {{ prompt?: boolean, timeout?: number }} [opts]
 *   `prompt: true` asks for permission if we don't have it — pass it only from
 *   a press, never on mount.
 * @returns {Promise<{status: string, coords?: object, message?: string|null}>}
 */
export async function getPunchLocation({ prompt = false, timeout = 12000 } = {}) {
  const permission = prompt ? await requestLocationPermission() : await checkLocationPermission();

  // COARSE_ONLY still yields a usable-ish fix; we take it and let the server's
  // geofence decide, because refusing to send anything would turn an
  // approximate match into no match at all.
  if (permission !== GEO_STATUS.GRANTED && permission !== GEO_STATUS.COARSE_ONLY) {
    return { status: permission, message: locationMessage(permission) };
  }

  const cached = await getPosition({ timeout: 4000, maximumAge: 60000, enableHighAccuracy: false });
  if (cached.status === GEO_STATUS.GRANTED) {
    return permission === GEO_STATUS.COARSE_ONLY
      ? { ...cached, status: GEO_STATUS.COARSE_ONLY, coords: cached.coords, message: locationMessage(GEO_STATUS.COARSE_ONLY) }
      : cached;
  }

  const fresh = await getPosition({ timeout, maximumAge: 0, enableHighAccuracy: true });
  if (fresh.status === GEO_STATUS.GRANTED) return fresh;
  return { ...fresh, message: locationMessage(fresh.status) };
}

/**
 * The punch payload's location fields, or `{}` when there is nothing to send.
 *
 * THE PUNCH SCHEMA HAS EXACTLY TWO COORDINATE FIELDS — `latitude` and
 * `longitude` (ATTENDANCE_API_CONTRACT C18/C19). There is no
 * `location_accuracy` and no `is_mock_location`; inventing either would mean
 * the gateway's `stripUnknown` drops it silently and we'd believe we were
 * sending something we weren't (10-api/05-contract-traps.md T9 — the whole
 * reason unknown keys are the worst class of bug on this API).
 *
 * Accuracy and the mock-location flag therefore go in `metadata`, the one
 * free-form object the schema accepts. They are worth sending: a 2km-accurate
 * fix that happens to land inside the office radius is not evidence of
 * anything, and a mocked coordinate is the thing an attendance app most needs
 * a record of.
 *
 * Returning `{}` rather than nulls is deliberate too — absence and an explicit
 * null are not the same thing to the geofence evaluator.
 */
export function locationPayload(fix) {
  const c = fix?.coords;
  if (!c) return {};
  const metadata = {};
  if (Number.isFinite(c.accuracy)) metadata.geo_accuracy = c.accuracy;
  if (c.mocked === true) metadata.mock_location = true;
  const out = { latitude: c.latitude, longitude: c.longitude };
  if (Object.keys(metadata).length) out.metadata = metadata;
  return out;
}
