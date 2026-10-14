// ─────────────────────────────────────────────────────────────────────────────
// attendance/officePlanes.js — the plane adapter for OFFICE locations, the
// places an organisation works from and the geofences a punch is checked
// against.
//
// Unlike client sites (fieldPlanes.js) there is no second router here: HR and
// the manager call the SAME path, `/organizations/locations`. What differs is
// who may write to it:
//
//   · GET  /organizations/locations      → super-admin, admin, hr, manager,
//                                          employee — EVERY org role
//   · POST /organizations/locations      → super-admin, admin, hr only
//   · PUT  /organizations/locations/:id  → super-admin, admin, hr only
//
// (md_organization/3_org_structure_api.md, verified 14 Oct 2026.)
//
// So a manager's Office Locations screen is READ-ONLY, and that is expressed
// the way the house does it: a capability a role lacks is `null` here, and the
// screen hides the control rather than disabling it or letting it 403
// (CLAUDE.md §2). An employee gets no plane at all — they have no such screen;
// their base office is shown on their own profile.
//
// WHY THE LIST IS NOT PAGINATED: the endpoint returns every location for the
// org, inactive ones included, ordered by name. There is no `page`, so the
// search below is deliberately client-side over the whole list — adding a
// server search would be inventing a parameter the contract hasn't got (§7).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { attendanceAPI } from "../api";

/**
 * The capability set for a workspace, or `null` for a role with no such screen.
 * A `null` capability means "this role cannot do this".
 *
 * @param {"hr"|"manager"} viewer
 */
export function officePlane(viewer) {
  if (viewer !== "hr" && viewer !== "manager") return null;
  const canManage = viewer === "hr";
  return {
    viewer,
    canManage,
    // Reads — every org role has this one.
    list: (params) => attendanceAPI.getLocations(params),
    // Writes — HR only. Null is what the screen checks before drawing a button.
    create: canManage ? (payload) => attendanceAPI.createLocation(payload) : null,
    update: canManage ? (id, payload) => attendanceAPI.updateLocation(id, payload) : null,
  };
}

/** The office-location list rows, newest read wins. */
const rowsOf = (res) => (Array.isArray(res?.data) ? res.data : []);

const errorText = (err, fallback) => err?.data?.message || err?.message || fallback;

/**
 * The office locations this workspace may read, with the loading, error and
 * in-place-patch handling both screens need.
 *
 * `patch` exists for the active toggle: refetching the list after a toggle
 * swapped every card for a skeleton, so the whole page flashed on each click
 * (the behaviour this hook inherited from the HR screen — keep it).
 *
 * @param {"hr"|"manager"} viewer
 */
export function useOfficeLocations(viewer) {
  const plane = officePlane(viewer);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Guards a slow first read landing after a reload has already answered, and
  // stops a read that resolves after unmount from setting state (§7).
  const token = useRef(0);
  const alive = useRef(true);
  // IT MUST BE SET TRUE ON THE WAY IN, not only false on the way out. React 18
  // StrictMode mounts, unmounts and remounts every component in dev, so a
  // cleanup-only guard latches false on the first unmount and the remount's
  // read - the only one left - is discarded. The screen then sits on an empty
  // list while the network tab shows both requests succeeding (14 Oct 2026).
  // Don't "simplify" this back to a bare cleanup.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!plane) { setLoading(false); return; }
    const mine = ++token.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await plane.list();
      if (!alive.current || mine !== token.current) return;
      setRows(rowsOf(res));
    } catch (err) {
      if (!alive.current || mine !== token.current) return;
      // "Couldn't load" is not "there are none" (§7): the screen must be able
      // to tell them apart, so the rows are left alone and the error is set.
      setError(errorText(err, "Could not load office locations."));
    } finally {
      if (alive.current && mine === token.current) setLoading(false);
    }
    // `plane` is rebuilt every render but is a pure function of `viewer`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  useEffect(() => { load(); }, [load]);

  const patch = useCallback((id, fields) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }, []);

  return { plane, rows, loading, error, setError, reload: load, patch };
}
