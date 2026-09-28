// ─────────────────────────────────────────────────────────────────────────────
// annualStatementMeta.js — Reading the FY annual salary statement (#183 for HR,
// #192 for the person themselves; one service answers both).
//
// Both screens were written against a draft shape — `period_month`, a
// `status: "empty"` flag and `ytd_totals` — and the live reply has none of
// them: each month is keyed `month` ("2026-04"), a month with no pay run is
// simply all nulls, and the year's figures are `totals` (with `months_paid`).
// So every cell read N/A and every row shared the key `undefined`. Read both
// spellings here so the two screens can't drift apart again.
// ─────────────────────────────────────────────────────────────────────────────

const paid = (m) => m.status !== "empty" && [m.gross_earnings, m.net_pay, m.total_deductions].some((v) => v !== null && v !== undefined);

/** One row per month of the financial year, in the server's order. */
export function statementMonths(data) {
  const months = Array.isArray(data?.months) ? data.months : [];
  return months.map((m, i) => ({
    ...m,
    key: m.month || m.period_month || String(i),
    period: m.month || m.period_month || "",
    empty: !paid(m),
    source: m.snapshot_source ?? m.source ?? null,
  }));
}

/** The year's totals, or null until at least one month has been paid. */
export function statementTotals(data) {
  const totals = data?.totals || data?.ytd_totals || null;
  if (!totals) return null;
  if (totals.months_paid !== undefined && Number(totals.months_paid) === 0) return null;
  return totals;
}
