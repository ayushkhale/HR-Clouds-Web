# Phase 6 — Advanced Features & Hardening: Production Implementation Plan (Rev. 2)

**Author:** Senior Backend Engineer review
**Status:** Ready for execution
**Prerequisite:** Phases 1–5 merged and verified (migrations `00030`–`00035` applied).
**Next migration number:** `00036`
**Rev. 2 changes:** Cross-checked against `review/for_cc_audit_phase6_bugs.md`. Verdicts recorded in §1. Concrete fixes folded into the task sections. One critical pre-existing defect (**M1 — sandwich flag read from the wrong model**) discovered during the cross-check and added.

---

## 0. Executive Summary — What Phase 6 *Actually* Is

The phased doc (`development_phases.md` §6) lists seven items; a source audit shows the bulk are **already implemented** in Phases 3–5, so the real Phase 6 work is **finishing, correcting, and hardening** them, plus adding two never-built validations — **and fixing one defect that silently disables the sandwich rule entirely.**

| # | Item | Real current state | Phase 6 action |
|---|------|--------------------|----------------|
| 6.1 | Sandwich Rule | Calculator logic exists **but is never triggered** — the flag is read off the wrong model (**M1**) | **Fix the flag source + harden (T7)** |
| 6.2 | Calendar Exceptions | Mechanics exist; **targeting (`target_*`) ignored** | **Fix targeting (T1)** |
| 6.3 | Night-shift / rotation | 2nd-date record for *direct* overnight only; **misses rotations; cancel orphans the +1 day; resolved once at start_date; half-day mis-stamped** | **Fix (T2, T3)** |
| 6.4 | Gender + demographic eligibility | Gender migrated (`00029`); **eligibility config + validation missing** | **Build (T4)** |
| 6.5 | Document enforcement | **Never built** | **Build + anti-smurfing (T5)** |
| 6.6 | Negative balance | **Done** | Verify + test |
| 6.7 | Notice-period cap | **Never built** | **Build, windowed (T6)** |

**Net engineering:** one migration (`00036`), targeted edits to the calculator, application/approval/assignment/admin services, three validators, three models. **No new routes/controllers.** All changes additive and backward-compatible (new columns nullable; null = "no restriction" = current behavior).

**Standing constraints:** unified routes; every query `org_id`-scoped; money-path writes inside a transaction with `SELECT … FOR UPDATE` on `leave_balances`; cross-module reads mirror the attendance module's own resolvers so both modules agree on "working day / active shift."

---

## 1. Audit Cross-Check — Verdicts (do not blindly accept)

Legend: **CONFIRMED** (real, fix folded in) · **PARTIAL** (real kernel, audit's framing or fix corrected) · **FALSE POSITIVE** (premise contradicted by code) · **CLARIFICATION** (product decision, not a bug).

| # | Audit claim | Verdict | Evidence / correction |
|---|-------------|---------|-----------------------|
| 1 | Sandwich TOCTOU via parallel pending requests | **PARTIAL** | Same-type adjacent submits share one `leave_balances` row → `FOR UPDATE` serializes them, and the existing submit-time exploit guard (`leave_application.service.js`, proximity check over `pending`+`approved`) blocks unification-evadable splits. Residual risk is **cross-type** adjacency (different balance rows, no shared lock). **Also moot in practice today because of M1 — the rule never fires.** Fix = M1 + approval-time re-validation + a leave_type-scoping decision (T7). |
| 2 | Rotation shift resolved once at `start_date`, wrong for multi-day leaves crossing a rotation change | **CONFIRMED** | Rotations are date-driven (`_resolveRotationShift(pattern, date)`). Resolve **per calendar day inside the loop** (T2). |
| 3 | Overnight half-day suppresses the spillover record → the actually-absent calendar day is unmarked | **CONFIRMED (edge)** | A `second_half` overnight leave's absence falls on the spillover date; suppressing it lets `auto_mark_absent` mark that day absent. Stamp the record on the correct calendar day by `half_day_type` (T2). Needs a product ruling on first/second-half→date mapping. |
| 4 | Managers/HR can never take marital-gated leave; add `marital_status` to their profiles | **FALSE POSITIVE** | `manager_profiles` and `hr_profiles` **already have `marital_status` and `gender`** (verified). My Rev. 1 plan's stated limitation was wrong. **No migration needed;** enforce for all roles via `_getRoleProfile` (T4). |
| 5 | Notice cap sums all-time usage, not the notice window | **CONFIRMED** | Rev. 1's unbounded `sum(paid_days)` would count leave taken months before resignation. **But** the audit's fix cites `notice_period_start_date`, which **does not exist** anywhere. Corrected fix: add `notice_period_started_on` (T-schema) *or* bound by `start_date >= today`; count `total_days` not `paid_days` (M3). |
| 6 | Document threshold bypass by splitting (2+2 vs 3) | **CONFIRMED** | Contiguous same-type splits are **not** caught by the sandwich guard (it only fires when the gap is non-working days). Aggregate contiguous same-type pending/approved span for the threshold (T5). |
| 7 | Exceptions need specificity weighting (User>Location>Dept>Org) | **PARTIAL** | Targeting itself is correct and **matches the attendance repo's predicate** (`findException`: user-list wins, else empty-user + dept/loc match). A full specificity-weighting model **exists nowhere in the codebase** and adopting it only in leave would break attendance parity. Real issue is only the **contradictory-overlap** case (a working + non_working exception both targeting one user/day). Fix = bounded tiebreaker + optional admin-side conflict validation; do **not** adopt the full model (T1). |
| 8 | Cross-year sandwich must split the charge across years | **PARTIAL / mischaracterized** | Single requests **cannot** cross years (submit blocks it), and the calculator only charges dates **within a request's own range**, so no cross-year charge is ever fabricated — there is nothing to "split." The genuine issue: the sandwich guard could **block** two legitimately-separate cross-year leaves that can't be unified. Fix = sandwich adjacency must **not bridge the year boundary** (T7). |
| 9 | Notice cap only enforced at submit; pre-approved future leave survives resignation | **CONFIRMED (limitation)** | Real. Document it; add an optional `job_status → notice_period` review hook (T6, §9). |
| 10 | Threshold on working days vs calendar days | **CLARIFICATION** | Legitimate product question. Default to `total_days` (deductible working days); flag for product (T5). |
| 11 | Nested-department targeting fails | **FALSE POSITIVE** | `organization_departments` has **no `parent_id`** — departments are flat. Not applicable. Note for the future: if nesting is ever added, attendance **and** leave must change together (T1 note). |

**Self-identified (not in the audit):**
- **M1 — CRITICAL, pre-existing:** `sandwich_rule_applies` is a **`leave_types`** column, but `submitLeaveRequest` passes `leaveConfig.sandwich_rule_applies` and `approveRequest` passes `leaveConfig ? leaveConfig.sandwich_rule_applies : false` — `employee_leave_configs` has **no such field**, so the value is always `undefined`/`false`. **The sandwich rule and its exploit guard never execute.** 6.1 is effectively dead code today. (T7)
- **M2:** `admin`/`super-admin`/owner applicants may have **no** employee/manager/hr profile → `_getRoleProfile` returns `null`. Demographic (T4), probation, and notice (T6) checks must degrade gracefully instead of throwing. (T4)
- **M3:** the notice cap should count **`total_days`** (time off), not `paid_days`. (T6)
- **M4:** T5's adjacency aggregate and T6's cap sum are read-then-decide checks; they must run **after** the `FOR UPDATE` balance-row lock is held (same serialization as Edge Case 24) or two concurrent submits can each pass. (T5/T6)

---

## 2. Database / Schema Changes

### Migration `00036-phase6-leave-eligibility-and-restrictions.js`

Single transactional migration; all `ADD COLUMN … NULL` → zero-downtime, no backfill (null = current behavior). **`marital_status` is NOT added — it already exists on all three profiles (audit #4 false positive).**

| Table | Column | Type | Null | Default | Purpose |
|-------|--------|------|------|---------|---------|
| `leave_types` | `allowed_genders` | `ARRAY(STRING)` | yes | `null` | Demographic gate. null/`[]` = all. Values ⊆ profile gender enum. |
| `leave_types` | `allowed_marital_statuses` | `ARRAY(STRING)` | yes | `null` | Demographic gate. null/`[]` = all. Matched case-insensitively vs profile `marital_status`. |
| `leave_policy_entitlements` | `notice_period_max_days` | `INTEGER` | yes | `null` | Per-type notice cap. null = unrestricted, `0` = blocked, `n` = ≤ n days during notice. |
| `employee_leave_configs` | `notice_period_max_days` | `INTEGER` | yes | `null` | Individualized copy (mirrors how `probation_restriction_days`/`max_negative_balance` flow template→config). |
| `employee_profiles`, `manager_profiles`, `hr_profiles` | `notice_period_started_on` | `DATEONLY` | yes | `null` | **Fixes audit #5.** Anchors the notice-period window so the cap sums only leaves taken during notice. Also enables the §9 resignation-review hook. |

**Rules:** one `sequelize.transaction()` (matches `00029`/`00035`); Postgres native arrays via `DataTypes.ARRAY(DataTypes.STRING)` (same convention as `attendance_calendar_exceptions.target_*`), **no ENUM types created** (avoids ENUM-migration pain, keeps marital comparison free-form). `down()` drops the six columns; no ENUM drop needed.

**Model updates (same PR):** `leave_type.model.js` (+2 arrays), `leave_policy_entitlement.model.js` (+`notice_period_max_days`), `employee_leave_config.model.js` (+`notice_period_max_days`), and the three profile models (+`notice_period_started_on`).

**Why `notice_period_started_on` rather than bound-by-today:** bounding the cap sum by `start_date >= today` is implementable with no schema change, but it is imprecise (a leave that started yesterday while already in notice would be excluded) and cannot power a resignation-review hook. The DATEONLY anchor is one nullable column per profile, set by HR when they flip `job_status → notice_period`. If the field is null at enforcement time, **fall back to `start_date >= today`** so the feature degrades safely on un-backfilled data.

---

## 3. Task-by-Task Implementation

> Order: T1, T3, T5 are migration-independent. T2 needs the shift-resolver extraction. T4/T6 need `00036`. T7 fixes M1 + hardening. T8 is the regression/load pass.

---

### T1 — Calendar-Exception Targeting + Overlap Resolution (Edge Case 22; audit #7, #11)

**Confirmed problem:** `leave_calculator.utils.js` fetches all org exceptions in the window and applies them to everyone, ignoring `target_departments/locations/users`. Over- or under-charges balances for out-of-scope users.

**Fix (targeting) — matches the attendance repo predicate exactly:**
- Extract the holiday targeting predicate (calculator lines 94–111) into `_isTargeted(entity, { userId, departmentId, locationId })` and use it for **both** holidays and exceptions:
  - `target_users` non-empty → applies **iff** user ∈ it.
  - else `target_departments` non-empty → `departmentId` present **and** ∈ it.
  - and `target_locations` non-empty → `locationId` present **and** ∈ it.
  - all empty → org-wide.
  This is the same logic as `attendance_calendar_exceptions.repository.findException` — leave and attendance stay consistent by construction. (Implement in memory, not via raw `literal()` string-interpolation, to avoid the injection-shaped pattern the attendance repo uses.)

**Fix (audit #7 — contradictory overlap, bounded):** only when a **targeted** `working_day` and a **targeted** `non_working_day` exception exist for the *same user + same date*, break the tie by **narrower scope wins**: user-targeted > location/department-targeted > org-wide (all-empty). Equal specificity → deterministic default = **non_working_day wins** (protects a real closure over a generic working override; the opposite of Rev. 1's "working wins"). Document this precedence in a header comment. **Do not** implement a general specificity engine (diverges from attendance).
- *Optional admin-side guard (recommended):* reject creation of a new exception that contradicts an existing one for an overlapping target/date, so contradictory data never enters the table. Belongs to the attendance admin surface; note it, don't block Phase 6 on it.

**Audit #11 (nested departments):** N/A — departments are flat (`organization_departments` has no `parent_id`). Add a code comment: "flat departments; if hierarchy is introduced, update attendance `findException` and this predicate together."

**Precedence (documented, unchanged otherwise):** targeted forced-working > targeted non-working (with the specificity tiebreaker above) > holiday > weekly-off.

**DoD:** two users in different departments get different `total_days` for a dept-scoped exception; a location-scoped closure beats an org-wide working override; holidays and exceptions share one predicate; unit tests green.

---

### T2 — Rotation-Aware, Per-Day, Half-Day-Correct Overnight Handling (Edge Case 23; audit #2, #3)

**Confirmed problems:** (a) approval detects overnight via `include: shift`, which is null for rotation assignments; (b) it resolves once at `start_date` and applies one boolean to the whole leave; (c) it suppresses the spillover for half-days, mis-marking `second_half` overnight leave.

**Fix (shared resolver):** extract `_resolveShiftForUser` + `_resolveRotationShift` from `clock.service.js` into `src/modules/attendance/utils/shift_resolver.utils.js` exposing `resolveShiftForUser(orgId, userId, dateStr, transaction)` (returns a `ShiftTemplates`-shaped object with `is_overnight`, or `null`). `clock.service` delegates to it (single source of truth; no leave→clock.service dependency; add a characterization test before moving — see risk register). Minimum-acceptable fallback if extraction is rejected this phase: call `shiftAssignmentRepository.findActiveAssignmentWithIncludes` + apply the rotation branch inline — but the util is the DoD target.

**Fix (per-day resolution):** in `approveRequest`, build `datesToMark` by iterating the leave's working days and, **for each date**, calling `resolveShiftForUser(orgId, userId, date, transaction)`. If that day's shift `is_overnight` and the leave is **not** half-day, also mark `date + 1`. This handles a rotation flip mid-leave (some days spill, others don't). Keep `datesToMark` a `Set` to dedup the collision where day D+1's own record meets day D's spillover.

**Fix (overnight half-day, audit #3):** for a **half-day overnight** leave, do not blanket-suppress. Resolve the shift for `start_date`; if overnight, stamp the single `on_leave` (half-day) record on the calendar day the requested half actually falls on:
- `first_half` → the shift's **start** calendar date;
- `second_half` → the **spillover** (start + 1) calendar date.
Deduction stays `0.5`; exactly one attendance record is written (no double-charge). **Product confirmation required** on the first/second-half→date mapping for overnight shifts; encode the mapping in one commented helper so it's a one-line change if product rules differently. If unconfirmed at build time, ship first_half→start / second_half→spillover as the documented default.

**Edge cases:** multi-day overnight leave (Mon–Wed) — per-day spillover naturally creates Tue/Wed/Thu; `Set` dedups. No shift assignment → `null` → single-date. Half-day non-overnight → unchanged (single record on the nominal date).

**DoD:** rotation overnight → both dates; direct overnight → both dates (regression); rotation flip mid-leave → only overnight days spill; `second_half` overnight → the record lands on the spillover date; day-shift/unassigned → one record; deduction always matches the calculator.

---

### T3 — Overnight Cleanup on Cancel / Revert (Edge Case 23, integrity; supports T2)

**Confirmed problem:** `attendance_records.repository.revertLeaveRecords` scopes destroy/update to `date BETWEEN [startDate, endDate]`; the spillover record at `end_date + 1` is outside the window → orphaned `on_leave` after cancel/terminate.

**Fix (leave_id is authoritative):**
- Extend the signature to `revertLeaveRecords({ …, endDate, spilloverEndDate })`. Run **two** scoped operations:
  1. `leave_id = leaveId` branch over `[startDate, spilloverEndDate || endDate]` — safe to widen because the `leave_id` predicate already scopes to this leave's own rows; it cannot touch a neighbor's day.
  2. legacy `leave_id IS NULL` branch stays on `[startDate, endDate]` only (a null-leave_id row at end_date+1 can't be safely attributed to this leave).
- Callers compute `spilloverEndDate = moment(request.end_date).add(1,'day')` and pass it: `leave_attendance_bridge.utils.unwindApprovedLeave` (cancellation-approval + deactivation) and the inline future-cancel path in `leave_application.service.cancelLeaveRequest`.

**Edge cases:** non-overnight cancel → extra day matches nothing (harmless). Two adjacent leaves where B owns end_date+1 → B's record has `leave_id = B`, never touched by A's revert. Idempotent (re-run finds nothing).

**DoD:** cancelling an overnight leave removes both records; an adjacent unrelated leave is untouched; non-overnight behavior unchanged.

---

### T4 — Demographic Eligibility (Edge Case 10; audit #4 corrected)

**Depends on:** `00036` (`allowed_genders`, `allowed_marital_statuses`) + `leave_type` model update.

**Admin side (`leave_admin.service.js` + `leave_admin.validator.js`):** accept the two arrays on create/update leave type. Validate `allowed_genders ⊆ {male,female,other,prefer_not_to_say}`; `allowed_marital_statuses` free-string array (store as given, compare lowercased). No control-flow change otherwise.

**Application side (`submitLeaveRequest`, after `leaveType` + role profile are resolved):**
- If `allowed_genders?.length`: read applicant `gender` via `_getRoleProfile` (**present on employee/manager/hr** per `00029`). Gender `null` → reject `DEMOGRAPHIC_PROFILE_INCOMPLETE` ("gender not on file; contact HR") — never silent-allow (defeats maternity/paternity gating). Not in list → reject `DEMOGRAPHIC_INELIGIBLE`.
- If `allowed_marital_statuses?.length`: read `marital_status` (**also present on all three profiles** — audit #4 is a false positive, so this works for managers/HR too). Missing value → `DEMOGRAPHIC_PROFILE_INCOMPLETE`; not in list → `DEMOGRAPHIC_INELIGIBLE`.
- **M2:** if `_getRoleProfile` returns `null` (admin/owner without a role profile) and a demographic gate exists → reject with `DEMOGRAPHIC_PROFILE_INCOMPLETE` (consistent, no crash). Ungated types are unaffected for such users.

**Security:** eligibility is enforced only in the service (single source), never trusts client-sent demographics; messages reference only the requester's own profile (no cross-tenant leak).

**DoD:** female-gated type appliable by `female`, rejected for `male`/unset, and enforceable for a manager/HR applicant; marital-gated type works across roles; ungated types unaffected; admin can set/clear arrays.

---

### T5 — Document Threshold + Anti-Smurfing (requires_document_threshold; audit #6, #10)

**Confirmed problem:** `requires_document_threshold` is never checked; and even once checked on a single request, splitting evades it.

**Fix (base enforcement, in `submitLeaveRequest` after `calcResult`):** if `leaveType.requires_document_threshold > 0` and `effectiveSpan > threshold` and `!document_url` → `BadRequestError('DOCUMENT_REQUIRED')`.

**Fix (anti-smurfing, audit #6):** `effectiveSpan` = requested `total_days` **plus** the summed `total_days` of the applicant's **contiguous** same-type `pending`/`approved` leaves (walk backward from `start_date - 1` and forward from `end_date + 1` while the neighbor's range is date-adjacent; contiguity is by calendar adjacency, not the sandwich's non-working-gap rule, so directly-adjacent working-day splits are caught). This read runs **under the held balance lock (M4)** so two concurrent splits can't both slip under the threshold.

**Fix (audit #10, product decision):** default `total_days` (deductible working days). If product wants calendar-span semantics, add a `document_threshold_basis` enum (`working_days`|`calendar_days`) on `leave_types` in a follow-up — **out of scope now**; record the default and the open question.

**Edge cases:** half-day (0.5) never crosses a ≥1 threshold; threshold `0` = never required; comp-off single-day → effectively never triggered.

**DoD:** 4-day request vs threshold 3 without doc → rejected; with doc → passes; **2-day + adjacent 2-day pending of the same type vs threshold 3 → the second is rejected without a doc**; concurrent split attempts don't both pass.

---

### T6 — Notice-Period Cap, Windowed (Edge Case 11; audit #5, #9; M3, M4)

**Depends on:** `00036` (`notice_period_max_days` on entitlement+config, `notice_period_started_on` on profiles) + assignment-service copy.

**Assignment side (`leave_assignment.service.js`):** copy `notice_period_max_days` entitlement→config in `assignPolicyToUser` and add it to the `overrideEmployeeConfig` allow-list (mirror `probation_restriction_days`).

**Application side (`submitLeaveRequest`, alongside probation, sharing one role-profile fetch — perf):**
- If `job_status === 'notice_period'` and `leaveConfig.notice_period_max_days !== null` (use `!== null`, never truthiness — `0` ≠ `null`):
  - `0` → reject `NOTICE_PERIOD_RESTRICTED` ("not permitted during notice period").
  - `n` → **windowed** committed sum (fixes audit #5): `sum(total_days)` (M3, not `paid_days`) of this user + this leave_type where `status IN ('pending','approved')` **and** `start_date >= windowStart`, where `windowStart = profile.notice_period_started_on ?? today` (safe fallback per §2). If `committed + requested.total_days > n` → reject with remaining allowance.
- This sum runs **under the held `FOR UPDATE` balance lock (M4)** — same balance row serializes the user's concurrent same-type submits, closing the double-spend of the cap (same mechanism as Edge Case 24).

**Precedence (documented):** retired-type → half-day rules → demographic (T4) → probation → **notice-period** → document (T5) → balance/LWP.

**Audit #9 (temporal loophole) — documented limitation + optional hook:** a leave approved **before** resignation is not retroactively capped. Document it. **Optional (recommended) hook:** when `job_status` transitions to `notice_period` (and `notice_period_started_on` is set), enqueue an HR review of future `approved` leaves of capped types beyond the allowance — surface, don't auto-cancel (avoids clawing back sanctioned leave). Scope this hook as a fast-follow, not a Phase 6 blocker.

**DoD:** `notice_period` employee with cap 2 books ≤ 2 days and is rejected on the 3rd **counting only leaves from the notice window**; a pre-notice leave from months ago does not consume the cap; `null` = unrestricted; `0` = blocked; field flows template→config→override; concurrent submits can't exceed the cap.

---

### T7 — Sandwich Rule: Fix the Dead Flag (M1) + TOCTOU/Cross-Year Hardening (6.1; audit #1, #8)

**M1 — CRITICAL fix (makes 6.1 actually work):** `sandwich_rule_applies` is a **`leave_types`** field. Change both call sites to read it from the leave type, not the (field-less) config:
- `leave_application.service.submitLeaveRequest`: pass `sandwich_rule_applies: leaveType.sandwich_rule_applies` to the calculator **and** gate the exploit-prevention block on `leaveType.sandwich_rule_applies`.
- `leave_approval.service.approveRequest`: fetch the `LeaveType` (it currently only has `leaveConfig`) and pass `leaveType.sandwich_rule_applies` to its `calculateLeaveDays` call.
Without this, every other sandwich behavior below is inert.

**Audit #1 (TOCTOU) — layered defense:**
1. Primary (existing): the submit-time proximity guard blocks a same-type adjacent split separated only by non-working days; the shared `leave_balances` `FOR UPDATE` lock serializes concurrent **same-type** submits.
2. **Cross-type residual:** the guard's proximity query is not leave_type-scoped, so it *detects* cross-type adjacency, but concurrent cross-type submits touch different balance rows and don't share a lock. **Decision to encode:** the sandwich rule is defined **per leave type** (Edge Case 4 / `leave_types.sandwich_rule_applies`), so restrict the guard's adjacency/proximity to the **same `leave_type_id`**; cross-type adjacency is explicitly out of the sandwich model (document it). This removes the false-positive cross-type blocks and makes the lock coverage complete.
3. **Defense-in-depth:** at approval, **re-run `calculateLeaveDays` and compare** the freshly computed `paid_days`/`total_days` against the stored request values; if they diverge (e.g., an adjacent leave became `approved` between submit and approve), recompute the deduction from the fresh number (under the balance lock) rather than trusting the submit-time snapshot. This closes the "static snapshot" concern the audit raised without re-architecting.

**Audit #8 (cross-year) — corrected fix:** single requests already can't cross years, and the calculator only charges dates within a request's own range, so **no cross-year charge is fabricated**. The real defect is the guard blocking two legitimately-separate cross-year leaves that can't be unified. Fix: in both the calculator's adjacency lookup and the submit guard, **treat a year boundary as breaking contiguity** — do not pull an adjacent leave from a different calendar year into the sandwich span, and do not raise the exploit error across a year boundary. Each year's request is charged to its own year (already the case). Document that sandwich bridging is intra-year by design.

**6.6 verification (no code expected):** confirm `max_negative_balance` is enforced identically at submit and approve, and that monthly accrual's `credit = max(0, target - alreadyMonthly)` lifts negatives without double-crediting; covered by T8 tests.

**DoD:** Fri+Mon single request with the type's `sandwich_rule_applies=true` → 4 days (proves M1 fixed); OFF → 2 days; adjacent same-type split separated by a weekend → blocked (guard fires); cross-type adjacency → not blocked; approval recomputes and reconciles a snapshot that drifted; cross-year adjacent leaves submit successfully and each charges its own year.

---

## 4. Execution Order & Dependencies

```
Migration 00036 ─┬─> model updates (leave_type, entitlement, config, 3 profiles)
                 │
T7-M1 (sandwich flag fix) ── independent, do FIRST (unblocks all sandwich behavior)
T1 (exception targeting + overlap) ── independent
T3 (revert spillover) ── independent; pairs with T2
T2 (rotation/per-day/half-day overnight) ── needs shift_resolver util
T5 (doc threshold + anti-smurf) ── independent
T4 (demographic) ── needs 00036 + leave_type model
T6 (notice cap, windowed) ── needs 00036 + assignment copy
T7-rest (TOCTOU/cross-year hardening) ── after M1
T8 (regression + load) ── last
```

**Recommended landing sequence:** **T7-M1** → T5 → T1 → T3 → T2 → (`00036`) → T4 → T6 → T7-rest → T8. Ship T2 and T3 together (never T3 alone) so a widened revert never precedes spillover creation — both are individually safe, but this keeps semantics paired.

**Hidden dependency:** T2's shift-resolver extraction touches `clock.service.js` (attendance). Add a characterization test first; the attendance behavior must be identical post-extraction.

---

## 5. Transactions, Concurrency, Idempotency, Data Integrity

- All new validations (T4/T5/T6) and the T7 approval re-check are **read-then-decide** steps placed **after** the `FOR UPDATE` lock on `leave_balances` and **before** the balance mutation, inside the existing transaction (M4). This reuses the Edge Case 24 serialization: same user + same type = same locked row, so concurrent submits/approvals of that type can't both pass a cap/threshold/snapshot check.
- **Cross-type note (T7):** the sandwich guard is scoped to one leave type, so its lock coverage is now complete for the cases it governs.
- **T2/T3 attendance writes** occur in the approve/cancel transaction and pass that `transaction` into `resolveShiftForUser` and `revertLeaveRecords`, so overnight-record creation and cleanup are consistent under concurrency with the `auto_mark_absent` cron (the Edge Case 21 UPSERT path already handles the insert race).
- **T3 idempotency:** revert by `leave_id` is naturally idempotent; the widened window preserves it.
- **T1** has no writes — the integrity risk was wrong numbers, now corrected.

---

## 6. Error Handling & Edge Cases (consolidated)

| Scenario | Behavior |
|---|---|
| Gender/marital rule set, value null (any role) | Reject `DEMOGRAPHIC_PROFILE_INCOMPLETE` (never silent-allow) |
| Applicant has no role profile (admin/owner) + gated type | Reject `DEMOGRAPHIC_PROFILE_INCOMPLETE` (M2) |
| Exception with null target arrays | Org-wide (back-compat via `|| []`) |
| Contradictory working+non_working exception, same user/day | Narrower scope wins; equal → non_working wins (T1) |
| Rotation flips mid-leave | Per-day resolution: only overnight days spill (T2) |
| `second_half` overnight leave | Single record stamped on the spillover date (T2) |
| Overnight leave adjacent to another leave, cancel one | `leave_id`-scoped cleanup; neighbor intact (T3) |
| Doc threshold split across adjacent requests | Aggregated contiguous span enforces the threshold (T5) |
| Notice cap `null` vs `0` | `null`=unrestricted, `0`=blocked (`!== null` checks) |
| Notice cap vs old leave from before resignation | Excluded by the notice window (T6) |
| Pre-resignation approved future leave | Not retroactively capped; documented + optional hook (T6/§9) |
| Cross-year adjacent leaves | Submit succeeds; sandwich does not bridge the boundary; each year charged separately (T7) |

**Error contract:** stable machine codes — `DEMOGRAPHIC_INELIGIBLE`, `DEMOGRAPHIC_PROFILE_INCOMPLETE`, `DOCUMENT_REQUIRED`, `NOTICE_PERIOD_RESTRICTED`, plus existing `BadRequest/Conflict/NotFound`. No cross-tenant/user data in messages.

---

## 7. Security & Authorization

- No new endpoints → no new route-authz surface; existing `authenticate` + `authorize([...])` + `requireFeature('leave.access')` stands.
- New leave-type config (demographic/notice) is set only by `hr,admin,super-admin`; self-service roles can't set it.
- Every new read/write is `org_id`-scoped — verify each (exceptions, profile lookups, entitlement copy, adjacency/cap sums).
- Demographics enforced server-side only; never trust client-sent `gender`/`marital_status`.
- T1 uses **in-memory** targeting (not `literal()` string interpolation) — avoids the injection-shaped pattern present in the attendance repo.
- `00036` adds no new PII (gender already exists; `notice_period_started_on` is an HR-set date; marital arrays are config strings).

---

## 8. Performance & Scalability

- **T1:** in-memory filter over an already-fetched, date-windowed set — no extra query.
- **T2:** per-day shift resolution adds ≤ N lookups for an N-day leave; use the single-query `findActiveAssignmentWithIncludes` per day (or cache the active assignment for the leave window and compute rotation offsets in memory to collapse to one query — recommended for long leaves).
- **T4/T5/T6/T7-recheck:** reuse the profile/leave-type/pending data already loaded in `submitLeaveRequest`; **consolidate the currently-duplicated role-profile fetch** (probation fetches its own) into one lookup shared by probation, notice, and demographic checks — a net query reduction. The T5 adjacency walk and T6 window sum are bounded, indexed by `(org_id, user_id, leave_type_id, status)` — add that composite index if EXPLAIN shows a scan.
- Cron paths untouched.

---

## 9. Logging, Monitoring & Audit

- Log each business rejection at `warn` with `{ org_id, user_id, leave_type_id, rule, requested_days }` (no full profiles). Prefix `[LeaveApply]` for greppability.
- **Audit trail:** every transition already stamps `actioned_at`/`approved_by`/`rejection_reason`; T8 verifies completeness (the dev-doc DoD). Both overnight records carry `leave_id`.
- **Post-deploy metrics:** counts of `DOCUMENT_REQUIRED`/`NOTICE_PERIOD_RESTRICTED`/`DEMOGRAPHIC_*` (spikes = misconfig); orphan detector = `on_leave` records with no live `leave_request` (should trend to 0 after T3); sandwich-charge distribution before/after T7-M1 (a jump confirms the rule went live — communicate to HR before deploy).
- **§9 resignation hook (optional):** on `job_status → notice_period`, log/enqueue future capped leaves exceeding allowance for HR review.

---

## 10. Testing Strategy

**Reality:** no JS test harness exists (`package.json` test = stub; `tests/` = Postman/OpenAPI). Phase 6:
1. **Add a minimal `jest` harness** scoped to pure logic — `leave_calculator.utils.js` (targeting, overlap tiebreaker, sandwich after M1, half-day, cross-year non-bridging) and any extracted predicate (`_isTargeted`, notice-window sum, doc-adjacency). Highest-ROI net-new tests on the money path. If disallowed this phase, gate on the Postman regression and say so in the PR.
2. **Extend the Postman collection** with a Phase 6 folder.

**Critical cases (→ DoD):**

| Area | Case | Expected |
|---|---|---|
| T7-M1 | Type `sandwich_rule_applies=true`, Fri+Mon single request | **4 days** (proves the flag now fires) |
| T7 | Same, flag OFF | 2 days |
| T7 | Adjacent same-type split over a weekend | Blocked by guard |
| T7 | Adjacent **cross-type** split | Not blocked (out of sandwich model) |
| T7 | Adjacent leave becomes approved between submit & approve | Approval recomputes & reconciles |
| T7 | Cross-year adjacent leaves (Dec 31 / Jan 3) | Both submit; each charges its own year; no bridge |
| T1 | Dept-scoped working-day exception, two depts | Only in-scope user charged |
| T1 | Location non_working vs org working, same day | Location closure wins |
| T2 | Rotation overnight, approve | Two records (D, D+1), deduct 1.0 |
| T2 | Rotation flips day→night mid-leave | Only night days spill |
| T2 | `second_half` overnight | Record on the spillover date |
| T2 | Direct overnight / day-shift / unassigned | Two / one / one record(s) |
| T3 | Cancel overnight leave | Both records removed |
| T3 | Cancel one of two adjacent leaves | Neighbor intact |
| T4 | Female-gated, male / unset / manager applicant | Reject / reject / enforced (audit #4) |
| T5 | 4d vs threshold 3, no doc → with doc | Reject → pass |
| T5 | 2d + adjacent 2d pending, threshold 3, no doc | Second rejected |
| T6 | Notice cap 2: book 2 then 1 | 3rd rejected |
| T6 | Notice cap 5, 15d taken 8 months ago | **Not** counted (window) |
| T6 | Notice cap null / 0 | Unrestricted / blocked |
| E14 | **Load:** concurrent double-submit on balance 1 | Exactly one succeeds |
| E21 | auto-mark-absent then approve | UPSERT, no crash |
| E25 | Regularize an `on_leave` day | Balance refunded |

**Load test (E14):** small concurrency script (k6/autocannon/Node parallel) on a staging user with balance 1; assert final `current_balance ≥ 0` and exactly one approved. Highest production-risk test. Add a parallel cross-type sandwich probe to confirm the T7 decision.

---

## 11. Migration & Deployment

- **Backward-compatible:** all `00036` columns nullable; null = current behavior. Deploy migration first, code second; old code ignores new columns.
- **Rollback:** `00036.down()` drops the six columns; code is independently roll-back-safe; no backfill, so rollback loses only Phase 6 *config*, never balances.
- **Release order:** (1) apply `00036`; (2) deploy models+services; (3) staging regression + load; (4) promote.
- **⚠️ Behavior-change comms:** **T7-M1 turns the sandwich rule ON for the first time.** Any leave type with `sandwich_rule_applies=true` will start charging bridged non-working days. **Audit each type's flag with HR before deploy** and announce, or employees see sudden higher deductions. Consider defaulting existing types' flag to `false` and letting HR opt in.
- **Feature-flag option:** gate T4/T5/T6 enforcement behind an org setting to dark-launch (recommended for the notice cap, which can hard-block leave).
- **Zero cron impact.**

---

## 12. Definition of Done — Phase 6

- [ ] `00036` written, reversible, applied on a populated staging DB; six model updates match; **no marital_status column added** (already present).
- [ ] **T7-M1:** sandwich flag read from `leave_types` in submit **and** approve; a `sandwich_rule_applies=true` type charges bridged days; HR sign-off on per-type flags obtained.
- [ ] **T1:** exceptions honor user/dept/location targeting (matches attendance predicate); contradictory-overlap tiebreaker defined; flat-department note added.
- [ ] **T2:** overnight is rotation-aware and **per-day**; `second_half` overnight lands on the spillover date; attendance behavior unchanged after resolver extraction.
- [ ] **T3:** cancel/revert removes the spillover record; neighbors untouched; idempotent.
- [ ] **T4:** demographic eligibility configurable + enforced for all roles (incl. managers/HR); null=open; no-profile applicants handled.
- [ ] **T5:** threshold enforced on `total_days` **and** across contiguous same-type pending/approved; concurrent splits can't both pass.
- [ ] **T6:** notice cap flows template→config→enforcement; **windowed** by `notice_period_started_on` (fallback today); counts `total_days`; `0`≠`null`; race-safe under the lock; §9 limitation documented (+ optional hook noted).
- [ ] **T7-rest:** guard scoped per leave type; approval re-validates/reconciles the charge; cross-year contiguity does not bridge.
- [ ] All rejections carry stable codes + structured logs; no `org_id`-unscoped query introduced.
- [ ] **T8:** 28-edge-case regression + E14 load + cross-type sandwich probe + audit-timestamp completeness.
- [ ] PR notes list verified-only vs newly-built and any deferred items (calendar-vs-working-day doc basis; §9 hook; admin exception-conflict validation).

---

## 13. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| **T7-M1 silently increases deductions** the day it ships (rule was dead) | **High** | Audit each type's flag with HR; default new flag to false / opt-in; announce; watch sandwich-charge metric |
| Shift-resolver extraction changes attendance behavior | High | Characterization test before/after; smoke tests |
| T3 widened window deletes a neighbor's record | High | `leave_id`-scoped predicate; explicit adjacency test |
| Per-day shift resolution = N queries on long leaves | Med | Cache the active assignment for the window, compute rotation offsets in memory |
| Notice-cap / doc-smurf double-spend under concurrency | Med | Run the sum/adjacency reads under the held `FOR UPDATE` balance lock |
| Demographic hard-reject blocks users with unset gender | Med | Only gates when admin sets `allowed_*`; `DEMOGRAPHIC_PROFILE_INCOMPLETE` + HR backfill runbook; dark-launch flag |
| Exception overlap tiebreaker diverges from attendance | Med | Bounded tiebreaker only for contradictory case; recommend mirroring into attendance; don't adopt full specificity model |
| `notice_period_started_on` un-backfilled | Low | Safe fallback to `start_date >= today` |
| Cross-year sandwich contradiction | Low | Non-bridging rule + test |
| Overnight half-day date mapping is product-dependent | Low | One commented helper; documented default; product confirm |

---

## 14. Files Touched (reviewer checklist)

**New**
- `src/infrastructure/postgres-sql/migrations/00036-phase6-leave-eligibility-and-restrictions.js`
- `src/modules/attendance/utils/shift_resolver.utils.js` (extracted shared resolver)
- (recommended) `jest.config.js` + `src/modules/leave/**/__tests__/*.test.js`

**Modified**
- `src/modules/leave/utils/leave_calculator.utils.js` — T1 targeting + overlap tiebreaker; T7 cross-year non-bridging
- `src/modules/leave/services/leave_application.service.js` — **T7-M1** (read flag from `leaveType`); T3 cancel path; T4/T5/T6 checks; consolidated profile fetch
- `src/modules/leave/services/leave_approval.service.js` — **T7-M1** (fetch `LeaveType`, pass its flag); T2 per-day rotation/half-day overnight; T7 approval re-validation
- `src/modules/attendance/repositories/attendance_records.repository.js` — T3 spillover window
- `src/modules/leave/utils/leave_attendance_bridge.utils.js` — T3 pass `spilloverEndDate`
- `src/modules/leave/services/leave_assignment.service.js` — T6 copy `notice_period_max_days`
- `src/modules/leave/services/leave_admin.service.js` — T4 accept eligibility config
- `src/modules/attendance/services/clock.service.js` — T2 delegate to shared resolver
- `src/modules/leave/models/leave_type.model.js` — T4 columns
- `src/modules/leave/models/leave_policy_entitlement.model.js` — T6 column
- `src/modules/leave/models/employee_leave_config.model.js` — T6 column
- `src/modules/employee/models/employee_profiles.model.js`, `src/modules/manager/models/manager_profiles.model.js`, `src/modules/hr/models/hr_profiles.model.js` — T6 `notice_period_started_on`
- `src/modules/leave/validators/leave_admin.validator.js` — T4 fields
- `src/modules/leave/validators/leave_request.validator.js` — no schema change (enforcement is service-side; note only)
```
