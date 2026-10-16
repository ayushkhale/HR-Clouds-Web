# E-24 — Data integrity — small contradictory flags across endpoints

- **Severity:** Low
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

2026-10-03 Saturday: status half_day with effective_hours 0 and late_minutes 322. Overtime record: overtime_minutes 90 with early_exit_minutes 30 on the same day. Sep payslip: overtime_minutes 60 but overtime_amount 0.00. Task: is_viewed true but first/last_viewed_at null. Cancelled regularization: reviewed_at set but reviewed_by null and reviewer null.

- **Expected fix:**

Add cross-field validation (half-day needs hours > 0; overtime and early-exit cannot both accrue the same minutes; viewed flags need timestamps; review timestamps need a reviewer).

- **Evidence / corroboration:**

API-verified.

- **Status:** Observed during audit. No data was modified.
