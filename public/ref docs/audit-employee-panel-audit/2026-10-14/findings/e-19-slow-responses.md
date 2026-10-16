# E-19 — Performance — several employee endpoints exceed 3 s; UI loads slow

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Slowest GETs: /payroll/me/tax/projection 6310 ms, /attendance/graph-data 3652 ms, /payroll/me/salary-structure 3337 ms, /payroll/me/tax/summary 3715 ms, /attendance/weekly-calendar 2907 ms. Browser also reported slow page loads. No caching/pagination issue was proven — marked as observed latency, not root-caused.

- **Expected fix:**

Add server-side timing budgets + caching for projection/graph/summary, and skeleton loaders so slow pages do not look frozen.

- **Evidence / corroboration:**

Browser: slow loads. API: timings above (single pass, IST).

- **Status:** Observed during audit. No data was modified.
