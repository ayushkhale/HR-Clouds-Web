# E-18 — API — employee gets 403 on three endpoints; bundle references dead 404 paths

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

403 Access denied (employee role): GET /leaves/types, GET /leaves/templates, GET /organizations/me/setup-status. 404 'Cannot GET': /comp-offs, /overtime, /regularizations (bare), /organizations/me/job-profile, /organizations/profile, /payroll/me/tax/regime, /documents/me. If any UI path calls the 403/404 endpoints, the employee sees a generic failure.

- **Expected fix:**

Return scoped employee-safe variants (or remove the calls), and prune dead bundle paths. Never surface a bare 'Access denied' — explain what the employee can do instead.

- **Evidence / corroboration:**

API-verified (52-endpoint sweep).

- **Status:** Observed during audit. No data was modified.
