# Phase 2 — Payroll Engine Core: Attendance/Leave Aggregation & the Run
*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_payrolls/implementation_plan.md) — the module's single source of truth. Every decision below implements a decision recorded there (`D-1` … `D-14`), or adds one (`D-15`, `D-16`) that the parent must be amended to carry. **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**
> **Predecessor:** [phase1_implementation_plan.md](public/md_payrolls/phases/phase1_implementation_plan.md) — **implemented**. Phase 2 builds on it and changes none of its tables, routes or behaviour.
> **Status:** Not started.
> **Depends on:** Phase 1 (component flags, structure versioning spine, `payroll_settings`, `payroll_audit_logs`, `money.utils`, `payroll_access.utils`). Consumes — **read-only** — Attendance (`attendance_records`, `attendance_overtime`, holidays, calendar exceptions, weekly-off rules, `lock.service`) and Leave (`leave_requests`, `leave_types`).

---

## 1. Goal & Boundary

**Goal.** Turn *what a person is paid* (Phase 1) into *what they are paid this month*. Deliver the Manager doc's headline flow — **select period → review readiness → auto-calculate → preview → execute** — end to end over real attendance and leave data, with an immutable, reproducible per-employee snapshot behind every figure.

Phase 2 establishes the three things every later phase plugs into:

1. **The day ledger** — one authoritative per-date classification per employee per period (§5.4). Phases 3–7 never re-derive it; they read `payroll_run_items.attendance_snapshot`.
2. **The calculation contract** — `computePayrollItem(...)` as a pure function (parent §5 Steps 1–9). Phases 3–5 extend it by feeding extra inputs, never by rewriting it.
3. **The run lifecycle and the period lock** — the state machine, the advisory lock, per-item error isolation, and D-3's reuse of `lock.service` as *the* payroll lock.

### 1.1 Explicitly in scope

* 3 tables, 3 models, 3 repositories, 4 services, 4 new **pure** utility modules, 20 endpoints (**#37–#56**).
* Batched org-month attendance/leave aggregator (**D-2**) — O(number of source tables) queries, not O(employees × days).
* The engine: period window, day ledger, structure resolution incl. mid-month revision (EC-3), earnings, proration, LOP, approved overtime, net pay, reconciliation asserts.
* Run lifecycle `draft → calculating → calculated → approved → paid`, plus `cancelled` / `failed`; advisory lock; resumable batched calculation; idempotent recalculation.
* Approval creates the attendance period lock (**D-3**); cancellation releases it.
* Employee & manager **payslip-as-JSON** reads over approved runs.
* 4 new org settings (**#41–#44**) and the unit suites for every pure module.

### 1.2 Explicitly NOT in scope (do not build these here)

| Deferred | Phase |
|---|---|
| Bonuses, incentives, ad-hoc adjustments, loans/EMI | 3 |
| **Real PF / ESI / PT / TDS.** Statutory components remain `is_active = false` from Phase 1 | 4 |
| Reimbursements, benefits, attachments | 5 |
| `payslips` table, PDF, CSV, bank advice, reports, bulk export, email dispatch | 6 |
| Crons, arrears/retro (D-12), off-cycle runs, F&F, comp-off encashment | 7 |

> **Honesty guard.** Phase 2 computes a net figure with **no statutory withholding**, because Phase 4 owns that. Every run item's snapshot carries `statutory_status: 'not_applied'`, the run header carries `engine_version`, and every payslip payload exposes both. A Phase-2 `net_pay` is **gross minus LOP minus nothing else**; it must never be presented to an employee as final take-home. A reviewer seeing a Phase-2 payload without `statutory_status` should treat it as a defect.

---

## 2. Pre-Flight Checks (do these before writing code)

Each of these is a fact verified in the live codebase, and each one silently breaks the engine if missed.

1. **Next migration number is `00038`** (latest is `00037-create-payroll-module.js`).
2. **Wiring is already done.** `modules/payroll/models` is in `MODEL_ROOTS` and `payroll.index.js` is mounted in [app.js:44](src/app.js#L44). Phase 2 adds **no** wiring edits — new models in `models/` autoload.
3. **Feature gate is unchanged.** Phase 1 never added the `008-seed-payroll-features.js` sub-keys the parent §2 anticipated; everything still gates on `payroll.access`. **Do not introduce sub-keys in this phase** — that is a separate seeding change with its own plan-feature mapping.
4. **`weekly_off` and `holiday` are never persisted.** Those days have **no `attendance_records` row at all**. The engine therefore cannot count rows to get paid days — it must resolve the calendar itself (§5.2). Counting rows is the single most likely way to ship a wrong payslip.
5. **`attendance_records.status` is a free `STRING(30)`, no DB enum.** Handle an unrecognised value as an item-level `error`, never as a silent 0 or 1.
6. **`leave_requests.paid_days` / `unpaid_days` are scalars for the whole request**, and a request can straddle the period boundary. D-4's per-date allocation is mandatory, and it must run over the request's **full span**, not the clipped-to-period slice (§5.3).
7. **`lock.service.createLock` is not transaction-aware today** — it calls `lockRepository.create(lockData)` without a transaction, while the repository already accepts one. Run approval must be atomic with lock creation, so §5.7 adds an optional trailing `transaction` parameter (backwards compatible, no call-site changes).
8. **No exit-date column exists anywhere** — not on `employee_profiles`, `manager_profiles` or `hr_profiles`; `grep` for `exit_date|last_working_day|relieving_date` returns nothing. `job_status` has a `terminated` value and `users.status` has `inactive`, but neither carries a *date*. See **D-15** (§5.1) — do not invent a column in another module's table.
9. **No org-level timezone column exists** (only `organization_locations.timezone`). The period is therefore a plain **DATEONLY calendar month**; every date the engine touches (`attendance_records.date`, `leave_requests.start_date`, holidays, exceptions) is already `DATEONLY`. This resolves **EC-28** by construction: no timezone conversion happens anywhere in the ledger, so there is no boundary ambiguity to get wrong. Never `new Date()` a `DATEONLY` value into a timestamp.
10. **Express 5: `req.query` is getter-only.** Every list/report endpoint validates query params **inside the controller** via `validateOrThrow`, exactly as [payroll_hr.controller.js:45](src/modules/payroll/controllers/payroll_hr.controller.js#L45) already does.
11. **Sequelize returns `DECIMAL` as a string.** Feed it straight to `toPaise()`. A `Number()` round-trip is the bug `money.utils` exists to prevent.
12. **`toPaise` rejects negative values by default.** `parseDecimalToScaled`'s `allowNegative` defaults to `false` and throws `422 NEGATIVE_MONEY` ([money.utils.js:67](src/modules/payroll/utils/money.utils.js#L67)). The only Phase-2 value that is legitimately negative is the down-rounding adjustment line, which must pass `{ allowNegative: true }` (§4.3). Everything else negative is a bug and should keep throwing.
13. **`pg_advisory_xact_lock` releases at commit.** Any flow spanning multiple transactions (§7.2 does) is *not* protected by a lock taken in the first one. Mutual exclusion there comes from the `calculating` status guard; the advisory lock only serialises single-transaction critical sections.
14. **No `deactivated_at` column exists on `users`** — only `status`, `last_login_at`, `password_updated_at` and `updated_at`. `updated_at` is not a deactivation signal (§5.5 population rule).
15. **`attendance_lock_periods` is not paranoid** and `deleteById` is a hard `destroy`, so a released lock leaves no soft-deleted row to obstruct a re-run (§7.3–§7.4).

---

## 3. Directory Structure (additions only)

```text
src/modules/payroll/
├── models/
│   ├── payroll_runs.model.js                       ← new
│   ├── payroll_run_items.model.js                  ← new
│   └── payroll_run_item_components.model.js        ← new
├── repositories/                                   ← one per model, same names
├── services/
│   ├── payroll_attendance_aggregator.service.js    ← new (D-2, batched, read-only)
│   ├── payroll_calculation.service.js              ← new (PURE — no db import)
│   ├── payroll_run.service.js                      ← new (lifecycle + transactions)
│   └── payslip_read.service.js                     ← new (self/manager payslip projection)
└── utils/
    ├── payroll_period.utils.js                     ← PURE (period + employment window)
    ├── calendar_resolver.utils.js                  ← PURE (working-day classification)
    ├── lop_allocator.utils.js                      ← PURE (D-4 paid-then-unpaid)
    └── day_ledger.utils.js                         ← PURE (parent §5 Step 2)
```

Controllers, routes and validators are **extended in place** (`payroll_hr.*`, `payroll_manager.*`, `payroll_self.*`) — Phase 2 adds no fourth route audience. `payroll_calculation.service.js` lives under `services/` to match the parent's naming, but it imports **no `db`, no repository, and no model** — it is a pure module by contract, and its test asserts that.

---

## 4. Database Schema — Migration `00038-create-payroll-run-engine.js`

Same shape as `00037`: one `queryInterface.sequelize.transaction()`, tables in FK dependency order, `down()` reversing and dropping every `enum_*` type with `CASCADE`.

**Conventions.** UUID PK `defaultValue: Sequelize.UUIDV4` · `org_id` UUID NOT NULL FK → `organizations` (`CASCADE`/`CASCADE`) · `created_at`/`updated_at` NOT NULL · `underscored: true`.

> **D-16 — Run items have stable identity across recalculation; component lines are disposable.** `payroll_runs` is `paranoid` (a user-authored artefact). `payroll_run_items` and `payroll_run_item_components` are **not** — a soft-deleted row would hold `UNIQUE (run_id, user_id)` hostage while adding nothing the audit log lacks.
>
> A run item's **UUID is stable for the life of the run**. Recalculation **UPSERTs** on `(run_id, user_id)` and only hard-deletes items whose user has left the population. It must not delete-and-reinsert: `payroll_audit_logs` is polymorphic (`entity_type` + `entity_id`, a bare UUID with **no FK**), so a new UUID breaks nothing referentially but silently orphans every prior audit row for that item — "HR excluded this employee on the 3rd" would point at a UUID that no longer exists, making the item's history unreconstructable exactly when an auditor needs it. Stable IDs also make the §7.2 carry-forward of exclusions and period overrides structural rather than a re-application step that can be dropped.
>
> **Component lines are replaced wholesale** (`DELETE WHERE run_item_id = ?` then insert): they have no stable natural key, are never audit targets, and are fully derived from the item. *This must be added to the parent's §3.*

### 4.1 `payroll_runs`

| Column | Type | Notes |
|---|---|---|
| `period_month` | STRING(7) NOT NULL | `'YYYY-MM'` — the run's identity |
| `period_start` / `period_end` | DATEONLY NOT NULL | resolved calendar month (§5.1) |
| `run_type` | ENUM(`regular`,`off_cycle`,`arrear`,`final_settlement`) NOT NULL DEFAULT `regular` | full enum declared now so Phase 7 never needs an enum ALTER; **the Phase-2 validator accepts `regular` only** |
| `status` | ENUM(`draft`,`calculating`,`calculated`,`approved`,`paid`,`cancelled`,`failed`) NOT NULL DEFAULT `draft` | |
| `engine_version` | INTEGER NOT NULL DEFAULT 2 | which engine produced these figures; Phase 4 bumps it |
| `requires_recalculation` | BOOLEAN NOT NULL DEFAULT false | set by any item mutation (#45–#47); **blocks approval** with `409 RUN_STALE` until a recalculation clears it (§6.1, §7.5) |
| `settings_snapshot` | JSONB NOT NULL | `lop_basis`, `net_pay_rounding`, `in_progress_treatment`, OT knobs, `standard_working_hours_per_day` **as of calculation**. Same reproducibility principle as Phase 1 §4.5: an HR user changing `lop_basis` in April must not change March's arithmetic |
| `total_employees` · `processed_count` · `error_count` · `excluded_count` | INTEGER NOT NULL DEFAULT 0 | |
| `total_gross` · `total_deductions` · `total_net` · `total_employer_cost` | DECIMAL(14,2) NOT NULL DEFAULT 0 | recomputed from items, never incremented |
| `lock_period_id` | UUID NULL | the `attendance_lock_periods` row created at approval (D-3) |
| `lock_reused` | BOOLEAN NOT NULL DEFAULT false | true when an existing lock already covered the period — cancel must then **not** delete it |
| `calculation_started_at` · `calculated_at` | DATE NULL | `calculation_started_at` also drives stale-claim recovery (§7.2) |
| `approved_by` / `approved_at` | UUID FK users (SET NULL) / DATE | |
| `paid_by` / `paid_at` | UUID FK users (SET NULL) / DATE | |
| `cancelled_by` / `cancelled_at` / `cancellation_reason` | UUID / DATE / TEXT | |
| `failure_reason` | TEXT NULL | aggregation-phase failure (`status = 'failed'`) |
| `notes` | TEXT NULL | |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes**
* `payroll_runs_org_period_type_unique_idx` — UNIQUE `(org_id, period_month, run_type)` WHERE `status != 'cancelled' AND deleted_at IS NULL` → **EC-10**. A cancelled run frees the period for a fresh one.
* `payroll_runs_org_status_idx` — `(org_id, status)`
* `payroll_runs_org_period_idx` — `(org_id, period_month)`

### 4.2 `payroll_run_items`

| Column | Type | Notes |
|---|---|---|
| `run_id` | UUID NOT NULL FK `payroll_runs` (CASCADE) | |
| `user_id` | UUID NOT NULL FK users (CASCADE) | |
| `status` | ENUM(`pending`,`calculated`,`error`,`excluded`) NOT NULL DEFAULT `pending` | |
| `period_start` / `period_end` | DATEONLY NOT NULL | **per-item** window, clipped to employment (EC-1/EC-2, D-15) |
| `period_override_reason` | TEXT NULL | required when HR narrows the window (#47) |
| `payable_days` · `lop_days` · `paid_non_working_days` | DECIMAL(6,2) NOT NULL DEFAULT 0 | |
| `standard_working_days` · `calendar_days` · `lop_divisor` | DECIMAL(6,2) NOT NULL DEFAULT 0 | `lop_divisor` is stored so a payslip explains its own per-day rate |
| `gross_earnings` · `lop_amount` · `total_deductions` · `total_employer_contributions` · `net_pay` · `ctc_cost` | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| `overtime_minutes` | INTEGER NOT NULL DEFAULT 0 | |
| `overtime_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| `structure_snapshot` | JSONB NULL | the structure version(s) used, incl. `sub_periods[]` for EC-3 |
| `attendance_snapshot` | JSONB NULL | the **day ledger** (D-4) — `{ per_date: [{ d, c, p, l, r }], totals }` with short keys to bound row size |
| `statutory_status` | STRING(20) NOT NULL DEFAULT `'not_applied'` | the §1.2 honesty guard, machine-readable |
| `error_code` | STRING(50) NULL | `NO_SALARY_STRUCTURE`, `UNKNOWN_ATTENDANCE_STATUS`, `IN_PROGRESS_AT_PERIOD_END`, `CTC_RECONCILIATION_FAILED`, … |
| `error_reason` | TEXT NULL | |
| `exclusion_reason` | TEXT NULL | |
| `excluded_by` | UUID NULL FK users (SET NULL) | |
| `calculated_at` | DATE NULL | |

**Indexes** — UNIQUE `(run_id, user_id)`; `(run_id, status)`; `(org_id, user_id, run_id)`.

### 4.3 `payroll_run_item_components`

`run_item_id` FK (CASCADE) · `org_id` · `component_id` UUID **NULL** FK `salary_components` (RESTRICT — NULL for engine-generated lines such as overtime or a rounding adjustment) · `component_code` STRING(50) NOT NULL · `component_name` STRING(150) NOT NULL · `component_type` ENUM(`earning`,`deduction`,`employer_contribution`,`reimbursement`) NOT NULL · `calculation_type` ENUM (Phase-1 enum, nullable for derived lines) · `full_month_amount` DECIMAL(14,2) NOT NULL · `amount` DECIMAL(14,2) NOT NULL (payable after proration + LOP) · `is_taxable` · `is_lop_applicable` · `pf_applicable` · `esi_applicable` · `is_part_of_ctc` BOOLEAN NOT NULL (snapshot flags, carried forward from the Phase-1 structure snapshot for Phase 4) · `source` ENUM(`structure`,`lop`,`overtime`,`adjustment`,`loan`,`reimbursement`,`statutory`,`arrear`,`rounding`) NOT NULL DEFAULT `structure` (full enum declared now; Phase 2 emits `structure`, `overtime`, `rounding` only) · `source_ref_id` UUID NULL · `display_order` INTEGER NOT NULL DEFAULT 0.

**Index** — `(run_item_id, display_order)`. No unique constraint: Phases 3–5 legitimately produce several lines of the same code (two bonuses, two loans), and wholesale replacement on recalculation (D-16) makes duplication impossible in Phase 2.

> **`amount` and `full_month_amount` must permit negative values — and the money helper blocks them by default.** A down-rounding adjustment (₹100.40 → ₹100.00) is a `−0.40` line; without it the component sum stops reconciling to the total, which is the whole point of §4.3. Therefore: **no `CHECK (amount >= 0)` constraint on either column**, and no `min(0)` in the Joi validators.
>
> This is a real crash, not a hypothetical. `toPaise(v)` delegates to `parseDecimalToScaled(v, 2, {})` where `allowNegative` **defaults to `false`** and throws `422 NEGATIVE_MONEY` ([money.utils.js:67](src/modules/payroll/utils/money.utils.js#L67)). The rounding line **must** be computed as `toPaise(residue, { allowNegative: true, field: 'rounding_adjustment' })` or every down-rounding run dies at the last step. `fromPaise` already renders negatives correctly (sign handling at [money.utils.js:91](src/modules/payroll/utils/money.utils.js#L91)) and `divRoundHalfUp` is sign-safe, so no other helper needs changing.
>
> Negative values are permitted **only** for `source: 'rounding'` in Phase 2. `computePayrollItem` asserts this before returning: any other line with `amount < 0` throws `INVALID_COMPONENT_AMOUNT`, so a sign bug in proration or LOP surfaces as an item error instead of a credit.

> **Why LOP is not its own line.** Reducing each LOP-applicable earning in place (`full_month_amount` → `amount`) keeps `Σ(earning lines) == gross_earnings` **exactly**, which is the EC-17 reconciliation guarantee. The item's `lop_amount` is the derived total `Σ(full_month_amount − amount)`, stored for display. A separate LOP deduction line would double-count. The `lop` enum value is reserved for Phase 7 arrears, which *do* need a standalone corrective line.

### 4.4 `payroll_settings` additions — registry **#41–#44**

Added by `00038` via `addColumn` on the existing table (no data migration; every column is NOT NULL with a default).

| Column | Type | Default | Registry # |
|---|---|---|---|
| `lop_basis` | ENUM(`calendar_days`,`standard_working_days`,`fixed_30`) | `calendar_days` | 41 |
| `net_pay_rounding` | ENUM(`none`,`nearest_rupee`) | `none` | 42 |
| `in_progress_treatment` | ENUM(`present`,`absent`,`flag_error`) | `present` | 43 |
| `overtime_payable` | BOOLEAN | **`false`** | 44 |
| `overtime_rate_multiplier` | DECIMAL(4,2) | `2.00` | 44 |
| `overtime_hourly_basis` | ENUM(`basic`,`gross`) | `basic` | 44 |
| `standard_working_hours_per_day` | DECIMAL(4,2) | `8.00` | 44 |

CHECK constraints: `overtime_rate_multiplier BETWEEN 1 AND 5`, `standard_working_hours_per_day BETWEEN 1 AND 24`.

**`overtime_payable` defaults OFF deliberately.** The parent §2 records that no OT rate multiplier exists anywhere in the codebase today; an org that has been approving overtime for months has never priced it. Defaulting ON would silently inflate the first payroll run by an amount nobody authorised. HR opts in.

**Component-level rounding is not configurable.** `money.utils` rounds half-up to the paise, everywhere, always. `net_pay_rounding` controls only the **final net figure**; when `nearest_rupee` is set, the residue is emitted as an explicit `ROUNDING_ADJUSTMENT` line (`source: 'rounding'`) so the component sum still reconciles to the total.

### 4.5 Migration hygiene

* Create order: `payroll_runs` → `payroll_run_items` → `payroll_run_item_components`, then the `payroll_settings` `addColumn`s. `down()` reverses (drop the three tables, then `removeColumn` each setting).
* `down()` drops every new enum type with `CASCADE`, including the four settings enums (`enum_payroll_settings_lop_basis`, `…_net_pay_rounding`, `…_in_progress_treatment`, `…_overtime_hourly_basis`).
* **Verify both directions:** `db:migrate` → `db:migrate:undo` → `db:migrate`.

---

## 5. Core Logic

**Data flow, once per run:**

```
payroll_run.service          orchestration, transactions, state machine
  └─ payroll_attendance_aggregator.service     ← the ONLY component that touches the DB for source data
       ├─ calendar_resolver.utils  (pure)      → per-user working-day map
       ├─ lop_allocator.utils      (pure)      → per-date paid/unpaid split of each leave request
       └─ day_ledger.utils         (pure)      → per-employee day ledger
  └─ payroll_calculation.service   (pure)      → computePayrollItem(...) → item + component lines
```

### 5.1 `payroll_period.utils.js` (pure)

```js
resolvePeriod({ periodMonth })                      // 'YYYY-MM' → { period_start, period_end, calendar_days }
clipToEmployment({ periodStart, periodEnd, joiningDate, exitDate })
  → { start, end, in_scope, excluded_days, reason }
```

* `resolvePeriod` is pure `DATEONLY` string arithmetic — no `Date` object, no timezone (§2 item 9, **EC-28**).
* `joiningDate > periodEnd` → `in_scope: false` (the employee is not in the run at all). `joiningDate` inside the window → `start` clips forward and `excluded_days` counts the pre-joining days (**EC-1**). Symmetric for `exitDate` (**EC-2**).
* A missing `joining_date` (nullable on every profile table) → `in_scope: true` with the full window and a `reason: 'joining_date_missing'` flag that the aggregator promotes to a **warning** on the item, not an error. Blocking payroll on a nullable legacy field would be worse than paying a full month.

> **D-15 — the employment window's exit date is a payroll-owned, per-item value.** No exit-date column exists in this codebase (§2 item 8), and payroll must not add one to another module's table. Phase 2 therefore resolves `exitDate` from `payroll_run_items.period_end` — defaulted to the period end, and narrowed by HR through **#47** (`PATCH /runs/:id/items/:itemId/period`, reason required, audit-logged). This gives a working mid-month-leaver proration now (**EC-2**, proration half) without a cross-module schema change; loan recovery, notice-pay and leave encashment stay in Phase 7's F&F as the parent already assigns. When Phase 7 lands F&F it should promote this to a first-class `exit_date`, and `clipToEmployment` already takes it as a parameter so that change is a one-line source swap. *This must be added to the parent's §3.*

### 5.2 `calendar_resolver.utils.js` (pure)

```js
classifyCalendar({ dates, profile, holidays, exceptions, weeklyOffRules })
  → Map<'YYYY-MM-DD', { is_working_day, reason }>
```

Takes **pre-fetched** org-wide rows and evaluates targeting in memory — that is what makes the aggregator batched (D-2). It reproduces [leave_calculator.utils.js](src/modules/leave/utils/leave_calculator.utils.js)'s predicates **exactly**, in the same precedence:

1. **Calendar exception** — targeting via `_isExceptionTargeted` (user list wins outright; else dept AND location must match or be empty). Contradictory `working_day` / `non_working_day` on one date resolved by specificity (user 3 > dept/loc 2 > org 1), non-working winning a tie.
2. **Holiday** — `excluded_users` removes, non-empty `included_users` restricts, then dept/location targeting.
3. **Weekly off** — highest-`priority` applicable rule; `days_of_week` contains the date's `day()`. **No applicable rule ⇒ not a weekly off** (mirrors `clock.service._isWeeklyOff`).
4. Otherwise a working day.

Two divergences from the leave calculator, both deliberate and both documented in the module header:
* **`shiftId` is passed as `null`**, exactly as the leave engine does. Shift-scoped weekly-off rules are therefore not applied. Payroll matching leave here is more important than payroll being independently "more correct" — a mismatch means an employee's LOP disagrees with their leave deduction.
* **The sandwich rule is not applied.** It is a *leave-charging* rule (how many balance days a request costs), not a *calendar* rule. Its effect already reached payroll: the sandwiched day carries an `on_leave` attendance row and the request's `paid_days`/`unpaid_days` already account for it.

> **Duplication risk, stated plainly.** This is a second implementation of a rule set that already exists in the Leave module, and the two can drift. Extracting a shared pure resolver would require editing `leave_calculator.utils.js` — a behavioural change to a live, tested module, out of scope here. Mitigation: the module header cites the leave file by path and line; `calendar_resolver.test.js` includes fixture cases copied verbatim from the leave module's targeting semantics; and §11.3 records this as an accepted risk with a recommended Phase-7 consolidation.

### 5.3 `lop_allocator.utils.js` (pure) — **D-4**

```js
allocateLeaveDays({ request, workingDates })   // workingDates over the request's FULL span
  → Map<'YYYY-MM-DD', { charge, paid_fraction, unpaid_fraction }>
```

Within one leave request, working days are consumed **chronologically — paid days first, then unpaid**. A 5-working-day request with `paid_days = 2, unpaid_days = 3` marks days 1–2 paid and days 3–5 LOP. Half-day requests charge 0.5 on a single date.

**Allocation runs over the request's whole span, then the result is intersected with the run window.** This is the load-bearing detail of **EC-5**: a request spanning 28 Feb – 3 Mar must produce the same per-date answer whether February or March is being run. It also means the aggregator fetches leave requests **overlapping** the window (not contained in it) and widens the calendar-resolution window to cover those requests' full spans.

Defensive rules: `paid + unpaid > total working days` → clamp (charge every day paid, surface a warning); `< total` → the shortfall is charged **paid** (never invent LOP from a data gap). Both cases are recorded in the ledger's `per_date[].r` reason so a payslip can explain itself.

### 5.4 `day_ledger.utils.js` (pure) — parent §5 Step 2

```js
buildDayLedger({ window, calendar, attendanceByDate, leaveAllocation, leaveTypesById, settings })
  → { payable_days, lop_days, paid_non_working_days, standard_working_days, calendar_days, per_date[] }
```

Every date in the item window is classified **exactly once**:

| Condition | Payable | LOP | Class |
|---|:--:|:--:|---|
| Non-working (holiday / weekly-off / exception), no attendance row | 1.0 | 0 | `paid_non_working` — **EC-8** |
| Non-working, but an attendance row says `present` | 1.0 | 0 | `worked_non_working` (OT priced separately; never double-paid) |
| `present` | 1.0 | 0 | `present` |
| `in_progress` | per `in_progress_treatment` | | `present` \| LOP 1.0 \| item error `IN_PROGRESS_AT_PERIOD_END` — **EC-9** |
| `half_day` (no `leave_id`) | 0.5 | 0.5 | `half_day` |
| `absent` | 0 | 1.0 | `absent` |
| `on_leave`, type `is_paid = false` | 0 | 1.0 *(0.5 if half-day)* | `unpaid_leave` |
| `on_leave`, paid type | per §5.3 allocation | remainder | `paid_leave` / `lop_leave` |
| `on_leave` with NULL `leave_id`, or a request not in `approved` | 0 | 1.0 | `orphan_leave` — defensive; reason recorded |
| Working day, **no row at all** | 0 | 1.0 | `no_record` (auto-mark-absent may not have run) |
| Unrecognised status string | — | — | item error `UNKNOWN_ATTENDANCE_STATUS` — §2 item 5 |

`standard_working_days` = count of working days in the **full period** (not the clipped item window) — it is the LOP divisor candidate, and it must not shrink because someone joined mid-month, or a joiner's per-day rate would be wrong.

`per_date[]` is persisted verbatim as `attendance_snapshot` with short keys (`d`ate, `c`lass, `p`ayable, `l`op, `r`eason) to bound JSONB size at ~31 small objects per item.

### 5.5 `payroll_attendance_aggregator.service.js` — **D-2**

The only Phase-2 component that reads source data. It consumes repositories, never other modules' models directly.

**Two-tier fetch.** Calendar data is org-wide and small, so it is fetched **once per run**. Per-employee data is unbounded, so it is fetched **per cohort** of `AGGREGATOR_COHORT_SIZE = 200` users — the same cohorts §7.2 persists in.

| Tier | # | Source | Call |
|---|---|---|---|
| Once | 1 | Holidays | `attendanceHolidaysRepo.findAll({ where: { org_id, is_active: true, date: between } })` |
| Once | 2 | Calendar exceptions | `calendarExceptionsRepo.findAll({ where: { org_id, date: between } })` |
| Once | 3 | Weekly-off rules | `weeklyOffRepo.findAll({ where: { org_id, is_active: true, effective_from <= to, (effective_to IS NULL OR >= from) } })` |
| Once | 4 | Leave types | `leaveTypeRepo.findAllByOrgId(orgId)` |
| Once | 5–7 | Profiles | `EmployeeProfile` / `ManagerProfile` / `HrProfile` (joining date, dept, location, employment type, job status) |
| Once | 8 | Population | `UserRole` × `User` — see the population rule below |
| Per cohort | 9–10 | Compensation | approved `employee_salary_structures` **overlapping** the window + their component snapshot lines, `WHERE user_id IN (cohort)` |
| Per cohort | 11 | Attendance | `attendanceRecordsRepo.findLeanForPeriod(orgId, from, to, cohortIds)` — **new, §5.7** |
| Per cohort | 12 | Leave | `leaveRequestRepo.findApprovedOverlapping(orgId, from, to, cohortIds)` — **new, §5.7** |
| Per cohort | 13 | Overtime | `attendanceOvertimeRepo.findApprovedInDateRange(orgId, from, to, cohortIds)` — **new, §5.7** |

**8 queries + 5 per cohort** — for 3,000 employees, ~83 queries, not 3,000. The D-2 guarantee is preserved (query count scales with **cohorts**, not headcount or days) while per-cohort memory is bounded at ~200 × 31 lean rows regardless of org size. Nothing is per-employee or per-day; `getGraphData`'s N-lookups-per-missing-day pattern is what this replaces.

> **Cohorts are keyed by `user_id`, never by `OFFSET`.** A day ledger needs *all* of one employee's rows together, so an offset-paged scan would split an employee across chunks and silently under-count their days. Deep `OFFSET` on `attendance_records` is also a sequential-scan trap at this table's size. `WHERE user_id IN (:cohort)` hits the existing `(org_id, user_id, date)` index and keeps each employee whole.

The `from`/`to` window is widened to cover the full span of every overlapping leave request (§5.3) before the calendar tier is fetched. Cohort results are folded into the output `Map` and the cohort's raw arrays are released before the next cohort is fetched, so peak memory is one cohort, not one org.

Output: `Map<userId, { profile, window, ledger, structures[], overtimeMinutes, warnings[] }>`.

**Population rule.** The population is every org member with an active `user_roles` row who was **employed at any point in the period** — not merely those active *today*:

* `users.status = 'active'` → in the population.
* `users.status != 'active'` → in the population **only if there is evidence of employment during the period**: an approved structure overlapping the window **and** at least one `attendance_records` row or approved leave day inside the window. Both signals come from data the aggregator already fetches (queries 9–12), so this costs no extra query.
* `joining_date > period_end` → not in the population at all.
* An in-population member with **no approved structure overlapping the window** → `error` item, `NO_SALARY_STRUCTURE`. Never a silent ₹0 (**EC-13**).

> **A mid-month leaver is surfaced automatically, and cannot be paid a silent full month.** An inactive-with-evidence member is admitted as an **`error` item with `error_code = 'EXIT_DATE_REQUIRED'`**, carrying an *inferred* `period_end` — the last date in the window with an attendance record or approved leave — in `error_reason` for HR to confirm or correct via **#47**. Because `error_count > 0` blocks approval (§7.3), HR **cannot** forget them: the run will not approve until each is given an exit date or explicitly excluded.
>
> This is deliberately not auto-payment. We know the employee is owed *something*; we do not know their last working day, and paying a full month or guessing wrong is a real financial error. Nor is it the deactivation-timestamp heuristic it might appear to need: **no `deactivated_at` column exists** on `users` (only `status`, `last_login_at`, `password_updated_at`), and `updated_at` bumps on any row change — a password reset would sweep a long-departed employee back into payroll. Employment evidence is the precise signal; a timestamp is not. (**EC-2**, **EC-22**, **D-15**.)

### 5.6 `payroll_calculation.service.js` — pure `computePayrollItem`

```js
computePayrollItem({ employee, structures, ledger, overtimeMinutes, settings, period })
  → { item, components[], warnings[] }        // throws AppError on an invariant breach
```

Implements parent §5 Steps 3–9. **No DB, no `Date.now()`, no randomness** — same input, same output, forever.

**Step 3 — resolve structure(s).** All approved versions overlapping the item window. One version → one sub-period. A revision effective mid-month → **split at each `effective_from`, compute each sub-period independently, sum** (**EC-3**). Each sub-period's monthly amounts are scaled by `sub_period_days / divisor`. Component lines sharing a code across sub-periods are merged into one line whose `full_month_amount` is the *last* sub-period's rate and whose `amount` is the summed payable; `structure_snapshot.sub_periods[]` records the split so a payslip can explain it.

**Step 4 — earnings.** Component lines come from the Phase-1 **structure snapshot** (`employee_salary_structure_components`), never from the live catalog — the flags were frozen at approval precisely so a March catalog edit cannot change January's arithmetic. `display_order` preserved.

**Step 4a — joining/exit proration (EC-1/EC-2).** Components with `is_prorated_on_joining = true` are scaled by `(divisor − excluded_days) / divisor`, where `excluded_days` is the count of period days **outside** the employment window. This is disjoint from LOP by construction: proration covers days the person was not employed, LOP covers unpaid days they were.

**Step 5 — LOP.** `divisor` per `settings.lop_basis`: `calendar_days` (days in the period), `standard_working_days` (§5.4), or `fixed_30` (**EC-4**). For each component with `is_lop_applicable = true`:
`amount = full_month_amount − round(full_month_amount × lop_days / divisor)`, in integer paise, single rounding. `divisor = 0` → item error `INVALID_LOP_DIVISOR` (an all-holiday period must not divide by zero).

**Step 6 — overtime.** Only when `settings.overtime_payable`. `hourly_rate = basis_monthly / (standard_working_days × standard_working_hours_per_day)`, basis = the `is_basic` component's monthly amount or gross per `overtime_hourly_basis`. `ot_amount = round(minutes / 60 × hourly_rate × multiplier)`. Emitted as one line, `source: 'overtime'`, `is_lop_applicable: false`, `is_taxable: true`, `pf_applicable: false`, `esi_applicable: false` — **the last two are Phase-2 placeholders and Phase 4 must revisit them**; they are recorded as `false` rather than guessed because no statutory config exists yet to make the choice against.

**Steps 7–8 — not in this phase.** Statutory (Phase 4) and loans/adjustments (Phase 3) are absent by design; `statutory_status: 'not_applied'`.

**Step 9 — net pay & reconciliation.** `gross_earnings = Σ(earning lines .amount)` — the sum of the *already-rounded* lines, never an independently rounded figure (**EC-17**). `net = gross − Σ(deduction lines)`. `ctc_cost = gross + Σ(employer_contribution lines)`. Negative net clamps to 0 (**EC-14** carry-forward is Phase 3; Phase 2 records `warnings: ['NEGATIVE_NET_CLAMPED']`, which cannot yet occur since there are no Phase-2 deductions, but the guard ships with the engine).

`net_pay_rounding = nearest_rupee` emits the `ROUNDING_ADJUSTMENT` line, whose amount is **signed**: `residue = roundedNet − rawNet`, negative when rounding down. It is built with `toPaise(residue, { allowNegative: true })` — the default throws (§4.3). Then **assert both**: every non-`rounding` line has `amount >= 0`, and `Σ(components) == totals`. A mismatch throws `CTC_RECONCILIATION_FAILED`; a stray negative throws `INVALID_COMPONENT_AMOUNT`. Either way the item lands `error` rather than persisting a wrong payslip.

### 5.7 Cross-module additions (minimal, additive, non-breaking)

Four small additions to modules Payroll consumes. Each is purely additive — no existing call site changes, no existing behaviour changes.

| File | Addition | Why |
|---|---|---|
| [attendance_overtime.repository.js](src/modules/attendance/repositories/attendance_overtime.repository.js) | `findApprovedInDateRange(orgId, startDate, endDate, userIds = null, transaction = null)` — lean attributes, no includes | **No date-range OT query exists** (verified). Only `status = 'approved'` rows are payable |
| [attendance_records.repository.js](src/modules/attendance/repositories/attendance_records.repository.js) | `findLeanForPeriod(orgId, startDate, endDate, userIds = null)` — `['user_id','date','status','is_half_day','half_day_type','leave_id','overtime_minutes']`, `raw: true` | `findRecordsForMonth` exists but eager-loads four profile tables per row; at 1,000 × 31 rows that is the run's memory ceiling |
| [leave_request.repository.js](src/modules/leave/repositories/leave_request.repository.js) | `findApprovedOverlapping(orgId, startDate, endDate, userIds = null, transaction = null)` with the `leave_type` include | No overlapping-range query exists; required for §5.3's full-span allocation |
| [lock.service.js](src/modules/attendance/services/lock.service.js) | `createLock(orgId, userId, payload, transaction = null)` and `deleteLock(id, orgId, transaction = null)` — forward the transaction to the repository, which **already accepts one** | Without it, run approval creates a lock outside its transaction; a rollback then leaves an orphan lock that silently freezes the org's attendance. Defaulting to `null` preserves all 11 existing call sites byte-for-byte |

**Nothing else in Attendance or Leave is touched.** Payroll never writes to their tables — the only write is the lock row, through their own service.

---

## 6. API Surface

Envelope, controller class/singleton style, `try/catch → next(error)`, and the leave `validate` wrapper are all unchanged from Phase 1 §6. Auth stacks (`hrAuth` / `managerAuth` / `selfAuth`) are reused verbatim — **Phase 2 introduces no new role list** and D-14's tenant-plane-only rule holds unchanged.

### 6.1 HR — `/api/v1/payroll/hr` *(`hrAuth` — `['hr']`)* — Tier C

| # | Method | Path | Notes |
|---|---|---|---|
| 37 | GET | `/runs/eligibility` | `?period_month=` — pre-run readiness, **persists nothing**: headcount, missing-structure list, missing-bank-account count, mid-month joiners/leavers, whether the period is already locked or already run. This is the doc flow's "review summary" step |
| 38 | POST | `/runs` | Create a `draft`. Body `{ period_month, run_type: 'regular', notes? }`. `409 DUPLICATE_RUN` on the partial unique index (**EC-10**) |
| 39 | GET | `/runs` | Filters `status`, `period_month`, `run_type`, pagination — **validate in controller** |
| 40 | GET | `/runs/:id` | Header + totals + counts |
| 41 | POST | `/runs/:id/calculate` | Calculate or **recalculate**. Idempotent replace (§7.2). `409 RUN_NOT_CALCULABLE` unless `draft`/`calculated`/stale-`calculating`; `409 RUN_IMMUTABLE` once `approved` (**D-12**) |
| 42 | GET | `/runs/:id/preview` | The full preview: totals, per-department breakdown, error items, excluded items, warning counts. Read-only over the `calculated` run |
| 43 | GET | `/runs/:id/items` | Paginated; filters `status`, `user_id`, `department_id` |
| 44 | GET | `/runs/:id/items/:itemId` | One item + component lines + day ledger |
| 45 | POST | `/runs/:id/items/:itemId/exclude` | `exclusion_reason` **required**. The sanctioned way to clear a blocking `error` (parent §7) |
| 46 | POST | `/runs/:id/items/:itemId/include` | Undo an exclusion; the item returns to `pending` and requires a recalculation |
| 47 | PATCH | `/runs/:id/items/:itemId/period` | Set `period_start` / `period_end` within the run period; `period_override_reason` required (**D-15**, **EC-2**, **EC-22**). Requires a recalculation to take effect |
| 48 | POST | `/runs/:id/approve` | §7.3. Creates the period lock (**D-3**). `409 RUN_HAS_ERRORS` while any item is `error` |
| 49 | POST | `/runs/:id/cancel` | `approved` and **not** `paid` only. Releases the lock when this run created it (**D-12**) |
| 50 | POST | `/runs/:id/pay` | `approved` → `paid`. Terminal |

Endpoints 45–47 mutate an item and therefore **invalidate the run's totals**. Each leaves the run in `calculated` but sets `requires_recalculation = true` on the run header, and **#48 refuses to approve while that flag is set** (`409 RUN_STALE`). Approving header totals that no longer match their items is the failure mode this prevents; demoting the run to `draft` instead would needlessly discard the other 999 correct items.

### 6.2 Manager — `/api/v1/payroll/manager` *(`managerAuth` — `['manager','hr']`)* — Tier A

Every handler: `getAccessibleUserIds` → `decideAuthority` → act. **Scope check precedes existence check**; out-of-scope and non-existent return an identical `403 FORBIDDEN` (**EC-24**).

| # | Method | Path | Notes |
|---|---|---|---|
| 51 | GET | `/runs/:runId/team-summary` | Team cost aggregate for one approved run: headcount, total gross / net / employer cost, LOP-day total. Available **regardless** of the visibility toggle — aggregates are Tier A |
| 52 | GET | `/runs/:runId/team-items` | Direct reports' items. With `manager_can_view_team_compensation = false` → **aggregates only, zero per-head figures** (**EC-25**) |
| 53 | GET | `/employees/:userId/payslips` | Scoped payslip list (approved/paid runs only) |
| 54 | GET | `/employees/:userId/payslips/:runId` | Scoped payslip JSON. Blocked entirely when the visibility toggle is OFF |

A manager sees only runs with `status ∈ {approved, paid}`. Draft and `calculated` runs are HR-only work-in-progress.

### 6.3 Self — `/api/v1/payroll` (under `/me`) *(`selfAuth`)*

| # | Method | Path | Notes |
|---|---|---|---|
| 55 | GET | `/me/payslips` | Approved/paid runs only; `{ period_month, gross_earnings, net_pay, payable_days, lop_days, statutory_status }` |
| 56 | GET | `/me/payslips/:runId` | Full payslip JSON: component lines, day ledger, LOP basis and divisor, structure version(s) used |

> **Payslip source, and why there is no `payslips` table yet.** D-6's frozen snapshot is *already* materialised in Phase 2 — `payroll_run_items.structure_snapshot` + `attendance_snapshot` + the component lines are the immutable record, written when the run is calculated and never mutated after approval (**D-12**). Phase 2's payslip endpoints are a **projection over the run item**. Phase 6 adds the `payslips` table (for versioning and re-issue) and the PDF renderer over the same data. The paths are named `/payslips` now so Phase 6 changes the source, not the contract.
>
> **Visibility rule.** An employee sees a period only once its run is `approved`. A `calculated` run is an HR working draft; surfacing it would leak figures HR has not signed off. Enforced in the service, not the controller.

---

## 7. Transactional Behaviour

Unmanaged transactions only, `if (!transaction.finished)` rollback guard — the Phase-1 idiom. Every state transition writes `payroll_audit_logs` **inside its own transaction** (`entity_type: 'payroll_run'` / `'payroll_run_item'`).

### 7.1 Create a run (#38)

One short transaction: advisory lock `payroll:run:{orgId}:{period_month}` → resolve settings → `resolvePeriod` → insert `draft` with the `settings_snapshot` → audit `run.created` → commit. Two concurrent creates: one wins the advisory lock, the second fails the partial unique index and is returned as `409 DUPLICATE_RUN` (**EC-10**, **EC-11**).

### 7.2 Calculate / recalculate (#41) — the critical section

Deliberately **not** one long transaction. A 1,000-employee run inside a single transaction holds locks for minutes and fails atomically, which violates the parent §7 requirement that partial failure be survivable.

1. **Claim (txn 1, short).** Advisory lock → load run `FOR UPDATE` → status must be `draft` \| `calculated` \| `calculating` **whose `calculation_started_at` is older than 30 minutes** (stale-claim recovery after a crash) → set `calculating`, `calculation_started_at = NOW()` → commit. Any other state → `409 RUN_CALCULATION_IN_PROGRESS` or `409 RUN_IMMUTABLE`. **The `calculating` status — not the advisory lock — is what excludes concurrent writers**, because `pg_advisory_xact_lock` releases at commit and steps 3–5 run in later transactions. Every other writer (#41, #45–#47) must therefore check the status, not just take the lock.
2. **Aggregate (no transaction).** §5.5, read-only, cohort-scoped.
3. **Compute & persist per cohort (one transaction per cohort of 200).** For each item: **UPSERT on `(run_id, user_id)`** — `bulkCreate` with `updateOnDuplicate` restricted to the **engine-owned** columns (amounts, day counts, snapshots, `status`, `error_code`, `error_reason`, `calculated_at`). `exclusion_reason`, `excluded_by`, `period_start`, `period_end` and `period_override_reason` are **absent from that list**, so HR's exclusions and window overrides survive structurally — there is no in-memory carry-forward step to forget (**D-16**). Component lines are deleted by `run_item_id` and re-inserted. `computePayrollItem` runs per employee inside a `try/catch`: a thrown `AppError` becomes an `error` item and **the cohort continues** (**EC-12**). If a whole cohort transaction fails on write, retry it **item by item** so one malformed row cannot fail 199 good ones.
4. **Prune (txn, short).** Hard-delete items whose `user_id` is no longer in the population (cascading their components). An item that HR has **excluded** is never pruned — the exclusion is the record of a deliberate decision.
5. **Finalise (txn N, short).** Recompute run totals and counts **by aggregating the persisted items** (never by accumulating in memory — that would drift from what is on disk) → status `calculated`, `calculated_at`, `requires_recalculation = false` → audit `run.calculated` with the counts → commit. An aggregation-phase throw instead sets `failed` + `failure_reason`.

**Idempotency.** UPSERT keyed on `(run_id, user_id)` makes recalculation naturally idempotent: a client retry after a timeout converges on the same rows with the **same item UUIDs**, never duplicates. The unique index is the backstop.

### 7.3 Approve (#48) — creates the period lock

1. Begin transaction; advisory lock `payroll:run:{orgId}:{period_month}`; load the run `FOR UPDATE`.
2. Status must be `calculated` → else `409`. `requires_recalculation` → `409 RUN_STALE`. `error_count > 0` → `409 RUN_HAS_ERRORS` (excluded items do not count; each error must be fixed or explicitly excluded — parent §7).
3. Re-aggregate totals from items and compare to the stored header. Mismatch → `409 RUN_TOTALS_DRIFTED`, refuse. Cheap, and it is the last line of defence against a partially-applied recalculation.
4. **Take a second advisory lock, `payroll:lock:{orgId}`** (org-scoped, not period-scoped), then **resolve the overlap by querying first** — do not create-and-catch. Load locks overlapping `[period_start, period_end]`:
   * none → `lockService.createLock(orgId, approverId, { start_date, end_date, reason: 'Payroll run <period_month>' }, t)` (**D-3**, §5.7), `lock_reused = false`;
   * one that **fully covers** the period → adopt it (`lock_period_id = existing.id`, `lock_reused = true`), create nothing;
   * partial overlap → `409 PERIOD_PARTIALLY_LOCKED` naming the conflicting range, because a partial lock leaves part of the period editable after approval.

   > **Why query-first and why the extra lock.** `createLock`'s overlap check is **application-level** — a `findAll` then a throw ([lock.service.js:22-42](src/modules/attendance/services/lock.service.js#L22-L42)), not a DB constraint — so catching `OVERLAPPING_LOCK` would *not* poison the transaction, and the catch-and-adopt approach would function. Query-first is still preferable: it keeps control flow out of an exception path and does not silently depend on that implementation detail staying application-level. The extra advisory lock closes a genuine TOCTOU: that check-then-insert is not atomic, and `payroll:run:{orgId}:{period_month}` cannot serialise it because two **different** periods approving concurrently hold different keys. It cannot bite in Phase 2 (calendar months never overlap) but will the moment Phase 7 adds off-cycle and arrear runs over arbitrary ranges. `attendance_lock_periods` is **not paranoid** and `deleteById` is a hard `destroy`, so a cancelled run's released lock leaves no soft-deleted row to block a re-run.
5. Status `approved`, `approved_by`, `approved_at`, `lock_period_id`, `lock_reused`.
6. Audit `run.approved` (**inside the transaction**). Commit.

From this instant every attendance / regularization / overtime / comp-off mutation in the period fails `403 PERIOD_LOCKED` through the existing `checkLock` call sites (**EC-7**) — **no second lock table** (D-3).

### 7.4 Cancel (#49) and Pay (#50)

* **Cancel** — `approved` and `paid_at IS NULL` only (**D-12**). Advisory lock → load `FOR UPDATE` → if `lock_reused = false`, `lockService.deleteLock(lock_period_id, orgId, t)`; if `true`, leave the pre-existing lock alone → status `cancelled`, `cancelled_by/at`, reason required → audit → commit. Items are **retained**, not deleted: the audit trail must show what was cancelled. The partial unique index excludes `cancelled`, so a corrected run can be created for the same period.
* **Pay** — `approved` → `paid`, `paid_by/at`, audit. Terminal: no transition out of `paid` exists in this phase; a correction after payment is Phase 7 arrears (**D-12**). **EC-26** (missing bank details blocking payment) lands in Phase 6 with the bank advice; Phase 2 surfaces `missing_bank_account_count` in #37 and #42 as an early warning only.

### 7.5 Item mutations (#45–#47)

Each is a single short transaction: **acquire the advisory lock `payroll:run:{orgId}:{period_month}`** → load the run `FOR UPDATE` → **refuse when `status = 'calculating'`** (`409 RUN_CALCULATION_IN_PROGRESS`) and unless the status is `draft`/`calculated` (**never** `approved`/`paid` — D-12) → load the item `FOR UPDATE` → mutate → set `requires_recalculation = true` → audit with the reason → commit.

> **Both guards are required; neither suffices alone.** The advisory lock serialises item mutations against each other and against §7.2's claim and finalise transactions. It does **not** exclude the calculation's cohort writes, because `pg_advisory_xact_lock` releases when the claim transaction commits — steps 3–4 run unlocked. The `calculating` status check is what covers that window. Without it, HR excluding an employee at the moment a cohort is being written would have the exclusion overwritten by the engine and silently lost, leaving a terminated employee in an approved run. Ordering is therefore serialised either way: the mutation lands before the claim (and UPSERT preserves it, **D-16**) or it is cleanly refused with a retryable 409.

### 7.6 State machine

```
draft ──calculate──► calculating ──►ok──► calculated ──approve──► approved ──pay──► paid
  ▲                       │                    │                      │
  └───────────────────────┴──►fail──► failed   └──recalculate─┘       └──cancel──► cancelled
```
`failed` is re-calculable (returns to `calculating`). No edge leaves `paid` or `cancelled`.

---

## 8. Tests (`node:test`) — D-10

Runner and script are already in place (`npm test` → `node --test "tests/unit/**/*.test.js"`). Phase 2 adds five suites; all are pure, no database, no network.

| File | Must cover |
|---|---|
| `tests/unit/payroll/payroll_period.test.js` | 28/29/30/31-day months; leap February; joiner mid-month clips forward and counts `excluded_days`; leaver clips back; `joining_date > period_end` → out of scope; missing `joining_date` → warning not error; no `Date` object anywhere in the output |
| `tests/unit/payroll/calendar_resolver.test.js` | exception beats holiday beats weekly-off; user-targeted exception beats org-wide; contradictory same-specificity overlap → non-working wins; holiday `excluded_users` / `included_users`; dept- and location-targeted holiday; **no weekly-off rule ⇒ working day**; highest-priority rule wins |
| `tests/unit/payroll/lop_allocator.test.js` | 5 working days `paid=2/unpaid=3` → days 1–2 paid, 3–5 LOP; **request straddling the month boundary yields the identical per-date split when run from either month** (EC-5); half-day request; `paid+unpaid` over- and under-shooting the working-day count; unpaid leave type charges LOP on every day |
| `tests/unit/payroll/day_ledger.test.js` | every row of the §5.4 table; holiday and weekly-off with **no attendance row** counted paid (EC-8); each `in_progress_treatment` branch (EC-9); unknown status → error; `standard_working_days` unaffected by a mid-month joiner |
| `tests/unit/payroll/payroll_calculation.test.js` | each `lop_basis` produces a materially different per-day rate (EC-4); mid-month revision splits, computes and sums (EC-3); proration and LOP are disjoint for a joiner who was also absent; `Σ(component amounts) == gross_earnings` **exactly** for a CTC that does not divide by 12 (EC-17); zero-divisor guard; no-structure input throws `NO_SALARY_STRUCTURE`; OT off by default, and priced correctly when on; the module imports no `db` |
| …**rounding polarity** (§4.3) | a **down-rounding** net (₹100.40 → ₹100.00) emits a `−0.40` `ROUNDING_ADJUSTMENT` and still reconciles — this test fails today unless `allowNegative: true` is passed; an up-rounding net emits a positive line; a non-`rounding` line with a negative amount throws `INVALID_COMPONENT_AMOUNT` |

**Integration checks stay manual** (no HTTP harness exists; do not build one here) — §10 covers them.

---

## 9. Documentation Deliverables (part of the phase, not afterwork)

1. **`public/md_system/api_registry.md`** — three new sections (`## Payroll Module - HR Administration (Phase 2)`, `- Manager Operations (Phase 2)`, `- Employee Self-Service (Phase 2)`), one row per endpoint **#37–#56**, matching the existing 13-column format.
2. **`public/md_settings/org_settings_registry.md`** — entries **#41–#44** (§4.4) in the `## Payroll Module` section, using the file's exact seven-field structure and citing real enforcement files.
3. **`public/md_payrolls/combined_api_analysis.md`** — request/response contracts for all 20 endpoints, including the `statutory_status` field and the day-ledger short-key schema.
4. **`public/md_payrolls/implementation_plan.md`** — amend §3 with **D-15** and **D-16**; note in §2 that no exit-date column exists and that `lock.service` gained an optional transaction parameter; update the §0 status line and the Phase-2 row.

---

## 10. Exit Criteria — Phase 3 does not begin until every line is checked

**Schema & wiring**
- [x] `00038` migrates up, down, and up again cleanly (all new enum types dropped with `CASCADE`, all four settings columns removed on `down`).
- [x] The three new models load; existing Phase-1 endpoints are unaffected (regression-check `/hr/settings`, `/hr/components`, `/me/salary-structure`).

**The hand-verifiable run (parent §8 exit criterion)**
- [x] A run over a month containing **a holiday, a weekly-off, a full-day absence, a paid leave, a half-day, a partly-unpaid leave straddling the month boundary, a mid-month joiner and a mid-month leaver** produces figures that match a hand calculation to the paise.
- [x] The holiday and weekly-off days — which have **no attendance row** — are paid (**EC-8**).
- [x] The straddling leave produces the identical per-date paid/unpaid split when the previous month is run (**EC-5**).
- [x] Changing `lop_basis` and recalculating changes the per-day rate as expected (**EC-4**); the run's `settings_snapshot` still shows the *old* basis for the *old* calculation.
- [x] A mid-month salary revision splits the month and sums correctly (**EC-3**); `structure_snapshot.sub_periods` shows both.
- [x] `Σ(component amounts) == gross_earnings` and `gross − deductions == net_pay`, exactly, on every item (**EC-17**).

**Lifecycle, concurrency & failure**
- [x] Two concurrent `POST /runs` for one period → one run, one `409 DUPLICATE_RUN` (**EC-10**).
- [x] Two concurrent `POST /runs/:id/calculate` → one calculation, one `409 RUN_CALCULATION_IN_PROGRESS` (**EC-11**).
- [x] Killing the process mid-calculation leaves the run `calculating`; after 30 minutes a re-issued calculate reclaims and completes it.
- [x] An employee with no salary structure surfaces as `error` / `NO_SALARY_STRUCTURE` — **not ₹0** — and the run still reaches `calculated` (**EC-12**, **EC-13**).
- [x] Approval is refused `409 RUN_HAS_ERRORS` until that item is fixed or excluded; excluding it with a reason then allows approval.
- [x] Recalculating **preserves** exclusions and per-item period overrides, **and every surviving item keeps its original UUID** (`SELECT id` before and after — D-16). Audit rows written against an item before a recalculation still resolve to that item afterwards.
- [x] An item whose user leaves the population is pruned; an **excluded** item is never pruned.
- [x] An employee **deactivated mid-period** with attendance in that period is auto-surfaced as `error` / `EXIT_DATE_REQUIRED` with an inferred last-worked date, and **blocks approval** until #47 sets a date or the item is excluded (**EC-2**, **EC-22**).
- [x] An employee deactivated **before** the period, with no attendance or leave in it, is **not** in the population — including one whose `users.updated_at` was bumped during the period by an unrelated edit such as a password reset.
- [x] `POST /runs/:id/items/:itemId/exclude` while the run is `calculating` → `409 RUN_CALCULATION_IN_PROGRESS`, and the exclusion is **not** lost (§7.5).
- [x] Approving locks the period; a subsequent attendance edit, regularization or OT approval in that period fails `403 PERIOD_LOCKED` (**EC-7**).
- [x] Cancelling before payment releases the lock and frees the period for a new run; cancelling a run that **adopted** a pre-existing lock leaves that lock intact.
- [x] `POST /runs/:id/calculate` on an `approved` run → `409 RUN_IMMUTABLE` (**D-12**).

**Authority & secrecy**
- [x] An `employee` token on any `/hr` or `/manager` run route → `403`. An `admin` / `super-admin` token → `403` on `/hr/*` and `/manager/*` (**D-14**).
- [x] A manager fetching a **non-report's** payslip → `403`, byte-identical to the response for a non-existent user id (**EC-24**).
- [x] `manager_can_view_team_compensation = false` → `/team-items` returns aggregates only, zero per-head figures anywhere in the payload (**EC-25**), while `/team-summary` still works.
- [x] An employee fetching another employee's `/me/payslips/:runId` gets only their own data; a `calculated` (unapproved) run is invisible to both employee and manager.
- [x] HR of Org A cannot read or mutate any Org B run, item or component.
- [x] Every run state transition and item mutation appears in `payroll_audit_logs` with the actor and reason.

**Performance & tests**
- [x] A 500-employee, 31-day run issues **8 + 5×⌈500/200⌉ ≈ 23 source queries** (verified by query log), not thousands — and a 3,000-employee run issues ~83, confirming the count scales with cohorts, not headcount (§5.5).
- [x] Peak RSS during a 3,000-employee run stays flat across cohorts (no monotonic growth), confirming cohort arrays are released rather than accumulated.
- [x] `npm test` passes — the four Phase-1 suites **and** the five Phase-2 suites.

---

## 11. Risks & Decisions Needed

| # | Item | Recommendation | Needed by |
|---|---|---|---|
| 1 | **No exit-date column exists** anywhere in the codebase (§2 item 8), yet the parent §5 Step 1 clips the period to `[joining_date, exit_date]`. | Adopt **D-15**: the exit boundary is `payroll_run_items.period_end`, defaulted to the period end and narrowed by HR via **#47** with a mandatory reason. Delivers EC-2 proration now, no cross-module schema change, and `clipToEmployment` already takes `exitDate` as a parameter so Phase 7's F&F can swap the source in one line. | Before §5.1 |
| 2 | **`lock.service.createLock` is not transaction-aware**, so run approval would create the period lock outside its own transaction — a rollback then leaves an orphan lock that freezes the org's attendance with no run to explain it. | Add an optional trailing `transaction = null` to `createLock` / `deleteLock` and forward it to the repository, **which already accepts one**. All 11 existing call sites are unchanged. Justified, additive, and the alternative (create-after-commit + reconciliation) is strictly worse. | Before §7.3 |
| 3 | **`calendar_resolver.utils` duplicates the Leave module's working-day rules** and the two can drift; a drift means an employee's LOP disagrees with their leave deduction. | Accept for this phase — extracting a shared resolver means editing live, tested Leave code. Mitigate by citing the leave file by path/line in the module header, copying its targeting fixtures into `calendar_resolver.test.js`, and matching its `shiftId: null` behaviour deliberately. Recommend a Phase-7 consolidation into `src/common/` as its own reviewed change. | Design |
| 4 | **Phase-2 net pay has no statutory withholding** and will look like an unrealistically high take-home to anyone demoing it. | Intentional and machine-flagged: `statutory_status: 'not_applied'` on every item and every payslip payload, plus `engine_version` on the run. State it up front — Phase 2 answers *"how many days are payable and what do they earn"*; Phase 4 answers *"what is withheld"*. | Communication |
| 5 | **`attendance_records.status` is an unconstrained `STRING(30)`.** A value the engine does not recognise (from a future feature or a manual DB edit) could be silently mis-paid. | Fail loud per item: `UNKNOWN_ATTENDANCE_STATUS` error, run still reaches `calculated`, HR sees exactly which employee and which date. Never default an unknown status to present or to absent. | Design |
| 6 | **`overtime_payable` default.** Orgs have been approving OT with no rate configured; enabling by default would inflate the first run by an unauthorised amount. | Default **OFF**. HR opts in and sets the multiplier and basis explicitly. | Before §4.4 |
| 7 | **JSONB snapshot volume.** 1,000 employees × ~31 day-ledger entries per run, per month. | Short keys (§4.2), no per-date object nesting, and no indexing of the JSONB. At ~2–3 KB per item this is a few MB per run — acceptable. Revisit only if a retention policy is requested; the snapshot is the reproducibility guarantee and must not be trimmed casually. | Design |
| 8 | **Run items are not paranoid** (**D-16**) — a pruned item leaves no soft-delete tombstone. | Accept, now narrowed: recalculation **UPSERTs** and preserves item UUIDs, so only users who leave the population are hard-deleted, and excluded items are never pruned. Items are derived and fully regenerable from the run's `settings_snapshot` plus source data; the audit log records every recalculation with its actor and counts. | Design |
| 11 | **A mid-month leaver is invisible to payroll.** No `deactivated_at` column exists, and relying on HR to remember to add deactivated employees to every run would silently drop salary owed for days worked. | Auto-surface from **employment evidence** already fetched — an inactive user with an overlapping structure *and* attendance/leave in the period becomes an `EXIT_DATE_REQUIRED` error with an inferred last-worked date, blocking approval (§5.5). Rejected the `updated_at >= period_start` heuristic: it is not a deactivation signal and would readmit long-departed employees after any unrelated row edit. | Before §5.5 |
| 12 | **Aggregator memory ceiling.** 3,000 employees × 31 days ≈ 93,000 attendance rows in one array, plus leave, structures and ledgers. | Cohort-scoped fetching at 200 users (§5.5): peak memory is one cohort regardless of org size, queries stay O(cohorts). Cohorts are keyed by `user_id` — **not `OFFSET`**, which would split an employee's days across chunks and deep-scan the table. | Before §5.5 |
| 13 | **Item mutations could race the calculation engine** and be silently overwritten, leaving a terminated employee in an approved run. | #45–#47 take the advisory lock **and** refuse while `status = 'calculating'` (§7.5). Both are needed: `pg_advisory_xact_lock` releases at commit, so the lock alone does not cover §7.2's cohort writes. | Before §7.5 |
| 9 | **A crash mid-calculation strands the run in `calculating`.** No cron exists until Phase 7 to sweep it. | 30-minute stale-claim recovery on `POST /runs/:id/calculate` (§7.2 step 1). Phase 7's cron can later sweep proactively; the manual path must exist first so an operator is never blocked. | Before §7.2 |
| 10 | **`in_progress` at period end** (**EC-9**) — an employee who never clocked out. | Default `present` (the least surprising and the least punitive), org-configurable to `absent` or `flag_error` (#43). An org that wants payroll to refuse ambiguous data picks `flag_error`. | Before §4.4 |
