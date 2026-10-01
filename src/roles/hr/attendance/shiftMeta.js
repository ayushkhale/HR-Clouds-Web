// ─────────────────────────────────────────────────────────────────────────────
// shiftMeta.js — how a shift template reads to a person, shared by the roster,
// Work Shifts and the assign dialog so they never describe the same shift two
// ways.
// ─────────────────────────────────────────────────────────────────────────────
import { fmtClock } from "../../../shared/attendance/dates";
import { validateShift } from "../../../shared/attendance/validation";

export const shiftType = (s) => s?.type || s?.shift_type || "fixed";
export const shiftPolicyId = (s) => s?.policy_id || s?.policy?.id || "";

/**
 * The PUT body that keeps a shift exactly as it is but follows `policyId`
 * ("" = back to the default policy). Built through validateShift, the same
 * function the Edit Shift form uses, from a FRESH read of the shift — PUT
 * /shifts/:id needs `name` and the docs don't promise a partial update is safe,
 * so we send precisely what an edit of this shift would send. `errors` is
 * non-empty when the saved shift itself fails the edit rules (e.g. a timed
 * shift saved without times); the caller skips it and says why.
 */
export function shiftPolicyPayload(fresh, policyId) {
  const hhmm = (v) => (v ? String(v).slice(0, 5) : "");
  const form = {
    name: fresh?.name || "",
    type: shiftType(fresh),
    policy_id: policyId || "",
    start_time: hhmm(fresh?.start_time),
    end_time: hhmm(fresh?.end_time),
  };
  const { errors, payload } = validateShift(form, {
    isEdit: true,
    hadPolicy: Boolean(shiftPolicyId(fresh)),
    hadTimes: Boolean(fresh?.start_time || fresh?.end_time),
  });
  return { errors: Object.fromEntries(Object.entries(errors).filter(([, m]) => m)), payload };
}

// Shifts no longer carry min_hours (update_shift_templates_2026_09_14): a
// flexible shift has no set hours. "" when there's nothing to show.
export function shiftHours(shift) {
  if (shift?.start_time && shift?.end_time) return `${fmtClock(shift.start_time)} – ${fmtClock(shift.end_time)}`;
  return (shift?.type || shift?.shift_type) === "flexible" ? "Flexible hours" : "";
}
