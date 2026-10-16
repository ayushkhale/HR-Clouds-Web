# E-14 — Tax — projection ignores HRA; tax estimates disagree

- **Severity:** Medium
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

/payroll/me/tax/projection: projected_monthly hra_received '0.00', hra_exemption '0.00' despite a 31250/mo HRA component, so the projected liability understates HRA exemption. Annual taxable estimates disagree across endpoints: structure 1500000 (full CTC) vs projection 793891.13. Positively: liability 0.00 is CORRECT via rebate 87A (tax_before_rebate 15944.50 fully rebated, income 718890 < 12L threshold) — not a bug.

- **Expected fix:**

Feed actual HRA into the projection (or label it 'HRA not modelled'), and use one taxable-income definition across salary/tax endpoints.

- **Evidence / corroboration:**

API-verified. Do not flag the zero liability itself.

- **Status:** Observed during audit. No data was modified.
