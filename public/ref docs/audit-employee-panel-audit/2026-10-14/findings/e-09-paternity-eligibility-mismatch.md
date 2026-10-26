# E-09 — Leaves — Paternity balance for a female-profile + ECL missing from applicable types

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/leaves/my-balances has a Paternity Leave balance (accrued 3.50) and /leaves/my-leave-types lists Paternity (allowed_genders ['male'], probation 90 days, quota 20) — but /organizations/me gender is 'female'. Separately, Executive Casual Leave appears in balances but NOT in my-leave-types (5 types vs 6 balances).

- **Expected fix:**

Filter leave types/balances by eligibility (gender, probation, employment) server-side, and keep balances and applicable-types derived from the same source so they cannot drift.

- **Evidence / corroboration:**

Browser: raw codes ECL_2026 / PAT_2026 shown in UI (see E-20).

- **Status:** Observed during audit. No data was modified.
