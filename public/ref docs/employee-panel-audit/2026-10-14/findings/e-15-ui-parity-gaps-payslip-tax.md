# E-15 — UI parity — payslip list and tax page contradict detail endpoints

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Browser: payslip list shows Deductions 'N/A' while the Sep detail has total_deductions 7733.19 (EMI 5233.19 + recovery 2500) and Aug 8429.96 (PF 696.77 + recovery 2500 + EMI 5233.19). Tax page shows PF 0 where salary structure shows PF 1800 (consequence of E-04). The list hides exactly the numbers that change take-home.

- **Expected fix:**

Render deductions from the detail figures in the list, and show a 'statutory pending' badge when statutory_status is not_applied.

- **Evidence / corroboration:**

Browser-observed; API-confirmed.

- **Status:** Observed during audit. No data was modified.
