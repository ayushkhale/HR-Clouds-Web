# E-08 — Salary — monthly_gross disagrees between structure views

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Salary structure top-level monthly_gross '118750.00' but statutory_breakdown figures.monthly_gross '125000.00'. Component sum = 62500 + 31250 + 25000 + 6250 = 125000. The 6250 gap is exactly AI_RECHARGE (type employer_contribution), which the top-level figure excludes. The payslip list / UI shows earnings summing to 118750 against Gross 125000.

- **Expected fix:**

Define one gross: either include employer contributions everywhere with a label, or exclude them everywhere. Show the arithmetic on the salary page so the total is auditable.

- **Evidence / corroboration:**

Browser: earnings sum 118750 vs Gross 125000 observed in UI.

- **Status:** Observed during audit. No data was modified.
