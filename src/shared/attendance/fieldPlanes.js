// ─────────────────────────────────────────────────────────────────────────────
// attendance/fieldPlanes.js — the plane adapter for field sites and assignments.
//
// The endpoints are mounted at IDENTICAL paths on the HR and manager routers,
// with identical payloads and responses. Only the authorization scope differs,
// so the screens are ONE component taking `viewer`, never a fork (CLAUDE.md §2).
// This file is the single place that knows what each plane may do; the screens
// read a capability and hide the control when it is null, so we never render a
// button that 403s.
//
// WHAT THE SERVER DECIDES, NOT US:
//   · `can_modify` on GET /field-locations/:id, and `creator` on the list rows,
//     are the real authority on edit/retire rights (HR admin, or the manager who
//     created the site). `canModifyLocation()` below mirrors that rule for list
//     rows where no `can_modify` is sent, but a detail payload's `can_modify`
//     always wins — gate on what the server returned (CLAUDE.md §7).
//   · Assignment scope is ONE LEVEL DEEP: HR may assign anyone; a manager may
//     assign their direct reports only, and never themselves. We can't resolve
//     the hierarchy client-side, so the picker is narrowed to the viewer's own
//     roster and a HIERARCHY_VIOLATION is surfaced as the error it is.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI } from "../api";

/** The API plane a workspace talks to. Employees have neither — they self-read. */
const PLANE_BY_VIEWER = { hr: "hr", manager: "manager" };

export const fieldPlaneFor = (viewer) => PLANE_BY_VIEWER[viewer] || null;

/**
 * The capability set for a workspace. A `null` entry means "this role cannot do
 * this" and the screen hides the affordance rather than disabling it.
 *
 * @param {"hr"|"manager"} viewer
 */
export function fieldPlane(viewer) {
  const plane = fieldPlaneFor(viewer);
  if (!plane) return null;

  return {
    plane,
    // Reads — both planes have all of these.
    list: (params) => attendanceAPI.getFieldLocations(plane, params),
    get: (id) => attendanceAPI.getFieldLocation(plane, id),
    assignmentsFor: (userId) => attendanceAPI.getUserFieldAssignments(plane, userId),

    // Writes. Any manager or HR may register a site — reuse org-wide is the
    // point — but editing and retiring are gated per row by `can_modify`.
    create: (payload) => attendanceAPI.createFieldLocation(plane, payload),
    update: (id, payload) => attendanceAPI.updateFieldLocation(plane, id, payload),
    retire: (id) => attendanceAPI.deleteFieldLocation(plane, id),

    assign: (payload) => attendanceAPI.assignFieldLocation(plane, payload),
    unassign: (assignmentId) => attendanceAPI.unassignFieldLocation(plane, assignmentId),

    // HR may assign anyone in the org; a manager only their own reports, and
    // never themselves. Drives the people picker's roster and the self-check.
    assignScope: viewer === "hr" ? "org" : "reports",
    canAssignSelf: viewer === "hr",
  };
}

/**
 * Whether THIS viewer may edit or retire a list row. HR always may; a manager
 * may only for a site they created. Prefer a detail payload's `can_modify` when
 * one is in hand — this exists for list rows, which carry `creator` instead.
 *
 * @param {object} row       a field-location list row (has `created_by`/`creator`)
 * @param {object} ctx       { viewer, userId } — the signed-in person
 */
export function canModifyLocation(row, { viewer, userId } = {}) {
  if (!row) return false;
  if (typeof row.can_modify === "boolean") return row.can_modify;
  if (viewer === "hr") return true;
  const creator = row.created_by || row.creator?.id;
  return !!creator && !!userId && String(creator) === String(userId);
}

/** Radius bounds mirror a database CHECK, so these can never fail at the write. */
export const FIELD_RADIUS_MIN = 50;
export const FIELD_RADIUS_MAX = 2000;
export const FIELD_RADIUS_DEFAULT = 250;

/**
 * Coordinates arrive as STRINGS from `numeric` columns via pg. A map component
 * handed "18.52043000" silently renders nothing, so every read goes through
 * this rather than trusting the payload's type.
 * @returns {number|null}
 */
export function coord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** True when a site has a usable GPS pin — the only thing that makes it geofenceable. */
export const hasPin = (loc) => coord(loc?.latitude) !== null && coord(loc?.longitude) !== null;

/**
 * Collapse rows that share an `id`, keeping the first.
 *
 * WORKAROUND for a live backend defect, verified 2026-10-06 against
 * development.hrclouds.in: `GET /field-locations` returns one row PER CREATOR
 * PROFILE instead of one per site. A site whose creator holds two role-profile
 * rows comes back twice, identical but for the nested `creator.profile`, while
 * `total` (a separate COUNT) correctly says 1 — `total: 1` with
 * `records.length: 2` is the signature.
 *
 * This keeps the table honest and stops two rows fighting over one React key.
 * It CANNOT fix the related pagination fault: `limit` is applied to the joined
 * rows, so a duplicated site consumes two slots of a page and pushes a real
 * site off the end, where no amount of client-side work can recover it. That
 * needs the join fixed server-side (DISTINCT, or a separate profile read).
 * Remove this once the endpoint returns one row per site, and keep deriving the
 * count from `total` rather than from the array either way.
 */
export function dedupeById(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((r) => {
    const id = r?.id == null ? null : String(r.id);
    if (id === null) return true; // nothing to collapse on — keep it
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
