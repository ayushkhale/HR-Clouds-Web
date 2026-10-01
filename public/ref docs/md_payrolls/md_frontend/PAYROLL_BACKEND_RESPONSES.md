# Payroll Runs, Adjustments and Bonus Rules — Backend Answers

**From:** Backend (Payroll module)
**To:** Frontend (HR panel)
**Date:** 2026-09-14
**Answers:** `PAYROLL_BACKEND_REQUESTS.md` (2026-09-14), items 1.1 → 8
**Source of truth:** the code on `development` (routes → validators → controllers → services → repositories → models). Where the Phase 2–4 docs and the API-analysis doc disagree with the code, **the code below is what ships**. Treat this file as authoritative over both.

---

## How to read this file

1. **Every sample is built field-by-field from the response builder in the code**, in the same key order the code emits, with fake identifiers, PAN, bank and salary values. Field names, types, nesting and `null`-ability are exact. They are **not** database dumps, so the *numbers* are illustrative; the *shape* is not.
2. Where a payload contains a large JSONB blob (`settings_snapshot`, `attendance_snapshot`, `structure_snapshot`, `statutory_snapshot`), the sample shows a few representative entries and a note under the block saying what the full array/object contains. Nothing is elided inside the JSON itself except where the note says so.
3. Two response envelopes exist in this codebase. Both are shown; do not assume one.

### Envelope A — non-paginated success (every payroll endpoint except lists)

```json
{
  "success": true,
  "message": "Payroll run fetched",
  "data": { }
}
```

### Envelope B — paginated success (every payroll list endpoint)

```json
{
  "success": true,
  "message": "Payroll runs fetched",
  "data": [],
  "pagination": { "total": 0, "page": 1, "limit": 20, "total_pages": 0 }
}
```

`pagination` is a **sibling of `data`**, not inside it, on every payroll and organization list endpoint. (The one exception in the whole product is the attendance HR list in §8 — see that section.)

### Conventions that apply everywhere below

| Thing | Rule |
|---|---|
| Money | Every money field is a **Postgres `DECIMAL`** and reaches you as a **string** with 2 decimals (`"58800.00"`), never a number. `bonus_rules.value` is `DECIMAL(14,4)` → `"10.0000"`. Parse with a decimal-safe parser, not `parseFloat` for arithmetic. |
| Day counts | `DECIMAL(6,2)` → also strings (`"21.00"`), except inside `attendance_snapshot` / `day_ledger` where they are real JSON numbers (`1`, `0.5`). |
| `period_month` | `STRING(7)`, `"2026-08"`. Not a date. |
| `period_start` / `period_end` / `joining_date` / `dob` | `DATEONLY` → `"2026-08-01"`, no time, no timezone. |
| `created_at` / `updated_at` / `*_at` | ISO 8601 UTC with milliseconds: `"2026-09-01T06:12:44.318Z"`. |
| Auth | Payroll HR endpoints require role `hr` **only** plus the `payroll.access` feature. `admin` / `super-admin` are platform roles and get `403` on every payroll route. |
| Base paths | `/api/v1/payroll/hr/...`, `/api/v1/organizations/...`, `/api/v1/attendance/hr/...`. |
| Unknown query/body keys | Silently **dropped**, never rejected (see 1.3). |

---

# 1. Error response format

## 1.1 — Validation error sample (P1)

`POST /api/v1/payroll/hr/runs/:id/cancel` with body `{}`.

**HTTP 400**

```json
{
  "success": false,
  "message": "\"cancellation_reason\" is required",
  "errorCode": "VALIDATION_ERROR"
}
```

That is the whole body in production. **There is no `errors[]` array, and no `details` array on a validation error**, so **there is no field `path` you can key a form highlight off.**

Why, exactly — `src/common/utilities/validator.utils.js`:

```js
const { error, value } = schema.validate(payload, {
  abortEarly: false, allowUnknown: false, stripUnknown: true, convert: true
})
if (error) throw new AppError(400, error.details[0].message, 'VALIDATION_ERROR')
```

Joi is asked for *all* errors (`abortEarly: false`), but only **`details[0].message`** — the **first** one — is put on the `AppError`. The rest are discarded before the error middleware ever sees them. So:

- One request → **one** message, even when three fields are wrong.
- The message is Joi's default English text and always contains the offending key **in escaped double quotes**: `"\"cancellation_reason\" is required"`, `"\"amount\" must be a positive number"`, `"\"limit\" must be less than or equal to 100"`.
- A custom Joi `.messages()` override replaces that text. The two you will meet on these screens:
  - `component_code` reserved → `"component_code is reserved by the payroll engine"`
  - a bad date format → `"Date must be in YYYY-MM-DD format"`

**In non-production only** (`NODE_ENV !== 'production'`) the middleware also appends a `stack` string. Do not read it, and do not let it change your parsing — it is absent on staging/production builds.

**Practical guidance for item 7 ("highlight the exact form field"):** you can do a best-effort highlight by extracting the first `"…"` segment from `message` and matching it against your field names, but **you cannot rely on the backend to tell you every invalid field**. Keep client-side validation as the primary mechanism for field-level highlighting; treat the 400 as a last-resort banner. If you want a true multi-field contract we can add one — see Appendix B, gap G-1.

## 1.2 — Business error sample (P1)

`POST /api/v1/payroll/hr/runs/:id/approve` on a run with error items.

**HTTP 409**

```json
{
  "success": false,
  "message": "The run has error items; fix or exclude each before approving",
  "errorCode": "RUN_HAS_ERRORS"
}
```

A business error that carries structured context sets `details`, and only then does the key appear. The only payroll endpoints that do this are the two bulk-adjustment endpoints:

**HTTP 422** — `POST /adjustments/bulk/preview` with a malformed CSV

```json
{
  "success": false,
  "message": "The CSV could not be parsed",
  "errorCode": "CSV_PARSE_FAILED",
  "details": {
    "errors": [
      { "line": 4, "message": "Row has 5 fields, expected 6" },
      { "line": 9, "message": "Unterminated quoted field" }
    ]
  }
}
```

**HTTP 422** — `POST /adjustments/bulk` (commit) when any row is invalid

```json
{
  "success": false,
  "message": "3 row(s) failed validation; nothing was saved",
  "errorCode": "BULK_VALIDATION_FAILED",
  "details": {
    "errors": [
      { "line": 4, "error_code": "EMPLOYEE_NOT_FOUND" },
      { "line": 7, "error_code": "RESERVED_COMPONENT_CODE" },
      { "line": 12, "error_code": "NEGATIVE_MONEY" }
    ]
  }
}
```

Note the two `details.errors[]` shapes differ: the parse failure carries `message`, the validation failure carries `error_code`. Everywhere else `details` is **absent**, not `null`.

**Canonical error contract** — this is the complete set of keys the error middleware can emit (`src/common/middlewares/error.middleware.js`):

```ts
{
  success: false          // always
  message: string         // always, human-readable, safe to show
  errorCode: string       // always; 'INTERNAL_ERROR' when unmapped
  details?: object        // only on CSV_PARSE_FAILED / BULK_VALIDATION_FAILED
  stack?: string          // non-production builds only
}
```

Recommended client rule: `errorCode` drives your message table, `message` is the fallback, `details.errors` is read **only** for the two bulk codes.

## 1.3 — `stripUnknown` (P1)

**Yes.** Every payroll route validates through the same `validateOrThrow`, which is hard-coded to `stripUnknown: true`, and the route wrapper reassigns the stripped value back onto the request:

```js
const validate = (schema, source = 'body') => (req, res, next) => {
  req[source] = validateOrThrow(schema, req[source])   // req.body is REPLACED
  next()
}
```

So the extra `reason` you currently send on cancel is **removed before the controller runs**. It is not rejected and it is not persisted. You are safe today, and you are also safe to remove it (please do — see 2.1).

One caveat worth knowing: `allowUnknown: false` combined with `stripUnknown: true` means unknown keys are stripped *rather than* rejected — `stripUnknown` wins. This holds for **body, params and query** on every payroll endpoint.

## 1.4 — The `errorCode` catalogue (P1)

### First: your 17 guesses, adjudicated

| Code you listed | Verdict | Use instead / notes |
|---|---|---|
| `RUN_NOT_CALCULABLE` | ✅ exists | 409. Only for a **cancelled** run sent to `/calculate`. |
| `RUN_NOT_CANCELLABLE` | ✅ exists | 409. `"Only an approved, unpaid run can be cancelled"`. |
| `RUN_NOT_APPROVED` | ❌ **does not exist** | Approving a non-`calculated` run → **`RUN_NOT_APPROVABLE`** (409). |
| `RUN_ALREADY_PAID` | ❌ **does not exist** | Paying a non-`approved` run (including an already-paid one) → **`RUN_NOT_PAYABLE`** (409). Recalculating a paid/approved run → **`RUN_IMMUTABLE`** (409). |
| `RUN_TOTALS_DRIFTED` | ✅ exists | 409. |
| `PERIOD_PARTIALLY_LOCKED` | ✅ exists | 409. The message embeds the conflicting ranges. |
| `CANCELLATION_REASON_REQUIRED` | ❌ **does not exist** | It is a Joi failure → **`VALIDATION_ERROR`** (400). |
| `EXCLUSION_REASON_REQUIRED` | ❌ **does not exist** | → **`VALIDATION_ERROR`** (400). |
| `PERIOD_OVERRIDE_REASON_REQUIRED` | ❌ **does not exist** | → **`VALIDATION_ERROR`** (400). |
| `PERIOD_OUTSIDE_RUN` | ❌ **does not exist** | → **`INVALID_PERIOD_OVERRIDE`** (422), three distinct messages (see 2.4). |
| `ITEM_NOT_FOUND` | ❌ **does not exist** | → **`RUN_ITEM_NOT_FOUND`** (404). |
| `RUN_NOT_FOUND` | ✅ exists | 404. |
| `ADJUSTMENT_NOT_FOUND` | ✅ exists | 404. |
| `BATCH_NOT_FOUND` | ✅ exists | 404. |
| `BONUS_RULE_NOT_FOUND` | ✅ exists | 404. |
| `RULE_NOT_APPROVED` | ❌ **does not exist** | Apply on a non-approved rule → **`RULE_NOT_APPLICABLE`** (409). Preview-impact on a rejected/cancelled rule → **`RULE_NOT_PREVIEWABLE`** (409). |
| `RULE_NOT_EDITABLE` | ✅ exists | 409, on `PUT /bonus-rules/:id`. |

**8 of your 17 guesses are not real codes.** Please delete those branches; today they are dead and the real code falls through to your "prettified unknown code" path, which is exactly the user-facing bug you were trying to prevent.

### Complete catalogue, by endpoint

Every endpoint below can additionally return `VALIDATION_ERROR` (400), `UNAUTHORIZED`/`FORBIDDEN` (401/403, from auth), and `INTERNAL_ERROR` (500). Those are omitted from each row.

**Run lifecycle**

| Endpoint | Codes |
|---|---|
| `GET /runs` | — |
| `POST /runs` | `DUPLICATE_RUN` (409), `TAX_TABLES_MISSING` (422) |
| `GET /runs/eligibility` | — |
| `GET /runs/:id` | `RUN_NOT_FOUND` (404) |
| `POST /runs/:id/calculate` | `RUN_NOT_FOUND` (404), `RUN_IMMUTABLE` (409), `RUN_NOT_CALCULABLE` (409), `RUN_CALCULATION_IN_PROGRESS` (409), `TAX_TABLES_MISSING` (422), `ITEM_PERSIST_FAILED` (500), `CALCULATION_FAILED` (500) |
| `GET /runs/:id/preview` | `RUN_NOT_FOUND` (404) |
| `GET /runs/:id/items` | `RUN_NOT_FOUND` (404) |
| `GET /runs/:id/items/:itemId` | `RUN_NOT_FOUND` (404), `RUN_ITEM_NOT_FOUND` (404) |
| `POST /runs/:id/items/:itemId/exclude` | `RUN_NOT_FOUND`, `RUN_ITEM_NOT_FOUND` (404), `RUN_CALCULATION_IN_PROGRESS` (409), `RUN_IMMUTABLE` (409) |
| `POST /runs/:id/items/:itemId/include` | the four above **+ `ITEM_NOT_EXCLUDED`** (409) |
| `PATCH /runs/:id/items/:itemId/period` | the four above **+ `INVALID_PERIOD_OVERRIDE`** (422) |
| `POST /runs/:id/approve` | `RUN_NOT_FOUND` (404), `RUN_NOT_APPROVABLE` (409), `RUN_STALE` (409), `RUN_HAS_ERRORS` (409), `RUN_TOTALS_DRIFTED` (409), `PERIOD_PARTIALLY_LOCKED` (409), `LOAN_INSTALLMENT_ALREADY_DEDUCTED` (409), `ADJUSTMENT_ALREADY_APPLIED` (409), `REIMBURSEMENT_ALREADY_APPLIED` (409) |
| `POST /runs/:id/cancel` | `RUN_NOT_FOUND` (404), `RUN_NOT_CANCELLABLE` (409) |
| `POST /runs/:id/pay` | `RUN_NOT_FOUND` (404), `RUN_NOT_PAYABLE` (409) |

**Adjustments**

| Endpoint | Codes |
|---|---|
| `POST /adjustments` | `FORBIDDEN` (403), `EMPLOYEE_NOT_FOUND` (404), `COMPONENT_NOT_FOUND_OR_INACTIVE` (422), `RUN_CALCULATION_IN_PROGRESS` (409), `PERIOD_CLOSED_FOR_ADJUSTMENT` (422), `INVALID_ADJUSTMENT_AMOUNT` (422) |
| `GET /adjustments`, `GET /adjustments/:id` | `ADJUSTMENT_NOT_FOUND` (404) on the detail route |
| `POST /adjustments/:id/approve` | `ADJUSTMENT_NOT_FOUND` (404), `PROPOSAL_NOT_PENDING` (409), `PROPOSAL_SCOPE_STALE` (409), `SEPARATE_CHECKER_REQUIRED` (403), `FORBIDDEN` (403), `RUN_CALCULATION_IN_PROGRESS` (409), `PERIOD_CLOSED_FOR_ADJUSTMENT` (422) |
| `POST /adjustments/:id/reject` | `ADJUSTMENT_NOT_FOUND` (404), `PROPOSAL_NOT_PENDING` (409), `FORBIDDEN` (403) |
| `POST /adjustments/:id/cancel` | `ADJUSTMENT_NOT_FOUND` (404), `FORBIDDEN` (403), plus a 409 when the row is already applied |
| `POST /adjustments/bulk/preview` | `CSV_PARSE_FAILED` (422, **with `details`**), `CSV_MISSING_IDENTITY_COLUMN` (422), `CSV_EMPTY` (422), `BULK_ROW_LIMIT_EXCEEDED` (422) |
| `POST /adjustments/bulk` | all of the preview codes **+ `BULK_VALIDATION_FAILED`** (422, **with `details`**), `RUN_CALCULATION_IN_PROGRESS` (409), `PERIOD_CLOSED_FOR_ADJUSTMENT` (422) |
| `POST /adjustments/batches/:batchId/cancel` | `BATCH_NOT_FOUND` (404) |

**Bonus rules**

| Endpoint | Codes |
|---|---|
| `POST /bonus-rules` | `COMPONENT_NOT_FOUND_OR_INACTIVE` (422), `BONUS_TARGETS_REQUIRED` (422), `ELIGIBILITY_SOURCE_NOT_PERMITTED` (403, manager plane only) |
| `GET /bonus-rules`, `GET /bonus-rules/:id` | `BONUS_RULE_NOT_FOUND` (404) on the detail route |
| `PUT /bonus-rules/:id` | `BONUS_RULE_NOT_FOUND` (404), `RULE_NOT_EDITABLE` (409), `COMPONENT_NOT_FOUND_OR_INACTIVE` (422) |
| `POST /bonus-rules/:id/approve` | `BONUS_RULE_NOT_FOUND` (404), `PROPOSAL_NOT_PENDING` (409), `PROPOSAL_SCOPE_STALE` (409), `FORBIDDEN` (403) |
| `POST /bonus-rules/:id/reject` | `BONUS_RULE_NOT_FOUND` (404), `PROPOSAL_NOT_PENDING` (409) |
| `POST /bonus-rules/:id/preview-impact` | `BONUS_RULE_NOT_FOUND` (404), `RULE_NOT_PREVIEWABLE` (409) |
| `POST /bonus-rules/:id/apply` | `BONUS_RULE_NOT_FOUND` (404), `RULE_NOT_APPLICABLE` (409), `RULE_ALREADY_APPLIED` (409), `RULE_NO_ELIGIBLE_EMPLOYEES` (422), `ELIGIBILITY_SOURCE_UNAVAILABLE` (422), `RUN_CALCULATION_IN_PROGRESS` (409), `PERIOD_CLOSED_FOR_ADJUSTMENT` (422) |
| `POST /bonus-rules/:id/cancel` | `BONUS_RULE_NOT_FOUND` (404), `RULE_NOT_CANCELLABLE` (409) |

**Two codes you have not seen but will hit**, because they come from the shared period guard on *every* write that touches a period that already has a run:

- `RUN_CALCULATION_IN_PROGRESS` (409) — *"A calculation is in progress; try again shortly."* Correct UX: disable the action and retry, do not show a hard failure.
- `PERIOD_CLOSED_FOR_ADJUSTMENT` (422) — message is `"Payroll for 2026-08 is already approved; ..."`. The month is closed; HR must cancel the run first.

Anything else that reaches a period which merely has a `draft`/`calculated` run silently sets `requires_recalculation = true` on that run — no error, but the run header will come back with `requires_recalculation: true` and approval will be refused with `RUN_STALE` until it is recalculated. Surface that flag prominently.

---

# 2. Payroll run actions

## 2.1 — Cancel body field (P1)

**`cancellation_reason`. Only that.** `reason` is stripped and ignored.

```js
const cancelRunSchema = Joi.object({
  cancellation_reason: Joi.string().trim().min(1).max(1000).required()
})
```

- Required.
- **Trimmed** before length checks, so `"   "` fails with `"\"cancellation_reason\" is not allowed to be empty"`.
- **Min 1, max 1000** characters. Enforce `maxlength=1000` on the textarea.
- It is persisted verbatim to `payroll_runs.cancellation_reason` and echoed on the run header afterwards, and it is also written to the audit log.

Please drop the dual-send.

## 2.2 — Cancel is `approved`-only (P1)

**Confirmed.** The guard is:

```js
if (run.status !== 'approved' || run.paid_at) {
  throw new AppError(409, 'Only an approved, unpaid run can be cancelled', 'RUN_NOT_CANCELLABLE')
}
```

| Run status | `POST /cancel` |
|---|---|
| `draft` | **409 `RUN_NOT_CANCELLABLE`** |
| `calculating` | 409 `RUN_NOT_CANCELLABLE` |
| `calculated` | **409 `RUN_NOT_CANCELLABLE`** |
| `approved`, not paid | ✅ 200 |
| `approved` with `paid_at` set / `paid` | 409 `RUN_NOT_CANCELLABLE` |
| `failed`, `cancelled` | 409 `RUN_NOT_CANCELLABLE` |

**There is no "discard draft" endpoint.** A `draft` or `calculated` run cannot be removed through the API at all. If HR needs to start over, the supported path is to **recalculate** it (`POST /calculate` is allowed from `draft`, `calculated` and `failed`). Please hide the Cancel action unless `status === 'approved' && paid_at === null`, rather than showing it and letting the 409 explain.

Cancel is not a soft no-op: it reverses the committed variable pay (loan installments go back to `scheduled`, adjustments are un-applied), and it releases the attendance period lock **only if this run created it** (`lock_reused === false`). Word the confirmation dialog accordingly.

## 2.3 — Is calculate synchronous? (P2)

**Fully synchronous.** There is no queue, no worker and no job id. The HTTP request returns only after the engine has processed every employee, persisted every item, and re-derived the header totals from the persisted rows. The status is already `calculated` in the response body.

Implications for your 8–10 s polling loop:

- **Remove the poll.** The response *is* the finished run.
- **Raise the client timeout.** This is an O(headcount) synchronous call: it aggregates attendance, leave, loans, adjustments, reimbursements, benefits and statutory tables in cohorts of 200 and writes back in one transaction per cohort. For a few hundred employees expect seconds; for a few thousand, tens of seconds. Set the timeout for this one call to at least 120 s and show a blocking progress state.
- **Do not send it twice.** A second concurrent call is rejected with **409 `RUN_CALCULATION_IN_PROGRESS`** (the run is claimed into `calculating` under an advisory lock). Disable the button for the duration.
- `calculating` **is** observable — but only by another reader (a second browser tab, or a `GET /runs/:id` issued while the first call is in flight). If you ever show `calculating`, poll `GET /runs/:id`, not `/calculate`. A crashed calculation that left a stale `calculating` is auto-reclaimed by the next `/calculate` after the staleness window.
- If the engine throws, the run is flipped to `failed` with `failure_reason` set, **and the HTTP call still returns an error** (the original error, e.g. 500 `CALCULATION_FAILED` or 422 `TAX_TABLES_MISSING`). So a `failed` run is visible both ways.

**Response body: the complete, updated run header row** (same shape as `GET /runs/:id`), with `status: "calculated"`, `calculated_at` set, `requires_recalculation: false` and all eight counters/totals refreshed.

```json
{
  "success": true,
  "message": "Payroll run calculated",
  "data": {
    "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "period_month": "2026-08",
    "period_start": "2026-08-01",
    "period_end": "2026-08-31",
    "run_type": "regular",
    "status": "calculated",
    "engine_version": 5,
    "requires_recalculation": false,
    "settings_snapshot": { "payroll_cycle": "monthly", "lop_basis": "standard_working_days", "net_pay_rounding": "nearest_ten", "negative_net_handling": "clamp_and_carry", "benefit_deductions_enabled": true, "statutory": { "config": {}, "pt_slabs": [], "tax": { "regimes": [], "slabs": [] } } },
    "total_employees": 42,
    "processed_count": 40,
    "error_count": 1,
    "excluded_count": 1,
    "total_gross": "2184500.00",
    "total_deductions": "312750.00",
    "total_net": "1871750.00",
    "total_employer_cost": "2265400.00",
    "lock_period_id": null,
    "lock_reused": null,
    "calculation_started_at": "2026-09-01T06:12:44.318Z",
    "calculated_at": "2026-09-01T06:13:09.774Z",
    "approved_by": null,
    "approved_at": null,
    "paid_by": null,
    "paid_at": null,
    "cancelled_by": null,
    "cancelled_at": null,
    "cancellation_reason": null,
    "failure_reason": null,
    "notes": "August regular payroll",
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-09-01T05:58:02.001Z",
    "updated_at": "2026-09-01T06:13:09.780Z",
    "deleted_at": null
  }
}
```

`settings_snapshot` above is shown with only the keys you are most likely to display. The full object is the frozen engine configuration: `payroll_cycle`, `period_start_day`, `attendance_cutoff_day`, `pay_day`, `pay_day_in_next_month`, `currency`, `financial_year_start_month`, `lop_basis`, `net_pay_rounding`, `in_progress_treatment`, `overtime_payable`, `overtime_rate_multiplier`, `overtime_hourly_basis`, `standard_working_hours_per_day`, `negative_net_handling`, `default_tax_regime`, `pt_state_source`, `tds_monthly_rounding`, `benefit_deductions_enabled`, `reimbursement_payout_lookahead_months`, plus a `statutory` sub-object carrying the frozen statutory config row, the PT slab set and the financial year's tax regimes and slabs. It can be several KB. **Treat it as opaque** unless you need a specific knob; it is frozen at CREATE and never changes for the life of the run.

## 2.4 — `PATCH /runs/:id/items/:itemId/period` (P2)

Schema:

```js
const setItemPeriodSchema = Joi.object({
  period_start: dateOnly,                    // optional
  period_end: dateOnly,                      // optional
  period_override_reason: Joi.string().trim().min(1).max(1000).required()
}).or('period_start', 'period_end')
```

| Question | Answer |
|---|---|
| Accepts both? | Yes. |
| Is either optional? | Yes, **each is individually optional, but at least one must be present** (`.or`). Sending only `period_override_reason` fails with `VALIDATION_ERROR`: `"\"value\" must contain at least one of [period_start, period_end]"`. |
| Is the reason optional? | **No — always required**, 1–1000 chars, trimmed. |
| Must both dates fall inside the run's month? | **Yes**, inclusive of both endpoints. |
| Format | `YYYY-MM-DD` exactly; anything else → `VALIDATION_ERROR` `"Date must be in YYYY-MM-DD format"`. |

An omitted bound **defaults to the run's own bound** for validation and stays at the run boundary. Three distinct 422 `INVALID_PERIOD_OVERRIDE` messages:

| Condition | `message` |
|---|---|
| `period_start` outside `[run.period_start, run.period_end]` | `"period_start must fall within the run period"` |
| `period_end` outside `[run.period_start, run.period_end]` | `"period_end must fall within the run period"` |
| `period_start > period_end` | `"period_start cannot be after period_end"` |

All three carry the same `errorCode`, so **use `message` to pick which field to flag**, not the code.

Also note, for all three item mutations (`exclude`, `include`, `period`):

- Allowed only while the run is `draft` or `calculated`; otherwise 409 `RUN_IMMUTABLE`, and 409 `RUN_CALCULATION_IN_PROGRESS` while calculating.
- **Every successful mutation sets `requires_recalculation: true` on the run header.** The response body is the updated *item*, not the run, so the header flag you hold in state is now stale — refetch `GET /runs/:id` (or set the flag locally) and show the "Recalculate required" banner. Approval will be refused with `RUN_STALE` until then.
- A period override is what makes an `EXIT_DATE_REQUIRED` item calculable, and it survives recalculation (it is HR-owned, keyed off `period_override_reason` being non-null).

## 2.5 — Approve / pay / cancel success samples (P3)

**All three return the complete, updated run header** — the same object shape as `GET /runs/:id`. No wrapper sub-object, no partial row.

**`POST /runs/:id/approve`** → 200

```json
{
  "success": true,
  "message": "Payroll run approved",
  "data": {
    "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "period_month": "2026-08",
    "period_start": "2026-08-01",
    "period_end": "2026-08-31",
    "run_type": "regular",
    "status": "approved",
    "engine_version": 5,
    "requires_recalculation": false,
    "settings_snapshot": {},
    "total_employees": 42,
    "processed_count": 41,
    "error_count": 0,
    "excluded_count": 1,
    "total_gross": "2184500.00",
    "total_deductions": "312750.00",
    "total_net": "1871750.00",
    "total_employer_cost": "2265400.00",
    "lock_period_id": "5b5b5b5b-0000-4000-8000-00000000001f",
    "lock_reused": false,
    "calculation_started_at": "2026-09-01T06:12:44.318Z",
    "calculated_at": "2026-09-01T06:13:09.774Z",
    "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "approved_at": "2026-09-02T04:20:11.006Z",
    "paid_by": null,
    "paid_at": null,
    "cancelled_by": null,
    "cancelled_at": null,
    "cancellation_reason": null,
    "failure_reason": null,
    "notes": "August regular payroll",
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-09-01T05:58:02.001Z",
    "updated_at": "2026-09-02T04:20:11.012Z",
    "deleted_at": null
  }
}
```

**`POST /runs/:id/pay`** → 200, `message: "Payroll run marked as paid"`, same shape with:

```json
{ "status": "paid", "paid_by": "9f8e7d6c-0000-4000-8000-00000000000a", "paid_at": "2026-09-03T09:05:44.201Z" }
```

**`POST /runs/:id/cancel`** → 200, `message: "Payroll run cancelled"`, same shape with:

```json
{
  "status": "cancelled",
  "cancelled_by": "9f8e7d6c-0000-4000-8000-00000000000a",
  "cancelled_at": "2026-09-02T11:41:03.559Z",
  "cancellation_reason": "Attendance corrections received for two departments after approval"
}
```

Note `lock_period_id` / `lock_reused`: approve creates the attendance period lock (`lock_reused: false`) or adopts an existing covering lock (`lock_reused: true`, and then cancel leaves it alone). Neither field is cleared by cancel — the run keeps the historical record.

---

# 3. Payroll run reads

## 3.1 — `GET /runs` (P1)

`GET /api/v1/payroll/hr/runs?page=1&limit=10&status=calculated`

```json
{
  "success": true,
  "message": "Payroll runs fetched",
  "data": [
    {
      "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "period_month": "2026-08",
      "period_start": "2026-08-01",
      "period_end": "2026-08-31",
      "run_type": "regular",
      "status": "calculated",
      "engine_version": 5,
      "requires_recalculation": false,
      "settings_snapshot": {},
      "total_employees": 42,
      "processed_count": 40,
      "error_count": 1,
      "excluded_count": 1,
      "total_gross": "2184500.00",
      "total_deductions": "312750.00",
      "total_net": "1871750.00",
      "total_employer_cost": "2265400.00",
      "lock_period_id": null,
      "lock_reused": null,
      "calculation_started_at": "2026-09-01T06:12:44.318Z",
      "calculated_at": "2026-09-01T06:13:09.774Z",
      "approved_by": null,
      "approved_at": null,
      "paid_by": null,
      "paid_at": null,
      "cancelled_by": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "failure_reason": null,
      "notes": "August regular payroll",
      "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "created_at": "2026-09-01T05:58:02.001Z",
      "updated_at": "2026-09-01T06:13:09.780Z",
      "deleted_at": null
    }
  ],
  "pagination": { "total": 7, "page": 1, "limit": 10, "total_pages": 1 }
}
```

**Confirmations:**

- Pagination keys are **`total`, `page`, `limit`, `total_pages`** — snake_case. There is **no `totalPages`** anywhere in this codebase. `total_pages = Math.ceil(total / limit)`, so it is `0` when `total` is `0`.
- `page` and `limit` echo the **effective** values after Joi defaults, not what you sent. `page` default `1`, `limit` default `20`, **max `limit` 100**. `limit=101` → 400 `VALIDATION_ERROR`.
- **`status` accepts exactly one value.** `Joi.string().valid(...)` — not an array, not a CSV. `?status=calculated,approved` → 400. Valid values: `draft`, `calculating`, `calculated`, `approved`, `paid`, `cancelled`, `failed`. Omit the key for "all".
- Other filters: `period_month` (`YYYY-MM`), `run_type` (`regular`, `off_cycle`, `arrear`, `final_settlement`). All filters AND together.
- **Ordering is fixed**: `period_month DESC, created_at DESC`. There is no sort parameter.
- `settings_snapshot` is returned in **full** on every list row. It is the single largest thing on this response; if list performance matters to you, say so and we will add an `attributes` projection (Appendix B, G-6).
- Runs are soft-deleted (`paranoid`), so `deleted_at` is present and always `null` on anything you can see.

## 3.2 — `GET /runs/:id` (P1)

**Every field you listed is returned.** All 30 columns of the row are returned unconditionally — there is no sparse projection, no field is dropped when null, and no extra computed field is added.

| Field you read | Returned | Type / notes |
|---|---|---|
| `error_count`, `excluded_count`, `processed_count`, `total_employees` | ✅ | `INTEGER` (real JSON numbers) |
| `requires_recalculation` | ✅ | `BOOLEAN` |
| `calculation_started_at`, `calculated_at` | ✅ | ISO string or `null` |
| `failure_reason` | ✅ | string or `null`; set only on `failed` |
| `period_start`, `period_end` | ✅ | `"YYYY-MM-DD"` |
| `total_gross`, `total_deductions`, `total_net`, `total_employer_cost` | ✅ | **DECIMAL strings** |
| `approved_at`, `paid_at`, `cancelled_at` | ✅ | ISO string or `null` |
| `cancellation_reason` | ✅ | string or `null` |
| `notes` | ✅ | string or `null` |

Plus these, which you did not list but should use: `status`, `run_type`, `engine_version`, `period_month`, `settings_snapshot`, `lock_period_id`, `lock_reused`, `approved_by`, `paid_by`, `cancelled_by`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `org_id`, `id`.

> **`approved_by` / `paid_by` / `cancelled_by` / `created_by` are bare user UUIDs. No name, no email, no embedded actor object.** To render "Approved by Kavya Iyer" you must resolve them yourself from the org employees list (§6.1). This is gap G-2.

### (a) `calculated` run with ≥1 error item and ≥1 excluded item

```json
{
  "success": true,
  "message": "Payroll run fetched",
  "data": {
    "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "period_month": "2026-08",
    "period_start": "2026-08-01",
    "period_end": "2026-08-31",
    "run_type": "regular",
    "status": "calculated",
    "engine_version": 5,
    "requires_recalculation": false,
    "settings_snapshot": {},
    "total_employees": 42,
    "processed_count": 40,
    "error_count": 1,
    "excluded_count": 1,
    "total_gross": "2184500.00",
    "total_deductions": "312750.00",
    "total_net": "1871750.00",
    "total_employer_cost": "2265400.00",
    "lock_period_id": null,
    "lock_reused": null,
    "calculation_started_at": "2026-09-01T06:12:44.318Z",
    "calculated_at": "2026-09-01T06:13:09.774Z",
    "approved_by": null,
    "approved_at": null,
    "paid_by": null,
    "paid_at": null,
    "cancelled_by": null,
    "cancelled_at": null,
    "cancellation_reason": null,
    "failure_reason": null,
    "notes": "August regular payroll",
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-09-01T05:58:02.001Z",
    "updated_at": "2026-09-01T06:13:09.780Z",
    "deleted_at": null
  }
}
```

**Counter arithmetic, which the screens should rely on:** `total_employees = processed_count + error_count + excluded_count`. Here `42 = 40 + 1 + 1`. All four are recomputed from the persisted items at the end of every calculation — never from memory — and re-verified at approve (a mismatch is `RUN_TOTALS_DRIFTED`). The money totals cover **`calculated` items only**; error and excluded items contribute zero.

### (b) `failed` run

```json
{
  "success": true,
  "message": "Payroll run fetched",
  "data": {
    "id": "c0ffee00-1111-4222-8333-4444aaaa0002",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "period_month": "2026-07",
    "period_start": "2026-07-01",
    "period_end": "2026-07-31",
    "run_type": "regular",
    "status": "failed",
    "engine_version": 5,
    "requires_recalculation": false,
    "settings_snapshot": {},
    "total_employees": 0,
    "processed_count": 0,
    "error_count": 0,
    "excluded_count": 0,
    "total_gross": "0.00",
    "total_deductions": "0.00",
    "total_net": "0.00",
    "total_employer_cost": "0.00",
    "lock_period_id": null,
    "lock_reused": null,
    "calculation_started_at": "2026-08-01T05:40:12.884Z",
    "calculated_at": null,
    "approved_by": null,
    "approved_at": null,
    "paid_by": null,
    "paid_at": null,
    "cancelled_by": null,
    "cancelled_at": null,
    "cancellation_reason": null,
    "failure_reason": "Income tax is enabled but no active tax regime or slabs exist for financial year 2026-2027. Bootstrap the year (POST /tax/bootstrap) before creating this run.",
    "notes": null,
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-08-01T05:39:58.470Z",
    "updated_at": "2026-08-01T05:40:13.002Z",
    "deleted_at": null
  }
}
```

Notes on `failed`:

- `failure_reason` is the **`message`** of the error that killed the run, **truncated to 1000 characters**. It is *not* an error code. The code is only in the audit log. If you want the code on the header, that is gap G-3.
- `calculated_at` stays `null`; `calculation_started_at` is set.
- Counters and totals hold whatever the last successful finalisation left — `0` if the run never completed once. A run that fails on a *re*calculation keeps the previous run's counters.
- A `failed` run **is recalculable**: `POST /calculate` is accepted and will move it back to `calculated` if the cause is fixed. Keep the Recalculate button enabled on `failed`.

### (c) `cancelled` run

```json
{
  "success": true,
  "message": "Payroll run fetched",
  "data": {
    "id": "c0ffee00-1111-4222-8333-4444aaaa0003",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "period_month": "2026-06",
    "period_start": "2026-06-01",
    "period_end": "2026-06-30",
    "run_type": "regular",
    "status": "cancelled",
    "engine_version": 5,
    "requires_recalculation": false,
    "settings_snapshot": {},
    "total_employees": 41,
    "processed_count": 41,
    "error_count": 0,
    "excluded_count": 0,
    "total_gross": "2103000.00",
    "total_deductions": "298400.00",
    "total_net": "1804600.00",
    "total_employer_cost": "2179900.00",
    "lock_period_id": "5b5b5b5b-0000-4000-8000-00000000001c",
    "lock_reused": false,
    "calculation_started_at": "2026-07-01T05:12:00.110Z",
    "calculated_at": "2026-07-01T05:12:31.902Z",
    "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "approved_at": "2026-07-02T03:44:18.220Z",
    "paid_by": null,
    "paid_at": null,
    "cancelled_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "cancelled_at": "2026-07-02T11:41:03.559Z",
    "cancellation_reason": "Attendance corrections received for two departments after approval",
    "failure_reason": null,
    "notes": null,
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-07-01T05:11:40.005Z",
    "updated_at": "2026-07-02T11:41:03.566Z",
    "deleted_at": null
  }
}
```

A cancelled run retains its totals and its `approved_by`/`approved_at` — it is a historical record. It is terminal: no calculate, no approve, no pay.

## 3.3 — `GET /runs/:id/items` (P1)

`GET /api/v1/payroll/hr/runs/:id/items?page=1&limit=20&status=error`

### Confirmations first (these matter more than the sample)

| Question | Answer |
|---|---|
| Does each row include `error_code`, `error_reason`, `exclusion_reason`, `period_override_reason`, `calculation_warnings`? | **Yes, all five, on every row**, `null` where not applicable. |
| Does each row include name / employee code / department? | **No. None of the three.** The row carries `user_id` only. There is no association include on this query. You must keep resolving from §6.1. This is gap G-2. |
| Does `status=error` return all error items at `limit=100`? | Only if there are ≤100. It is a normal paginated query. |
| Max `limit`? | **200** on this endpoint (not 100 — this is the one payroll list with a higher cap). Default `50`. `limit=201` → 400. |
| Filters | `status` (single value: `pending`\|`calculated`\|`error`\|`excluded`), `user_id`, `department_id`. All AND together. `department_id` resolves to that department's members; an empty department correctly returns `total: 0`. |
| Ordering | Fixed `created_at ASC`. No sort parameter. Because items are UPSERTed on `(run_id, user_id)`, `created_at` is stable across recalculations — the row order does not shuffle when HR recalculates. |
| Are components included? | **No.** Component lines come only from the item-detail endpoint (§3.5). |

**For the "needs attention" panel: use `GET /runs/:id/items?status=error&limit=200` and drop the preview fallback.** The preview's `error_items[]` is a summary and, critically, **carries no item id** — so you cannot deep-link from it to the item detail or to the exclude/period actions. The items list is the correct single source. Paginate if `pagination.total > 200`.

### Sample — three rows, one of each kind

Sent as three separate requests in reality (the `status` filter takes one value); shown together here for compactness. Pagination shown is for the unfiltered call.

```json
{
  "success": true,
  "message": "Payroll run items fetched",
  "data": [
    {
      "id": "11aa0001-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "run_id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
      "status": "calculated",
      "period_start": "2026-08-01",
      "period_end": "2026-08-31",
      "period_override_reason": null,
      "payable_days": "21.00",
      "lop_days": "0.00",
      "paid_non_working_days": "10.00",
      "standard_working_days": "21.00",
      "calendar_days": "31.00",
      "lop_divisor": "21.00",
      "gross_earnings": "68000.00",
      "lop_amount": "0.00",
      "total_deductions": "9200.00",
      "total_employer_contributions": "1800.00",
      "net_pay": "58800.00",
      "ctc_cost": "69800.00",
      "overtime_minutes": 240,
      "overtime_amount": "1000.00",
      "structure_snapshot": {},
      "attendance_snapshot": {},
      "statutory_status": "applied",
      "calculation_warnings": ["LOAN_EMI_SKIPPED:7a1c2b3d-0000-4000-8000-00000000000f"],
      "carry_forward_in": "0.00",
      "carry_forward_out": "0.00",
      "error_code": null,
      "error_reason": null,
      "exclusion_reason": null,
      "excluded_by": null,
      "calculated_at": "2026-09-01T06:13:07.220Z",
      "pf_wage": "15000.00",
      "esi_wage": "0.00",
      "taxable_earnings": "68000.00",
      "esi_covered": false,
      "pf_employee_amount": "1800.00",
      "pf_employer_amount": "1050.00",
      "eps_amount": "750.00",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "200.00",
      "income_tax_amount": "4200.00",
      "statutory_snapshot": {},
      "reimbursement_amount": "0.00",
      "benefit_employee_amount": "0.00",
      "benefit_employer_amount": "0.00",
      "created_at": "2026-09-01T06:13:07.220Z",
      "updated_at": "2026-09-01T06:13:07.220Z"
    },
    {
      "id": "11aa0002-0000-4000-8000-000000000002",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "run_id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "user_id": "22222222-aaaa-4bbb-8ccc-000000000002",
      "status": "error",
      "period_start": "2026-08-01",
      "period_end": "2026-08-31",
      "period_override_reason": null,
      "payable_days": "0.00",
      "lop_days": "0.00",
      "paid_non_working_days": "0.00",
      "standard_working_days": "0.00",
      "calendar_days": "0.00",
      "lop_divisor": "0.00",
      "gross_earnings": "0.00",
      "lop_amount": "0.00",
      "total_deductions": "0.00",
      "total_employer_contributions": "0.00",
      "net_pay": "0.00",
      "ctc_cost": "0.00",
      "overtime_minutes": 0,
      "overtime_amount": "0.00",
      "structure_snapshot": null,
      "attendance_snapshot": null,
      "statutory_status": "not_applied",
      "calculation_warnings": null,
      "carry_forward_in": "0.00",
      "carry_forward_out": "0.00",
      "error_code": "EXIT_DATE_REQUIRED",
      "error_reason": "Employee appears inactive with employment evidence in the period. Inferred last working day: 2026-08-14. Set the exit date via a period override (#47) or exclude the item.",
      "exclusion_reason": null,
      "excluded_by": null,
      "calculated_at": null,
      "pf_wage": "0.00",
      "esi_wage": "0.00",
      "taxable_earnings": "0.00",
      "esi_covered": false,
      "pf_employee_amount": "0.00",
      "pf_employer_amount": "0.00",
      "eps_amount": "0.00",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "0.00",
      "income_tax_amount": "0.00",
      "statutory_snapshot": null,
      "reimbursement_amount": "0.00",
      "benefit_employee_amount": "0.00",
      "benefit_employer_amount": "0.00",
      "created_at": "2026-09-01T06:13:07.311Z",
      "updated_at": "2026-09-01T06:13:07.311Z"
    },
    {
      "id": "11aa0003-0000-4000-8000-000000000003",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "run_id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "user_id": "33333333-aaaa-4bbb-8ccc-000000000003",
      "status": "excluded",
      "period_start": "2026-08-01",
      "period_end": "2026-08-31",
      "period_override_reason": null,
      "payable_days": "0.00",
      "lop_days": "0.00",
      "paid_non_working_days": "0.00",
      "standard_working_days": "0.00",
      "calendar_days": "0.00",
      "lop_divisor": "0.00",
      "gross_earnings": "0.00",
      "lop_amount": "0.00",
      "total_deductions": "0.00",
      "total_employer_contributions": "0.00",
      "net_pay": "0.00",
      "ctc_cost": "0.00",
      "overtime_minutes": 0,
      "overtime_amount": "0.00",
      "structure_snapshot": null,
      "attendance_snapshot": null,
      "statutory_status": "not_applied",
      "calculation_warnings": null,
      "carry_forward_in": "0.00",
      "carry_forward_out": "0.00",
      "error_code": null,
      "error_reason": null,
      "exclusion_reason": "On unpaid sabbatical for the whole of August; salary to resume in September",
      "excluded_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "calculated_at": null,
      "pf_wage": "0.00",
      "esi_wage": "0.00",
      "taxable_earnings": "0.00",
      "esi_covered": false,
      "pf_employee_amount": "0.00",
      "pf_employer_amount": "0.00",
      "eps_amount": "0.00",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "0.00",
      "income_tax_amount": "0.00",
      "statutory_snapshot": null,
      "reimbursement_amount": "0.00",
      "benefit_employee_amount": "0.00",
      "benefit_employer_amount": "0.00",
      "created_at": "2026-09-01T06:13:07.402Z",
      "updated_at": "2026-09-01T06:14:55.881Z"
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "total_pages": 3 }
}
```

Reading the sample:

- The three JSONB fields are shown as `{}` / `null` for length. On a real `calculated` row, `structure_snapshot`, `attendance_snapshot` and `statutory_snapshot` are **fully populated and large** — `attendance_snapshot` alone holds one entry per day of the window. **The items list returns them in full.** A 200-row page is therefore a heavy payload; if that hurts, ask us for a projection (G-6).
- **An `error` row has every figure zeroed and all three snapshots `null`** (`ZERO_FIGURES` + explicit nulls). Do not render "₹0.00 net pay" for it — branch on `status`.
- **An `error` row also has `calculation_warnings: null` always.** Warnings and errors are mutually exclusive: a row that errored never reached the warning-producing stage.
- An `excluded` row is likewise zeroed. `excluded_by` is a bare UUID.
- `calculation_warnings` is `null` (not `[]`) when there are none. Check for array-ness before mapping.
- `payroll_run_items` is **not** paranoid, so there is no `deleted_at` here (unlike `payroll_runs`).
- `overtime_minutes` is a real `INTEGER`; everything `DECIMAL` is a string.

## 3.4 — `GET /runs/:id/preview` (P1)

### Confirmations

| Question | Answer |
|---|---|
| `error_items[]` shape | **`{ user_id, error_code, error_reason }` — exactly three keys.** **No `id`, no `item_id`**, no name. This is why the panel must use §3.3 instead. |
| `excluded_items[]` shape | **`{ user_id, exclusion_reason }` — two keys.** |
| Is `warnings` an array or an object? | **An object of counts.** `{ error_items, excluded_items, missing_structure, exit_date_required }`, all integers. It is *not* a list of codes. |
| `department_breakdown[]` keys | `department_id`, **`department`** (not `department_name`), `headcount`, `total_gross`, `total_net`, `total_employer_cost`, `total_lop_days`. **There is no `total_deductions` per department.** |
| Which statuses allow a preview? | **All of them.** There is no status guard. A `draft` run previews successfully and returns zeros — it does **not** error. Only `RUN_NOT_FOUND` can come back. |

Two more things about `department_breakdown`:

- Only **`calculated`** items are bucketed. Error and excluded items are pulled out first, so the department headcounts sum to `processed_count`, not `total_employees`.
- Employees with no department land in a single bucket with `department_id: null` and `department: null`. Render that as "Unassigned".
- Money in this array is `.toFixed(2)` **strings**; `total_lop_days` is a real **number** (2 dp). Inconsistent with the rest of the payload — this is deliberate in the code, so handle it.

### Sample — the calculated run from 3.2(a)

```json
{
  "success": true,
  "message": "Payroll run preview fetched",
  "data": {
    "run": {
      "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "period_month": "2026-08",
      "status": "calculated",
      "requires_recalculation": false,
      "total_employees": 42,
      "processed_count": 40,
      "error_count": 1,
      "excluded_count": 1,
      "total_gross": "2184500.00",
      "total_deductions": "312750.00",
      "total_net": "1871750.00",
      "total_employer_cost": "2265400.00",
      "settings_snapshot": {}
    },
    "department_breakdown": [
      {
        "department_id": "d1d1d1d1-0000-4000-8000-000000000001",
        "department": "Engineering",
        "headcount": 18,
        "total_gross": "1102000.00",
        "total_net": "945300.00",
        "total_employer_cost": "1143400.00",
        "total_lop_days": 3.5
      }
    ],
    "error_items": [
      {
        "user_id": "22222222-aaaa-4bbb-8ccc-000000000002",
        "error_code": "EXIT_DATE_REQUIRED",
        "error_reason": "Employee appears inactive with employment evidence in the period. Inferred last working day: 2026-08-14. Set the exit date via a period override (#47) or exclude the item."
      }
    ],
    "excluded_items": [
      {
        "user_id": "33333333-aaaa-4bbb-8ccc-000000000003",
        "exclusion_reason": "On unpaid sabbatical for the whole of August; salary to resume in September"
      }
    ],
    "warnings": {
      "error_items": 1,
      "excluded_items": 1,
      "missing_structure": 0,
      "exit_date_required": 1
    },
    "missing_bank_account_count": 2,
    "variable_pay": {
      "adjustment_earnings_total": "42000.00",
      "adjustment_deductions_total": "5500.00",
      "loan_recovery_total": "36000.00",
      "carry_forward_recovered_total": "1250.00",
      "carry_forward_generated_total": "0.00",
      "skipped_emi_count": 1,
      "clamped_item_count": 0,
      "warning_items": [
        {
          "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
          "warnings": ["LOAN_EMI_SKIPPED:7a1c2b3d-0000-4000-8000-00000000000f"]
        }
      ]
    },
    "statutory": {
      "pf_employee_total": "68400.00",
      "pf_employer_total": "39900.00",
      "eps_total": "28500.00",
      "esi_employee_total": "1425.00",
      "esi_employer_total": "6175.00",
      "pt_total": "8000.00",
      "tds_total": "184300.00",
      "esi_covered_count": 5,
      "pt_unresolved_count": 0,
      "statutory_shortfall_count": 0,
      "pan_missing_count": 1
    },
    "payouts": {
      "reimbursement_total": "18400.00",
      "reimbursement_item_count": 6,
      "taxable_reimbursement_total": "3400.00",
      "benefit_employee_total": "12600.00",
      "benefit_employer_total": "25200.00"
    },
    "total_items": 42
  }
}
```

**`variable_pay` — what each key means** (Phase 3 §7.7; every figure is *read* from what the engine persisted, never recomputed, so it cannot disagree with the payslips):

| Key | Type | Meaning |
|---|---|---|
| `adjustment_earnings_total` | DECIMAL string | Σ of real adjustment earning lines. **Excludes** the two engine-synthesised carry-forward codes. |
| `adjustment_deductions_total` | DECIMAL string | Σ of real adjustment deduction lines, same exclusion. |
| `loan_recovery_total` | DECIMAL string | Σ of every `source: "loan"` line (actual EMI recovered this run). |
| `carry_forward_recovered_total` | DECIMAL string | Σ of `carry_forward_in` — prior-period shortfall recovered now. |
| `carry_forward_generated_total` | DECIMAL string | Σ of `carry_forward_out` — new shortfall clamped away this period. Non-zero here means some employees' net went negative and was carried. |
| `skipped_emi_count` | integer | Counts **EMIs**, not people. One employee with two unaffordable loans contributes 2. |
| `clamped_item_count` | integer | Counts **items** with `NEGATIVE_NET_CLAMPED` (one net per item). |
| `warning_items` | array | `[{ user_id, warnings: string[] }]` — every calculated item that has any warning at all. Only `user_id`, no name. |

**`statutory`** (Phase 4 §6.3): the seven `*_total` are DECIMAL strings; the four `*_count` are integers derived from `calculation_warnings`:

- `pt_unresolved_count` counts items warning `PT_STATE_UNRESOLVED` or `PT_SLAB_UNRESOLVED` — PT could not be determined and **₹0 PT was deducted**. Flag it loudly.
- `statutory_shortfall_count` counts `STATUTORY_EXCEEDS_NET` — statutory dues exceeded net pay.
- `pan_missing_count` counts `PAN_MISSING_206AA_APPLIED` — s.206AA flat-rate TDS floor applied because no PAN.
- `esi_covered_count` counts items where `esi_covered = true`.

**`payouts`** (Phase 5 §6.6): `reimbursement_total` is the **whole** reimbursement payout (taxable + non-taxable); `taxable_reimbursement_total` is the subset that sits *inside* gross; `reimbursement_item_count` counts the component lines that made it up. Do not add `reimbursement_total` to `total_gross`.

`missing_bank_account_count` is computed over **calculated items only** — the count of people who will be paid but have no verified bank account. It is the single most useful pre-approval warning on this payload.

## 3.5 — `GET /runs/:id/items/:itemId` (P2)

### Shape

**Not flat, and not the shape you guessed.** The response `data` has exactly three keys:

```ts
{
  item: PayrollRunItem,          // the full row, identical to a §3.3 list row
  components: ComponentLine[],   // ordered by display_order ASC; [] if none
  day_ledger: object | null      // === item.attendance_snapshot, exposed under a second name
}
```

**The key is `day_ledger`, not `attendance_snapshot`.** The same object is also present at `item.attendance_snapshot`; `day_ledger` is a convenience alias. Read either, but `day_ledger` is the documented one. It is `null` on an `error` or `excluded` item.

**Yes, every statutory item field is included** — `pf_wage`, `esi_wage`, `taxable_earnings`, `esi_covered`, `pf_employee_amount`, `pf_employer_amount`, `eps_amount`, `esi_employee_amount`, `esi_employer_amount`, `professional_tax_amount`, `income_tax_amount`, `statutory_status` **and the full `statutory_snapshot`** (the reproducibility trace: PF ceiling working, ESI eligibility decision, PT slab resolution trace, and the TDS annualisation with the regime and slab ids used). `statutory_snapshot` is the one field the preview deliberately does *not* return; here it is complete. Treat it as a diagnostic blob for a "why this number?" drawer.

### Sample — a calculated item with an adjustment, a loan instalment and statutory lines

```json
{
  "success": true,
  "message": "Payroll run item fetched",
  "data": {
    "item": {
      "id": "11aa0001-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "run_id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
      "status": "calculated",
      "period_start": "2026-08-01",
      "period_end": "2026-08-31",
      "period_override_reason": null,
      "payable_days": "21.00",
      "lop_days": "0.00",
      "paid_non_working_days": "10.00",
      "standard_working_days": "21.00",
      "calendar_days": "31.00",
      "lop_divisor": "21.00",
      "gross_earnings": "68000.00",
      "lop_amount": "0.00",
      "total_deductions": "9200.00",
      "total_employer_contributions": "1800.00",
      "net_pay": "58800.00",
      "ctc_cost": "69800.00",
      "overtime_minutes": 240,
      "overtime_amount": "1000.00",
      "structure_snapshot": {
        "structures": [
          {
            "structure_id": "5555aaaa-0000-4000-8000-000000000001",
            "effective_from": "2025-04-01",
            "effective_to": null,
            "annual_ctc": "780000.00",
            "components": [
              { "component_id": "c1c1c1c1-0000-4000-8000-000000000001", "component_code": "BASIC", "calculation_type": "flat", "value": "30000.00" }
            ]
          }
        ]
      },
      "attendance_snapshot": {
        "payable_days": 21,
        "lop_days": 0,
        "paid_non_working_days": 10,
        "standard_working_days": 21,
        "calendar_days": 31,
        "window_working_days": 21,
        "window_calendar_days": 31,
        "per_date": [
          { "d": "2026-08-01", "c": "paid_non_working", "p": 1, "l": 0, "r": "weekly_off" },
          { "d": "2026-08-03", "c": "present", "p": 1, "l": 0, "r": "present" },
          { "d": "2026-08-11", "c": "paid_leave", "p": 1, "l": 0, "r": "paid_leave" },
          { "d": "2026-08-15", "c": "paid_non_working", "p": 1, "l": 0, "r": "holiday" },
          { "d": "2026-08-19", "c": "half_day", "p": 0.5, "l": 0.5, "r": "half_day" },
          { "d": "2026-08-27", "c": "no_record", "p": 0, "l": 1, "r": "no_record" }
        ]
      },
      "statutory_status": "applied",
      "calculation_warnings": ["LOAN_EMI_SKIPPED:7a1c2b3d-0000-4000-8000-00000000000f"],
      "carry_forward_in": "0.00",
      "carry_forward_out": "0.00",
      "error_code": null,
      "error_reason": null,
      "exclusion_reason": null,
      "excluded_by": null,
      "calculated_at": "2026-09-01T06:13:07.220Z",
      "pf_wage": "15000.00",
      "esi_wage": "0.00",
      "taxable_earnings": "68000.00",
      "esi_covered": false,
      "pf_employee_amount": "1800.00",
      "pf_employer_amount": "1050.00",
      "eps_amount": "750.00",
      "esi_employee_amount": "0.00",
      "esi_employer_amount": "0.00",
      "professional_tax_amount": "200.00",
      "income_tax_amount": "4200.00",
      "statutory_snapshot": {
        "pf": { "wage_basis": "15000.00", "ceiling_applied": true, "employee_rate": "12.0000" },
        "esi": { "covered": false, "reason": "gross_above_threshold" },
        "pt": { "state_code": "KA", "slab_id": "aa11bb22-0000-4000-8000-000000000004", "amount": "200.00" },
        "tds": { "regime": "new", "annual_taxable": "816000.00", "months_remaining": 8, "monthly": "4200.00" }
      },
      "reimbursement_amount": "0.00",
      "benefit_employee_amount": "0.00",
      "benefit_employer_amount": "0.00",
      "created_at": "2026-09-01T06:13:07.220Z",
      "updated_at": "2026-09-01T06:13:07.220Z"
    },
    "components": [
      {
        "id": "cc000001-0000-4000-8000-000000000001",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c1c1c1c1-0000-4000-8000-000000000001",
        "component_code": "BASIC",
        "component_name": "Basic Salary",
        "component_type": "earning",
        "calculation_type": "flat",
        "full_month_amount": "30000.00",
        "amount": "30000.00",
        "is_taxable": true,
        "is_lop_applicable": true,
        "pf_applicable": true,
        "esi_applicable": true,
        "is_part_of_ctc": true,
        "source": "structure",
        "source_ref_id": null,
        "display_order": 1,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000002-0000-4000-8000-000000000002",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": null,
        "component_code": "OVERTIME",
        "component_name": "Overtime",
        "component_type": "earning",
        "calculation_type": null,
        "full_month_amount": "1000.00",
        "amount": "1000.00",
        "is_taxable": true,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": true,
        "is_part_of_ctc": false,
        "source": "overtime",
        "source_ref_id": null,
        "display_order": 500,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000003-0000-4000-8000-000000000003",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": null,
        "component_code": "SPOT_AWARD",
        "component_name": "Spot Award — Q2 release",
        "component_type": "earning",
        "calculation_type": null,
        "full_month_amount": "2000.00",
        "amount": "2000.00",
        "is_taxable": true,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": false,
        "source": "adjustment",
        "source_ref_id": "ad000001-0000-4000-8000-000000000001",
        "display_order": 600,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000004-0000-4000-8000-000000000004",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c9c9c9c9-0000-4000-8000-00000000000b",
        "component_code": "PF_EMPLOYEE",
        "component_name": "Provident Fund (Employee)",
        "component_type": "deduction",
        "calculation_type": null,
        "full_month_amount": "1800.00",
        "amount": "1800.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": false,
        "source": "statutory",
        "source_ref_id": null,
        "display_order": 1000,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000005-0000-4000-8000-000000000005",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c9c9c9c9-0000-4000-8000-00000000000d",
        "component_code": "PROFESSIONAL_TAX",
        "component_name": "Professional Tax",
        "component_type": "deduction",
        "calculation_type": null,
        "full_month_amount": "200.00",
        "amount": "200.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": false,
        "source": "statutory",
        "source_ref_id": null,
        "display_order": 1020,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000006-0000-4000-8000-000000000006",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c9c9c9c9-0000-4000-8000-00000000000e",
        "component_code": "TDS",
        "component_name": "Income Tax (TDS)",
        "component_type": "deduction",
        "calculation_type": null,
        "full_month_amount": "4200.00",
        "amount": "4200.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": false,
        "source": "statutory",
        "source_ref_id": null,
        "display_order": 1030,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000007-0000-4000-8000-000000000007",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": null,
        "component_code": "LOAN_EMI",
        "component_name": "Loan EMI",
        "component_type": "deduction",
        "calculation_type": null,
        "full_month_amount": "3000.00",
        "amount": "3000.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": false,
        "source": "loan",
        "source_ref_id": "1f1f1f1f-0000-4000-8000-000000000021",
        "display_order": 1600,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000008-0000-4000-8000-000000000008",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c9c9c9c9-0000-4000-8000-00000000000c",
        "component_code": "PF_EMPLOYER",
        "component_name": "Provident Fund (Employer)",
        "component_type": "employer_contribution",
        "calculation_type": null,
        "full_month_amount": "1050.00",
        "amount": "1050.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": true,
        "source": "statutory",
        "source_ref_id": null,
        "display_order": 1500,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      },
      {
        "id": "cc000009-0000-4000-8000-000000000009",
        "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
        "run_item_id": "11aa0001-0000-4000-8000-000000000001",
        "component_id": "c9c9c9c9-0000-4000-8000-00000000000f",
        "component_code": "EPS",
        "component_name": "Employee Pension Scheme (Employer)",
        "component_type": "employer_contribution",
        "calculation_type": null,
        "full_month_amount": "750.00",
        "amount": "750.00",
        "is_taxable": false,
        "is_lop_applicable": false,
        "pf_applicable": false,
        "esi_applicable": false,
        "is_part_of_ctc": true,
        "source": "statutory",
        "source_ref_id": null,
        "display_order": 1510,
        "created_at": "2026-09-01T06:13:07.240Z",
        "updated_at": "2026-09-01T06:13:07.240Z"
      }
    ],
    "day_ledger": {
      "payable_days": 21,
      "lop_days": 0,
      "paid_non_working_days": 10,
      "standard_working_days": 21,
      "calendar_days": 31,
      "window_working_days": 21,
      "window_calendar_days": 31,
      "per_date": [
        { "d": "2026-08-01", "c": "paid_non_working", "p": 1, "l": 0, "r": "weekly_off" },
        { "d": "2026-08-03", "c": "present", "p": 1, "l": 0, "r": "present" }
      ]
    }
  }
}
```

Both `per_date` arrays above are trimmed for length: the real array has **one entry per date in the employee's payable window** (31 for a full August; fewer for a mid-month joiner or leaver). Nothing else in the payload is abbreviated except the two remaining `{}`-style blobs already noted.

### `attendance_snapshot` / `day_ledger` — the real contract

Top-level keys — all **plain JSON numbers**, not strings:

| Key | Meaning |
|---|---|
| `payable_days` | Σ of `p`. Drives proration. |
| `lop_days` | Σ of `l`. |
| `paid_non_working_days` | Weekly offs and holidays inside the window, always fully paid. |
| `standard_working_days` | Working days in the **whole run period**. |
| `calendar_days` | Calendar days in the **whole run period**. |
| `window_working_days` | Working days in **this employee's window** (< `standard_working_days` for a joiner/leaver). |
| `window_calendar_days` | Calendar days in this employee's window. |
| `per_date` | One entry per date in the window. |

**`per_date[]` entry — `{ d, c, p, l, r }`:**

| Key | Type | Meaning |
|---|---|---|
| `d` | string | `"YYYY-MM-DD"` |
| `c` | string | **class** |
| `p` | number | payable fraction: `0`, `0.5` or `1` |
| `l` | number | LOP fraction: `0`, `0.5` or `1` |
| `r` | string | **reason** |

> **Correction to your assumption: `c` is not `P`/`L`/`W`/`H`/`O`. There are no single-letter codes anywhere in this payload.** `c` is a full lowercase word. Your current legend will not match anything.

**Complete `c` value list (10):**

| `c` | Meaning | Typical `p` / `l` |
|---|---|---|
| `present` | Worked a working day (includes an in-progress day resolved as present). | 1 / 0 |
| `absent` | Absent on a working day (includes in-progress resolved as absent). | 0 / 1 |
| `half_day` | Half day worked, no leave attached. | 0.5 / 0.5 |
| `paid_leave` | Approved leave, fully paid. | 1 / 0 |
| `lop_leave` | Approved leave of a *paid* type whose balance ran out — the unpaid share is charged. | varies |
| `unpaid_leave` | Approved leave of a type flagged `is_paid: false`. | varies |
| `orphan_leave` | Attendance says `on_leave` but no matching approved leave was found. **Defensive LOP.** Worth surfacing to HR as a data issue. | 0 / 1 |
| `no_record` | Working day with no attendance row at all (auto-mark-absent did not run). Charged as LOP. | 0 / 1 |
| `paid_non_working` | Weekly off or holiday, not worked. Paid. | 1 / 0 |
| `worked_non_working` | Weekly off or holiday that was worked. Paid once here; overtime, if any, is a separate component. | 1 / 0 |

**Complete `r` value list.** `r` starts as the calendar's own reason and is overwritten by the classification when one applies:

*Calendar reasons (when nothing else applies):* `working_day`, `holiday`, `weekly_off`, `exception_working`, `exception_non_working`.

*Classification reasons:* `present`, `in_progress_present`, `in_progress_absent`, `absent`, `half_day`, `no_record`, `orphan_leave`.

*Leave-allocation reasons:* whatever the leave allocator recorded — in practice `lop_alloc_overshoot` / `lop_alloc_undershoot`, otherwise it falls back to the class name itself (`paid_leave`, `lop_leave`, `unpaid_leave`).

Safe rendering rule: show `c` as the badge; show `r` as the tooltip; **do not** switch on `r` exhaustively — treat unknown `r` as free text.

### `component.source` — the complete emitted set

The DB enum has 10 values. Here is what the engine actually emits and where each comes from:

| `source` | Emitted? | `component_code` on those lines | `source_ref_id` |
|---|---|---|---|
| `structure` | ✅ | The org's own component codes (`BASIC`, `HRA`, `SPECIAL_ALLOWANCE`, …) | `null` |
| `overtime` | ✅ | `OVERTIME` | `null` |
| `adjustment` | ✅ | Whatever the adjustment carries, **plus** the two engine codes below | the `payroll_adjustments.id` (null for engine-synthesised) |
| `loan` | ✅ | `LOAN_EMI` | the loan installment id |
| `statutory` | ✅ | `PF_EMPLOYEE`, `ESI_EMPLOYEE`, `PROFESSIONAL_TAX`, `TDS`, `PF_EMPLOYER`, `EPS`, `PF_ADMIN_CHARGES`, `EDLI`, `ESI_EMPLOYER` | `null` |
| `benefit` | ✅ | the benefit plan's code | the enrollment/plan ref |
| `reimbursement` | ✅ | the reimbursement category's component code | the claim item ref |
| `rounding` | ✅ | `ROUNDING_ADJUSTMENT` | `null` |
| `lop` | ❌ **never emitted** | — | LOP is applied by reducing the structure line's `amount` below its `full_month_amount`, not as a separate line. Use `full_month_amount - amount` to show the LOP effect per component, and `item.lop_amount` for the total. |
| `arrear` | ❌ not emitted in this release | — | reserved |

**Engine-generated `component_code` values — the full list** (these are also the `RESERVED_COMPONENT_CODES` an HR-authored adjustment is forbidden from using):

| Code | `source` | `component_type` | Meaning |
|---|---|---|---|
| `OVERTIME` | `overtime` | earning | Overtime pay for `overtime_minutes`. |
| `ROUNDING_ADJUSTMENT` | `rounding` | earning or deduction | The net-pay rounding delta (`net_pay_rounding` = `nearest_rupee` / `nearest_ten`). Tiny; absent when rounding is `none` or the delta is zero. |
| `NET_PAY_SHORTFALL_CARRIED` | `adjustment` | earning | Under `negative_net_handling: "clamp_and_carry"`: the amount that could not be deducted this month, added back to bring net to zero. Mirrors `carry_forward_out`. |
| `CARRY_FORWARD_RECOVERY` | `adjustment` | deduction | The prior period's carried shortfall being recovered now. Mirrors `carry_forward_in`. Capped so it can never push net negative again. |

Plus the nine statutory codes listed in the table above, which are also engine-owned and cannot be assigned to a structure, benefit plan or reimbursement category (`STATUTORY_COMPONENT_NOT_ASSIGNABLE`).

**Component line field notes:**

- `full_month_amount` vs `amount`: `full_month_amount` is the un-prorated, un-LOP'd figure; `amount` is what was actually paid. They are equal when there is no LOP and no mid-month proration. **Show both** in a "why is this less?" column.
- `component_id` is `null` for engine-synthesised lines that have no catalog row (`OVERTIME`, `LOAN_EMI`, ad-hoc adjustments). Never key off it.
- `display_order` is the sort key and is already applied by the backend (ASC). Statutory lines occupy the reserved 1000–1999 band so the payslip ordering is stable regardless of which subsystem produced them.
- Two in-memory flags, `is_statutory` and `is_hra`, exist inside the engine but are **not persisted and not returned**. Identify statutory lines by `source === "statutory"`.

## 3.6 — Codes we explain to HR (P1)

### (a) Item `error_code` values

Mechanism first, because it determines how you should treat the list: the engine runs each employee inside a `try`/`catch`. **Any** `AppError` thrown while computing that one employee becomes `item.error_code = err.errorCode` and `item.error_reason = err.message`, and the cohort continues. So the set is "every error code reachable from the per-employee path", and it is open-ended by design — **keep a generic fallback renderer.** What follows is the complete reachable set today.

**Your twelve, adjudicated:**

| Code you listed | Reachable as an item `error_code`? |
|---|---|
| `NO_SALARY_STRUCTURE` | ✅ Very common. `"No approved salary structure overlaps the pay period"` |
| `EXIT_DATE_REQUIRED` | ✅ Common. See (c) below. |
| `UNKNOWN_ATTENDANCE_STATUS` | ✅ `"Unrecognised attendance status 'X' at YYYY-MM-DD"` |
| `IN_PROGRESS_AT_PERIOD_END` | ✅ `"Employee has an in-progress attendance at YYYY-MM-DD"` (only when `in_progress_treatment = flag_error`) |
| `CTC_RECONCILIATION_FAILED` | ✅ |
| `NO_BASIC_COMPONENT` | ✅ `"A percent_of_basic component requires exactly one is_basic component"` |
| `NEGATIVE_NET_PAY` | ✅ **but only when `negative_net_handling = "block"`.** Under the default `clamp_and_carry` you get a `NEGATIVE_NET_CLAMPED` *warning* instead and the item succeeds. |
| `TAX_TABLES_MISSING` | ⚠️ **Almost never an item code.** It is raised at run CREATE (422) and re-asserted at calculate, where it fails the **whole run** (`status: failed`). Treat it as a run-level failure, not a per-item one. |
| `STATUTORY_COMPONENT_NOT_ASSIGNABLE` | ⚠️ **Not an item code.** It is a 422 on the *configuration* endpoints (assigning a structure, mapping a benefit plan / reimbursement category / template component). Move it out of your item legend into your salary-structure legend. |
| `PF_SPLIT_RECONCILIATION_FAILED` | ✅ Reachable (PF employer/EPS split failed to reconcile). |
| `SCHEDULE_RECONCILIATION_FAILED` | ✅ Reachable, from loan amortisation: `"Cannot amortise loan: degenerate rate/tenure"`, `"Cannot amortise loan: EMI does not cover interest"`, `"Schedule rounding produced a non-positive final principal"`. |
| `INVALID_STATUTORY_AMOUNT` | ✅ Reachable. |

**Codes you do not have yet and will see:**

| Code | Cause | What HR should do |
|---|---|---|
| `CALCULATION_FAILED` | Fallback when the thrown error carried no `errorCode`. | Raise with support; include the item id. |
| `INVALID_LOP_DIVISOR` | The configured `lop_basis` produced a zero/negative divisor for this employee (usually a calendar with no working days in the window). | Fix the shift calendar / holiday config for that location. |
| `OVERTIME_BASIS_UNRESOLVED` | `overtime_hourly_basis = "basic"` but the org has no component flagged `is_basic`. | Flag one component as Basic, or switch the OT basis. |
| `INVALID_COMPONENT_AMOUNT` | A structure component evaluated to a non-money value. | Fix the structure. |
| `INVALID_STRUCTURE` | Structure is malformed. | Fix the structure. |
| `MULTIPLE_BASIC_COMPONENTS` | More than one component flagged `is_basic`. | Fix the component catalog. |
| `MULTIPLE_BALANCING_COMPONENTS` | More than one balancing component. | Fix the structure template. |
| `NO_EARNING_COMPONENTS` | Structure has no earning lines. | Fix the structure. |
| `CTC_BELOW_FIXED_COMPONENTS` | Annual CTC is lower than the sum of its fixed components. | Revise the CTC or the components. |
| `INVALID_PERCENTAGE` | A percent component has an out-of-range value. | Fix the component. |
| `INVALID_MONEY` / `MONEY_OVERFLOW` / `NEGATIVE_MONEY` | Bad money value anywhere in the employee's inputs. | Data fix. |
| `INVALID_STATUTORY_CONFIG` | The frozen statutory config is internally inconsistent. | Backend/config issue. |
| `INVALID_STATUTORY_CONTEXT` | Aggregator handed the statutory engine a malformed context. | Raise with support. |
| `STATUTORY_FIGURES_MISMATCH` | The statutory reconciliation guard tripped. | Raise with support. |
| `INVALID_TDS_MONTHS` / `INVALID_TDS_ROUNDING` | TDS annualisation inputs are invalid. | Check FY settings. |
| `LEDGER_BUILD_FAILED` | The attendance day-ledger could not be built for reasons other than the two known ones. | Raise with support. |
| `ITEM_PERSIST_FAILED` | The item computed fine but could not be written (per-item retry after a cohort transaction failure). | Recalculate. |

For everything in the second table, "recalculate after fixing the data" is the correct HR instruction; only `ITEM_PERSIST_FAILED` and `CALCULATION_FAILED` need support.

### (b) `calculation_warnings` — format and complete list

**Format: `calculation_warnings` is `JSONB` holding a flat array of plain strings**, or `null` when there are none. **Not objects.** Two of the strings are parameterised with a `:`-suffix; the rest are bare.

```json
"calculation_warnings": ["LOAN_EMI_SKIPPED:7a1c2b3d-0000-4000-8000-00000000000f", "PT_STATE_UNRESOLVED"]
```

Complete list:

| Warning string | Parameterised | Meaning / what HR should do |
|---|---|---|
| `LOAN_EMI_SKIPPED:<loan_id>` | yes, **loan UUID** | The EMI was unaffordable this month (all-or-nothing; the engine never part-deducts an EMI). The installment stays `scheduled` and rolls forward. Show the loan, not the raw UUID. |
| `NEGATIVE_NET_CLAMPED` | no | Net went below zero and was clamped to zero; the shortfall is in `carry_forward_out` and will be recovered next month. |
| `STATUTORY_EXCEEDS_NET` | no | Statutory dues exceeded net pay. Serious — surface prominently. |
| `PT_STATE_UNRESOLVED` | no | The employee's PT state could not be determined (no work-location state / no profile state). **₹0 PT was deducted.** Fix the location or profile state. |
| `PT_SLAB_UNRESOLVED` | no | State resolved but no PT slab matched the gross. **₹0 PT was deducted.** Fix the PT slab set. |
| `PAN_MISSING_206AA_APPLIED` | no | No PAN on file, so the s.206AA flat-rate TDS floor was applied (higher TDS). Collect the PAN. |
| `206AA_OVERRODE_TRUE_UP` | no | In the final FY month, the 206AA floor overrode the exact true-up figure. Consequence of the above. |
| `TDS_OVERDEDUCTED_REFUND_AT_ITR` | no | TDS already deducted exceeds the year's liability; payroll will not emit a negative TDS line. The excess is refunded at ITR, not by payroll. Tell the employee. |
| `STATUTORY_STRUCTURE_LINE_IGNORED:<component_code>` | yes, **component code** | A statutory component was found sitting inside a salary structure and was dropped so PF/ESI could not be double-deducted. Remove it from the structure. |
| `DUPLICATE_BENEFIT_ENROLLMENT:<plan_code>` | yes, **plan code** | The employee has more than one active enrollment in the same benefit plan; only one was charged. Fix the enrollments. |

Parsing rule: `const [code, param] = w.split(':')` — take `code` for the message table, `param` as the entity id.

One warning you may see mentioned in older docs, **`joining_date_missing`** (lowercase), lives on the internal aggregator entry and is **never merged into the persisted `calculation_warnings`**. You will not receive it. Ignore it.

### (c) `EXIT_DATE_REQUIRED` and the pre-filled date picker

The reason string is built as:

```
Employee appears inactive with employment evidence in the period. Inferred last working day: <INFERRED>. Set the exit date via a period override (#47) or exclude the item.
```

`<INFERRED>` is either a **`YYYY-MM-DD` date** or the **literal string `unknown`** when no last working day could be inferred.

**So: no, it is not *always* a date.** Your pre-fill must handle both. Suggested extraction:

```js
const m = /Inferred last working day: (\d{4}-\d{2}-\d{2})\./.exec(item.error_reason)
const prefill = m ? m[1] : null      // null → leave the picker empty
```

Do not assume a fixed character offset; the sentence is stable but parse it by pattern.

The fix path is `PATCH /runs/:id/items/:itemId/period` with `period_end` set to the last working day and a `period_override_reason` — that is exactly what suppresses this error on the next calculation. (Or exclude the item.)

> We would rather you did not regex-parse a human sentence. Putting the inferred date in a structured field is gap G-4; ask and we will add it.

## 3.7 — `GET /runs/eligibility` (P2)

`GET /api/v1/payroll/hr/runs/eligibility?period_month=2026-09`

### Confirmations

| Question | Answer |
|---|---|
| Is `already_run` an id string or an object? | **An object — `{ id, status }` — or `null`.** Never a bare string. `status` lets you word the message correctly ("a draft run already exists" vs "already approved"). |
| `missing_structure[]` entry fields | `{ user_id, employee_code }`. **No name.** `employee_code` can itself be `null` if the employee has no code. |
| `locked_ranges[]` keys | `{ start_date, end_date }`, both `"YYYY-MM-DD"`. No id, no reason. |
| `statutory` block keys | 13 keys — see below. |

Also note `exit_date_required[]` is `{ user_id, employee_code, reason }` — three keys, one more than `missing_structure[]`, and `reason` is the same sentence described in 3.6(c).

This endpoint **persists nothing**. It is a dry run: it runs the real aggregator over the live cohort and reports readiness. It is safe to call as often as you like, but it is not cheap (it is O(headcount) with several queries), so call it when the month picker changes, not on every keystroke.

### Sample (a) — a month that already has a run

```json
{
  "success": true,
  "message": "Payroll run eligibility evaluated",
  "data": {
    "period_month": "2026-08",
    "period_start": "2026-08-01",
    "period_end": "2026-08-31",
    "headcount": 42,
    "missing_structure_count": 1,
    "missing_structure": [
      { "user_id": "44444444-aaaa-4bbb-8ccc-000000000004", "employee_code": "EMP-0311" }
    ],
    "exit_date_required_count": 1,
    "exit_date_required": [
      {
        "user_id": "22222222-aaaa-4bbb-8ccc-000000000002",
        "employee_code": "EMP-0107",
        "reason": "Employee appears inactive with employment evidence in the period. Inferred last working day: 2026-08-14. Set the exit date via a period override (#47) or exclude the item."
      }
    ],
    "joiners_count": 2,
    "leavers_count": 1,
    "missing_bank_account_count": 2,
    "already_run": {
      "id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "status": "calculated"
    },
    "period_locked": false,
    "locked_ranges": [],
    "statutory": {
      "config_updated_at": "2026-04-02T07:15:33.100Z",
      "pf_enabled": true,
      "esi_enabled": true,
      "pt_enabled": true,
      "income_tax_enabled": true,
      "tax_tables_present": true,
      "missing_pan_count": 1,
      "pt_unresolved_count": 0,
      "unsubmitted_declaration_count": 4,
      "unverified_declaration_count": 6,
      "proof_deadline": "2027-01-31",
      "proof_deadline_passed": false,
      "previous_employer_unrecorded_count": 2
    },
    "payouts": {
      "approved_claims_count": 6,
      "approved_claims_total": "18400.00",
      "claims_awaiting_approval_count": 3,
      "benefit_deductions_enabled": true,
      "active_enrollment_count": 14,
      "benefit_employee_total": "12600.00",
      "benefit_employer_total": "25200.00"
    }
  }
}
```

### Sample (b) — a month with no run, and an overlapping attendance lock

```json
{
  "success": true,
  "message": "Payroll run eligibility evaluated",
  "data": {
    "period_month": "2026-09",
    "period_start": "2026-09-01",
    "period_end": "2026-09-30",
    "headcount": 44,
    "missing_structure_count": 0,
    "missing_structure": [],
    "exit_date_required_count": 0,
    "exit_date_required": [],
    "joiners_count": 3,
    "leavers_count": 0,
    "missing_bank_account_count": 3,
    "already_run": null,
    "period_locked": true,
    "locked_ranges": [
      { "start_date": "2026-09-01", "end_date": "2026-09-15" }
    ],
    "statutory": {
      "config_updated_at": "2026-04-02T07:15:33.100Z",
      "pf_enabled": true,
      "esi_enabled": true,
      "pt_enabled": true,
      "income_tax_enabled": true,
      "tax_tables_present": true,
      "missing_pan_count": 1,
      "pt_unresolved_count": 0,
      "unsubmitted_declaration_count": 4,
      "unverified_declaration_count": 6,
      "proof_deadline": "2027-01-31",
      "proof_deadline_passed": false,
      "previous_employer_unrecorded_count": 2
    },
    "payouts": {
      "approved_claims_count": 0,
      "approved_claims_total": "0.00",
      "claims_awaiting_approval_count": 1,
      "benefit_deductions_enabled": true,
      "active_enrollment_count": 15,
      "benefit_employee_total": "13100.00",
      "benefit_employer_total": "26200.00"
    }
  }
}
```

**`statutory` block, key by key:**

| Key | Type | Meaning |
|---|---|---|
| `config_updated_at` | ISO or `null` | When the statutory config last changed. |
| `pf_enabled` / `esi_enabled` / `pt_enabled` / `income_tax_enabled` | boolean | Which heads are on. **Everything below is zero when the relevant head is off** — PT counts only when PT is on; the three declaration/previous-employer counts only when income tax is on. Do not render "0 missing PANs, all good" for an org with income tax off. |
| `tax_tables_present` | boolean | **If `income_tax_enabled && !tax_tables_present`, creating the run will fail with 422 `TAX_TABLES_MISSING`.** Block the Create button on this condition — it is the cleanest pre-flight you have. |
| `missing_pan_count` | integer | Employees with no PAN → higher TDS under s.206AA. |
| `pt_unresolved_count` | integer | Employees whose PT state/slab will not resolve → ₹0 PT. |
| `unsubmitted_declaration_count` | integer | Investment declarations never submitted for the FY. |
| `unverified_declaration_count` | integer | Submitted but not verified. |
| `proof_deadline` | `"YYYY-MM-DD"` or `null` | The org's proof deadline for the FY. |
| `proof_deadline_passed` | boolean | True once the run's period end is on/after the deadline — after which unverified declarations stop being honoured. This is the "cliff": the first run after the deadline can raise a lot of people's TDS. Warn HR. |
| `previous_employer_unrecorded_count` | integer | Mid-FY joiners with no Form 12B figures recorded. Their TDS will be under-computed. |

**`payouts` block:** `approved_claims_count` / `approved_claims_total` are approved-and-unpaid reimbursements targeting **this** period; `claims_awaiting_approval_count` is the approval backlog and is deliberately **not** period-scoped (a claim's payout month is only fixed at final approval). The benefit figures are priced through the exact engine path and are returned **even when `benefit_deductions_enabled` is false** — that is the pre-flight for the first run after HR switches the flag on. Use `benefit_deductions_enabled` to decide whether to present them as "will be charged" or "would be charged if enabled".

---

# 4. Salary adjustments

## 4.1 — `GET /adjustments` (P1)

`GET /api/v1/payroll/hr/adjustments?page=1&limit=20`

```json
{
  "success": true,
  "message": "Adjustments fetched",
  "data": [
    {
      "id": "ad000001-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
      "period_month": "2026-08",
      "adjustment_type": "earning",
      "category": "incentive",
      "component_id": null,
      "component_code": "SPOT_AWARD",
      "component_name": "Spot Award — Q2 release",
      "amount": "2000.00",
      "is_taxable": true,
      "pf_applicable": false,
      "esi_applicable": false,
      "status": "approved",
      "proposed_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "actioned_at": "2026-08-28T10:02:19.447Z",
      "rejection_reason": null,
      "reason": "Shipped the payroll statutory module ahead of schedule",
      "bonus_rule_id": null,
      "batch_id": null,
      "source_loan_id": null,
      "applied_run_id": "c0ffee00-1111-4222-8333-4444aaaa0001",
      "applied_run_item_id": "11aa0001-0000-4000-8000-000000000001",
      "applied_at": "2026-09-02T04:20:11.009Z",
      "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "created_at": "2026-08-28T10:02:19.447Z",
      "updated_at": "2026-09-02T04:20:11.009Z",
      "deleted_at": null
    }
  ],
  "pagination": { "total": 37, "page": 1, "limit": 20, "total_pages": 2 }
}
```

**Every field you asked about is confirmed present:**

| Field | Type | Notes |
|---|---|---|
| `proposed_by` | UUID | Who authored it. Always set. |
| `created_by` | UUID | Same person as `proposed_by` for HR-created rows. Both are returned. |
| `approved_by` | UUID or `null` | `null` while `pending`. Equals `proposed_by` when it landed straight in `approved`. |
| `actioned_at` | ISO or `null` | When it was approved or rejected. |
| `applied_at` | ISO or `null` | When a payroll run consumed it. |
| `applied_run_id` | UUID or `null` | Which run consumed it. |
| `applied_run_item_id` | UUID or `null` | **Bonus field you did not list** — deep-link straight to the item detail. |
| `batch_id` | UUID or `null` | Set for bulk-uploaded rows. |
| `bonus_rule_id` | UUID or `null` | Set for rows generated by applying a bonus rule. |
| `source_loan_id` | UUID or `null` | Set for loan-originated rows. |
| `component_code` | string | Always present — it is required at create. |
| `rejection_reason` | string or `null` | Set only on `rejected`. |

**Employee name and code: no.** `user_id` only, no association include. Actor names: **no** — `proposed_by` / `approved_by` / `created_by` are bare UUIDs. Both are gap G-2; resolve from §6.1.

Ordering is fixed `created_at DESC`. `payroll_adjustments` is paranoid, so `deleted_at` is present and always `null`.

A note on the lifecycle that affects your badges: `status` is one of `pending | approved | rejected | cancelled`. **`applied` is not a status** — an applied row still reads `status: "approved"` and is identified by `applied_at != null`. Render "Applied" from `applied_at`, not from `status`. An applied adjustment is immutable (cancel is refused) because a run has already paid it.

## 4.2 — Do the list filters combine? (P1)

**Yes. All of them, ANDed, in one query.** The schema is:

```js
Joi.object({
  period_month, user_id, status, category, adjustment_type, batch_id,
  page:  default 1,
  limit: default 20, max 100
})
```

| Filter | Accepts |
|---|---|
| `period_month` | one `"YYYY-MM"` |
| `user_id` | one UUID |
| `status` | one of `pending`, `approved`, `rejected`, `cancelled` |
| `category` | one of `bonus`, `incentive`, `ad_hoc_earning`, `ad_hoc_deduction`, `recovery`, `arrear` |
| `adjustment_type` | `earning` or `deduction` |
| `batch_id` | one UUID |

Every one is single-valued (no arrays, no CSV). `?period_month=2026-08&adjustment_type=earning&category=bonus&batch_id=<uuid>` is valid and returns the intersection. The `pagination.total` reflects the filtered set, so it is safe to drive "N results" from it.

For the post-upload flow you described: after `POST /adjustments/bulk` returns `batch_id`, `GET /adjustments?batch_id=<that>&limit=100` gives you exactly the created rows.

> Note `category` accepts `arrear` as a **filter** value (the DB enum has it) but the **create** schema rejects it. Adjustments with `category: "arrear"` can therefore exist from other code paths but cannot be authored through `POST /adjustments`. Keep `arrear` in your filter dropdown, out of your create dropdown.

## 4.3 — `POST /adjustments` — component fields and flags (P1)

### Is `component_name` enough without `component_id`?

**No. `component_code` is required on every single create, always, `component_id` or not.**

```js
component_id:   uuid,                              // OPTIONAL
component_code: adjustmentComponentCode.required(),// REQUIRED, ALWAYS
component_name: Joi.string().max(150).required(),  // REQUIRED, ALWAYS
```

The API-analysis doc's example that omits `component_code` is **wrong**; omitting it returns 400 `VALIDATION_ERROR` `"\"component_code\" is required"`. Your form must collect a code even for a custom name.

`component_code` rules:
- Uppercase code format (the shared `codeSchema`).
- **Must not be one of the four reserved engine codes** — `NET_PAY_SHORTFALL_CARRIED`, `CARRY_FORWARD_RECOVERY`, `OVERTIME`, `ROUNDING_ADJUSTMENT`. The check is case-insensitive. Violating it gives 400 `VALIDATION_ERROR` with the custom message `"component_code is reserved by the payroll engine"`. Pre-validate client-side so HR never sees it.
- It is not checked for uniqueness and is not looked up in the catalog. It is a free label used on the payslip line.

### When `component_id` IS sent, are the body's flags ignored?

**Yes — the catalog wins, completely and silently.**

```js
if (componentId) {
  const cat = await salaryComponentRepo.findByIdAndOrgId(componentId, orgId)
  if (!cat || cat.is_active === false) throw new AppError(422, ..., 'COMPONENT_NOT_FOUND_OR_INACTIVE')
  return { is_taxable: cat.is_taxable, pf_applicable: cat.pf_applicable, esi_applicable: cat.esi_applicable }
}
return {
  is_taxable:     isTaxable     !== undefined ? isTaxable     : true,   // default TRUE
  pf_applicable:  pfApplicable  !== undefined ? pfApplicable  : false,  // default FALSE
  esi_applicable: esiApplicable !== undefined ? esiApplicable : false   // default FALSE
}
```

| Scenario | `is_taxable` | `pf_applicable` | `esi_applicable` |
|---|---|---|---|
| `component_id` sent | from catalog | from catalog | from catalog |
| No `component_id`, flags omitted | **`true`** | `false` | `false` |
| No `component_id`, flags sent | as sent | as sent | as sent |

Two consequences for the UI:

1. **When the user picks a catalog component, disable the three flag toggles** and show the catalog's values (fetched from the component catalog), because whatever the toggles say will be discarded. Today a user can tick "PF applicable", save, and see it come back unticked — that looks like a bug.
2. `component_id` pointing at a missing or **inactive** component → 422 `COMPONENT_NOT_FOUND_OR_INACTIVE`, message `"Component <uuid> is not found or is inactive"`. Filter inactive components out of the picker.
3. **`component_code` and `component_name` are still taken from your body even when `component_id` is sent** — they are *not* overwritten with the catalog's code/name. So if the user picks "Travel Allowance" from the catalog and your form leaves a stale code in the hidden field, the payslip line will carry the stale code. **Populate both from the selected catalog row.**

Other create rules worth knowing:

- `amount` must be **strictly positive**. Direction comes from `adjustment_type`, never from the sign. A negative or zero amount → 422 `INVALID_ADJUSTMENT_AMOUNT` (`"Adjustment amount must be greater than zero"`), or 400 from Joi first if it is not money-shaped.
- `reason` is required, 1–1000 chars, trimmed.
- `category` at create is limited to `bonus | incentive | ad_hoc_earning | ad_hoc_deduction | recovery`. **`arrear` is rejected here** (see 4.2).
- If the target period already has a `draft`/`calculated` run, that run is flagged `requires_recalculation: true`. If it is `approved`/`paid`, you get 422 `PERIOD_CLOSED_FOR_ADJUSTMENT`. If it is mid-calculation, 409 `RUN_CALCULATION_IN_PROGRESS`.

## 4.4 — `POST /adjustments` success response (P2)

**HTTP 201.** The body is the created row — same shape as a list row.

```json
{
  "success": true,
  "message": "Adjustment created",
  "data": {
    "id": "ad000002-0000-4000-8000-000000000002",
    "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
    "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
    "period_month": "2026-09",
    "adjustment_type": "deduction",
    "category": "recovery",
    "component_id": null,
    "component_code": "ASSET_RECOVERY",
    "component_name": "Laptop damage recovery",
    "amount": "1500.00",
    "is_taxable": true,
    "pf_applicable": false,
    "esi_applicable": false,
    "status": "approved",
    "proposed_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "actioned_at": "2026-09-14T08:31:05.612Z",
    "rejection_reason": null,
    "reason": "Recovery approved by the asset committee on 2026-09-10",
    "bonus_rule_id": null,
    "batch_id": null,
    "source_loan_id": null,
    "applied_run_id": null,
    "applied_run_item_id": null,
    "applied_at": null,
    "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
    "created_at": "2026-09-14T08:31:05.612Z",
    "updated_at": "2026-09-14T08:31:05.612Z",
    "deleted_at": null
  }
}
```

**`status` is `"approved"` or `"pending"` and you cannot predict which client-side. Read it off the response.**

The rule, for HR:

| Org setting `payroll_require_separate_checker` | Resulting `status` |
|---|---|
| `false` (default) | **`approved`**, with `approved_by = proposed_by` and `actioned_at` set. It is live and will be picked up by the next calculation. |
| `true` | **`pending`**, `approved_by: null`, `actioned_at: null`. A *different* HR user must call `POST /adjustments/:id/approve`; the same user gets 403 `SEPARATE_CHECKER_REQUIRED`. |

(On the manager plane the deciding setting is `manager_direct_compensation_authority`; the same response shape applies.)

Suggested messages: `status === 'approved'` → "Adjustment saved and will be included in the next calculation."; `status === 'pending'` → "Adjustment submitted for approval by another HR user."

Also note: when the row lands `approved`, the period guard runs *inside the same transaction* — so a `PERIOD_CLOSED_FOR_ADJUSTMENT` means nothing was saved. When it lands `pending`, the period check is deferred to approval time, so a pending proposal can be created for a month that later closes, and the failure surfaces at approve.

## 4.5 — `POST /adjustments/bulk/preview` (P1)

### The CSV contract

Request body (both required):

```json
{ "period_month": "2026-09", "csv_content": "<the raw file text>" }
```

**Required headers** (exact names): `adjustment_type`, `category`, `component_code`, `component_name`, `amount`, `reason`.

**Plus at least one identity column**: `user_id` **or** `employee_code`. If neither header is present the whole request fails with 422 `CSV_MISSING_IDENTITY_COLUMN`.

Optional columns: `is_taxable`, `pf_applicable`, `esi_applicable`.

**Row limit: 5000.** Beyond that → 422 `BULK_ROW_LIMIT_EXCEEDED`. An empty file → 422 `CSV_EMPTY`.

### Confirmations — the keys, versus what you guessed

| You guessed | Reality |
|---|---|
| per-row `line` | ✅ `line` — 1-based **file** line number (header is line 1, so the first data row is 2). Good for "row N" messages. |
| per-row `employee_code` | ✅ `employee_code` — echoed from the CSV; `null` if the row identified by `user_id`. |
| per-row `user_id` | ✅ `user_id` — the **resolved** UUID, or `null` when resolution failed. |
| per-row `adjustment_type` | ❌ **not returned on the row.** |
| per-row `amount` | ✅ `amount` — the normalised DECIMAL string, or the raw value if normalisation failed. |
| per-row `status` | ✅ `status` — but the values are **`"ok"` / `"error"`**, not `valid`/`invalid`. |
| per-row `error_code` | ✅ `error_code` — string on failure, **`null` on success**. |
| per-row error **message** | ❌ **there is no per-row message field.** You must map `error_code` → text yourself. Full list below. |
| totals `total_rows` | ✅ `total_rows` |
| totals `valid_rows` | ❌ the key is **`ok_rows`** |
| totals `error_rows` | ✅ `error_rows` |
| totals `total_earning_amount` | ❌ the key is **`earnings_total`** |
| totals `total_deduction_amount` | ❌ the key is **`deductions_total`** |

So four of your eleven guessed keys are wrong and one does not exist. Exact row type:

```ts
{ line: number, user_id: string|null, employee_code: string|null, amount: string, status: 'ok'|'error', error_code: string|null }
```

### Sample — one valid row and several error rows

**HTTP 200** (preview never fails on bad *rows*; it fails only on a bad *file*)

```json
{
  "success": true,
  "message": "Bulk adjustment preview evaluated",
  "data": {
    "batch_id": null,
    "period_month": "2026-09",
    "totals": {
      "total_rows": 6,
      "ok_rows": 1,
      "error_rows": 5,
      "earnings_total": "2500.00",
      "deductions_total": "0.00"
    },
    "rows": [
      { "line": 2, "user_id": "11111111-aaaa-4bbb-8ccc-000000000001", "employee_code": "EMP-0042", "amount": "2500.00", "status": "ok",    "error_code": null },
      { "line": 3, "user_id": null, "employee_code": "EMP-9999", "amount": "1000.00", "status": "error", "error_code": "EMPLOYEE_NOT_FOUND" },
      { "line": 4, "user_id": null, "employee_code": null,       "amount": "500.00",  "status": "error", "error_code": "MISSING_IDENTIFIER" },
      { "line": 5, "user_id": "33333333-aaaa-4bbb-8ccc-000000000003", "employee_code": "EMP-0203", "amount": "750.00", "status": "error", "error_code": "INVALID_CATEGORY" },
      { "line": 6, "user_id": "44444444-aaaa-4bbb-8ccc-000000000004", "employee_code": "EMP-0311", "amount": "-200.00", "status": "error", "error_code": "NEGATIVE_MONEY" },
      { "line": 7, "user_id": "11111111-aaaa-4bbb-8ccc-000000000001", "employee_code": "EMP-0042", "amount": "900.00", "status": "error", "error_code": "RESERVED_COMPONENT_CODE" }
    ]
  }
}
```

`batch_id` is **always `null` on preview** — nothing was persisted. Only the commit call mints a batch id.

`earnings_total` / `deductions_total` sum **only the `ok` rows**, so they are the true "what will be created" figures.

### Complete per-row `error_code` list

| `error_code` | Cause | Suggested text |
|---|---|---|
| `MISSING_IDENTIFIER` | Both `user_id` and `employee_code` are blank on this row. | "No employee id or code on this row." |
| `EMPLOYEE_NOT_FOUND` | The id/code did not resolve to an active member of this org. | "No employee matches this code." |
| `INVALID_ADJUSTMENT_TYPE` | Not `earning` or `deduction`. | "Type must be earning or deduction." |
| `INVALID_CATEGORY` | Not one of the five creatable categories. | "Category is not one of the allowed values." |
| `MISSING_COMPONENT_CODE` | `component_code` blank. | "Component code is required." |
| `RESERVED_COMPONENT_CODE` | One of the four engine-owned codes. | "This component code is reserved by payroll." |
| `MISSING_COMPONENT_NAME` | `component_name` blank. | "Component name is required." |
| `MISSING_REASON` | `reason` blank. | "Reason is required." |
| `INVALID_MONEY` | `amount` is not a parseable money value. | "Amount is not a valid number." |
| `NEGATIVE_MONEY` | `amount` is negative. | "Amount must be positive; use the type column for direction." |
| `MONEY_OVERFLOW` | `amount` exceeds the supported range. | "Amount is too large." |
| `INVALID_BOOLEAN` | One of the three optional flags is not a recognised boolean. | "Use true/false for the tax, PF and ESI columns." |
| `COMPONENT_NOT_FOUND_OR_INACTIVE` | An explicit `component_id` column pointed at a missing/inactive component. | "The linked component is inactive or does not exist." |
| `ROW_INVALID` | Fallback for anything unclassified. | "This row could not be processed." |

### Whole-request failure codes (preview and commit)

| Code | HTTP | `details` | Meaning |
|---|---|---|---|
| `CSV_PARSE_FAILED` | 422 | `errors: [{ line, message }]` | The file is not valid CSV. |
| `CSV_MISSING_IDENTITY_COLUMN` | 422 | — | Neither `user_id` nor `employee_code` header present. |
| `CSV_EMPTY` | 422 | — | No data rows. |
| `BULK_ROW_LIMIT_EXCEEDED` | 422 | — | More than 5000 rows. |
| `BULK_VALIDATION_FAILED` | 422 | `errors: [{ line, error_code }]` | **Commit only.** At least one row is invalid → nothing was saved. |

## 4.6 — `POST /adjustments/bulk` (commit) (P1)

**HTTP 201**, and the response is the preview payload **plus** three things: a real `batch_id`, a `status`, and `created_count`.

```json
{
  "success": true,
  "message": "Bulk adjustments applied",
  "data": {
    "batch_id": "bb000001-0000-4000-8000-000000000001",
    "period_month": "2026-09",
    "status": "approved",
    "totals": {
      "total_rows": 3,
      "ok_rows": 3,
      "error_rows": 0,
      "earnings_total": "7500.00",
      "deductions_total": "1500.00"
    },
    "created_count": 3,
    "rows": [
      { "line": 2, "user_id": "11111111-aaaa-4bbb-8ccc-000000000001", "employee_code": "EMP-0042", "amount": "2500.00", "status": "ok", "error_code": null },
      { "line": 3, "user_id": "33333333-aaaa-4bbb-8ccc-000000000003", "employee_code": "EMP-0203", "amount": "5000.00", "status": "ok", "error_code": null },
      { "line": 4, "user_id": "44444444-aaaa-4bbb-8ccc-000000000004", "employee_code": "EMP-0311", "amount": "1500.00", "status": "ok", "error_code": null }
    ]
  }
}
```

Answers:

- **`batch_id`** — yes, returned, key is `batch_id`. Use it directly in `GET /adjustments?batch_id=<id>`.
- **Count of rows created** — the key is **`created_count`**. It equals `totals.ok_rows` on success (the commit is all-or-nothing, so they cannot diverge).
- **`status`** — the status **every created row landed in**, `"approved"` or `"pending"`, by the same separate-checker rule as 4.4. Use it for the confirmation message.

**Commit is all-or-nothing in a single transaction.** If any row is invalid you get 422 `BULK_VALIDATION_FAILED` with `details.errors` and **zero** rows are created — there is no partial success to reconcile. So the safe flow is: preview → show errors → let HR fix the file → preview again → commit. Never commit a file whose preview had `error_rows > 0`; it will always fail.

## 4.7 — `POST /adjustments/batches/:batchId/cancel` (P2)

**HTTP 200.**

```json
{
  "success": true,
  "message": "Adjustment batch cancelled",
  "data": {
    "batch_id": "bb000001-0000-4000-8000-000000000001",
    "cancelled_count": 2,
    "skipped_applied_count": 1,
    "skipped_applied_ids": ["ad000009-0000-4000-8000-000000000009"]
  }
}
```

| Your question | Answer |
|---|---|
| Key for the cancelled count | **`cancelled_count`** (integer) |
| Key for the skipped count | **`skipped_applied_count`** (integer) |
| Is "skipped" a number or a list? | **Both.** `skipped_applied_count` is the number; **`skipped_applied_ids`** is the array of the adjustment UUIDs that were skipped. It is `[]` when nothing was skipped, never `null`. |

"Skipped" always means **already applied by a payroll run** — an applied adjustment has been paid and is immutable, so batch-cancel reports it and leaves it alone rather than failing. Good UX: "2 adjustments cancelled. 1 could not be cancelled because it has already been paid in a payroll run." and link the skipped ids to their detail rows.

Unknown/foreign batch → 404 `BATCH_NOT_FOUND`.

## 4.8 — `POST /adjustments/:id/cancel` — is a reason accepted? (P3)

**No reason is required, and none is accepted.** The route has **no body validator** and the controller passes only `(id, orgId, user, actorContext)` — no body field is read. Send no body (or an empty object); anything you do send is ignored entirely.

The same is true of `POST /adjustments/:id/approve`. The only adjustment action that takes a body is **reject**, which requires `{ "rejection_reason": "..." }` (1–1000 chars, trimmed) — the same `rejectSchema` used for bonus rules.

Cancel returns **HTTP 200** with the updated adjustment row (`status: "cancelled"`). It works on a `pending` proposal and on an `approved`-but-unapplied row; an **applied** row is refused (it has already been paid).

---

# 5. Bonus rules

**Verdict up front: the implementation plan is live; the API-analysis document is wrong on every disputed point.** Keep the payload you are already sending (`bonus_type` + `eligibility_config`) and delete the alternate branch.

## 5.1 — Calculation-type field name and values (P1)

**`bonus_type`.** `calculation_mode` does not exist anywhere in the codebase.

```js
const BONUS_TYPES = ['flat', 'percent_of_gross', 'percent_of_basic']
```

| Value | Supported | `value` means |
|---|---|---|
| `flat` | ✅ | A rupee amount, per eligible employee. |
| `percent_of_gross` | ✅ | A percentage of the employee's **structure monthly gross**. |
| `percent_of_basic` | ✅ | A percentage of the employee's **structure Basic**. |
| `percent_of_ctc` | ❌ **not supported** | Rejected at create with 400 `VALIDATION_ERROR`. Remove it from the dropdown. |

(For completeness: `percent_of_ctc` *does* exist as a `calculation_type` for **salary structure components** — a different feature. That is probably where the API-analysis doc got it. It is not a bonus type.)

The percentage base is taken from the employee's **approved salary structure**, not from the payroll run — so a bonus rule can be previewed and applied for a month that has no run yet.

## 5.2 — Eligibility (P1)

**`eligibility_config`.** `eligibility_criteria` does not exist. The exact schema:

```js
const eligibilityConfigSchema = Joi.object({
  user_ids:         Joi.array().items(uuid),
  department_ids:   Joi.array().items(uuid),
  employment_types: Joi.array().items(Joi.string().valid('full_time','part_time','contract','intern')),
  min_tenure_months: Joi.number().integer().min(0)
}).default({})
```

| Key | Status |
|---|---|
| `user_ids` | ✅ supported |
| `department_ids` | ✅ supported |
| **`employment_types`** | ✅ **supported** — you asked; the answer is yes. Values: `full_time`, `part_time`, `contract`, `intern`. |
| `min_tenure_months` | ✅ supported, **integer months, ≥ 0** |
| `min_tenure_days` | ❌ **does not exist** |
| `exclude_notice_period` | ❌ **does not exist** |

`eligibility_config` itself is optional and defaults to `{}`. Unknown keys inside it are stripped silently — so if you send `min_tenure_days` today it disappears and **no tenure filter is applied at all**, which would silently over-award. Please remove it.

**What you are sending today (`eligibility_config` with `department_ids`, `user_ids`, `min_tenure_months`) is correct.** Add `employment_types` if you want the filter.

Which keys are *read* depends on `eligibility_source`:

| `eligibility_source` | Candidate set comes from | Config keys read |
|---|---|---|
| `manual` | `eligibility_config.user_ids` | `user_ids`, then the common filters |
| `csv_upload` | `eligibility_config.user_ids` — **evaluated identically to `manual`** | same as `manual` |
| `department` | `eligibility_config.department_ids` | `department_ids`, then the common filters |
| `all_employees` | whole org | the common filters only |
| `performance_rating` | nothing — see 5.3 | — |

The "common filters" (`employment_types`, `min_tenure_months`) are applied to whatever candidate set the source produced.

## 5.3 — `csv_upload` and `performance_rating` (P2)

Both are **accepted by the validator**, but they behave very differently. This is the one place where "accepted" ≠ "works".

**`csv_upload`: works, and is indistinguishable from `manual`.** The evaluator has no separate branch for it — it reads `eligibility_config.user_ids` exactly like `manual`. There is **no CSV upload endpoint for bonus rules**; you must parse the CSV client-side and send the resolved `user_ids`. If you do that, `csv_upload` is fully functional and the label is just provenance metadata. If your UI shows it as "not available yet", that is stricter than the backend — your call, but it does work.

**`performance_rating`: accepted at create, but non-functional.** There is no performance-rating data source in this release.

- `POST /bonus-rules` with it → **succeeds** (the rule is created).
- `POST /bonus-rules/:id/preview-impact` → **succeeds**, and returns `awarded_count: 0` with **every** candidate in `skipped[]` carrying `reason: "ELIGIBILITY_SOURCE_UNAVAILABLE"`.
- `POST /bonus-rules/:id/apply` → **422 `ELIGIBILITY_SOURCE_UNAVAILABLE`**, message *"The performance_rating eligibility source has no data source in this release"*.

**Keep showing it as "not available yet", and ideally block creation client-side** — today HR can create a rule that can never be applied.

## 5.4 — `value` ceiling, and updating `max_amount_per_employee` (P2)

**There is no 1000 cap. The plan doc is wrong.** The validator is:

```js
value: positiveMoneyLike.required()
// = Joi.alternatives().try(Joi.number().positive(), Joi.string().pattern(/^\d+(\.\d+)?$/))
```

Constraints that actually apply:

- Must be **strictly positive** (`0` and negatives rejected).
- Stored as `DECIMAL(14,4)` → max ~99,999,999,999.9999, and values beyond the safe-integer paise range give 422 `MONEY_OVERFLOW`.
- **No upper bound is enforced for percentages.** `bonus_type: "percent_of_gross"` with `value: "500"` is accepted and will award 5× monthly gross to everyone.

**Please enforce a sane client-side cap** (we suggest ≤ 100 for percent types, with an explicit confirm above, say, 50). Server-side we consider the missing cap a real gap — G-5. Until it is added, `max_amount_per_employee` is the only server-side brake, and it is optional.

**Can `max_amount_per_employee` be updated via `PUT`? Yes.** `PUT /bonus-rules/:id` uses the **same schema as create** and the service **replaces the whole row**. Therefore:

- ⚠️ **`PUT` is a full replace, not a patch.** Any key you omit is blanked, not preserved — omit `component_id` and it becomes `null`; omit `eligibility_config` and it becomes `{}`; omit `max_amount_per_employee` and it becomes `null` (the cap is silently removed). **Always send the complete object**, pre-filled from `GET /bonus-rules/:id`.
- `max_amount_per_employee` accepts `null` explicitly to clear the cap, or a positive money value.
- `PUT` is only allowed while the rule is editable; otherwise 409 `RULE_NOT_EDITABLE`.

## 5.5 — `GET /bonus-rules` (P1)

`GET /api/v1/payroll/hr/bonus-rules?page=1&limit=20`

```json
{
  "success": true,
  "message": "Bonus rules fetched",
  "data": [
    {
      "id": "br000001-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "name": "Diwali Bonus 2026",
      "period_month": "2026-10",
      "bonus_type": "percent_of_basic",
      "value": "8.3300",
      "component_id": null,
      "eligibility_source": "department",
      "eligibility_config": {
        "department_ids": ["d1d1d1d1-0000-4000-8000-000000000001"],
        "employment_types": ["full_time"],
        "min_tenure_months": 6
      },
      "max_amount_per_employee": "25000.00",
      "status": "approved",
      "proposed_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "actioned_at": "2026-09-12T06:44:10.882Z",
      "rejection_reason": null,
      "applied_at": null,
      "applied_batch_id": null,
      "applied_count": 0,
      "reason": "Annual festive bonus, approved in the September compensation review",
      "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "created_at": "2026-09-12T06:41:55.004Z",
      "updated_at": "2026-09-12T06:44:10.882Z",
      "deleted_at": null
    }
  ],
  "pagination": { "total": 4, "page": 1, "limit": 20, "total_pages": 1 }
}
```

**All seven fields you asked about are confirmed:**

| Field | Type | Notes |
|---|---|---|
| `proposed_by` | UUID | always set |
| `approved_by` | UUID or `null` | `null` while `pending` |
| `actioned_at` | ISO or `null` | approve/reject timestamp |
| `applied_at` | ISO or `null` | **`null` ⇒ not yet applied.** This, not `status`, is the "Applied" flag. |
| `applied_count` | integer | **`0` until applied**, then the number of adjustments created. |
| `applied_batch_id` | UUID or `null` | the batch of generated adjustments; feed it to `GET /adjustments?batch_id=` |
| `rejection_reason` | string or `null` | set only on `rejected` |

**Names: no.** UUIDs only, for both the rule's actors and the employees inside `eligibility_config.user_ids`. Gap G-2.

Type notes: **`value` is `DECIMAL(14,4)` → a 4-decimal string** (`"8.3300"`), unlike every other money field here which is 2-decimal. Format it accordingly — and remember it is a *percentage* for the two percent types and *rupees* for `flat`. `max_amount_per_employee` is `DECIMAL(14,2)` → `"25000.00"` or `null`. `eligibility_config` is JSONB returned verbatim, `{}` when never set.

Filters: `period_month`, `status` (`pending|approved|rejected|cancelled`), `bonus_type`. `page` default 1, `limit` default 20, max 100. Order `created_at DESC`.

## 5.6 — `POST /bonus-rules/:id/preview-impact` (P1)

**Neither documented shape is exactly right.** The live shape is closest to the plan's `{ awards[], skipped[] }`, with extra counters — and `basis` is **per-award**, not top-level.

**HTTP 200:**

```json
{
  "success": true,
  "message": "Bonus rule impact evaluated",
  "data": {
    "rule": {
      "id": "br000001-0000-4000-8000-000000000001",
      "name": "Diwali Bonus 2026",
      "period_month": "2026-10",
      "bonus_type": "percent_of_basic",
      "value": "8.3300",
      "eligibility_source": "department",
      "status": "approved"
    },
    "awarded_count": 3,
    "skipped_count": 3,
    "total_award_amount": "45830.00",
    "awards": [
      {
        "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
        "amount": "2499.00",
        "basis": "structure_basic",
        "basis_amount": "30000.00"
      },
      {
        "user_id": "55555555-aaaa-4bbb-8ccc-000000000005",
        "amount": "25000.00",
        "basis": "structure_basic",
        "basis_amount": "420000.00"
      },
      {
        "user_id": "66666666-aaaa-4bbb-8ccc-000000000006",
        "amount": "18331.00",
        "basis": "structure_basic",
        "basis_amount": "220000.00"
      }
    ],
    "skipped": [
      { "user_id": "77777777-aaaa-4bbb-8ccc-000000000007", "reason": "INSUFFICIENT_TENURE" },
      { "user_id": "88888888-aaaa-4bbb-8ccc-000000000008", "reason": "EMPLOYMENT_TYPE_EXCLUDED" },
      { "user_id": "99999999-aaaa-4bbb-8ccc-000000000009", "reason": "NO_SALARY_STRUCTURE" }
    ],
    "note": "Amounts are gross bonus additions; Phase 3 applies no statutory withholding."
  }
}
```

In that sample, the **second award is capped**: 8.33% of ₹420,000 is ₹34,986, but `max_amount_per_employee` is ₹25,000, so `amount` is `"25000.00"`.

### Per-row keys — versus what you guessed

| You guessed | Reality |
|---|---|
| `basis_amount` **or** `basic_salary` | **`basis_amount`** ✅ (a DECIMAL string). `basic_salary` does not exist. |
| `basis` | ✅ exists, but **per award**, not a top-level key. Values: **`flat`** (for `bonus_type: "flat"`, and then `basis_amount` is `"0.00"`), **`structure_monthly_gross"`**, **`structure_basic`**. |
| `capped` | ❌ **does not exist.** The cap is applied silently. |
| name | ❌ **not included.** `user_id` only. |
| `eligible_count` / `total_bonus_liability` / `employees[]` (API-analysis shape) | ❌ none of these exist. The counters are **`awarded_count`**, **`skipped_count`**, **`total_award_amount`**, and the array is **`awards`**. |

**Detecting a capped award, today:** compare against the rule's cap yourself —

```js
const capped = rule.max_amount_per_employee != null &&
               eq(award.amount, rule.max_amount_per_employee)
```

That is an inference, not a fact from the API, and it is wrong in the edge case where the uncapped amount happens to land exactly on the cap. **Adding an explicit `capped` boolean is a real backend gap — G-7.** Say the word and we will add it; it is a small, additive change.

### Complete skip reason codes

| `reason` | Meaning | HR fix |
|---|---|---|
| `NOT_ELIGIBLE` | Not in the candidate set for this source (e.g. not in `user_ids`, not in the listed departments). | Widen the rule. |
| `EMPLOYMENT_TYPE_EXCLUDED` | Employment type is not in `eligibility_config.employment_types`. | Add the type, or accept the exclusion. |
| `INSUFFICIENT_TENURE` | Tenure is below `min_tenure_months`. | Lower the threshold. |
| `NO_SALARY_STRUCTURE` | No approved salary structure, so no basis to compute a percentage from. **Also skips `flat` rules** — the evaluator requires a structure to consider someone payable. | Assign a salary structure. |
| `ELIGIBILITY_SOURCE_UNAVAILABLE` | `performance_rating` only; every candidate gets this. | Use a different source. |

**Other behaviour worth knowing:** `preview-impact` is a `POST` but **persists nothing** — it is safe to call repeatedly. It is refused with 409 `RULE_NOT_PREVIEWABLE` on a rejected/cancelled rule, and 404 `BONUS_RULE_NOT_FOUND` otherwise. The `note` field is a constant string; show it or ignore it, but do note what it means: **bonus amounts are gross additions and carry no statutory withholding of their own** — PF/ESI/TDS are recomputed on the whole month when the run is calculated, so the employee's take-home increase will be less than `amount`. Word the HR-facing summary as "gross bonus", not "payout".

## 5.7 — `POST /bonus-rules/:id/apply` (P2)

**HTTP 201.**

```json
{
  "success": true,
  "message": "Bonus rule applied",
  "data": {
    "rule": {
      "id": "br000001-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "name": "Diwali Bonus 2026",
      "period_month": "2026-10",
      "bonus_type": "percent_of_basic",
      "value": "8.3300",
      "component_id": null,
      "eligibility_source": "department",
      "eligibility_config": {
        "department_ids": ["d1d1d1d1-0000-4000-8000-000000000001"],
        "employment_types": ["full_time"],
        "min_tenure_months": 6
      },
      "max_amount_per_employee": "25000.00",
      "status": "approved",
      "proposed_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "approved_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "actioned_at": "2026-09-12T06:44:10.882Z",
      "rejection_reason": null,
      "applied_at": "2026-09-14T09:02:44.771Z",
      "applied_batch_id": "bb000002-0000-4000-8000-000000000002",
      "applied_count": 3,
      "reason": "Annual festive bonus, approved in the September compensation review",
      "created_by": "9f8e7d6c-0000-4000-8000-00000000000a",
      "created_at": "2026-09-12T06:41:55.004Z",
      "updated_at": "2026-09-14T09:02:44.775Z",
      "deleted_at": null
    },
    "batch_id": "bb000002-0000-4000-8000-000000000002",
    "applied_count": 3
  }
}
```

| Your question | Answer |
|---|---|
| Key for the number of adjustments created | **`applied_count`** — at the **top level** of `data`. It is also mirrored inside `data.rule.applied_count`. |
| Key for `applied_batch_id` | **Two names for the same value.** At the top level of `data` the key is **`batch_id`**; on the nested rule it is **`applied_batch_id`**. Read `data.batch_id`. |

The generated adjustments are `adjustment_type: "earning"`, `category: "bonus"`, `status: "approved"`, each carrying `bonus_rule_id` and the shared `batch_id`. So `GET /adjustments?batch_id=<batch_id>` lists exactly what the rule created, and the normal batch-cancel endpoint (§4.7) can undo the unapplied ones.

Apply is **idempotent by refusal**: a second call gives 409 `RULE_ALREADY_APPLIED`. Other refusals: 409 `RULE_NOT_APPLICABLE` (rule not `approved`), 422 `RULE_NO_ELIGIBLE_EMPLOYEES` (nobody qualified — preview first to avoid this), 422 `ELIGIBILITY_SOURCE_UNAVAILABLE` (`performance_rating`), plus the period guard's 409 `RUN_CALCULATION_IN_PROGRESS` / 422 `PERIOD_CLOSED_FOR_ADJUSTMENT`.

## 5.8 — Reason on approve / cancel (P3)

| Endpoint | Body |
|---|---|
| `POST /bonus-rules/:id/approve` | **None.** No validator, no body read. Send nothing. |
| `POST /bonus-rules/:id/cancel` | **None.** No validator, no body read. Send nothing. |
| `POST /bonus-rules/:id/reject` | **Required**: `{ "rejection_reason": "..." }`, 1–1000 chars, trimmed. 400 `VALIDATION_ERROR` if missing. |
| `POST /bonus-rules/:id/preview-impact` | **None.** |
| `POST /bonus-rules/:id/apply` | **None.** |

All of them return **HTTP 200** with the updated rule row (except `apply`, which is 201, and `preview-impact`, which returns the preview payload). Cancel on a rule that is not cancellable → 409 `RULE_NOT_CANCELLABLE`.

---

# 6. Shared data used by these screens

## 6.1 — `GET /organizations/employees?purpose=emp_report` (P1)

### The answer to the question that is causing "Employee not found"

> **Use `user_id`. Not `id`, and not `employee_id`.**

The row contains **both** `user_id` and `employee_id`, and they are different things:

```js
user_id:     user.id,                       // ← the users PK. THIS is the payroll join key.
employee_id: roleProfile.id || user.id,     // ← the ROLE-PROFILE PK (employee/hr/manager profile row)
```

`employee_id` is the primary key of the role-specific profile row (`employee_profiles` / `hr_profiles` / `manager_profiles`). **It falls back to `user.id` when the role profile is missing**, which is exactly why this bug is intermittent: for employees without a role-profile row the two are identical and your lookup appears to work; for everyone else it silently misses.

**Every `user_id` in the payroll module — run items, preview `error_items`/`excluded_items`, adjustments, bonus awards, `proposed_by`/`approved_by`/`created_by`/`excluded_by` — is a `users.id`, and therefore matches `user_id` on this row.** There is no field named `id` on this row at all.

### Sample — one employee

```json
{
  "success": true,
  "message": "Employees fetched successfully",
  "data": [
    {
      "user_id": "11111111-aaaa-4bbb-8ccc-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "name": "Aarav Mehta",
      "first_name": "Aarav",
      "last_name": "Mehta",
      "email": "aarav.mehta@example.com",
      "personal_email": "aarav.personal@example.com",
      "contact": "+91-90000-00001",
      "avatar_url": "https://cdn.example.com/avatars/aarav.png",
      "employee_id": "ep000001-0000-4000-8000-000000000001",
      "role": "employee",
      "employee_code": "EMP-0042",
      "department_id": "d1d1d1d1-0000-4000-8000-000000000001",
      "department": "Engineering",
      "designation": "Senior Software Engineer",
      "location_id": "10101010-0000-4000-8000-000000000001",
      "work_location": "Bengaluru HQ",
      "work_mode": "hybrid",
      "employment_type": "full_time",
      "joining_date": "2023-07-17",
      "pan_number": "ABCDE1234F",
      "uan_number": "100000000001",
      "blood_group": "O+",
      "marital_status": "single",
      "current_address": "12, Sample Street, Indiranagar, Bengaluru",
      "permanent_address": "12, Sample Street, Indiranagar, Bengaluru",
      "state": "Karnataka",
      "pincode": "560038",
      "dob": "1995-02-11",
      "gender": "male",
      "reporting_person": "9f8e7d6c-0000-4000-8000-00000000000a",
      "is_active": true,
      "status": "active"
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "total_pages": 3 }
}
```

(`ABCDE1234F` and the UAN above are fake, per your instruction. Field names and types are exact.)

### Confirmations

| Question | Answer |
|---|---|
| Which field matches payroll `user_id`? | **`user_id`.** |
| Department included? | **Yes** — both `department_id` (UUID, joinable) and `department` (the resolved name string). |
| Employee code included? | **Yes** — `employee_code`. Can be `null`. |
| Paginated? | **Yes.** `page` default 1, **`limit` default 20, max 100**. Same `{ total, page, limit, total_pages }` sibling object. |
| `purpose` | **Required.** Omitting it → 400 `"Purpose is required to filter employee data"`. `emp_report` is the only purpose that returns the full row (the others are deliberately reduced projections). |
| Other filters | `search` (≤150 chars), `department_id`, `include_inactive`. |

### Three traps that will bite the payroll screens

1. **`include_inactive` defaults to `false`.** A resigned employee who is still in an August payroll run (a leaver, or the very `EXIT_DATE_REQUIRED` item you are trying to render) **will not be in the default list**, and the row will show "Employee not found" again — for a completely different reason than the id-key bug. **For payroll name resolution, always call with `include_inactive=true`.**
2. **`limit` max is 100.** For a 500-person org that is 5 requests. Build the name map once per screen (or cache it app-wide) rather than per table.
3. **`emp_report` returns all roles** (employee, manager and HR), so HR and manager subjects of a payroll run do resolve. But the row carries **PII** — `pan_number`, `uan_number`, both addresses, `dob`, `personal_email`, `marital_status`, `state`, `pincode`. This projection exists for HR reports. **Do not cache it in localStorage or log it**, and do not use it for a lightweight name lookup on a screen that does not need PII — `purpose=all_employee_list` (the slim view: `user_id`, `name`, `email`, `contact`, `role`, `department`, `designation`, `avatar_url`, `work_location`, `dob`, `gender`, `is_active`) is the right choice when all you need is a name, though note it is role-filtered to `employee` only.

## 6.2 — `GET /organizations/departments` (P2)

```json
{
  "success": true,
  "message": "Departments fetched successfully",
  "data": [
    {
      "id": "d1d1d1d1-0000-4000-8000-000000000001",
      "org_id": "1a2b3c4d-0000-4000-8000-000000000001",
      "location_id": "10101010-0000-4000-8000-000000000001",
      "name": "Engineering",
      "description": "Product engineering and platform",
      "head_of_department_id": "9f8e7d6c-0000-4000-8000-00000000000a",
      "is_active": true,
      "created_at": "2025-04-01T04:30:00.000Z",
      "updated_at": "2026-02-11T09:12:45.220Z",
      "location": {
        "id": "10101010-0000-4000-8000-000000000001",
        "name": "Bengaluru HQ"
      },
      "head_of_department": {
        "id": "9f8e7d6c-0000-4000-8000-00000000000a",
        "identifier": "kavya.iyer@example.com",
        "profile": {
          "first_name": "Kavya",
          "last_name": "Iyer",
          "display_name": "Kavya Iyer",
          "avatar_url": "https://cdn.example.com/avatars/kavya.png"
        }
      }
    }
  ]
}
```

| Question | Answer |
|---|---|
| Which key holds the id? | **`id`.** (Note the contrast with §6.1, where the id you want is `user_id`.) |
| Is it paginated? | **No.** There is **no `pagination` key at all** on this response — `data` is the complete list. Do not read `pagination` here; it is `undefined`. |

This `id` is what `department_id` refers to everywhere: in `GET /runs/:id/items?department_id=`, in `preview.department_breakdown[].department_id`, and in `eligibility_config.department_ids`.

Other notes:

- Optional `location_id` query filter.
- **Inactive departments are always included** (`is_active: false` rows are returned). Filter client-side if the picker should hide them — but keep them for *display* lookups, or a run bucketed under a since-retired department will render as "Unknown department".
- `head_of_department` is `null` when unset; when present, the name is at `head_of_department.profile.display_name` (fall back to `first_name + last_name`, then `identifier`).
- Sorted by name.

---

# 7. Your "today vs once answered" table, resolved

| Area | What to change |
|---|---|
| **Cancel run** | Send **only** `cancellation_reason` (1–1000, trimmed, required). Drop `reason`. Hide the action unless `status === 'approved' && !paid_at`. |
| **Validation errors** | Read **`message`** and **`errorCode`** only. There is no `errors[]` and no validation `details`. Best-effort field highlight by extracting the first `"…"` token from `message`; keep client-side validation as the real mechanism. Read `details.errors` **only** for `CSV_PARSE_FAILED` and `BULK_VALIDATION_FAILED`. |
| **Error and warning codes** | Delete the 8 non-existent codes in §1.4. Add the per-endpoint catalogue in §1.4, the item error codes in §3.6(a) and the 10 warning strings in §3.6(b). **Keep the unknown-code fallback** — item error codes are open-ended by design. |
| **"Needs attention" panel** | Use `GET /runs/:id/items?status=error&limit=200` as the single source and delete the preview fallback. The preview's `error_items[]` has no item id, so it cannot drive the fix actions. |
| **Item names** | The payroll responses will **not** give you names — this is a confirmed backend gap (G-2), not something you are reading wrong. Keep the org-employees lookup, key it on **`user_id`**, and call it with **`include_inactive=true`**. |
| **Bulk / batch-cancel / apply counts** | Exact keys: bulk totals `total_rows` / **`ok_rows`** / `error_rows` / **`earnings_total`** / **`deductions_total`**; commit `batch_id` + **`created_count`** + `status`; batch cancel **`cancelled_count`** / **`skipped_applied_count`** / **`skipped_applied_ids`**; bonus apply **`batch_id`** + **`applied_count`**. Remove the multi-key guessing. |
| **Bonus preview** | Keep only `{ rule, awarded_count, skipped_count, total_award_amount, awards[], skipped[], note }`. `basis` is **per award**. `basis_amount`, not `basic_salary`. No `capped`, no name. |
| **Bonus rule payload** | **No switch needed.** `bonus_type` + `eligibility_config` is correct. Remove `percent_of_ctc`, `min_tenure_days`, `exclude_notice_period`. Add `employment_types` if wanted. Remember `PUT` is a full replace. |

---

# 8. Attendance HR tab shows "Unknown"

## The endpoint, exactly as it responds

`GET /api/v1/attendance/hr/hrs/attendance?date=2026-09-14&page=1&limit=20`

```json
{
  "success": true,
  "message": "HR staff attendance list fetched successfully",
  "data": {
    "pagination": { "total": 3, "page": 1, "limit": 20, "total_pages": 1 },
    "records": [
      {
        "user_id": "9f8e7d6c-0000-4000-8000-00000000000a",
        "name": "Kavya Iyer",
        "role": "hr",
        "employee_code": "HR-0001",
        "department": "People Operations",
        "designation": "HR Manager",
        "avatar_url": "https://cdn.example.com/avatars/kavya.png",
        "date": "2026-09-14",
        "status": "present",
        "clock_in_time": "2026-09-14T03:32:11.000Z",
        "clock_out_time": null,
        "effective_hours": 5.4,
        "late_minutes": 2,
        "overtime_minutes": 0,
        "work_mode": "office",
        "is_regularized": false
      }
    ]
  }
}
```

> ⚠️ **This is the one endpoint in the product where `pagination` is nested INSIDE `data`**, alongside `records`. Everywhere else it is a sibling of `data`. If your HR tab reads `response.pagination`, it is reading `undefined` — worth checking while you are in there.

## Where `first_name` sits: **it does not**

**There is no `first_name` key anywhere in this response.** The list row exposes a single pre-composed **`name`** field and nothing else name-related — no `first_name`, no `last_name`, no nested `profile` or `user` object. The record keys are exactly the 17 shown above.

So the "Unknown" you are seeing is **already the backend's output**, not a key you failed to read.

## Root cause — this is a backend data gap, not a frontend bug

`name` is composed server-side as:

```
display_name  ||  (first_name + " " + last_name)  ||  "Unknown"
```

…from the org-scoped **`user_profiles`** row. The literal string `"Unknown"` is the backend's final fallback when that row is missing.

And it is missing for a specific, predictable population: **the HR user created as part of organization sign-up.** Org creation assigns the HR role and creates the HR *role profile*, but it never creates a `user_profiles` row — `upsertUserProfile` is only ever called from the invitation flow. So:

| How the HR user was created | `user_profiles` row | Name shown |
|---|---|---|
| Invited into the org | ✅ created | real name |
| **Org founder / sign-up HR** | ❌ **never created** | **`"Unknown"`** |

That is why it is the HR tab specifically, and typically exactly one person on it.

**There is no frontend workaround that makes this correct** — the data does not exist to send. Two options:

1. **Backend fix (recommended, and ours to do):** create the `user_profiles` row at organization creation, and backfill existing orgs. Tracked as **G-8**. Tell us the priority and we will schedule it; it is a small service change plus a one-off backfill.
2. **Interim frontend mitigation:** when `name === "Unknown"`, fall back to the org employees list (§6.1) keyed on `user_id` — that row's `name` falls back to `user.identifier` (the email) rather than the literal "Unknown", so you would at least show an email instead of nothing. Cosmetic only.

## The per-user monthly endpoint

`GET /api/v1/attendance/hr/hrs/{userId}/attendance?month=9&year=2026` is a **different** shape (a month of that one person's records, not a roster), and it is not where the tab's name comes from. If you want its full contract documented, say so and we will add it — it was out of scope for this round.

---

# Appendix A — Quick reference card

## Response envelopes

| Kind | Shape |
|---|---|
| Non-paginated success | `{ success: true, message, data }` |
| Paginated success (payroll + organizations) | `{ success: true, message, data: [], pagination: { total, page, limit, total_pages } }` |
| Paginated success (**attendance HR list only**) | `{ success: true, message, data: { pagination, records } }` |
| Error | `{ success: false, message, errorCode, details?, stack? }` |

## Limits and defaults

| Endpoint | `limit` default | `limit` max |
|---|---|---|
| `GET /payroll/hr/runs` | 20 | 100 |
| `GET /payroll/hr/runs/:id/items` | **50** | **200** |
| `GET /payroll/hr/adjustments` | 20 | 100 |
| `GET /payroll/hr/bonus-rules` | 20 | 100 |
| `GET /organizations/employees` | 20 | 100 |
| `GET /organizations/departments` | — | not paginated |
| Bulk adjustment CSV | — | 5000 rows |
| All reason/name text fields | — | 1000 chars (`component_name`: 150) |

## HTTP status codes you will actually see

| Status | When |
|---|---|
| 200 | Reads; approve / pay / cancel / reject; item mutations; bulk **preview**; batch cancel; bonus preview-impact |
| **201** | `POST /runs`, `POST /adjustments`, **`POST /adjustments/bulk`** (commit), `POST /bonus-rules`, **`POST /bonus-rules/:id/apply`** |
| 400 | `VALIDATION_ERROR` only |
| 403 | Wrong role / plane, `FORBIDDEN`, `SEPARATE_CHECKER_REQUIRED`, `ELIGIBILITY_SOURCE_NOT_PERMITTED` |
| 404 | `*_NOT_FOUND` |
| 409 | State-machine conflicts (`RUN_*`, `RULE_*`, `PROPOSAL_NOT_PENDING`, `ITEM_NOT_EXCLUDED`, `RUN_CALCULATION_IN_PROGRESS`) |
| 422 | Business-rule / data failures (`INVALID_PERIOD_OVERRIDE`, `PERIOD_CLOSED_FOR_ADJUSTMENT`, `TAX_TABLES_MISSING`, `CSV_*`, `BULK_VALIDATION_FAILED`, `COMPONENT_NOT_FOUND_OR_INACTIVE`, `RULE_NO_ELIGIBLE_EMPLOYEES`) |
| 500 | `CALCULATION_FAILED`, `ITEM_PERSIST_FAILED`, `INTERNAL_ERROR` |

## The five fixes with the largest user-visible impact

1. `user_id`, not `employee_id`, **with `include_inactive=true`** (§6.1) — kills "Employee not found".
2. Send only `cancellation_reason` and gate Cancel on `approved && !paid_at` (§2.1, §2.2).
3. Drop the calculate polling loop and raise that call's timeout (§2.3).
4. Replace the 8 phantom error codes with the real ones (§1.4).
5. Use `items?status=error` for "needs attention"; the preview has no item id (§3.3, §3.4).

---

# Appendix B — Backend gaps we are acknowledging

These are **our** shortcomings, not yours. Each is additive and non-breaking. Tell us which you want and in what order.

| # | Gap | Impact on your screens | Proposed fix |
|---|---|---|---|
| **G-1** | Validation errors return only the **first** Joi message, with no field path. | You cannot highlight all invalid fields from the response. | Add `details: [{ path, message }]` for `VALIDATION_ERROR`, keeping `message` unchanged for backward compatibility. |
| **G-2** | **No payroll response carries any name** — not the employee's, not the actor's. Run items, preview, adjustments and bonus rules are all UUID-only. | Every payroll table needs a second request plus a client-side join. Drives the "Employee not found" class of bug. | Add an opt-in `?include=employee` that eager-loads `{ name, employee_code, department }` onto run items / adjustments / bonus awards. |
| **G-3** | A `failed` run exposes `failure_reason` (a sentence) but **not the error code**. | You cannot map a failed run to a written explanation; you can only print the raw message. | Add `failure_code` to the run header. |
| **G-4** | `EXIT_DATE_REQUIRED` hides the inferred last working day **inside a prose sentence**. | You must regex-parse English to pre-fill the date picker. | Add a structured `error_context: { inferred_last_working_day }` on the item. |
| **G-5** | **No upper bound on bonus `value`** for percentage types. | A typo (`500` instead of `5`) creates a rule that awards 5× gross to everyone; only an optional per-employee cap stands in the way. | Bound percentage types at 100 in the validator (and require an explicit override flag above a threshold). |
| **G-6** | List endpoints return **full JSONB snapshots** (`settings_snapshot` on every run row; `structure_snapshot` / `attendance_snapshot` / `statutory_snapshot` on every item row). | A 200-item page is a very large payload. | Add a lean projection (default) with the snapshots behind `?include=snapshots`. |
| **G-7** | Bonus preview applies `max_amount_per_employee` **silently** — no `capped` flag. | You cannot honestly tell HR which awards were reduced; comparing to the cap is an inference. | Add `capped: boolean` and `uncapped_amount` to each award. |
| **G-8** | **Org-founder HR users have no `user_profiles` row**, so their name renders as the literal `"Unknown"`. | The §8 bug. Unfixable from the frontend. | Create the profile row at organization creation + backfill existing orgs. |

---

*Prepared by the backend team against `development`. If any response you observe disagrees with this document, that is a bug on our side — send us the endpoint, the request and the raw response and we will fix it.*
