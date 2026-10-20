# E-07 — Payroll — EPS amount equals PF amount instead of 8.33% of PF wage

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Salary-structure statutory_breakdown: pf_employee 1800, eps 1800 (8.33% of pf_wage 15000 = 1250). August payslip: pf_employee 696.77, eps 696.77 (8.33% of pf_wage 5806.45 = ~483.70), while epf_employer is 0.00 and pf_employer_amount is 1800 in one place / 0.00 in the other. EPS is systematically copied from PF.

- **Expected fix:**

Compute EPS = 8.33% of PF wage capped at the statutory ceiling, split employer PF into EPS + EPF, and reconcile the two employer-PF fields.

- **Evidence / corroboration:**

API-only (values). UI shows PF 1800 without the EPS split.

- **Status:** Observed during audit. No data was modified.
