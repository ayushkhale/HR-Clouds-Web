# Payroll: Backend Response to Gaps G-1 … G-8

**From:** Backend (Payroll module)
**To:** Frontend (HR panel)
**Date:** 2026-09-14
**Re:** `PAYROLL_BACKEND_GAPS_REQUEST.md` — you asked for all eight, plus (1) ship order + rough dates, (2) final key names for G-2 and the G-5 override flag, (3) one sample per gap.

---

## How to read this file

1. **The contracts below are final and are safe to code against.** Where you proposed a shape, I either accept it verbatim or state the one change and why. Key names will not move after this.
2. **Every JSON sample is built field-by-field from the code that will produce it, with fake values** (fake UUIDs, `EMP-…` codes, PAN `ABCDE1234F`, invented salary figures). They are *not* captured from a running server. The **field names, types, nullability, and DECIMAL-as-string** are exact; the numbers are illustrative. Real on-`development` samples come after each gap is built (your request #3).
3. **I have committed to an engineering order and to effort sizes, not to calendar dates.** Sizing is mine to give from the code; the actual sprint dates are a scheduling call for whoever picks up the tickets. Where you asked for "a rough date for G-2 and G-8," I have given the size, the dependencies, and what makes them the two longest — see §0.1.
4. **Nothing here is built yet.** This document is the design + contract sign-off. On your go-ahead I can implement Wave 1 (G-5, G-7, G-1) immediately — those need no migration — and proceed down the waves.

---

## §0 — Direct answers to your three questions

### §0.1 The order we'll ship in, and why it differs from yours

Your order was by HR pain (G-2, G-8 first). I'm proposing an order by **safety-and-effort ratio**, because two of your lowest-ranked items are nearly free *and* one of them (G-5) closes a real money-loss hole. Grouping by whether a **database migration** is needed:

| Wave | Gaps | Migration? | Size | Rationale |
|---|---|---|---|---|
| **1** | **G-5**, then **G-7**, **G-1** | No | S · S · S | Validator/util/one-function changes. G-5 first: it stops a `500`-instead-of-`5` typo paying **5× salary to everyone** — highest safety-to-effort item in the whole list. |
| **2** | **G-3**, **G-4** | Yes (add column) | S · M | One nullable column each, populated at existing failure/compute sites. G-3's value is already computed (see §G-3). |
| **3** | **G-6** | No | M | Read-path projection on two list endpoints. Additive but touches a hot path, so it gets its own wave with a test that the payslip detail still carries snapshots. |
| **4** | **G-8** | Yes (+ backfill) | M–L | New `user_profiles` row at sign-up **plus an idempotent backfill** for existing orgs. Data-changing, so it stands alone. |
| **5** | **G-2** | No (read-time join) | L | The largest by far: a batch name-resolver wired into five endpoints plus actor fields. It should **not block** the cheap wins in front of it. |

**On your top-two priority (G-2, G-8):** I hear that the org-list fan-out and the `"Unknown"` name are your biggest daily pain. They are also my two **longest** items — G-2 because it re-introduces names into responses that were deliberately name-free (§G-2), and G-8 because a backfill over existing orgs must be idempotent and safe to re-run. They are **independent of Waves 1–3**, so if the pain outweighs the safety fixes we can start G-8 in parallel with Wave 1 and begin G-2 alongside — neither depends on the others. What I will *not* do is let G-2's size delay G-5, which is a financial-integrity fix that ships in an afternoon.

**Rough sizing (not dates):**
- Wave 1 — a single PR, no schema change. Ready the day it's picked up.
- Waves 2–4 — each a small-to-medium PR with one migration (Wave 4 also a backfill script).
- G-2 — its own PR; the bulk is the shared resolver + tests, not any single endpoint.

If you need calendar commitments, tell me which waves to schedule and I'll turn these into dated tickets.

### §0.2 Final key names

| Gap | Key(s) — **final** | Notes |
|---|---|---|
| **G-2 employee** | `employee` = `{ user_id, name, employee_code, department, is_active }` | Accepted with two added fields (`user_id` echoed for convenience; nothing else). Gated by `?include=employee`. |
| **G-2 actors** | append **`_user`** to each actor UUID field → `proposed_by_user`, `approved_by_user`, `excluded_by_user`, `created_by_user`, `cancelled_by_user`, `rejected_by_user`, `applied_by_user`; each = `{ user_id, name }` | Same `?include=employee` switch turns these on too. |
| **G-2 / G-6 combined** | `?include=employee,snapshots` (comma list) | One `include` param serves both gaps; unknown tokens are ignored. |
| **G-5 override flag** | **None.** No override flag. | Per "no speculative configurability." `value ≤ 100` is enforced for `percent_of_gross`/`percent_of_basic` only; `flat` stays uncapped (it's rupees). If a real >100% case ever appears we'll revisit then, not now. |
| **G-3** | `failure_code` (string \| null) | Beside `failure_reason` on every run-header response. |
| **G-4** | `error_context` = `{ inferred_last_working_day: "YYYY-MM-DD" \| null }` | `null`, never the word `"unknown"`. |
| **G-1** | `details` = `[{ path, message }]` on `VALIDATION_ERROR` | `path` dot-joined. CSV codes keep `details = { errors: [...] }` — see §G-1 on the (non-)clash. |
| **G-7** | `capped` (bool), `uncapped_amount` (decimal string) | Added to each `awards[]` row. |

### §0.3 On the samples "once it's on development"

Below, each gap has a **proposed** sample built from its response code. When a gap lands on `development` I'll post the captured sample against it; I don't expect the shape to change from what's here, because these are derived from the exact serialization paths.

---

## §G-2 — Employee & actor names in payroll responses  *(Wave 5, size L)*

**Accepted**, with the contract in §0.2. Trigger: `?include=employee`.

### Why this one is large (and why it's last, not because it's low-value)
Payroll responses are **name-free by design**, not by omission. The repositories load no associations, so run items, adjustments, bonus awards and preview blocks all carry bare `user_id`s (confirmed: `preview` builds `error_items` as `{ user_id, error_code, error_reason }` at [payroll_run.service.js:1021](src/modules/payroll/services/payroll_run.service.js#L1021); eligibility `exit_date_required[]` carries `{ user_id, employee_code, reason }` at [payroll_run.service.js:262](src/modules/payroll/services/payroll_run.service.js#L262)). Adding names touches five endpoints at once and must not regress into an N+1.

**How it will be built (no new PII):**
- A single shared resolver takes every `user_id` in the response (employees **and** actors), and returns `user_id → { name, employee_code, department, is_active }` in **one pass across the three role-profile tables + `user_profiles`** — the same 3-table `Promise.all` pattern `buildSettingsSnapshot` already uses at [payroll_run.service.js:215-220](src/modules/payroll/services/payroll_run.service.js#L215-L220). No per-row query.
- The exposed fields are exactly those on the org **directory view** (`name`, `department`, no PAN/UAN/address/dob) — see [employee_formatter.utils.js:102-113](src/modules/organization/utilities/employee_formatter.utils.js#L102-L113). So `?include=employee` exposes **no PII the endpoint didn't already gate behind `hr` auth**.
- **No active-only filter** — leavers and removed actors resolve, so `is_active` can be `false`. This is the fix for your intermittent "Employee not found".
- Applies to: `GET /runs/:id/items`, `GET /runs/:id/items/:itemId`, `GET /runs/:id/preview` (employee objects inside `error_items` / `excluded_items` / `warning_items`), `GET /adjustments` and `/adjustments/:id`, `POST /bonus-rules/:id/preview-impact` (`awards[]` and `skipped[]`).

**Sample — `GET /payroll/hr/runs/{runId}/items?include=employee` (one row):**
```json
{
  "success": true,
  "message": "Run items fetched",
  "data": [
    {
      "id": "8f2c1a7e-0d4b-4b1a-9c3e-1a2b3c4d5e6f",
      "run_id": "3b9d6f10-2c8a-4e5f-8a1b-7c6d5e4f3a2b",
      "user_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "status": "calculated",
      "net_pay": "58420.00",
      "employee": {
        "user_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "name": "Aarav Mehta",
        "employee_code": "EMP-0042",
        "department": "Engineering",
        "is_active": true
      }
    }
  ],
  "pagination": { "total": 1, "page": 1, "limit": 50, "total_pages": 1 }
}
```

**Sample — actor object on an adjustment (`GET /payroll/hr/adjustments?include=employee`, trimmed):**
```json
{
  "id": "c7e8...",
  "user_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "employee": { "user_id": "a1b2c3d4-...", "name": "Aarav Mehta", "employee_code": "EMP-0042", "department": "Engineering", "is_active": true },
  "proposed_by": "d4c3b2a1-...",
  "proposed_by_user": { "user_id": "d4c3b2a1-...", "name": "Kavya Iyer" },
  "approved_by": "d4c3b2a1-...",
  "approved_by_user": { "user_id": "d4c3b2a1-...", "name": "Kavya Iyer" }
}
```
Without `?include=employee`, every one of these `employee` / `*_user` keys is **absent** (not `null`) — your existing fallback path is untouched, so it is safe for us to ship before you send the param.

---

## §G-8 — `user_profiles` row for the founding HR  *(Wave 4, size M–L)*

**Accepted.** Confirmed root cause: at org sign-up the founding HR gets a `UserRole` and an `HrProfile` via `upsertRoleProfile('hr', …)` ([organization.service.js:107-113](src/modules/organization/services/organization.service.js#L107-L113)), but **no `user_profiles` row is ever created** — and the same omission repeats at the second HR-provisioning site ([organization.service.js:248](src/modules/organization/services/organization.service.js#L248)). With no `user_profiles` row, the name composer has nothing to read and falls back to `"Unknown"`.

**Fix (two parts):**
1. **At creation:** write a `user_profiles` row in the *same transaction* as the HR role profile, at both sites, seeded from the sign-up payload's name if present (else `first_name`/`last_name` = `null`, which makes the composer fall back to the user's email/identifier — never the literal `"Unknown"`).
2. **Backfill migration** for existing orgs: insert a `user_profiles` row for every HR/member that has a role profile but no `user_profiles` row. It will be **idempotent** (a `WHERE NOT EXISTS` guard so re-running is a no-op) and safe under the `(org_id, user_id)` unique index.

**On removing your interim fallback:** once the backfill runs, the attendance HR tab will get a real `name` (or the email fallback for nameless profiles) and **never the literal string `"Unknown"`**. So: keep your `"Unknown"`-detection fallback until we confirm the backfill has run in each environment; after that it becomes dead code you can drop. The value it "becomes" is the person's real name, or their email if they never filled a name in — not a sentinel.

**Sample — `GET /attendance/hr/hrs/attendance` (one row, after backfill):**
```json
{
  "user_id": "f0e1d2c3-b4a5-4968-8776-5a4b3c2d1e0f",
  "name": "Ishaan Kapoor",
  "email": "ishaan@acme-hr.example",
  "date": "2026-09-01",
  "status": "present"
}
```
(For an HR who never set a name, `name` becomes `"ishaan@acme-hr.example"`, not `"Unknown"`.)

---

## §G-5 — Cap percentage bonuses  *(Wave 1, size S, ship first)*

**Accepted, no override flag.** Confirmed the hole: `value` is `positiveMoneyLike.required()` with **no upper bound** ([payroll_hr.validator.js:341](src/modules/payroll/validators/payroll_hr.validator.js#L341)), and the evaluator multiplies it straight through — `percentOfPaise(basePaise, rule.value)` at [bonus_rule_evaluator.utils.js:141](src/modules/payroll/utils/bonus_rule_evaluator.utils.js#L141). So `value: 500` on a `percent_of_gross` rule pays 500% = 5× monthly gross to every eligible employee.

**Fix:** make `value` conditional on `bonus_type` in **both** `createBonusRuleSchema` and the PUT schema (PUT is a full replace, so `bonus_type` is present there too): for `percent_of_gross` / `percent_of_basic`, `value` must be `≤ 100`; for `flat`, it stays uncapped (rupees). Rejected with `400 VALIDATION_ERROR`.

**Sample — `POST /payroll/hr/bonus-rules` with `{ "bonus_type": "percent_of_gross", "value": 500, ... }`:**
```json
{
  "success": false,
  "message": "\"value\" must be less than or equal to 100",
  "errorCode": "VALIDATION_ERROR"
}
```
`flat` rules and `percent_*` rules with `value ≤ 100` are unaffected. There is **no override flag** — if a genuine >100% need ever arises we'll add one deliberately, not pre-build it.

---

## §G-3 — `failure_code` on the run header  *(Wave 2, size S)*

**Accepted.** The code is **already computed** — the failed-run audit records `(error && error.errorCode) || 'CALCULATION_FAILED'` at [payroll_run.service.js:993](src/modules/payroll/services/payroll_run.service.js#L993); it just isn't persisted to a column.

**Fix:** add a nullable `failure_code STRING(50)` column to `payroll_runs`, set it at the two places `failure_reason` is set today — the item-persist failure (`'ITEM_PERSIST_FAILED'`, [payroll_run.service.js:910](src/modules/payroll/services/payroll_run.service.js#L910)) and the calculation failure ([payroll_run.service.js:986](src/modules/payroll/services/payroll_run.service.js#L986), where the errorCode is already in hand), and clear it back to `null` when a run re-enters `calculating` (beside the existing `failure_reason: null` at [payroll_run.service.js:668](src/modules/payroll/services/payroll_run.service.js#L668)). It's serialized automatically because run headers are returned as model rows.

**The realistic value set** (from the calculation service's throws, [payroll_calculation.service.js](src/modules/payroll/services/payroll_calculation.service.js)):
`CALCULATION_FAILED` (fallback), `ITEM_PERSIST_FAILED`, `NO_SALARY_STRUCTURE`, `INVALID_LOP_DIVISOR`, `NEGATIVE_NET_PAY`, `INVALID_COMPONENT_AMOUNT`, `CTC_RECONCILIATION_FAILED`, `OVERTIME_BASIS_UNRESOLVED`, plus statutory failures such as `TAX_TABLES_MISSING`. Treat it as open-ended and always keep showing `failure_reason` for codes you don't have a "What to do" line for.

**Sample — `GET /payroll/hr/runs/{runId}` for a failed run:**
```json
{
  "success": true,
  "message": "Run fetched",
  "data": {
    "id": "3b9d6f10-2c8a-4e5f-8a1b-7c6d5e4f3a2b",
    "status": "failed",
    "period_month": "2026-08",
    "failure_reason": "Statutory rate tables are not configured for FY 2026-27",
    "failure_code": "TAX_TABLES_MISSING"
  }
}
```
On a run that never failed, `failure_code` is `null` (as `failure_reason` already is).

---

## §G-4 — Structured inferred last working day  *(Wave 2, size M)*

**Accepted.** The date is **already computed as a real value** and then buried in prose: `_inferLastWorkedDate(...)` returns `inferred`, which is string-interpolated into the reason at [payroll_attendance_aggregator.service.js:297-299](src/modules/payroll/services/payroll_attendance_aggregator.service.js#L297-L299) as `"… Inferred last working day: ${inferred || 'unknown'}. …"`.

**Fix:** add a nullable `error_context JSONB` column to `payroll_run_items`; on an `EXIT_DATE_REQUIRED` entry, store `{ inferred_last_working_day: inferred || null }` (note: `null`, not `'unknown'`) alongside the existing `error_code`/`error_reason`. Surface it in the item list, item detail, and the eligibility `exit_date_required[]` block (that path is computed live, so it attaches directly without touching the column). The prose `error_reason` stays as-is for your fallback parser.

**Sample — an `EXIT_DATE_REQUIRED` item (`GET /payroll/hr/runs/{runId}/items?status=error`):**
```json
{
  "id": "b2c3d4e5-...",
  "user_id": "a1b2c3d4-...",
  "status": "error",
  "error_code": "EXIT_DATE_REQUIRED",
  "error_reason": "Employee appears inactive with employment evidence in the period. Inferred last working day: 2026-08-14. Set the exit date via a period override (#47) or exclude the item.",
  "error_context": { "inferred_last_working_day": "2026-08-14" }
}
```
When it can't be inferred: `"error_context": { "inferred_last_working_day": null }` (and the sentence reads `"… Inferred last working day: unknown. …"` — parse the structured field, not the sentence).

---

## §G-1 — All validation problems, with field paths  *(Wave 1, size S)*

**Accepted.** This is nearly free: `validateOrThrow` already runs Joi with `abortEarly: false`, so `error.details` **already contains every problem** — the code simply throws `error.details[0].message` and drops the rest ([validator.utils.js:5-13](src/common/utilities/validator.utils.js#L5-L13)). And the error middleware already forwards any `err.details` it finds ([error.middleware.js:16-18](src/common/middlewares/error.middleware.js#L16-L18)).

**Fix:** in `validateOrThrow`, keep `message` = the first message (unchanged, so nothing that reads `message` today breaks), and attach `err.details = error.details.map(d => ({ path: d.path.join('.'), message: d.message }))` before throwing. `path` is dot-joined, so nested keys read as `eligibility_config.min_tenure_months`.

**On the CSV (non-)clash — confirmed safe:** `VALIDATION_ERROR` will carry `details` as an **array**; the CSV codes (`CSV_PARSE_FAILED`, `BULK_VALIDATION_FAILED`) carry `details` as an **object** `{ errors: [...] }`. They never appear under the same `errorCode`, so **branch on `errorCode`**, not on the type of `details`: if `errorCode === 'VALIDATION_ERROR'` read `details` as `[{path, message}]`; for the CSV codes read `details.errors`. Nothing about the CSV shape changes.

**Sample — a two-field failure:**
```json
{
  "success": false,
  "message": "\"cancellation_reason\" is required",
  "errorCode": "VALIDATION_ERROR",
  "details": [
    { "path": "cancellation_reason", "message": "\"cancellation_reason\" is required" },
    { "path": "amount", "message": "\"amount\" must be a positive number" }
  ]
}
```
`message` is still the first problem, so single-message consumers are unaffected. Field highlighting can key off `path` once this ships.

---

## §G-7 — `capped` and `uncapped_amount` on bonus awards  *(Wave 1, size S)*

**Accepted.** Confirmed the discard: the evaluator caps in place — `if (capPaise !== null && amount > capPaise) amount = capPaise` at [bonus_rule_evaluator.utils.js:144-146](src/modules/payroll/utils/bonus_rule_evaluator.utils.js#L144-L146) — and the pre-cap value is lost before `awards.push(...)` at line 148.

**Fix:** capture the uncapped amount before the cap, then push `capped` and `uncapped_amount` too:
- `capped` = `capPaise !== null && uncappedPaise > capPaise` (true only when the cap actually bit — so an amount that lands *exactly* on the cap is correctly `capped: false`, which is the edge your current guess gets wrong).
- `uncapped_amount` = the pre-cap amount as a decimal string (same formatting as `amount`).
This flows straight into `preview-impact`'s `awards[]`.

**Sample — one `awards[]` row from `POST /payroll/hr/bonus-rules/{id}/preview-impact`:**
```json
{
  "user_id": "a1b2c3d4-...",
  "amount": "25000.00",
  "capped": true,
  "uncapped_amount": "34986.00",
  "basis": "structure_monthly_gross",
  "basis_amount": "116620.00"
}
```
When the cap didn't bite: `"amount": "18000.00", "capped": false, "uncapped_amount": "18000.00"`. (`basis` is `flat` / `structure_basic` / `structure_monthly_gross` per [bonus_rule_evaluator.utils.js:124-128](src/modules/payroll/utils/bonus_rule_evaluator.utils.js#L124-L128).)

---

## §G-6 — Lean list projections  *(Wave 3, size M)*

**Accepted.** Confirmed the weight: `settings_snapshot` is a frozen multi-KB JSONB blob on every run ([payroll_run.service.js:50-51, 167-172](src/modules/payroll/services/payroll_run.service.js#L50-L51)), and each item carries three JSONB snapshots (`structure_snapshot`, `attendance_snapshot`, `statutory_snapshot` — [payroll_run_items.model.js:115-122, 227-230](src/modules/payroll/models/payroll_run_items.model.js#L115-L122)). A 200-row item page ships all of them for nothing.

**Fix:** default the two **list** endpoints to omit these blobs, and return them only on `?include=snapshots`:
- `GET /runs` rows — omit `settings_snapshot` by default.
- `GET /runs/:id/items` rows — omit `structure_snapshot` / `attendance_snapshot` / `statutory_snapshot` by default.
- `GET /runs/:id/items/:itemId` (detail) — **unchanged**, always full. Your payslip view keeps reading them there.
The `include` token composes with G-2: `?include=employee,snapshots`.

**Sample — `GET /payroll/hr/runs/{runId}/items` (default, lean row):**
```json
{
  "id": "8f2c1a7e-...",
  "user_id": "a1b2c3d4-...",
  "status": "calculated",
  "payable_days": "30.00",
  "gross_earnings": "68000.00",
  "total_deductions": "9580.00",
  "net_pay": "58420.00"
}
```
The `*_snapshot` keys are **absent** by default and present (unchanged shape) with `?include=snapshots`. Since your lists never read them, no frontend change is needed either way.

---

## §Appendix — What I need from you / what's next

1. **Go/no-go on the order in §0.1.** My default: ship **Wave 1 (G-5 → G-7 → G-1)** as one PR first, since it needs no migration and G-5 closes the 5×-salary hole. Say the word and I'll start it.
2. **Whether to fast-track G-8 and/or G-2** in parallel with Wave 1 (they're independent), if the "Unknown" name and the org-list fan-out are hurting more than the safety fixes.
3. **Confirm the key names in §0.2** — especially the `*_user` actor suffix and the single combined `?include=employee,snapshots` param. If those read well to you, they're locked.
4. Calendar dates: tell me which waves to schedule and I'll cut dated tickets; I've deliberately not invented dates here.

Each gap's real on-`development` sample (your request #3) will be posted against this doc as its wave lands.
