// ─────────────────────────────────────────────────────────────────────────────
// leaveConfig.js
// Shared helpers for leave configuration fields that need special encoding.
//
// notice_period_max_days is tri-state on the backend:
//   null → unrestricted (no cap during notice period)
//   0    → fully blocked during notice period
//   n    → at most n days allowed during notice period
// The UI must distinguish 0 from null, so we model it as an explicit mode.
// ─────────────────────────────────────────────────────────────────────────────

export function noticeModeOf(v) {
  if (v === null || v === undefined || v === "") return "unrestricted";
  if (Number(v) === 0) return "blocked";
  return "capped";
}

// Resolve the payload value for notice_period_max_days from a mode + day count.
export function noticeValue(mode, days) {
  if (mode === "unrestricted") return null;
  if (mode === "blocked") return 0;
  return parseInt(days, 10) || 0;
}

/* ─── The system Compensatory Off leave type (2026-10-11) ───────────────────
   Every organisation is provisioned with a leave type the platform owns
   rather than HR: attendance credits comp-off against it, the nightly expiry
   and the year-end rollover read it, and payroll encashes it. So the backend
   refuses to delete it, deactivate it, or let its code be changed
   (SYSTEM_LEAVE_TYPE_IMMUTABLE / SYSTEM_LEAVE_TYPE_CODE_IMMUTABLE).

   TWO CODES, NOT ONE. New organisations get `CO`. Organisations that predate
   the change may carry `COMP_OFF`, and the backend's own resolvers check `CO`
   first and fall back to it — so anything that keys off this must accept both,
   or the older tenants lose the protection on screen while keeping it on the
   server, which is the worst of the two.

   Everything else about it is HR's: the display name, the document threshold,
   the sandwich rule and the demographic rules all stay editable. */
const SYSTEM_LEAVE_TYPE_CODES = ["CO", "COMP_OFF"];

/** Is this the platform-owned comp-off type, under either of its codes? */
export const isSystemLeaveType = (code) =>
  SYSTEM_LEAVE_TYPE_CODES.includes(String(code || "").trim().toUpperCase());
