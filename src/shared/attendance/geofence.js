// ─────────────────────────────────────────────────────────────────────────────
// attendance/geofence.js — reading the `geofence` object a punch comes back with,
// and the two work-mode vocabularies it sits between.
//
// THE PUNCH ALWAYS SUCCEEDED. Every outcome here describes something about the
// punch that was recorded, never a failure to record it. A geofence result must
// never roll back optimistic UI, never render rose, and never read as "couldn't
// clock you in" — the server returns 201/200 in all four cases (contract
// md_attendance/7_work_mode_and_field_geofencing_api.md §5.3).
//
// TWO VOCABULARIES, ONE IDEA (§0.2). The organisation module stores a person's
// contractual mode as `on-site` | `remote` | `hybrid` | `field`; attendance
// records and punches use `office` | `remote` | `hybrid` | `field`. `on-site`
// and `office` are the same mode and must NEVER be compared directly. A NULL
// contractual mode is fail-secure: it reads as `office`.
//
// `matched_location_id` IS POLYMORPHIC — an `organization_locations.id` when
// `matched_location_type` is "office", an `organization_field_locations.id` when
// "field". Always branch on the type before looking the id up, and never print
// the id itself (CLAUDE.md §4).
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeStatusKey } from "./enums.js";

/* ─── Work mode ───────────────────────────────────────────────────────────── */

/** Profile vocabulary → attendance vocabulary. `null`/unknown ⇒ `office`. */
export function normalizeWorkMode(mode) {
  const key = normalizeStatusKey(mode);
  if (key === "on_site" || key === "onsite" || key === "office") return "office";
  if (key === "remote" || key === "hybrid" || key === "field") return key;
  return "office";
}

/**
 * The modes an employee may legitimately claim on a punch or a regularization,
 * given their contract. Only `hybrid` gets a choice; everyone else is fixed, so
 * the punch screen shows a toggle for hybrid staff and nothing for anyone else
 * (§5.4). An empty list means "send nothing".
 */
export function permittedWorkModes(contractMode) {
  const mode = normalizeWorkMode(contractMode);
  if (mode === "hybrid") return ["office", "remote"];
  return [mode];
}

/** True when the employee picks where they work and the UI should offer a toggle. */
export const choosesWorkMode = (contractMode) => normalizeWorkMode(contractMode) === "hybrid";

/** True when this employee's punches are checked against client sites. */
export const isFieldWorker = (contractMode) => normalizeWorkMode(contractMode) === "field";

/* ─── Distance ────────────────────────────────────────────────────────────── */

/**
 * Metres as a person would say them. Under a kilometre stays in metres because
 * "0.4 km" reads as further than "400 m" to most people; above it, kilometres
 * to one decimal. Returns "" when there is no distance to state — callers drop
 * the clause rather than printing a dash (CLAUDE.md §5).
 */
export function formatDistance(meters) {
  // `Number(null)` is 0, and 0 is finite — so an absent distance would print
  // "0 m" and claim the person stood exactly on the pin. Absence is not zero
  // (the same trap `metric()` guards in dayStatus.js).
  if (meters === null || meters === undefined || meters === "") return "";
  const n = Number(meters);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1000) return `${Math.round(n)} m`;
  return `${(n / 1000).toFixed(1)} km`;
}

/* ─── Outcomes ────────────────────────────────────────────────────────────── */

/**
 * `tone` maps to InlineAlert's tones. Note what is NOT here: no "rose". An
 * out-of-bounds punch is a flag for a manager to review, not an error the
 * employee just made — rose is reserved for things that actually failed
 * (CLAUDE.md §5).
 */
export const GEOFENCE_OUTCOMES = {
  in_bounds: { tone: "emerald", short: "At your work location" },
  out_of_bounds: { tone: "amber", short: "Away from your work location" },
  missing_coordinates: { tone: "amber", short: "No location recorded" },
  unresolved: { tone: "slate", short: "Work location not set up" },
};

export const geofenceOutcomeKey = (geofence) => normalizeStatusKey(geofence?.outcome) || null;

/**
 * Whether a distance check actually ran. `evaluated: false` is the normal,
 * silent case — a remote employee, a declared work-from-home day or a biometric
 * punch — and the punch screen shows no geofence chrome at all for it.
 */
export const wasGeofenceEvaluated = (geofence) => geofence?.evaluated === true;

/**
 * The one-line notice a punch screen shows under the clock button, or `null`
 * when there is nothing worth saying.
 *
 * `locationName` is resolved by the caller, which is the only place that knows
 * whether to look `matched_location_id` up among offices or field sites — this
 * module never prints an id (CLAUDE.md §4). Pass "" and the copy simply drops
 * the name clause rather than showing "Unknown".
 *
 * @returns {{ tone: string, text: string }|null}
 */
export function geofenceNotice(geofence, locationName = "") {
  if (!geofence) return null;
  const key = geofenceOutcomeKey(geofence);
  const meta = GEOFENCE_OUTCOMES[key];
  if (!meta) return null;

  // Nothing was measured, so there is nothing to explain. Staying silent here
  // is deliberate: a remote employee should not see geofence wording at all.
  if (!wasGeofenceEvaluated(geofence) && key !== "unresolved") return null;

  const where = locationName ? ` ${locationName}` : " your work location";
  const away = formatDistance(geofence.distance_meters);

  if (key === "in_bounds") return { tone: meta.tone, text: `Recorded at${where}.` };
  if (key === "out_of_bounds") {
    return {
      tone: meta.tone,
      text: away
        ? `Recorded ${away} from${where}. Your manager has been notified — send a correction request if you were at a client site.`
        : `Recorded away from${where}. Your manager has been notified — send a correction request if you were at a client site.`,
    };
  }
  if (key === "missing_coordinates") {
    return { tone: meta.tone, text: "Recorded without your location. Turn on location access so your attendance isn’t flagged." };
  }
  // unresolved — a configuration gap. Says who fixes it, and doesn't blame them.
  return { tone: meta.tone, text: "Recorded. Your work location hasn’t been set up yet — ask HR to finish it." };
}
