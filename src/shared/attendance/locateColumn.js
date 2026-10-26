// ─────────────────────────────────────────────────────────────────────────────
// locateColumn.js — the table-level decision behind the "ask where they are"
// quick action. The cells and the dialog host live in LocateQuickAction.jsx;
// this file holds the hook so neither file mixes components with helpers
// (react-refresh/only-export-components, §8).
//
// WHY THE DECISION IS AT TABLE LEVEL AND NOT PER ROW. Two rules meet here:
//
//   · §5 — "if no row in a list has an action, drop the Actions column". The
//     verdict (is the feature on? may this role ask?) is ONE answer for the
//     whole table, and whether any row qualifies can only be known after every
//     row has been tested. A per-row component cannot delete its own header.
//   · §2 — HR and the manager must get the identical control, in the identical
//     place, worded identically. So the rule lives once, not in each table.
//
// The caller asks `show` before drawing the `<th>`, `canAsk(row)` per row, and
// renders the host as a SIBLING of the table (§3 stacking — a dialog is never
// nested inside a `<tr>`).
//
// ─── WHAT MAKES A ROW ASKABLE ─────────────────────────────────────────────
// · Never yourself — the server raises 422 on it, so the button is simply not
//   there rather than present and guaranteed to fail (§2).
// · Never a past date. The answer is where the phone is NOW; offering it beside
//   last Tuesday's attendance would promise something nobody can deliver.
// · Not when the org requires the person to be clocked in and they are not.
//   HR can read `require_clocked_in`; a manager cannot (locatePlanes.js), so
//   for a manager the button stays and the refusal explains itself — the same
//   optimistic bargain the rest of the manager plane makes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { todayYMD } from "./dates";
import { canLocate, useLocationChecks } from "./locatePlanes";

/** The column header, identical in both tables. */
export const LOCATE_COLUMN_LABEL = "Location";

/** The field-help surface the column header and the dialog share. */
export const LOCATE_SURFACE = "attendance.locate_employee";

/**
 * The table-level verdict for the "ask where they are" column.
 *
 * @param {{viewer: "hr"|"manager", date?: string}} options `date` is the day
 *   the list is showing; omit it for a list that is always today.
 * @returns {{viewer: string, show: boolean, canAsk: (row: object) => boolean,
 *            ask: (row: object, name?: string) => void, target: object|null,
 *            close: () => void}}
 */
export function useLocateColumn({ viewer, date } = {}) {
  const { user } = useAuth();
  const { ctx } = useLocationChecks({ viewer });
  const [target, setTarget] = useState(null);

  const isToday = !date || date === todayYMD();
  const allowed = canLocate({ ctx, viewer }) && isToday;
  // Only HR ever reads the policy, so this is only ever true for HR. A manager
  // sees the button on everyone and learns the rule from the refusal.
  const needsClockIn = ctx?.policy?.require_clocked_in === true;
  const selfId = user?.id ? String(user.id) : null;

  const canAsk = useCallback((row) => {
    if (!allowed || !row) return false;
    const id = row.user_id || row.id;
    if (!id) return false;
    if (selfId && String(id) === selfId) return false;
    if (needsClockIn && !row.clock_in_time) return false;
    return true;
  }, [allowed, needsClockIn, selfId]);

  const ask = useCallback((row, name) => {
    const id = row?.user_id || row?.id;
    if (id) setTarget({ userId: id, row, name });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  return { viewer, show: allowed, canAsk, ask, target, close };
}
