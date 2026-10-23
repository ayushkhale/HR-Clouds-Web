// ─────────────────────────────────────────────────────────────────────────────
// attendance/locatePlanes.js — the plane adapter for live location checks, and
// the one shared answer to "may this person ask anybody where they are?".
//
// The HR and manager endpoints take the same bodies and return the same shapes;
// only the reach differs. So the screens are ONE component taking `viewer`,
// never a fork (CLAUDE.md §2), and this file is the only place that knows which
// URL pair a workspace talks to.
//
// ─── THE ASYMMETRY THIS FILE EXISTS TO ABSORB ──────────────────────────────
// `GET /attendance/hr/location-policy` is HR-ONLY. A manager therefore cannot
// read whether the feature is on, whether their role is allowed to use it, or
// whether a reason is required — there is no manager-plane policy endpoint, and
// the frontend guide does not offer one.
//
// That leaves two honest options for the manager, and only two:
//   (a) never show the control to a manager at all — which is a worse product
//       than the spec asks for, and the spec explicitly wants managers to locate
//       their own reports (guide §2.2);
//   (b) show it, and learn the answer from the server's refusal.
// We take (b), and make the refusal cheap and final: the three "this org cannot
// do this at all" codes (`FEATURE_DISABLED`, `LOCATION_TRACKING_DISABLED`,
// `LOCATE_ROLE_NOT_ALLOWED`) mark the capability off FOR THE SESSION, so a
// manager presses at most one button that can only say no, once, ever.
//
// Everything else — not clocked in, no device, cooldown, consent pending — is
// about THIS person RIGHT NOW, not about the organisation, and must never
// switch the feature off: the same manager asking the same person an hour later
// will succeed.
//
// ─── WHY THE REASON IS ALWAYS SENT ─────────────────────────────────────────
// `require_reason` is a policy flag we cannot read on the manager plane. Rather
// than guess and eat a `400 REASON_REQUIRED`, the dialog always asks for one and
// always sends it. Sending a reason that was not required is free, it is shown
// to the person in their own history, and it is the right thing to do anyway
// (§6: say why). `canReadPolicy` below is the only thing that branches on role.
//
// Contract: public/ref docs/md_updates/2026-10-23_on_demand_location_tracking_frontend_guide.md
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { attendanceAPI } from "../api";
import { isLocationChecksUnavailable } from "../utils/attendanceErrors";
import { unwrap } from "./normalize";

const PLANE_BY_VIEWER = { hr: "hr", manager: "manager" };

/** The API plane a workspace talks to. An employee has neither — they are the subject. */
export const locatePlaneFor = (viewer) => PLANE_BY_VIEWER[viewer] || null;

/**
 * The capability set for a workspace. A `null` entry means "this role cannot do
 * this" and the screen hides the affordance rather than disabling it (§2).
 *
 * @param {"hr"|"manager"} viewer
 */
export function locatePlane(viewer) {
  const plane = locatePlaneFor(viewer);
  if (!plane) return null;
  const hr = plane === "hr";

  return {
    plane,
    /** Ask one person where they are. body `{ reason }`. */
    locate: (userId, payload) => (hr
      ? attendanceAPI.locateEmployeeAsHR(userId, payload)
      : attendanceAPI.locateMemberAsManager(userId, payload)),
    /** Read one request's result. A manager may only read requests they raised. */
    poll: (requestId) => (hr
      ? attendanceAPI.getLocationRequestAsHR(requestId)
      : attendanceAPI.getLocationRequestAsManager(requestId)),
    /** Who asked this person, when and why. */
    history: (userId, params) => (hr
      ? attendanceAPI.getEmployeeLocationHistoryAsHR(userId, params)
      : attendanceAPI.getMemberLocationHistoryAsManager(userId, params)),

    // HR-only. `null` rather than a function that 403s.
    readPolicy: hr ? () => attendanceAPI.getLocationPolicy() : null,
    writePolicy: hr ? (payload, updatedAt) => attendanceAPI.updateLocationPolicy(payload, updatedAt) : null,

    /** HR reads the org's policy; a manager learns it only by being refused. */
    canReadPolicy: hr,
    /** HR may ask anyone active; a manager only their own direct reports. */
    scope: hr ? "org" : "reports",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The session verdict
//
// Cached for the session and shared by every subscriber, the same arrangement
// `deviceTrust.js` uses for its context read: the profile tab asks whether to
// draw the button, the HR settings page asks what the policy says, and one read
// answers both.
//
// IT NEVER THROWS AND NEVER REPORTS A FAILURE. A policy we could not read is
// treated the way the product behaved before this feature existed — for HR,
// that means the control stays hidden rather than appearing and failing.
// ─────────────────────────────────────────────────────────────────────────────

/** No such feature on this server, or the org has it switched off. */
const OFF = Object.freeze({ enabled: false, absent: true, policy: null });

let cache = null;        // last good verdict, or OFF
let inFlight = null;     // de-dupes StrictMode's double mount and parallel screens
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(cache));

/** The cached verdict without triggering a read. `null` = not read yet. */
export const peekLocationChecks = () => cache;

/** Forget the verdict; the next read goes to the server. */
export function invalidateLocationChecks() {
  cache = null;
  inFlight = null;
}

/**
 * Called by any screen that gets a locate refusal. Only the three org-wide
 * codes land; everything else is about one person at one moment and is ignored
 * here on purpose (see the header).
 */
export function noteLocateRefusal(err) {
  if (!isLocationChecksUnavailable(err)) return;
  cache = OFF;
  inFlight = null;
  notify();
}

/**
 * Read the org policy, from cache unless `force`. HR only — a manager has no
 * such endpoint, so for them this resolves to an OPTIMISTIC verdict rather than
 * to OFF: "we don't know, let them try once".
 *
 * @param {{viewer?: "hr"|"manager", force?: boolean}} [options]
 */
export async function loadLocationChecks({ viewer = "hr", force = false } = {}) {
  if (viewer !== "hr") {
    // Not cached: the manager's verdict is only ever changed by a refusal, and
    // caching "unknown" here would stop `noteLocateRefusal` from sticking.
    return cache || { enabled: true, absent: false, policy: null, unknown: true };
  }
  if (!force && cache) return cache;
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const policy = unwrap(await attendanceAPI.getLocationPolicy());
      cache = policy && typeof policy === "object"
        ? { enabled: policy.enabled === true, absent: false, policy }
        : OFF;
    } catch (err) {
      // "This server has no such feature" (404/403/501/503) is a settled answer
      // and worth caching. Anything else — offline, 500 — is not: leave the
      // cache empty so the next screen asks again, rather than hiding a feature
      // the organisation is paying for because of one dropped request.
      const settled = [403, 404, 501, 503].includes(err?.status);
      cache = settled ? OFF : null;
      inFlight = null;
      notify();
      return OFF;
    }
    inFlight = null;
    notify();
    return cache;
  })();
  return inFlight;
}

/** Re-read after the policy form saves — `enabled` may have just moved. */
export const refreshLocationChecks = () => loadLocationChecks({ viewer: "hr", force: true });

/**
 * The verdict, for a component. Starts from whatever is cached, so a second
 * screen renders the right thing on its first frame.
 *
 * @param {{viewer?: "hr"|"manager", enabled?: boolean}} [options]
 * @returns {{ctx: object|null, loading: boolean, reload: Function}}
 */
export function useLocationChecks({ viewer = "hr", enabled = true } = {}) {
  const [ctx, setCtx] = useState(() => (viewer === "hr" ? cache : cache || { enabled: true, unknown: true }));
  const [loading, setLoading] = useState(() => enabled && viewer === "hr" && !cache);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const listener = (next) => alive && setCtx(next);
    listeners.add(listener);
    loadLocationChecks({ viewer }).then((next) => {
      if (!alive) return;
      setCtx(next);
      setLoading(false);
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, [enabled, viewer]);

  const reload = useCallback(() => loadLocationChecks({ viewer, force: true }), [viewer]);
  return { ctx, loading, reload };
}

/**
 * Should this workspace draw the "ask where they are" control at all?
 *
 * HR: only when the policy row says `enabled` AND lists `hr`. A manager: unless
 * a refusal has already told us otherwise. Nobody may locate themselves, which
 * is a 422 the server raises anyway — caught here so the button is simply not
 * there on your own record rather than present and guaranteed to fail.
 */
export function canLocate({ ctx, viewer, isSelf = false }) {
  if (isSelf) return false;
  if (!locatePlaneFor(viewer)) return false;
  if (!ctx) return viewer !== "hr";          // unread: optimistic for a manager only
  if (ctx.absent || ctx.enabled === false) return false;
  const roles = ctx.policy?.allowed_requester_roles;
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(viewer)) return false;
  return true;
}
