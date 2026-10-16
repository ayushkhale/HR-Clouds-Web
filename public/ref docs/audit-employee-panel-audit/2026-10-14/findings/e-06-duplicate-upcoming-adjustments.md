# E-06 — Payroll — duplicate upcoming adjustments + test record

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/payroll/me/adjustments upcoming contains THREE identical 'Year-End Merit Bonus 2026' +8000.00 rows for 2026-12 (same name/amount/reason, different ids) and THREE identical 'Asset Replacement Recovery' −2500.00 rows for 2026-12. /payroll/me/bonuses upcoming adds a 'Performance Bonus Test' / TEST_PERF_BONUS 15000.00 row (2026-04) and duplicate festival bonuses. If the UI sums 'upcoming', the employee is promised 24000 of a bonus that may be 8000.

- **Expected fix:**

Deduplicate by idempotency key (period + component + reason), delete/void test rows in seeded data, and never sum duplicate component+period rows without a uniqueness guard.

- **Evidence / corroboration:**

Browser: duplicate rows observed in payroll views.

- **Status:** Observed during audit. No data was modified.
