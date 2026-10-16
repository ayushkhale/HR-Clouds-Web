# E-05 — Payslip — September statutory not applied; net pay excludes PF/ESI/PT/TDS

- **Severity:** High
- **Location / Component:** see body
- **Observed (2026-10-14, Employee panel, HR-Vista org, read-only):**

Sep payslip (run 33336340): statutory_status 'not_applied', pf_wage 0, PF/ESI/PT/TDS all 0, with note 'net_pay does not reflect PF, ESI, professional tax or TDS'. paid_at is null despite status approved — approved but unpaid. August, by contrast, is 'applied'. Two consecutive approved runs use different statutory treatment and different engine versions (Sep v2, Aug v5).

- **Expected fix:**

Apply statutory consistently or, if 'not_applied' is intentional (e.g. draft), label it prominently in the payslip list ('Statutory pending — net pay is pre-statutory') and set paid_at only on payment. Pin/document engine-version changes.

- **Evidence / corroboration:**

Browser: payslip list Deductions shows 'N/A' (see E-15) — the list hides this entirely.

- **Status:** Observed during audit. No data was modified.
