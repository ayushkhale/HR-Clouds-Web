# E-13 — Loans — outstanding + recovered exceeds principal; next due stale

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Active loan: principal 60000.00, outstanding_principal 50281.20, recovered 10466.38 → outstanding + recovered = 60747.58 > principal by 747.58 (interest/fees not separated). next_due_period_month is 2026-05 — five months stale — although ~2 EMIs have been recovered since a May start. EMI math itself checks out (5233.19 × 12 = 62798.24 = total_payable).

- **Expected fix:**

Split outstanding into principal vs interest, keep next_due in sync with the instalment schedule, and expose the instalment schedule (endpoint exists in bundle).

- **Evidence / corroboration:**

API-verified.

- **Status:** Observed during audit. No data was modified.
