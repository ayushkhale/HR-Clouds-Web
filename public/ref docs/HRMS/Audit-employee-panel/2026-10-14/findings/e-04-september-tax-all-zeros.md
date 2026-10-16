# E-04 — Tax — September 2026 paid but every tax field is zero

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/payroll/me/tax/monthly: 2026-09 paid=true yet taxable_earnings, TDS, PF employee/employer, EPS, ESI, professional tax are all '0.00', even though the Sep payslip gross is 116854.17. YTD therefore equals August only (43891.13). Root cause is E-05 (Sep statutory not_applied) propagating into tax.

- **Expected fix:**

Backfill or recompute September statutory/tax from the approved payslip, and add a cross-check: paid month with gross > 0 must not have all-zero statutory fields.

- **Evidence / corroboration:**

Browser: Tax page PF 0 vs salary PF 1800 — same gap visible in UI.

- **Status:** Observed during audit. No data was modified.
