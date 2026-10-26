// ─────────────────────────────────────────────────────────────────────────────
// attendance/punchMeta.js — reading the punch coordinates, location and photo
// that every attendance READ now carries (2026-10-22). Pure logic only; the
// components that render it live in PunchDetails.jsx (§8, react-refresh).
//
// WHAT CHANGED. The three daily-log reads always returned `photo_url` and
// `punch_photo` on each `logs[]` entry; now they also carry `location`, and
// every list/day row and the self `/today` card carries a `punches` object
// ({ clock_in, clock_out }) plus a top-level `punches_truncated` flag. Contract:
// md_updates/2026-10-22_attendance-reads-punch-location-photo.md.
//
// THREE TRAPS, ENCODED HERE SO NO SURFACE HAS TO REMEMBER THEM:
//
//  · COORDINATES ARE NUMBERS, AND 0 IS A REAL ONE. `latitude`/`longitude` are
//    `null` — never `0` — when the punch carried no GPS fix. `Number(null)` is
//    0 and `0` is finite, so a naive check prints "0, 0" (a point in the Gulf
//    of Guinea) as if it were a location. `hasCoordinates` tests for a real
//    number, not truthiness.
//
//  · `evaluated:false` IS NOT A PASSED CHECK. A punch can come back
//    `outcome:"in_bounds"` with `evaluated:false` — a remote employee, a
//    declared work-from-home punch, or a biometric terminal that attests its
//    own location. Nothing was measured, so it must read neutral, never as a
//    green tick (§4 of the contract). `punchLocationView` returns `checked`
//    for exactly this reason.
//
//  · `photo_url:null` DOES NOT MEAN "NO PHOTO". It can mean the photo expired
//    (the url is a 5-minute credential), or the response was too large to
//    resolve it (`punches_truncated`). Only `punch_photo === null` means no
//    photo leg at all. `punchPhotoState` tells the four apart so the UI can
//    offer "re-open the day" instead of implying nothing was captured.
//
// `matched_location_id` is POLYMORPHIC and must never be joined on — the server
// already resolved the historically-correct `matched_location_name`, which is
// the value to render (§4, and geofence.js's header).
// ─────────────────────────────────────────────────────────────────────────────

import { formatDistance, geofenceOutcomeKey, wasGeofenceEvaluated } from "./geofence.js";

/** Where a punch came from, said plainly. Falls back to the raw word humanised. */
export const PUNCH_SOURCE_LABELS = {
  web: "Web",
  mobile: "Mobile app",
  biometric: "Biometric device",
  manual: "Added by hand",
};

const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

/** A real GPS fix — both numbers present. `0` counts; `null` does not. */
export const hasCoordinates = (punch) => isFiniteNum(punch?.latitude) && isFiniteNum(punch?.longitude);

/** "18.52043, 73.85674", or "" when there is no fix to show. */
export function coordsLabel(punch) {
  if (!hasCoordinates(punch)) return "";
  return `${punch.latitude.toFixed(5)}, ${punch.longitude.toFixed(5)}`;
}

// Why a geofence check did NOT run. Keyed by the raw `reason` string so a value
// the server adds later simply falls through to the generic "not checked" line
// rather than being mislabelled.
const NOT_CHECKED_REASON = {
  remote_work_mode: "Remote — location not checked",
  declared_remote_punch: "Declared working remotely",
  device_attested: "Verified by the device",
  no_usable_candidates: "No work location set up to check against",
};

/**
 * The `location` object (§4) reduced to what a reader sees. Returns `null` when
 * there is nothing worth showing, otherwise:
 *   { tone: "ok"|"warn"|"neutral", label, detail, address, checked }
 * `checked` is false whenever no distance check actually ran, so a caller never
 * dresses `evaluated:false` up as a passed geofence (the trap in the header).
 * `tone` follows the house palette (§5): ok → violet, warn → fuchsia, neutral →
 * slate. Never rose — an out-of-bounds punch is a flag to review, not an error.
 */
export function punchLocationView(location) {
  if (!location) return null;
  const key = geofenceOutcomeKey(location);
  const evaluated = wasGeofenceEvaluated(location);
  const name = location.matched_location_name || "";
  const away = formatDistance(location.distance_meters);
  const address = location.address || "";

  if (evaluated && key === "in_bounds") {
    return { tone: "ok", label: name ? `At ${name}` : "At the work location", detail: away, address, checked: true };
  }
  if (evaluated && key === "out_of_bounds") {
    return { tone: "warn", label: name ? `Away from ${name}` : "Away from the work location", detail: away ? `${away} away` : "", address, checked: true };
  }
  if (key === "missing_coordinates") {
    return { tone: "warn", label: "Location unavailable", detail: "No GPS fix on this punch", address, checked: false };
  }
  if (key === "unresolved") {
    return { tone: "neutral", label: "Work location not set up", detail: "", address, checked: false };
  }
  // evaluated:false with an in_bounds/other outcome — nothing was measured.
  if (!evaluated) {
    return { tone: "neutral", label: NOT_CHECKED_REASON[location.reason] || "Location not checked", detail: "", address, checked: false };
  }
  // Only an address survived — show it quietly rather than nothing.
  if (address) return { tone: "neutral", label: address, detail: "", address: "", checked: false };
  return null;
}

/**
 * Which of five things a punch's photo is, so the UI never implies "no photo"
 * when one exists but couldn't be delivered, and — just as important for a
 * manager or HR reader — never hides the fact that the employee attached none
 * (§5). `message` is the one-line human caption to show in place of the image:
 *   shown    — a live url to render now                 (no message)
 *   deferred — a photo exists but this response was truncated; re-open the day
 *   expired  — a photo exists but its 5-minute url lapsed; re-open to refresh
 *   rejected — a photo was attached but not stored (`rejected_reason` says why)
 *   none     — no photo leg at all: the employee did not provide one
 * `meta` is the `punch_photo` block (captured_at, address, skew_seconds, …).
 */
const PHOTO_MESSAGE = {
  shown: "",
  deferred: "Photo not loaded here",
  expired: "Photo link expired",
  rejected: "Photo not kept",
  none: "No photo provided",
};

export function punchPhotoState(punch, { truncated = false } = {}) {
  const pp = punch?.punch_photo || null;
  const url = punch?.photo_url || "";
  const withMsg = (kind, extra) => ({ kind, url: extra?.url || "", meta: pp, message: PHOTO_MESSAGE[kind] });
  if (url) return withMsg("shown", { url });
  if (pp?.stored === true) return withMsg(truncated ? "deferred" : "expired");
  if (pp?.attached && pp.rejected_reason) return withMsg("rejected");
  return withMsg("none");
}

/** True when this punch has anything location- or photo-worthy to show. */
export function punchHasExtras(punch, opts) {
  if (!punch) return false;
  return hasCoordinates(punch) || !!punchLocationView(punch.location) || punchPhotoState(punch, opts).kind !== "none";
}

/**
 * The row-level `punches` object in its three documented states (§3):
 *   loaded   — resolved; `in`/`out` are the day's first entry and last exit
 *   deferred — `punches: null`; data exists but this response was truncated
 *   absent   — no `punches` key at all (a server that predates this change)
 * Always safe to call; never throws on a missing key.
 */
export function punchesState(row) {
  if (!row || !("punches" in row)) return { state: "absent", in: null, out: null };
  const p = row.punches;
  if (p === null) return { state: "deferred", in: null, out: null };
  return { state: "loaded", in: p?.clock_in || null, out: p?.clock_out || null };
}

/** The top-level truncation flag — inside `data` for objects, beside it for the
 *  two team endpoints that return a bare array. Checks both places (§6). */
export function punchesTruncated(res) {
  if (!res || typeof res !== "object") return false;
  if (res.punches_truncated === true) return true;
  return res.data?.punches_truncated === true;
}
