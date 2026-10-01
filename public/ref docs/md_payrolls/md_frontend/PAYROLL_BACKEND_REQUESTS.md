# Payroll Runs, Adjustments and Bonus Rules: What the Frontend Needs from the Backend

**From:** Frontend (HR panel)
**Date:** 2026-09-14
**Scope:** HR screens for Payroll Runs, Run detail, Salary Adjustments and Bonus Rules

## Why we're asking

We fixed the reported bugs using the phase 2–4 docs. Some response shapes, field names and error codes aren't specified there. Right now the frontend guesses them defensively, for example by reading two possible keys or falling back to a generic message. Each item below removes one guess.

## How to send answers

- For every **Sample** item, paste the raw JSON response exactly as the API returns it, including the `{ success, data }` envelope.
- One record per list is enough, plus the pagination object.
- Replace real PAN, bank and salary data with fake values. Keep the field names and types unchanged.
- For every **Confirm** item, a one-line answer is enough.

**Priority:**
- **P1:** a user-facing bug may still happen without it.
- **P2:** needed so details and messages are shown correctly.
- **P3:** nice to have.

---

## 1. Error response format (P1, applies to every endpoint)

We turn backend errors into plain messages using `errorCode`.

| # | Type | Question |
|---|---|---|
| 1.1 | Sample | One **validation error** response, e.g. `POST /payroll/hr/runs/:id/cancel` with an empty body. We need to know whether field errors come as `details: [{ message, path }]`, `errors: [...]`, or only in `message`. |
| 1.2 | Sample | One **business error**, e.g. approve a run that has errors (`409 RUN_HAS_ERRORS`). |
| 1.3 | Confirm | Does the validator run with `stripUnknown: true` on every payroll endpoint? We send one extra key on cancel (see 2.1). It must be ignored, not rejected. |
| 1.4 | Confirm | Please send the **full list of `errorCode` values** each endpoint below can return. Some codes we already show messages for came from the docs; others we guessed. Please confirm or correct these: `RUN_NOT_CALCULABLE`, `RUN_NOT_CANCELLABLE`, `RUN_NOT_APPROVED`, `RUN_ALREADY_PAID`, `RUN_TOTALS_DRIFTED`, `PERIOD_PARTIALLY_LOCKED`, `CANCELLATION_REASON_REQUIRED`, `EXCLUSION_REASON_REQUIRED`, `PERIOD_OVERRIDE_REASON_REQUIRED`, `PERIOD_OUTSIDE_RUN`, `ITEM_NOT_FOUND`, `RUN_NOT_FOUND`, `ADJUSTMENT_NOT_FOUND`, `BATCH_NOT_FOUND`, `BONUS_RULE_NOT_FOUND`, `RULE_NOT_APPROVED`, `RULE_NOT_EDITABLE`. |

---

## 2. Payroll run actions

| # | Type | Endpoint | Question |
|---|---|---|---|
| 2.1 | Confirm (P1) | `POST /payroll/hr/runs/:id/cancel` | What is the **exact body field name** for the reason: `cancellation_reason` or `reason`? Is there a minimum or maximum length? *Right now we send both.* |
| 2.2 | Confirm (P1) | same | Cancel is allowed only when `status = approved` and the run isn't paid. Please confirm that a `draft` or `calculated` run **cannot** be cancelled or discarded, and tell us the error code returned if someone tries. |
| 2.3 | Confirm (P2) | `POST /payroll/hr/runs/:id/calculate` | Is calculate **synchronous**, returning only after the run reaches `calculated` or `failed`? Or can it return while the status is still `calculating`? *We refresh every 8–10 s while a run shows `calculating`.* Also: what does the response body contain? |
| 2.4 | Confirm (P2) | `PATCH /payroll/hr/runs/:id/items/:itemId/period` | Does it accept **both** `period_start` and `period_end`? Is either one optional? Must both dates fall inside the run's month? |
| 2.5 | Sample (P3) | `POST .../approve`, `.../pay`, `.../cancel` | One success response each. We only need to know whether they return the updated run header. |

---

## 3. Payroll run reads

### 3.1 List runs: `GET /payroll/hr/runs?page=1&limit=10&status=calculated` (P1)

**Sample:** one run plus the pagination object.

**Confirm:**
- the pagination key names (`pagination.total` / `totalPages`?)
- whether the `status` filter accepts a single value

### 3.2 Run header: `GET /payroll/hr/runs/:id` (P1)

**Sample:** please send three runs:

- a **calculated** run with at least 1 error item and at least 1 excluded item
- a **failed** run
- a **cancelled** run

**Confirm:** which of these fields are returned. The screens read them:

`error_count`, `excluded_count`, `processed_count`, `total_employees`, `requires_recalculation`, `calculation_started_at`, `calculated_at`, `failure_reason`, `period_start`, `period_end`, `total_gross`, `total_deductions`, `total_net`, `total_employer_cost`, `approved_at`, `paid_at`, `cancelled_at`, `cancellation_reason`, `notes`.

### 3.3 Run items list: `GET /payroll/hr/runs/:id/items?page=1&limit=20&status=error` (P1)

**Sample:** one `error` item, one `excluded` item and one `calculated` item that has warnings, plus pagination.

**Confirm:**
- Does each list row include `error_code`, `error_reason`, `exclusion_reason`, `period_override_reason` and `calculation_warnings`? *We show these in the table and in the "needs attention" panel.*
- Does each row include the **employee's name, employee code and department**? If not, we look them up from `GET /organizations/employees?purpose=emp_report` (see 6.1).
- Does `status=error` return **all** error items when `limit=100`? What is the maximum allowed `limit`?

### 3.4 Run preview: `GET /payroll/hr/runs/:id/preview` (P1)

**Sample:** the preview for the calculated run from 3.2.

**Confirm:**
- The shape of `error_items[]`. Does it include the **item id** (`id` or `item_id`), `user_id`, `error_code` and `error_reason`?
- The shape of `excluded_items[]`.
- Is `warnings` an **array** of codes or an **object of counts**?
- The exact keys in `department_breakdown[]` (`department_name`, `headcount`, `total_net`?).
- The exact keys in the `variable_pay` block (Phase 3 §7.7) and the `statutory` block (Phase 4 §6.3).
- Which run statuses allow a preview. Does `draft` return an error?

### 3.5 Item detail: `GET /payroll/hr/runs/:id/items/:itemId` (P2)

**Sample:** one calculated item that has an adjustment, a loan instalment and statutory lines.

**Confirm:**
- Is the response `{ item, components, attendance_snapshot }` or a flat object?
- The full list of day codes in `attendance_snapshot.per_date[].c`. *We know `P`, `L`, `W`, `H` and `O`. Are there others, and what does `r` hold?*
- The `component.source` values actually emitted, and the engine-generated `component_code` values (e.g. `NET_PAY_SHORTFALL_CARRIED`, `CARRY_FORWARD_RECOVERY`, `ROUNDING_ADJUSTMENT`).
- Whether the statutory item fields (`pf_wage`, `pf_employee_amount`, …, `statutory_snapshot`) are included.

### 3.6 Codes we explain to HR (P1)

Please send the **complete list** of:

- **Item `error_code` values.** We know `NO_SALARY_STRUCTURE`, `EXIT_DATE_REQUIRED`, `UNKNOWN_ATTENDANCE_STATUS`, `IN_PROGRESS_AT_PERIOD_END`, `CTC_RECONCILIATION_FAILED`, `NO_BASIC_COMPONENT`, `NEGATIVE_NET_PAY`, `TAX_TABLES_MISSING`, `STATUTORY_COMPONENT_NOT_ASSIGNABLE`, `PF_SPLIT_RECONCILIATION_FAILED`, `SCHEDULE_RECONCILIATION_FAILED` and `INVALID_STATUTORY_AMOUNT`.
- **`calculation_warnings` values, and their format.** Is each warning a plain string like `LOAN_EMI_SKIPPED:<loanId>`, or an object?
- **For `EXIT_DATE_REQUIRED`:** is the inferred last working day always in `error_reason` as `YYYY-MM-DD`? *We pre-fill the date picker from it.*

### 3.7 Run eligibility: `GET /payroll/hr/runs/eligibility?period_month=2026-09` (P2)

**Sample:** a month that already has a run, and a month that doesn't.

**Confirm:**
- Is `already_run` an id string or an object?
- The fields in each `missing_structure[]` entry. Does it include a name?
- The keys in each `locked_ranges[]` entry.
- The keys in the `statutory` block.

---

## 4. Salary adjustments

| # | Type | Endpoint | Question |
|---|---|---|---|
| 4.1 | Sample (P1) | `GET /payroll/hr/adjustments?page=1&limit=20` | One row plus pagination. Does each row include the employee's name and code? Please confirm these fields: `proposed_by`, `created_by`, `approved_by`, `actioned_at`, `applied_at`, `applied_run_id`, `batch_id`, `bonus_rule_id`, `source_loan_id`, `component_code`, `rejection_reason`. Are the people's names included, or only their ids? |
| 4.2 | Confirm (P1) | `GET /payroll/hr/adjustments` | Do the `period_month`, `adjustment_type`, `category` and `batch_id` filters all work together? |
| 4.3 | Confirm (P1) | `POST /payroll/hr/adjustments` | When **no `component_id`** is sent, is `component_name` enough? Or is `component_code` required? *The form now allows a custom name without a catalog component, as the API doc example shows.* When `component_id` is sent, are the tax, PF and ESI flags from the body ignored in favour of the catalog values? |
| 4.4 | Sample (P2) | `POST /payroll/hr/adjustments` | The success response. We need to know whether `status` comes back as `pending` or `approved`, so we can show the right message. |
| 4.5 | Sample (P1) | `POST /payroll/hr/adjustments/bulk/preview` | A file with one valid row and one row of each error type. **Confirm:** the per-row keys (`line`, `employee_code`, `user_id`, `adjustment_type`, `amount`, `status`, `error_code`, error message field) and the totals keys (`total_rows`, `valid_rows`, `error_rows`, `total_earning_amount`, `total_deduction_amount`). Also send **the full list of row `error_code` values**. |
| 4.6 | Sample (P1) | `POST /payroll/hr/adjustments/bulk` | The success response. Is the new `batch_id` returned, and under which key is the count of rows created? *After saving, we filter the list to the new upload using `batch_id`.* |
| 4.7 | Sample (P2) | `POST /payroll/hr/adjustments/batches/:batchId/cancel` | The success response. What are the keys for the cancelled and skipped counts? Is "skipped" a number or a list? |
| 4.8 | Confirm (P3) | `POST /payroll/hr/adjustments/:id/cancel` | Is a reason required or accepted? *The docs don't mention one, so we send no body.* |

---

## 5. Bonus rules

The two docs disagree on these, so please confirm which is live:

| # | Type | Question |
|---|---|---|
| 5.1 | Confirm (P1) | **Field name for the calculation type.** Is it `bonus_type` (implementation plan) or `calculation_mode` (API analysis)? And which values are allowed? `flat`, `percent_of_basic`, `percent_of_gross`, and is `percent_of_ctc` supported? |
| 5.2 | Confirm (P1) | **Eligibility.** Is it `eligibility_config` with `min_tenure_months` (plan), or `eligibility_criteria` with `min_tenure_days` and `exclude_notice_period` (API analysis)? Are `employment_types` supported? *The frontend sends `eligibility_config` with `department_ids`, `user_ids` and `min_tenure_months`.* |
| 5.3 | Confirm (P2) | Are `csv_upload` and `performance_rating` accepted as eligibility sources? *They're shown as "not available yet" in the UI.* |
| 5.4 | Confirm (P2) | What is the maximum `value` for a percentage (the plan says 1000)? Can `max_amount_per_employee` be updated through `PUT`? |

| # | Type | Endpoint | Question |
|---|---|---|---|
| 5.5 | Sample (P1) | `GET /payroll/hr/bonus-rules?page=1&limit=20` | One rule plus pagination. Confirm `proposed_by`, `approved_by`, `actioned_at`, `applied_at`, `applied_count`, `applied_batch_id` and `rejection_reason`. Are names included? |
| 5.6 | Sample (P1) | `POST /payroll/hr/bonus-rules/:id/preview-impact` | Is the response `{ eligible_count, total_bonus_liability, employees[] }` (API analysis) or `{ awards[], skipped[], basis }` (plan)? Please send a sample where **at least one employee is skipped** and one amount is capped. Also send the full list of **skip reason codes** and the per-row keys (`basis_amount` / `basic_salary`, `capped`, name). |
| 5.7 | Sample (P2) | `POST /payroll/hr/bonus-rules/:id/apply` | The success response. What are the keys for the number of adjustments created and for `applied_batch_id`? |
| 5.8 | Confirm (P3) | `POST .../approve`, `.../cancel` | Is a reason required or accepted for cancel? |

---

## 6. Shared data used by these screens

| # | Type | Endpoint | Question |
|---|---|---|---|
| 6.1 | Sample (P1) | `GET /organizations/employees?purpose=emp_report` | One employee. **Which field matches the payroll `user_id`: `id` or `user_id`?** *Names shown in run items, adjustments and bonus rules are resolved from this list. If the wrong key is used, rows show "Employee not found".* Does the list include department and employee code? Is it paginated? |
| 6.2 | Sample (P2) | `GET /organizations/departments` | One department. Which key holds the id, and is the list paginated? |

---

## 7. What the frontend does today, and what changes once answered

| Area | Today (defensive) | Once answered |
|---|---|---|
| Cancel run | Sends `cancellation_reason` and `reason` | Send only the real field |
| Validation errors | Reads `details`, `errors` or `message` | Read the one real format, and highlight the exact form field |
| Error and warning codes | Known codes get plain text; unknown codes are shown prettified (e.g. "Some new code") | Every code gets a written explanation and a fix |
| "Needs attention" panel | Loads items with `status=error`, falls back to preview `error_items` | Use one source, and remove the fallback |
| Item names | Looked up from the organisation employees list | Use names from the payroll response, or the correct id key |
| Bulk, batch cancel and apply counts | Reads several possible keys, else shows a generic message | Show exact counts |
| Bonus preview | Accepts both documented shapes | Keep only the live shape |
| Bonus rule payload | Sends `bonus_type` and `eligibility_config` (plan) | Switch if the API analysis names are the live ones |

---

## 8. Other open item from the earlier HR pass

**HR tab name shows "Unknown" (Attendance Directory → HR tab).** Please send one record from `data.records`, plus the `pagination` object, from:

- `GET /attendance/hr/hrs/attendance?date=YYYY-MM-DD&page=1&limit=20`
- optionally, `GET /attendance/hr/hrs/{userId}/attendance?month=9&year=2026`

This confirms where `first_name` sits in the response.
