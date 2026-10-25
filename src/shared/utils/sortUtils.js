// ─────────────────────────────────────────────────────────────────────────────
// sortUtils.js — Unified date comparator & sorting for newest-first list data.
// Handles diverse timestamp & date fields across all HR Clouds modules:
// ISO strings, YYYY-MM-DD, YYYY-MM periods, and fallback id tiebreakers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a numeric epoch millisecond timestamp from an entity using
 * the canonical date/time attributes in priority order.
 */
export function getRecordTimestamp(item) {
  if (!item || typeof item !== "object") return 0;

  // 1. Precise created/applied/requested timestamp
  const created =
    item.created_at ||
    item.createdAt ||
    item.applied_on ||
    item.applied_date ||
    item.requested_at ||
    item.requestedAt ||
    item.timestamp ||
    item.performed_at;
  if (created) {
    const t = new Date(created).getTime();
    if (!Number.isNaN(t)) return t;
  }

  // 2. Business date
  const dateStr =
    item.date ||
    item.record_date ||
    item.start_date ||
    item.startDate ||
    item.earned_date ||
    item.worked_date ||
    item.work_date ||
    item.disbursed_on ||
    item.effective_from ||
    item.submitted_at ||
    item.updated_at ||
    item.updatedAt;
  if (dateStr) {
    const t = new Date(dateStr).getTime();
    if (!Number.isNaN(t)) return t;
  }

  // 3. Period (YYYY-MM)
  const periodStr = item.start_period_month || item.period_month || item.start_period || item.period;
  if (typeof periodStr === "string" && /^\d{4}-\d{2}$/.test(periodStr)) {
    const t = new Date(`${periodStr}-01`).getTime();
    if (!Number.isNaN(t)) return t;
  }

  return 0;
}

/**
 * Sorts an array descending in time (newest first).
 * Pure function: returns a new sorted shallow copy.
 * Handles integer IDs, UUIDs, and prefixed IDs with natural descending comparison.
 */
export function sortNewestFirst(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const timeA = getRecordTimestamp(a);
    const timeB = getRecordTimestamp(b);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const idA = a?.id ?? a?._id ?? "";
    const idB = b?.id ?? b?._id ?? "";
    return String(idB).localeCompare(String(idA), undefined, { numeric: true, sensitivity: "base" });
  });
}
