# Phase 4: Attendance Integration Bridge - Implementation Plan

> **Revision note (verified against the live codebase):** This plan was reviewed against the actual Phase 1–3 implementation. The original draft assumed Phase 3 had completed the schema wiring — it had not. Section 0 captures the mandatory pre-work that must land before any bridge is built, and several sections below were corrected to match reality (cancellation lives in `leave_application.service.js`, not `leave_approval`; `is_half_day` is missing alongside `leave_id`; the leave-type soft-delete guard is already largely implemented). Claims verified: `leave_id` and `is_half_day` absent from the `attendance_records` model **and** the `00015` migration; `source_comp_off_id` absent from `leave_requests`; `leave_types.code` present with `findByCodeAndOrgId`; `comp_off.service.approveCompOff` has no transaction; `leave_balance.repository` already exposes locked `findOrCreateBalance` / `getBalanceForUpdate`.

## 1. Scope and Objectives
Phases 1–3 delivered a self-contained Leave Ledger: rules, personalized balances, and a fully transactional application/approval workflow. Phase 4 stops treating Leave as an island. It wires the Leave module into the **existing Attendance module** so the two ledgers can never drift apart, and it closes the lifecycle holes that open when data changes *outside* the leave workflow (comp-offs earned, employees terminated, attendance regularized, leave types retired).

The primary objectives are:
- **Repair the Phase 3 attendance bridge** so the leave↔attendance link (`leave_id`, `is_half_day`) is actually persisted rather than silently dropped (Section 0). Everything else depends on this.
- Build the **Comp Off Bridge** so an approved comp-off deposits a spendable day into the Leave ledger, and burning that day updates the source comp-off record — a closed earn→spend loop.
- Build the **Comp Off Expiry Sync Cron** so unused comp-offs lapse from the Leave balance automatically (Edge Case 13).
- Build the **Employee Deactivation Hook** so terminating a user cleanly unwinds their future leaves and attendance footprint (Edge Case 20).
- Build the **Regularization ↔ Leave Conflict Hook** so a manually corrected attendance day refunds the leave it overwrites (Edge Case 25).
- **Finish** the **Leave Type Soft-Delete Safety** guard, most of which already exists (Edge Case 26).

> **Non-goals (deferred):** Monthly accrual and year-end carry-forward crons belong to Phase 5. Phase 4 builds *only* the attendance-facing bridges and the one comp-off expiry cron that is inseparable from the comp-off bridge.

---

## 0. Phase 3 Debt — Mandatory Pre-Work (do this first)

Phase 3 wrote the leave→attendance sync assuming schema that does not exist. Sequelize **silently ignores unknown model attributes on `create`/`update`**, so these writes have been no-ops in production. None of the Phase 4 bridges can work until this is fixed. This is Step 0 and blocks everything.

### 0.1 Add `leave_id` and `is_half_day` to `attendance_records` (model + migration + association)
- **Reality:** `leave_approval.service.js` writes `leave_id: request.id`, `is_half_day`, and `half_day_type` onto `attendance_records`, but the `AttendanceRecords` model **and** the `00015` create-table migration define **neither `leave_id` nor `is_half_day`** (`half_day_type` does exist). So every `on_leave` record ever created has `leave_id = NULL` and no `is_half_day`, and the leave-id-based revert branch in `leave_approval`'s cancellation-approval path currently matches **nothing** — it is a silent dead code path today.
- **Action:**
  1. New additive migration: `ALTER TABLE attendance_records ADD COLUMN leave_id UUID NULL`, `ADD COLUMN is_half_day BOOLEAN NOT NULL DEFAULT false`; add an index on `leave_id`.
  2. Add both fields to `attendance_records.model.js`, and add `AttendanceRecords.belongsTo(models.LeaveRequest, { foreignKey: 'leave_id', as: 'leave_request' })`.
  3. **Backfill** `leave_id` for existing `on_leave` records: match each `on_leave` record to the covering `approved` `leave_request` by `(org_id, user_id, date BETWEEN start_date AND end_date)`. Where the match is ambiguous or absent, leave NULL and rely on the legacy date-range fallback (see 0.3). Without this, historical leaves cannot be cancelled/regularized by `leave_id`.

### 0.2 Add `source_comp_off_id` to `leave_requests` (migration + model)
- **Reality:** confirmed absent from `leave_request.model.js`. Correct as the original plan identified.
- **Action:** additive migration `ADD COLUMN source_comp_off_id UUID NULL` + model field + `belongsTo(AttendanceCompOffs)`. Bundle in the **same migration file** as 0.1 so the schema lands atomically. Forward-only; no backfill.

### 0.3 Introduce a Leave↔Attendance bridge interface (fix the coupling now, before adding more hooks)
- **Reality:** `leave_application.cancelLeaveRequest` and `leave_approval` reach directly into `db.AttendanceRecord.destroy/create/update` — a cross-module coupling the original plan itself warned against (§8). Adding four more hooks on top of raw model calls will produce a tangle.
- **Action:** add a thin, explicit contract for cross-module writes and route **all** of them through it:
  - Attendance side: add the small set of methods the bridge needs to `attendance_records.repository.js` (e.g. `findByLeaveId`, `findByUserAndDateRange`, `revertLeaveRecords({leaveId, userId, orgId, cutoffDate}, tx)`), all transaction-aware and `leave_id`-first with a **date-range fallback for legacy NULL-`leave_id` rows** (so pre-0.1 leaves still revert cleanly).
  - Leave-balance writes from the Attendance side (comp-off credit/lapse, regularization refund) go through `leave_balance.repository.js`, which **already exposes** locked `findOrCreateBalance` and `getBalanceForUpdate` — use them; do not new up `db.LeaveBalance` from attendance services.
- This makes the contract testable and keeps a schema change on one side from silently breaking the other.

### 0.4 Migrate `cancelLeaveRequest`'s revert to `leave_id`
- **Reality:** `leave_application.cancelLeaveRequest` destroys `on_leave` records by `(user_id, org_id, date BETWEEN start,end, status='on_leave')` — it does **not** filter by `leave_id` (because `leave_id` never existed). This can destroy an unrelated overlapping `on_leave` record.
- **Action:** once 0.1 lands, switch this (and the `leave_approval` cancellation-approval path) to the shared `revertLeaveRecords` helper so reverts are scoped to `leave_id = request.id`, with the date-range fallback only for legacy NULL rows.

---

## 2. Database & Schema Verification
Phase 4 introduces **no new tables**, but it **does** require the additive columns in Section 0 (these are not optional). Verify the following:

- `attendance_records` — **currently lacks `leave_id` and `is_half_day`** (see §0.1). After §0.1 it exposes `leave_id` (UUID, nullable, indexed) and `is_half_day` (boolean). `status` is a free `STRING(30)` (default `absent`), **not** a DB enum — writing `on_leave` / `absent` / `present` / `half_day` / `weekly_off` / `holiday` requires no enum migration, only the string value. `half_day_type` (`STRING(15)`) already exists.
- `attendance_comp_offs` — already exposes `status` (`earned` → `approved` → `used`/`expired`/`cancelled`), `expiry_date` (DATEONLY), `used_on_date` (DATEONLY), and `used_leave_id` (UUID). Status is a free `STRING(20)`. These are the fields the bridge mutates when a comp-off is burned or expires.
- `leave_types` — **confirmed** to have a stable `code` (`STRING(50)`, NOT NULL, unique per org) and `leave_type.repository.findByCodeAndOrgId(code, orgId)`. Resolve the org's Comp-Off type by `code = 'CO'`; **never** match on the free-text `name`. If an org has no `CO` type, comp-off approval must fail loudly (see §3.1 step 2), not silently skip the credit.
- `leave_balances` — the Comp-Off credit/lapse writes to `total_accrued` and `current_balance` (both `DECIMAL(5,2)`), keyed `(org_id, user_id, leave_type_id, year)` (unique index confirmed). Route writes through `leave_balance.repository` (§0.3).
- `leave_requests` — `status` enum already includes `terminated_cancelled` (confirmed in `leave_request.model.js`), used by the deactivation hook. `is_half_day` / `half_day_type` present. `source_comp_off_id` added in §0.2.

---

## 3. Core Engines & Utilities (The Bridges)

### 3.1 Comp Off Bridge — Earn Side (`comp_off.service.js` hook)
When a comp-off transitions `earned → approved`, credit the employee's Comp-Off leave wallet in the **same transaction** as the approval.

**Location:** `approveCompOff()` in `src/modules/attendance/services/comp_off.service.js`. **Confirmed:** it currently runs with **no transaction** — it calls `getCompOffById` then `compOffRepository.updateById(id, {status:'approved', expiry_date, approved_by})` unwrapped, and sets `expiry_date = earned_date + 90 days` inline. It must be wrapped in a transaction and extended.
**Logic:**
1. Open a transaction. `SELECT ... FOR UPDATE` the comp-off row (`compOffRepository.findById(id, tx, true)`); re-verify `status === 'earned'` inside the lock (idempotency guard against double-approve).
2. Resolve the org's Comp-Off leave type by `code = 'CO'` via `leaveTypeRepository.findByCodeAndOrgId('CO', orgId)`. If absent → `AppError(409, 'No Comp-Off leave type configured', 'CO_TYPE_MISSING')` and roll back. **Do not** create the leave silently.
3. `leave_balance.repository.findOrCreateBalance({org_id, user_id, leave_type_id: CO, year: year(earned_date)}, tx)` (already locks `FOR UPDATE`).
4. `total_accrued += 1`, `current_balance += 1`. Persist via `leave_balance.repository.update`.
5. Set comp-off `status = 'approved'`, `expiry_date = earned_date + window`. Keep the 90-day default, but if the applicable `attendance_comp_off_policies` row defines an expiry window, use that (confirm the policy field name during implementation).
6. Commit. Write an audit log entry (comp-off id → balance id, +1).

**Why a shared transaction:** if the balance credit succeeds but the status flip fails (or vice-versa), the employee either double-earns or silently loses a day. Both are ledger-integrity failures.

### 3.2 Comp Off Bridge — Burn Side (`leave_application` + `leave_approval` hooks)
Spending a comp-off day must decrement the *source* comp-off, not just the aggregate balance, so expiry accounting stays honest.

**Logic:**
- **On application** of a leave whose `leave_type.code === 'CO'` (`leave_application.service.js` `submitLeaveRequest`): after the standard balance check, pick the **oldest non-expired `approved`** comp-off row(s) (FIFO by `expiry_date`) to satisfy the requested days, and stamp `leave_requests.source_comp_off_id`. Constrain comp-off leaves to the **single-day case** in the request validator for Phase 4 (multi-day multi-comp-off consumption is deferred — see §8).
- **On approval** (`leave_approval.service.js` `approveRequest`, inside its existing transaction): mark the linked `attendance_comp_offs` row `status = 'used'`, `used_on_date = start_date`, `used_leave_id = request.id`.
- **On cancellation** (`leave_application.cancelLeaveRequest` and the `cancellation_pending` approval path): reverse it — set the comp-off back to `approved`, clear `used_on_date`/`used_leave_id`, **but only if `expiry_date >= today`**. If it would already have expired, refund as a plain balance credit instead of resurrecting a dead comp-off.

### 3.3 Employee Deactivation Hook (`organization.service.js`)
When HR soft-deletes an employee, their pending/future leaves and future attendance footprint must be unwound so they don't haunt approver queues or corrupt payroll.

**Location:** extend `softDeleteEmployee()` in `src/modules/organization/services/organization.service.js`, inside its **existing transaction**. Call the leave-unwind *after* `_reassignSubordinatesOnDelete` and *before* the `softDeleteEmployee` repo call.
**Logic (all in the passed-in transaction):**
1. Load all `leave_requests` for the user with `status IN ('pending', 'approved', 'cancellation_pending')` and `end_date >= today`.
2. For each **`approved`, future** request: run the shared `unwindApprovedLeave(request, tx)` helper (§Implementation Order step 2) — refund `paid_days` to `current_balance`, decrement `total_used`, then revert its `attendance_records` **by `leave_id`** (`date > today` → destroy; `date <= today` → leave as historical), via the §0.3 bridge helper.
3. For each **`pending` / `cancellation_pending`** request: no balance was ever deducted (phantom hold only) → just set `status = 'terminated_cancelled'`.
4. For all touched requests: set `status = 'terminated_cancelled'`, `actioned_at = NOW()`.
5. Do **not** refund partially-elapsed leaves (past days were genuinely taken).

### 3.4 Regularization ↔ Leave Conflict Hook (`regularization.service.js`)
A regularization that turns an `on_leave` day into a worked day must give the leave back.

**Location:** `approveRequest()` in `src/modules/attendance/services/regularization.service.js`, inside its **existing transaction**.
**Confirmed gap:** the current flow does **not** load the record when `request.record_id` is present — it fires `recordRepo.updateById(request.record_id, {...})` blindly. You must add an explicit read first.
**Logic:**
1. Add `const record = await recordRepo.findById(request.record_id, tx, true)` (FOR UPDATE) **before** the update.
2. If `record.status === 'on_leave'` and `record.leave_id != null`: load the linked `leave_requests` row `FOR UPDATE`. Refund the amount **read from the record's `is_half_day`/`half_day_type`** (0.5 for a half-day record, else the per-day amount) to `leave_balances.current_balance`, reduce `total_used`, and reduce the request's `total_days` for that date.
   - If this drops the request to `total_days <= 0`, set the request `status = 'cancelled'`.
3. Flip the record to the regularized worked state (`is_regularized = true`, status reset for recalculation) and **clear `leave_id`** (and `is_half_day`).
4. Make it **explicit and logged** — surface `regularization_refunded_leave: true` in the response so the approver sees what happened.

### 3.5 Leave Type Soft-Delete Safety (`leave_admin.service.js`) — **already largely implemented**
**Reality:** `leave_admin.deleteLeaveType(id, orgId, force)` **already**: locks the leave-type row `FOR UPDATE`; blocks with `409 PENDING_REQUESTS_EXIST` when `pending`/`cancellation_pending` requests exist; and, unless `force === true`, blocks with `409 ACTIVE_BALANCES_EXIST` when any `current_balance > 0` exists; then `softDelete` sets `is_active = false`. So most of §3.5 is done.
**Remaining work (scoped down):**
1. **Design decision to reconcile:** the code **hard-blocks** on residual balance (with a `force` override), whereas the original plan wanted a **non-blocking warning payload** listing affected users. Pick one and make it consistent. (Recommendation: keep the existing `force`-override block — it's already shipped and is the safer default — but have the API return the affected-user list in the `409` body so HR can decide, then re-call with `force=true`.)
2. **Confirm the application path rejects inactive types:** `getLeaveTypes` already filters `is_active` unless `includeInactive`. Verify that `leave_application.submitLeaveRequest` (or its validator) rejects a request whose `leave_type` is `is_active = false` (today it keys off `EmployeeLeaveConfig`, not the type's active flag). Add a `422`/`409` guard if missing. Historical `my-requests` reads must still join inactive types (the balance repo already uses `required: false`).

---

## 4. Integration Surface (Hooks, not new public routes)
Phase 4 is almost entirely **internal wiring** — it adds behavior to existing endpoints. The touched endpoints:

| Existing Endpoint / Trigger | File | Phase 4 Behavior Added |
|---|---|---|
| `POST /api/v1/attendance/comp-offs/:id/approve` | `comp_off.service.js` | Wrap in tx; credit `+1` Comp-Off balance via leave repo (§3.1) |
| `POST /api/v1/leaves/request` (CO type) | `leave_application.service.js` | Link + FIFO-reserve source comp-off (§3.2) |
| `POST /api/v1/leaves/requests/:id/approve` (CO type) | `leave_approval.service.js` | Mark source comp-off `used` (§3.2) |
| `POST /api/v1/leaves/requests/:id/cancel` (CO type) | `leave_application.service.js` | Un-burn comp-off if not expired; revert by `leave_id` (§0.4, §3.2) |
| `DELETE /api/v1/organizations/employees/:id` | `organization.service.js` | Unwind future leaves + attendance (§3.3) |
| `POST /api/v1/attendance/regularizations/:id/approve` | `regularization.service.js` | Load record, refund leave on `on_leave` conflict (§3.4) |
| `DELETE /api/v1/leaves/types/:id` | `leave_admin.service.js` | Verify/reconcile existing guard (§3.5) |

**One new background job** (not an HTTP route):
- `src/cron-jobs/comp_off_expiry_sync.cron.js` — nightly (`0 2 * * *` IST). For each `attendance_comp_offs` where `status = 'approved'` AND `expiry_date < today`: decrement `1` from the Comp-Off `leave_balances.current_balance` (floor at the configured `max_negative_balance`, never below), set comp-off `status = 'expired'`. Process per-org in batched, locked transactions. Register in `server.js` alongside `auto_mark_absent.cron` / `auto_clock_out.cron` (note: `server.js` gates these under `os.platform() === 'linux'`).

---

## 5. Critical Edge Cases & Integrity Handling

### 5.1 Cron vs. Burn Race (Comp-Off expires the same night it is spent)
The expiry cron runs at 02:00; a comp-off leave for tomorrow was approved at 23:00, but the comp-off's `expiry_date` is today.
**Solution:** The cron **only** targets comp-offs in `status = 'approved'`. A burned comp-off is already `status = 'used'`, so the cron skips it. The status transition, guarded by `FOR UPDATE`, is the single source of truth — never expire on date alone.

### 5.2 Double-Credit on Comp-Off Re-Approval
**Solution:** The earn-side bridge (§3.1) re-checks `status === 'earned'` *inside* the row lock. A second approval finds `status = 'approved'` and aborts before crediting.

### 5.3 Deactivation During In-Flight Approval
**Solution:** Both operations lock the `leave_requests` row `FOR UPDATE`. Whichever commits first wins; the second sees the mutated status and its guard rejects the stale transition.

### 5.4 Regularization Refund vs. Half-Day Leave
**Solution:** The refund amount is read from the *record's* `is_half_day`/`half_day_type` (which requires §0.1 — before that column exists the value is always null). Refund exactly what was deducted (0.5), and only clear the leave for the half it covered.

### 5.5 Comp-Off Type Missing / Misconfigured Org
**Solution:** Fail the comp-off *approval* loudly (§3.1 step 2) rather than crediting a phantom balance. Provisioning a `CO` leave type should be part of org onboarding — flag as a follow-up with the organization-module owners.

### 5.6 Idempotency of the Expiry Cron
**Solution:** Filters on `status = 'approved'` and flips to `expired` inside a locked transaction per row/batch; already-expired rows are excluded on re-run. Naturally idempotent — log processed counts per org for observability.

### 5.7 Legacy `on_leave` records with NULL `leave_id` (new)
Pre-§0.1 `on_leave` records carry NULL `leave_id`. If the backfill (§0.1 step 3) can't confidently match one, the `leave_id`-first bridge helper must fall back to the date-range match for those legacy rows only, so historical leave cancellations/regularizations still revert. New records (post-§0.1) always carry `leave_id` and take the precise path.

---

## 6. Implementation Order (Sequential Workflow)
1. **Schema + coupling foundation (Section 0):** one additive migration adding `attendance_records.leave_id` + `attendance_records.is_half_day` + `leave_requests.source_comp_off_id`; update the three models + associations; backfill `leave_id`; introduce the bridge interface (§0.3) and migrate `cancelLeaveRequest`/`leave_approval` reverts to it (§0.4). **Nothing else works until this ships.**
2. **Shared helper:** extract `unwindApprovedLeave(request, tx)` (refund balance + revert attendance by `leave_id`). Both §3.3 and the cancellation paths reuse it — single source of truth.
3. **Comp-Off Earn Bridge (§3.1):** wrap `approveCompOff` in a transaction, add the `CO`-type resolution + balance credit through the leave repo. Ship + test before the burn side.
4. **Comp-Off Burn Bridge (§3.2):** link on application (single-day), mark `used` on approval, un-burn on cancel.
5. **Comp-Off Expiry Cron (§4):** build and register `comp_off_expiry_sync.cron.js`.
6. **Leave Type Soft-Delete Safety (§3.5):** verify existing guard, reconcile block-vs-warn, confirm the application path rejects inactive types. (Small — mostly done.)
7. **Regularization Conflict Hook (§3.4):** add the record read + `on_leave` refund branch to `approveRequest`.
8. **Employee Deactivation Hook (§3.3):** last, since it composes `unwindApprovedLeave` (step 2) and touches the most other systems.

---

## 7. Testing Strategy
- **Schema/regression (Section 0):** approve a leave → assert the `on_leave` `attendance_records` row now actually persists `leave_id` and `is_half_day` (would have been NULL before). Backfill: seed legacy NULL-`leave_id` `on_leave` rows → run backfill → assert matched.
- **Unit:** `unwindApprovedLeave` against future/past/half-day records; comp-off FIFO selection against mixed expiry dates; the bridge helper's `leave_id`-first + date-range-fallback branching.
- **Comp-Off loop (integration):** earn → approve (assert `+1` CO balance, one credit only) → apply CO leave → approve (assert comp-off `used`) → cancel (assert comp-off `approved` again, balance restored). Repeat with an already-expired comp-off and assert plain-balance refund instead of resurrection. Include the **missing-`CO`-type** org → assert `409 CO_TYPE_MISSING`, no phantom credit.
- **Expiry cron:** seed an `approved` comp-off with `expiry_date = yesterday`; run cron; assert balance `-1` and status `expired`. Re-run; assert **no** double-decrement.
- **Deactivation:** employee with 1 pending + 1 future-approved + 1 past-approved leave → soft-delete → assert pending & future set `terminated_cancelled`, future balance refunded, future `on_leave` records destroyed (by `leave_id`), past leave untouched.
- **Regularization refund:** approve a leave marking a day `on_leave` → regularize that day → assert `total_days`/balance refunded by exactly the right amount (0.5 for half-day), `leave_id` cleared, response flags the refund.
- **Soft-delete guard:** deactivate a leave type with an open pending request → `409 PENDING_REQUESTS_EXIST`; with residual balance only → `409 ACTIVE_BALANCES_EXIST` without `force`, success with `force=true`.
- **Concurrency:** simultaneous comp-off approve×2 (assert single credit); simultaneous deactivate + leave-approve (assert one clean winner); cron-expiry vs. burn on the same comp-off (assert exactly one terminal state).

---

## 8. Dependencies and Risks
- **Hard dependency:** Section 0 is a prerequisite for **every** bridge — the leave↔attendance link does not physically exist until the migration + models land. Do not start §3.x before Step 1.
- **Dependency:** requires a canonical `CO` leave type per org. The `code` column and `findByCodeAndOrgId` exist, but org onboarding does not yet provision a `CO` type — coordinate with the organization-module owners or the comp-off bridge is inert.
- **Risk — cross-module transaction coupling:** the comp-off and regularization hooks live in **Attendance** but mutate **Leave** tables. Mitigated by §0.3: route all cross-module writes through the Leave repositories (`leave_balance.repository`, and a leave-owned attendance-bridge method), never raw model calls, so the contract is explicit and testable.
- **Risk — helper divergence:** if `unwindApprovedLeave` and the revert helper are copy-pasted instead of shared, the deactivation and cancellation paths will drift. Enforce the single-helper rule in review.
- **Risk — comp-off FIFO on multi-day leaves:** linking one `source_comp_off_id` under-models a multi-day comp-off leave. For Phase 4, constrain comp-off leaves to the single-day case in the validator; defer multi-comp-off consumption to a later hardening pass.
- **Risk — no test suite exists yet:** the project has no automated tests. Given that Phase 4 mutates payroll-affecting ledgers across two modules, stand up a minimal integration-test harness (Jest + a disposable test DB) alongside Step 1 rather than after.