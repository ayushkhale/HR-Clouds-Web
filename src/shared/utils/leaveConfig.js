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
