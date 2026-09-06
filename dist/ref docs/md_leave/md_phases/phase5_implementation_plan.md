# Phase 5: Cron Jobs & Year-End Automation — Implementation Plan (Revised)

> **Status of this revision.** The prior draft was reviewed against the live codebase, then this pass **re-verified every claim by reading the actual source** (not the plan's assertions). The Phase 4 fixes are confirmed present. Four blocking corrections (C1–C4) hold. The integrity additions (A1–A9) hold and are sharpened with exact code references. **Nine new items (E1–E9)** were found on this pass — one of them a genuine leak the Phase 4 fixes did **not** cover, plus a cross-boundary approval failure that only surfaces by reading the approval path.
>
> Files read for verification: `leave_approval.service.js`, `leave_assignment.service.js`, `regularization.service.js`, `leave_attendance_bridge.utils.js`, `employee_leave_config.model.js`, `leave_balance.model.js`, `comp_off_expiry_sync.cron.js`.

---

## Part 0 — Phase 4 fixes: verified, with one gap

All three fixes are present and correct:

- **Bug 1 (`in_progress` bypass)** — `leave_approval.service.js:113-114`. The guard is now `else if (existingRecord.status === 'present' || existingRecord.status === 'in_progress')` throwing `BadRequestError`. Runs inside the approval transaction with the leave request (`:19`) and balance row (`:35`) locked `FOR UPDATE`. Correct.
- **Bug 2 (regularization comp-off laundering)** — `regularization.service.js:191-211`. Locks the comp-off `FOR UPDATE`, checks `expiry_date`, returns it to `approved` if live, marks `expired` and **suppresses the balance refund** (`refundBalance = false`, `:208`) if dead. Correct.
- **Bug 3 (deactivation comp-off leak)** — `leave_attendance_bridge.utils.js:16-36`. Identical, correct.

### E1 (blocking) — the same leak still lives in the cancellation-approval path, and the fix is now copied four times

The "un-burn a comp-off, suppress the refund if it expired" invariant now exists in **four** places, and they have **drifted**:

| Location | Locks `FOR UPDATE` | Suppresses refund when comp-off expired? |
|---|---|---|
| `regularization.service.js::_refundLeaveForRegularizedDay` | yes | **yes** (`refundBalance=false`) |
| `leave_attendance_bridge.utils.js::unwindApprovedLeave` | yes | **yes** |
| `leave_approval.service.js::_unburnCompOff` (cancellation) | yes | **no** |
| `leave_approval.service.js` approval-side burn (`:135`) | yes | n/a (burn, not un-burn) |

In the cancellation-approval path (`leave_approval.service.js:146-181`), the balance is refunded **unconditionally** at `:155-159`, and *then* `_unburnCompOff` (`:194`) runs. `_unburnCompOff` marks an expired comp-off `expired` but never rolls back that already-applied refund. So a cancellation whose backing comp-off expired in the meantime credits a phantom day into the balance while the comp-off is dead — **exactly the laundering leak Bugs 2 and 3 closed**, still open here. (The Bug 2 write-up cited this path as the canonical implementation to copy; in fact it is the one now missing the suppression.)

**Fix — extract one shared helper and route all four sites through it.** This is the real remedy for a bug class that has already recurred three times because the invariant lives in developers' heads instead of one function:

```
// comp_off.service.js
async releaseBurnedCompOff(compOffId, orgId, transaction) → { released: bool, refundAllowed: bool }
//   locks the comp-off FOR UPDATE
//   status !== 'used' → { released:false, refundAllowed:true }   (nothing to un-burn)
//   not expired       → status='approved', clear used_* → { released:true, refundAllowed:true }
//   expired           → status='expired'                 → { released:true, refundAllowed:false }
```

Callers refund the balance **only if `refundAllowed`**. Convert the cancellation path to compute the refund *after* calling the helper (like the other three), so an expired comp-off suppresses it there too.

**Also verify (not yet confirmed):** whether the attendance row read at `leave_approval.service.js:98` (`attendanceRecordRepository.findByDate`) takes `FOR UPDATE`. The leave request and balance are locked, but a concurrent clock-in that flips the attendance row to `in_progress` between this read and the write is a check-then-act window. Low probability (a unique `(org,user,date)` constraint on attendance would catch the double-insert), worth a lock for correctness.

---

## Blocking Corrections (re-verified against source)

### C1 — `accrual_type` has no `'annual'` value — confirmed
`employee_leave_config.model.js:29-30`: `accrual_type: DataTypes.ENUM('upfront', 'monthly')`. Any `'annual'` branch is dead code; upfront employees would roll over with `carry_forward` only and zero fresh quota. **Use `'upfront'` everywhere the old draft said `'annual'`.**

### C2 — migration path/naming — confirmed
Migrations live in `src/infrastructure/postgres-sql/migrations/` with a zero-padded prefix; latest is `00034-phase4-attendance-leave-bridge.js`. **New migration: `00035-add-leave-balance-rollover-columns.js`.**

### C3 — reassignment engine already exists — confirmed, do not rebuild
`leave_assignment.service.js` already implements it. `_calculateNewAccrued()` (`:24`) handles all four transitions — `upfront→upfront` (differential quota, `:37-43`), `monthly→upfront` (`:44-48`), `upfront→monthly` (strips unearned future days, `:56-65`), `monthly→monthly` (no-op — "Cron handles future", `:67`) — with leap years (`:26`) and `_roundToHalf()` (`:16`). `assignPolicyToUser()` and `overrideEmployeeConfig()` are fully transactional. **Reframe §3 to "verify & extend."**

### C4 — cannot insert a parallel active config — confirmed
`employee_leave_config.model.js:65-72` defines a partial unique index on `['user_id','leave_type_id'] WHERE deleted_at IS NULL`. `_closeOutConfig()` (`leave_assignment.service.js:78-97`) sets `effective_to` **then soft-deletes** (`db.EmployeeLeaveConfig.destroy`) to free the index. **Reuse `_closeOutConfig()`; never insert a second active row.**

---

## Confirmed facts the plan depended on

- **Unique index for rollover idempotency exists.** `leave_balance.model.js:53-59` — `leave_balances_org_user_type_year_idx` on `['org_id','user_id','leave_type_id','year'] WHERE deleted_at IS NULL`. `findOrCreate` idempotency is valid.
- **`leave_balances` has only `total_accrued`, `total_used`, `current_balance`** (`:29-43`). No `lapsed_balance`, `carried_forward`, or watermark. Migration required (below).
- **Fresh-quota source confirmed.** `assigned_annual_quota` on the config is the *full* annual quota (`leave_assignment.service.js:155` comment: "MUST be the full quota, not pro-rated"). Rollover reads it from the currently-active (non-deleted) config.
- **`max_carry_forward`** lives on the config, `DECIMAL(5,2)` default 0 (`employee_leave_config.model.js:33-37`).
- **Negative balances are a designed feature** — `max_negative_balance` (`:43-47`) and `leave_approval.service.js:46-51` enforce it. This *strengthens* the "carry negatives forward" recommendation: the system already treats a negative balance as real consumed advance.
- **Cron pattern confirmed.** `comp_off_expiry_sync.cron.js` runs `'0 2 * * *'`, `timezone: 'Asia/Kolkata'`, thin wrapper delegating to `compOffService.expireStaleCompOffs()`. The proposed 00:00 (rollover) and 01:00 (accrual) slots don't collide with the 02:00 comp-off job.

---

## User Review Required

> [!IMPORTANT]
> **Negative balance carry-forward.** `carry_forward = min(current_balance, max_carry_forward)` yields `-2` for a `-2` balance, carrying the debt. **Recommend keeping it** — negatives are real advances the system already supports (`max_negative_balance`); zeroing them silently forgives leave debt (take advance in December, wiped Jan 1). `lapsed = max(0, current_balance - carry_forward)` stays `0` for negatives, so nothing is mis-lapsed. Confirm, or say clamp at zero.

> [!WARNING]
> **Migration (three columns, one migration):** add `lapsed_balance`, `carried_forward`, `last_accrued_period` to `leave_balances` (A9). Confirmed absent from the model. **Must also backfill existing rows (E6)** or the first post-deploy accrual run mis-credits everyone.

---

## Open Questions

> [!NOTE]
> 1. **Accrual time:** `0 1 1 * *` (01:00) so rollover at `0 0 1 1 *` (00:00) has a clear one-hour lead (A2). Confirm.
> 2. **Pro-rata:** already decided in code — `_calculateNewAccrued()` uses exact day-of-year fractions. Keep it; don't switch to month-boundary rounding unless HR mandates month granularity.
> 3. **CO exclusion (A3):** confirm `CO` is excluded from both crons. **And confirm whether CO is the *only* excluded type — see E7** (event-based types like maternity/LWP likely need the same treatment).
> 4. **Cross-boundary approval (E2 — new):** approving a leave request whose `start_date` is in a not-yet-rolled year currently **hard-fails**. Decide the intended behavior (see E2).
> 5. **Leave year = calendar year (E9 — new):** confirmed hardcoded system-wide. Confirm no org needs a fiscal (e.g. Apr–Mar) cycle before we bake Jan 1 into a cron.

---

## Proposed Changes

### 1. Database Migration

#### [NEW] `src/infrastructure/postgres-sql/migrations/00035-add-leave-balance-rollover-columns.js` *(C2, A9, E6)*
Add to `leave_balances`, matching the existing `DECIMAL(5,2)`:
- `lapsed_balance` — `DECIMAL(5,2) NOT NULL DEFAULT 0`. Excess burned at year-end.
- `carried_forward` — `DECIMAL(5,2) NOT NULL DEFAULT 0`. Portion of new-year `total_accrued` that came from last year. Without it, a balance dispute is unresolvable (can't separate carry-forward from fresh quota).
- `last_accrued_period` — `STRING(7)` nullable, `'YYYY-MM'`. Idempotency watermark for the monthly accrual cron (A1).

**Backfill in the same migration (E6):** for existing current-year rows, set `last_accrued_period` to the last month already credited (or leave `NULL` only if you are certain no monthly accrual has run through any other path). Otherwise the first cron run sees `NULL`, treats every monthly employee as never-accrued, and credits a full cumulative catch-up. `carried_forward` can backfill to `0` for pre-existing rows (no audited carry yet).

---

### 2. Cron Jobs

Both mirror `comp_off_expiry_sync.cron.js` (node-cron, `timezone: 'Asia/Kolkata'`, try/catch + logged count, thin wrapper → service method). **All real logic lives in a service (A7/E5), not the `.cron.js` file.**

#### [NEW] `src/cron-jobs/leave_monthly_accrual.cron.js` → `leave_accrual.service.js`
- **Schedule:** `0 1 1 * *` (1st, 01:00 IST) — offset per A2.
- **Target:** `accrual_type = 'monthly'` configs.
- **Logic:**
  1. Fetch active `employee_leave_configs` where `accrual_type = 'monthly'` (paranoid excludes soft-deleted superseded configs — critical, else reassigned employees double-credit, C4).
  2. Exclude `CO` (A3) — and any other non-accruing types (E7).
  3. Skip inactive/terminated users; skip configs whose `effective_to` is in the past (A6).
  4. Credit via **cumulative target anchored to the config's `effective_from`**, not Jan 1 (A4 + **E3**):
     ```
     monthsElapsed = whole months from effective_from (this year) to now
     target = roundToHalf(assigned_annual_quota * monthsElapsed / 12)
     credit = max(0, target - (total_accrued - carried_forward))
     ```
     `total_accrued - carried_forward` is "already accrued from monthly runs this year" (needs `carried_forward`, hence A9). The `max(0, …)` floor prevents a debit when a mid-year reassignment lowered the quota (**E4**). Reuse the existing `_roundToHalf()` for 0.5 granularity (matches `_calculateNewAccrued`, which anchors to `effectiveDate.month()` at `leave_assignment.service.js:53` — mirror that anchoring, do not count from January).
  5. Idempotency guard (A1): if `last_accrued_period === current 'YYYY-MM'`, skip. Set it inside the same transaction as the credit.
  6. Per-org chunked transactions (A8).

#### [NEW] `src/cron-jobs/leave_year_end_rollover.cron.js` → `leave_rollover.service.js`
- **Schedule:** `0 0 1 1 *` (Jan 1, 00:00 IST).
- **Logic (per active config, excluding `CO`/E7, skipping inactive/A6):**
  1. `oldYear` / `newYear`.
  2. Fetch the `oldYear` balance **`FOR UPDATE`** (E-lock: rollover must not race a live approval still deducting from the old year on the boundary).
  3. `carry_forward = min(current_balance, max_carry_forward)` — negatives carry by design.
  4. `lapsed = max(0, current_balance - carry_forward)`.
  5. Update old row: `lapsed_balance = lapsed`.
  6. Create/complete new row (`findOrCreate` on the confirmed unique index):
     - `total_used = 0`, `carried_forward = carry_forward`
     - `accrual_type === 'upfront'`: `total_accrued = carry_forward + assigned_annual_quota` *(C1)*
     - `accrual_type === 'monthly'`: `total_accrued = carry_forward`, `last_accrued_period = null`
     - `current_balance = total_accrued`
  7. Idempotency: skip any old row that already has `lapsed_balance` set; **if the new-year row already exists (E2 — created early), complete it rather than skipping** — populate `carried_forward`/`total_accrued` if they are still at defaults.

#### [MODIFY] `src/server.js`
Mount both inside the existing `os.platform() === 'linux'` block, alongside `auto_clock_out`, `auto_mark_absent`, `comp_off_expiry_sync`.

---

### 3. Policy Reassignment — Verify & Extend *(C3/C4)*

#### [MODIFY] `src/modules/leave/services/leave_assignment.service.js`
The engine is correct. Only Phase 5 change:
- After a reassignment that results in `accrual_type = 'monthly'`, **stamp `last_accrued_period` on the current-year balance to the current `YYYY-MM`**. `_calculateNewAccrued()` deliberately no-ops for `monthly→monthly` (`:67`); without the watermark the next cron can't tell "already credited this month under the old config" from "not yet credited" and over-credits the switch month.
- Confirm (don't rewrite) `_closeOutConfig()` runs on every superseding path — it does today in both `assignPolicyToUser` and `overrideEmployeeConfig`.

---

## Added Integrity Requirements (A1–A9 — retained, verified)

**A1 — Accrual idempotency.** Compare `last_accrued_period` to current `YYYY-MM`; skip if equal; set it in the credit's transaction. Makes the job re-runnable (server restart at 01:00, manual re-run, future cluster mode).
**A2 — Jan 1 collision.** Offset accrual to 01:00; rollover keeps 00:00. A1 + `findOrCreate` make ordering safe even on overrun.
**A3 — Exclude `CO`.** Comp-off is earned ad hoc via the bridge and expires via `comp_off_expiry_sync.cron.js`; it is not accrued from quota. Treating it as normal would fabricate days (accrual) or lapse live comp-off balances (rollover), re-opening the Phase 4 bug class. Resolve the `CO` type id via `leaveTypeRepository.findByCodeAndOrgId('CO', orgId)` and exclude it in both crons.
**A4 — Rounding drift.** Naive `quota/12` overcredits (15/12 → 1.5 → 18/yr). Use the cumulative-target delta (§2). Self-corrects, lands exactly on quota in December.
**A5 — Pending requests across the boundary.** A December `pending` request holds against the old year; after rollover the old row is finalized. **Decide:** (a) rollover treats pending-locked days as non-lapsable (carry up to `max_carry_forward`), or (b) auto-reject old-year pending at rollover with a `rejection_reason`. Must be explicit; the ledger is silently inconsistent otherwise. (Phase 3 already blocks a single request spanning two calendar years, so only the pending-at-boundary case remains.)
**A6 — Skip terminated/inactive.** Join user/role-profile status; skip inactive, soft-deleted, exited users and past-`effective_to` configs. Else rollover resurrects balances for people the Phase 4 deactivation hook already unwound.
**A7 — Testability.** Crons only register under `os.platform() === 'linux'`; dev is Windows. Put logic in a service behind a guarded admin endpoint / `npm run` script; `.cron.js` stays a scheduler wrapper.
**A8 — Chunked transactions.** Per org, chunk ~200 employees, one transaction per chunk. A global transaction holds `leave_balances` row locks tenant-wide and blocks live approvals (which take `FOR UPDATE` on the balance — confirmed at `leave_approval.service.js:35`). Log processed/skipped/failed per org.
**A9 — Audit trail.** `carried_forward` + `lapsed_balance` make each transition explainable; see E8 for durable run records.

---

## New Integrity Requirements (E1–E9 — found this pass)

- **E1 (blocking) — Reconcile the four un-burn copies; the cancellation path still leaks.** See Part 0. Extract `releaseBurnedCompOff()`; suppress the cancellation-path refund on expiry.
- **E2 — Cross-boundary approval hard-fails.** `leave_approval.service.js:33-39` looks up the balance for `year(start_date)` and throws `NotFoundError('Leave balance not found.')` if absent. So a request whose start date is in a not-yet-rolled year **cannot be approved** until rollover creates the row. Decide: (a) approval `findOrCreate`s the target-year balance from the active config, or (b) block new-year requests until rollover, documented. Silent `NotFoundError` to a manager in late December is the current behavior — pick intentionally. Add a test.
- **E3 — Mid-year-joiner accrual anchoring.** The cumulative target must count months from the config's `effective_from`, not January — otherwise a July joiner is credited 6/12 on their first run. `_calculateNewAccrued` already anchors to the effective/joining date (`:53`); the cron must mirror it. Folded into §2.
- **E4 — Downward reassignment → negative accrual delta.** If a reassignment lowers quota mid-year, `target - alreadyAccrued` can go negative. The `max(0, …)` floor in §2 prevents debiting below `total_used`. Add a downward-reassignment test (existing test only goes 12→18).
- **E5 — node-cron does not fire missed runs; the rollover is annual.** If the server is down or deploying at 00:00 Jan 1 (single-instance `fork`, a restart at 00:05 misses it entirely), the rollover never runs and nothing notices. Reframe A7's admin trigger as the **production safety net**, add a **startup catch-up check** ("are we past the boundary with an un-rolled prior year? run it"), and **alert on failure** (Sentry/email/Slack) — a silent rollover failure is the same "discovered in January" class as the C1 bug.
- **E6 — Deploy-time backfill.** Folded into the migration. First post-deploy accrual run mis-credits without it.
- **E7 — Is `CO` the only special type?** Rollover treats every non-`CO` type with the same `min(balance, max_carry_forward)` model. Event-based / use-it-or-lose-it types (maternity, LWP/unpaid, sabbatical, sometimes sick) don't fit annual accrual and may need the same exclusion as `CO`. `max_carry_forward = 0` covers "lapse all," but genuinely event-based types shouldn't enter the pipeline. Confirm the full exclusion set with HR before shipping.
- **E8 — Durable run audit + alerting.** Logs rotate; year-end disputes surface months later. Add a small `leave_cron_run` table (run, org, processed/skipped/failed, timestamp, error) and failure alerting. Cheap insurance for ledger-adjacent automation.
- **E9 — Calendar-year assumption is system-wide.** Confirmed: year is `moment(start_date).year()` everywhere (`leave_approval.service.js:32,148`; `regularization.service.js:180`; `leave_attendance_bridge.utils.js:11`). Jan 1 rollover is *consistent* with the codebase — not a bug — but the assumption is now baked into a cron. If fiscal-year (e.g. Apr–Mar) support is ever needed it's a cross-cutting change, not a config flag. Document it; source the rollover boundary from config rather than a literal cron string if there's any chance of a non-calendar org.

---

## Verification Plan

### Unit tests (highest value — pure functions of the balance row)
- **Accrual math (A4/E3):** 12 consecutive months on a 15-day quota totals **exactly 15**, not 18. July joiner's first run credits the effective-date-anchored fraction, not 6/12.
- **Accrual floor (E4):** reassignment 18→12 mid-year yields a non-negative credit and never pushes `current_balance` below `total_used`.
- **Rollover math:** upfront and monthly cases; negative-balance case.

### Integration / manual
1. **Accrual happy path** — monthly user; `current_balance`/`total_accrued` rise by the cumulative delta; `last_accrued_period` stamped.
2. **Accrual idempotency (A1)** — immediate re-trigger; no second credit.
3. **Accrual CO exclusion (A3)** — user with a `CO` balance gets no monthly credit.
4. **Rollover upfront (C1)** — 2025 `accrual_type='upfront'`, quota 12, balance 8, `max_carry_forward` 5 → 2025 `lapsed_balance=3`; 2026 `carried_forward=5`, `total_accrued=17`, `current_balance=17`.
5. **Rollover monthly** — same → 2026 `total_accrued=5`, `last_accrued_period=null`.
6. **Rollover idempotency** — re-run; no dup 2026 row; `lapsed_balance` unchanged.
7. **Rollover negative** — balance `-2` → carry `-2`, `lapsed_balance=0`.
8. **Rollover terminated (A6)** — no 2026 row.
9. **Boundary pending (A5)** — December `pending` across rollover, approved in January; chosen strategy holds; old-year ledger reconciles.
10. **Cross-boundary approval (E2)** — approve a request dated in the new year *before* rollover; assert the chosen behavior (findOrCreate vs. documented block), not an unhandled `NotFoundError`.
11. **Reassignment up & down (C3/C4/E4)** — 12→18 and 18→12 mid-year: `total_used` preserved, exactly one non-deleted config for the pair, superseded config soft-deleted with `effective_to`, `last_accrued_period` stamped for monthly.
12. **Comp-off refund suppression (E1)** — cancel a comp-off-sourced leave *after* its comp-off has expired; assert the balance is **not** refunded and the comp-off is `expired`. (This fails today.)
13. **Missed-run recovery (E5)** — start the server after the boundary with an un-rolled prior year; assert the catch-up runs once.
```