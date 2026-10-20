# E-10 — Leaves — one request's total_days disagrees with its date range

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

9 of 10 requests reconcile, but the cancelled Annual Leave 2026-11-15 → 2026-11-16 spans 2 calendar days with total_days '1.00'. (Half-day flag is false, so no half-day explanation.)

- **Expected fix:**

Validate total_days against the inclusive calendar range (minus weekly offs/holidays where policy says so) on create, and display the counted days next to the range in the request form.

- **Evidence / corroboration:**

API-verified across all 10 requests.

- **Status:** Observed during audit. No data was modified.
