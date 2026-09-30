# Payroll — F&F Settlement, Bank Advice & Statutory Summary PDFs

**Date:** 2026-09-30
**Module:** Payroll (HR plane)
**Audience:** Frontend engineers
**Registry:** `public/md_system/api_registry.md` #222, #223, #224

---

Three new **HR-only** download endpoints. Each returns `application/pdf` (`Content-Disposition: attachment`) and is rendered through the HTML→PDF renderer. No existing request or response shape changed. The only change to an existing API is two new `report_type` values in the exports list (§4).

> **Deploy dependency:** migration `00063` must be applied before #222 and #224 go live. Without it they fail with `500` after rendering.

## 1. #224 — Full & Final settlement statement

`GET /api/v1/payroll/hr/exits/:id/settlement-statement/pdf`

| Exit status | Result |
|---|---|
| `prepared` | **PROVISIONAL** statement: frozen leave encashments (credits), notice-shortfall and loan recoveries, and the net of those items. The final-period salary is not shown yet. |
| `settled` | **FINAL** statement: the above plus the final-period pay (gross, deductions, reimbursements, **net settlement paid**) from the paid F&F payroll run. |
| `recorded` | `409 SETTLEMENT_NOT_PREPARED`. Prepare the settlement (#201) first. |
| `cancelled` | `409 EXIT_CANCELLED` |
| unknown id / other org | `404 EXIT_NOT_FOUND` |

- Items cancelled after preparation are left out, and a note on the PDF records this.
- Active loans that were not recovered (loan recovery mode `manual`) appear under "Outstanding Loans". This is a live read.
- Filename: `fnf_statement_<first 8 chars of exit id>_<provisional|final>.pdf`.
- UI suggestion: show the button once the exit is `prepared`. Label it "Provisional statement" while `prepared` and "Final statement" once `settled`.

## 2. #223 — Bank advice PDF (covering copy)

`GET /api/v1/payroll/hr/runs/:id/bank-advice/pdf`

- This is a signed, printable companion to the existing CSV (#181). It covers the same employees, in the same order, with the same `Sr.`, payment reference, amounts and total.
- **Account numbers are masked** (`XXXX1234`). **The CSV remains the file uploaded to the bank.** Do not offer the PDF as a replacement for it.
- Filename: `bank_advice_run-<RUNREF>.pdf`.

| Error | When |
|---|---|
| `404 RUN_NOT_FOUND` | unknown run / other org |
| `409 RUN_NOT_PAID` | the run is not `paid` (same rule as the CSV) |
| `409 MISSING_BANK_ACCOUNTS` `details.employee_codes[]` | a payable employee has no primary bank account (same rule as the CSV) |
| `422 EXPORT_TOO_LARGE` `details { row_count, max_rows: 2000, format: 'pdf' }` | more than 2000 payable employees. Use the CSV instead; the CSV has no such cap. |

## 3. #222 — Statutory contributions summary PDF

`GET /api/v1/payroll/hr/tax/financial-years/:financialYear/statutory-summary/pdf` (`financialYear` like `2025-26`)

- This is the #118 JSON summary as a landscape PDF. It shows, for each month, employee count, PF (employee/employer), EPS, ESI covered, ESI (employee/employer), professional tax and TDS, with FY totals.
- It is a **challan-preparation worksheet**. It is **not** an ECR, ESI-return or 24Q/FVU e-filing file, and the UI copy should not describe it as one.
- Filename: `statutory_summary_<financialYear>.pdf`.
- Errors: `400 VALIDATION_ERROR` for a malformed `financialYear`.

## 4. Changed: exports audit list (#182)

`GET /api/v1/payroll/hr/exports?report_type=…` now also accepts:

- `statutory_summary`: written by #222
- `fnf_statement`: written by #224 (`subject_user_id` = the exiting employee)

Bank advice PDFs are logged under the existing `bank_advice` label with `format: 'pdf'`. If the UI keeps a hard-coded label/filter list, add the two new values.

## 5. Errors common to all three

| Status / code | Meaning |
|---|---|
| `403` | caller is not HR |
| `502 PDF_RENDERER_UNAVAILABLE`, `504 PDF_RENDER_TIMEOUT`, `503 PDF_RENDERER_NOT_CONFIGURED`, `500 PDF_RENDER_FAILED` | the PDF renderer failed, timed out or is not configured. Nothing was recorded; retry is safe. |
