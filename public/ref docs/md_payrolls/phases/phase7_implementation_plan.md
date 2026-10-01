# Payroll Module — Phase 7 Implementation Plan
### Automation, Corrections (Arrears · Off-Cycle · F&F) & Hardening

> **Status:** ✅ **COMPLETE** (2026-09-18). Build order Steps 0–12 all landed. Endpoints #195–#218 wired (HR #195–#215, Manager #216–#217, Self #218); `engine_version` at 6; `RECONCILABLE_ENGINE_VERSIONS = {5,6}`. Four automation crons + startup catch-up in place; org-settings registry entries #55–#57 registered (default OFF). Full unit suite **1019 passing / 0 failing** (payroll suite **923 passing**). Ops hand-back: migration **`00048`** is the user's to run — it has NOT been run from here (no remote DB access). See the Phase 1–7 completion report at the end of this file for the EC-1…EC-104 coverage table. **This banner records the final state; the source-of-truth design below is unchanged.**
> **Parent:** `public/md_payrolls/implementation_plan.md` §7 (cross-cutting), §8 (Phase 7), §9 (EC-2/6/22/27/31/32/33), §10 (settings), §11.
> **Predecessors:** `phase1_implementation_plan.md` … `phase6_implementation_plan.md`.
> **Review status:** a code-level review after the first draft found 16 defects (F-1 … F-16, three of them in this plan's own design). **All of them are now integrated into §1–§15 — implement the body as written.** §16 is retained as the review record and the rationale for each ruling; where the two could ever be read as disagreeing, **the body governs**. Paragraphs the review changed carry an inline `(F-n)` trace tag.
> **Conflict rule (unchanged since Phase 2):** where this document and the parent disagree, the parent wins *unless* this document records an explicit ruling in §11 with the technical reason. All such rulings are listed there; none are silent.

**Counters at Phase 7 start (verified against the tree, not the docs):**

| Counter | Value | Verified from |
|---|---|---|
| Next endpoint number | **#195** | `payroll_{hr,manager,self}.routes.js` end at #194 |
| Next decision ID | **D-51** | Phase 6 closed at D-50 |
| Next edge-case ID | **EC-73** | Phase 6 closed at EC-72 |
| Next migration | **`00048`** | last on disk is `00047-create-payroll-payslips-and-report-exports.js` |
| Next org-settings registry entry | **#55** | registry current through **#54** (Phase 6 closed its debt — verified in the file, not the plan) |
| Test baseline | **792 passing / 0 failing** | `npm test`, run at plan time |
| `engine_version` | **5 → 6** | Phase 7 is the first phase since Phase 5 to change engine arithmetic (§5.6) |
| API docs state | **current through #194** | `api_registry.md` has Phase-6 sections; `combined_api_analysis.md` documents #194 |

---

## 1. Goal & Boundary

### 1.1 What Phase 7 is

Phase 1–6 built a system that computes and delivers **one regular run per month, correctly, once**. Phase 7 makes that system survive the things that actually happen at month-end:

1. **Corrections** — a closed period's inputs changed after approval. Phase 7 detects the drift and settles it as **arrear adjustment lines in the next open run** (D-12), never by mutating the closed run.
2. **Off-cycle runs** — a second, *supplementary* run inside a month that already has a closed regular run, without double-charging a single statutory head.
3. **Full & Final settlement** — a first-class exit record that finally gives payroll a real `exit_date`, plus notice recovery, leave encashment and loan recovery, settled through the existing run engine.
4. **Comp-off encashment** — cash for an unused comp-off, debiting both the `attendance_comp_offs` row and the CO leave wallet so the day can never be spent twice (**EC-27**).
5. **Automation** — four crons (reminders, auto-draft, stale-run sweep, attachment sweep) with startup catch-up and manual HR triggers.
6. **The two deferred tax behaviours** — employer benefit contribution as a taxable perquisite, employee premium auto-credited to §80D (**D-38 / EC-32 / EC-33**).
7. **Hardening** — the §9 edge-case regression, the 1,000-employee performance measurement the parent §7 defers to this phase, a salary-exposure/IDOR security pass, and documentation close-out.

**The safety property of this phase:** *for any input set that Phase 6 could already process, the engine produces the same numbers.* Phase 7 changes engine arithmetic in exactly two places (§5.6 perquisite/§80D, §5.4 same-period statutory netting), and **both are inert unless the new inputs exist** — no benefit plan with a tax flag set, and no sibling run in the same `period_month`. There are zero such rows in any tenant today, so the `engine_version` bump from 5 to 6 must be provable as a no-op on existing fixtures (§9.5).

### 1.2 What Phase 7 is **not** — deferred or explicitly out of scope

| Deferred / excluded | Why |
|---|---|
| **Consolidating `calendar_resolver.utils` with the Leave module's day rules** | Phase 2 §11.3 *recommended* this for Phase 7, but it is a behavioural refactor of live, tested Leave code. Parent §8 does not assign it; `CLAUDE.md` forbids unrelated refactoring. It stays an accepted, documented duplication. **Ruling D-63.** |
| **"Re-issue structure" corrective action** | Phase 1 §11-5 said Phase 7 *may* add it "if a genuine correction need appears". None has. Retro pay is handled by arrears without rewriting a structure. |
| **Revised / un-finalized Form 16** | Phase 4 §7 called a post-finalization correction "a Phase-7 concern". Parent §8 does not list it, and an arrear settled in a later month already flows into that FY's Form 16 through the existing item scan. A *versioned revised Form 16* is a new product surface — out. |
| **TAN column on `organization_profiles`** | **D-47** product flag stands. It is an organization-module schema change with its own validation and settings surface. Phase 7 re-raises it in §13.4; it does not build it. |
| **Bank-specific NEFT layouts** (HDFC/ICICI/Axis fixed-width) | Phase 6 §1.2 called these "a Phase-7 configuration concern", but the parent never asked for a named bank. One canonical CSV layout ships. No requirement → no build. |
| **Retro revision *onto or before* the live structure version** (`RETRO_REVISION_NOT_SUPPORTED`) | Remains blocked. Editing the currently-effective version in place is a history rewrite, not an arrear. A retro *increment* (effective date after the live version's start, in an already-closed month) **is** supported — §5.3 case R2. |
| **Employee-initiated encashment requests** | Not in the parent's RBAC surface (§6) or §8. Comp-off encashment is HR-direct (Tier C) or manager-proposed (Tier B), matching the "ad-hoc earning" row of parent §6. |
| **Standalone (non-F&F) leave encashment** | Parent §8 scopes leave encashment to F&F only. The `encashment.service` is built with two source adapters so a future standalone flow is a route away, but no route ships. |
| **`.xlsx` export; scheduled report delivery; GL/journal posting** | Phase 6 §1.2 deferrals with no new requirement. |
| **Arbitrary-date-window runs** | Off-cycle runs stay keyed to a calendar `period_month`. **D-52** explains why widening this would break six invariants. |
| **`arrear` as a `run_type`** | Declared in the enum since Phase 2, but D-12 settles arrears as *lines in the next run*, not as a separate run. **D-54** keeps it reserved-and-unused. |
| **Money movement / payment gateway** | Parent §1.3. Unchanged. |

### 1.3 Scope reconstruction — parent §8 Phase 7 vs. what actually remains

The parent's Phase 7 list was written in August 2026, before Phases 2–6 existed. Several items are already satisfied, one is satisfied *by construction*, and several carry hidden prerequisites the list does not mention. **This table, not parent §8, drives the build.**

| # | Parent §8 Phase 7 line item | Actual state in the tree today | Phase 7 action |
|---|---|---|---|
| 1 | Cron: **payroll cut-off reminder** | No payroll reminder exists. `email.utils.js` + `TEMPLATE_MAP` + SES exist and Phase 6 proved the pattern (`payslip_email_dispatch.cron.js`). `payroll_settings.attendance_cutoff_day` / `pay_day` exist (registry #35) but nothing reads them. | **NEW** — folded with three other reminders into one daily cron (**D-57**). |
| 2 | Cron: **auto-draft creation** | `payrollRunService.create()` is fully idempotent (advisory lock + partial unique index + `findLiveByPeriod`). | **NEW cron, no new run logic** — the cron is a scheduled caller of an existing idempotent method. |
| 3 | Cron: **loan EMI schedule maintenance** | **ALREADY DONE.** `employee_loan.service.recomputeLoanState()` recomputes `outstanding_principal`/`recovered_amount` and closes/reopens the loan *inside* every mutating transaction, including run approval and cancellation (Phase 3 §7.4/§7.5). Nothing drifts between runs. | **NOT APPLICABLE.** Building a sweeper would be a second source of truth for loan state. Documented as N/A, not silently dropped. |
| 4 | Cron: **declaration-window open/close** | Phase 4 §5 ruled explicitly: the declared-vs-verified basis is *a pure function of the run's period and the frozen `proof_deadline`* — "**This needs no cron** … Phase 7's cron can add a *reminder*; it is not, and must not become, the correctness mechanism." | **REMINDER ONLY**, inside the §5.7 reminder cron. No window-state writes. |
| 5 | **Arrears & retro pay** (D-12): back-dated leave approval, retro increment, late-approved OT | Nothing exists. `payroll_adjustments.category` has `'arrear'` in the enum and `payroll_run_item_components.source` has `'arrear'`; **both are rejected/unused.** `payroll_period_guard` returns `422 PERIOD_CLOSED_FOR_ADJUSTMENT` with the message "retro settlement is a future arrears feature". All frozen inputs needed for a diff exist (`structure_snapshot`, `attendance_snapshot`, `statutory_snapshot`, component lines). | **NEW** — a recompute-and-diff reconciliation service emitting ordinary `payroll_adjustments`. **No new engine path** (**D-53**). |
| 6 | **Off-cycle runs** | `run_type` enum has `off_cycle`; the create validator accepts `'regular'` only. Three blockers the parent list does not mention: the unique index forbids a second run per (period, type); the YTD/ESI aggregate reads **strictly earlier months** (`period_month < X`), so a same-month sibling is invisible and PT/TDS/PF-ceiling would be charged twice; and there is no cohort restriction on the aggregator. | **NEW** — index change, cohort restriction, `earnings_mode`, and same-period statutory netting (**D-52 / D-55 / D-56**). |
| 7 | **Full & Final settlement** for exits | No `exit_date` column anywhere in the codebase (`users.status` enum has `inactive`, but no date). **D-15** made the exit boundary `payroll_run_items.period_end`, narrowed per item via **#47**, and said Phase 7 "should promote this to a first-class `exit_date`; `clipToEmployment` already takes it as a parameter so that change is a one-line source swap." Today an inactive employee produces `EXIT_DATE_REQUIRED` **every month, forever**. `employee_loan.service.foreclose({ settlementMode: 'recover_via_payroll', recoveryPeriodMonth })` already exists (#82). | **NEW `employee_exits` table** + the one-line source swap + a `prepare-settlement` orchestrator. **Loan recovery reuses `foreclose()` verbatim** — no new loan logic. |
| 8 | F&F: **leave encashment** | No encashment code anywhere (`grep -i encash` over `src/` returns nothing). `leave_balance.repository.getBalanceForUpdate()` exists with a row lock. `leave_types` has **no** `is_encashable` flag → which types are encashable must be an org setting (parent §10 agrees). | **NEW** — registry **#55**. |
| 9 | F&F: **notice-period adjustment** | No notice-period column exists anywhere in the codebase. | **NEW** — entered on the exit record, defaulted from settings (#55). |
| 10 | **Comp-off encashment** ("net-new; no path exists today") | Confirmed net-new. `attendance_comp_offs.status` is a free `STRING(20)` (no DB enum) → a new `'encashed'` value needs **no migration** and is inert to every attendance read (the expiry sweep filters `status='approved'`; redeemability filters `approved` + unexpired). Comp-off approval credits the **CO leave wallet**, so encashment must debit *both* sides or **EC-27** breaks. | **NEW** — registry **#57**; writes via the attendance/leave **repositories** per the D-2 cross-module idiom, so **zero live attendance/leave service code changes** (**D-58**). |
| 11 | **D-38 tax items** (EC-32 perquisite, EC-33 §80D) | `statutory_calculation.service.js:163` builds `taxableEarningsPaise` from `realEarningLines` (`component_type === 'earning'`) only, so an `employer_contribution` line cannot reach it. **But** the §80D half is *much* narrower than D-38 implies: `projectAnnualTax` already accepts `deductions.chapter_via.injected[section]` — the EC-44 channel used for EPF→80C. `benefit_plans` has no tax flags. | **NEW but narrow.** EC-32 = one new basis (`perquisitePaise`) that feeds *only* the income-tax base. EC-33 = one more `injected` key. **No change to `projectAnnualTax`.** Both mirrored into `employee_tax.service` (the second call site — §5.6). |
| 12 | Cron: **stale `calculating` run sweep** | *(Not in parent §8; Phase 2 §11-9 assigned it here.)* `calculate()` already has 30-minute stale-claim recovery on the *manual* path; no proactive sweep. | **NEW** — reuses `STALE_CALCULATION_MS`. |
| 13 | **Attachment sweep** | *(Not in parent §8; Phase 5 §11-6 and `phase5_api_analysis.md` assigned "Phase 7 retention cycles" here.)* `payroll_attachments.status` ENUM(`pending`,`available`,`deleted`); abandoned `pending` rows and soft-`deleted` S3 objects accumulate. | **NEW** — registry **#56** retention knob. |
| 14 | **Edge-case regression** (§9) | Phases 1–6 each tested their own ECs; **EC-6, EC-27, EC-31, EC-32, EC-33** have no test because they had no implementation, and **EC-2** has only its proration half. | **CLOSE the six**, then assert §9.6 coverage over the whole register. |
| 15 | **1,000-employee performance measurement** (parent §7) | Never measured. Phase 6 measured *approval* duration only. | **MEASURE**, publish numbers, fix only what the measurement condemns (**§10**). |
| 16 | **Security pass** — salary exposure & IDOR | Per-phase authority tests exist (`authority.test.js`, `attachment_authority.test.js`, EC-24 tests). No cross-phase sweep. | **NEW sweep** over all 218 endpoints (§9.7). |
| 17 | **Documentation close-out** | `api_registry.md` and `combined_api_analysis.md` are current through **#194**; `org_settings_registry.md` through **#54**. The parent's **line-3 STATUS banner is stale** ("Phases 1 & 2 implemented… Phases 4–7 not started"). No module completion report exists (Leave has one). | **Register #195–#218, #55–#57**; rewrite the banner; write the Phase 1–7 completion report. |

---

## 2. Pre-Flight Checks — verified facts Phase 7 depends on

Read from the tree at plan time. Do not re-derive.

1. **`attendance_lock_periods` is org-wide.** Columns are `org_id, start_date, end_date, locked_by, locked_at, reason` — **no `user_id`**. `checkLock(orgId, date)` throws `403 PERIOD_LOCKED` for *every* user on a locked date. → A single-leaver F&F run must therefore **not** create a lock (**D-55**).
2. **`approve()` already handles lock adoption.** It takes `pg_advisory_xact_lock('payroll:lock:{orgId}')`, finds overlapping locks, and either creates (`lock_reused=false`) or adopts a fully-covering one (`lock_reused=true`). `cancel()` releases only when `lock_reused === false && lock_period_id` — so a `NULL` `lock_period_id` needs **no cancel-path change**.
3. **The run advisory lock key is `payroll:run:{orgId}:{period_month}`**, shared by `payroll_period_guard.lockRunForPeriod` and every run lifecycle method. It is **run-type-agnostic**, so it already serialises a regular run and an off-cycle run for the same month. This is what makes the §7.4 duplicate-earnings check atomic.
4. **`findStatutoryPeriodAggregates` filters `period_month < periodMonthExclusive`** and `run.status IN ('approved','paid')`, `item.status='calculated'`. Same-month siblings are invisible to YTD, ESI continuation, and the §80C EPF injection. **This is the single most dangerous fact in Phase 7.**
5. **`findCarryForwardBalances`** uses the same closed-run join (repository comment states this explicitly) and needs the same treatment.
6. **The Leave module never calls `lockService.checkLock`.** Attendance clock, regularization, overtime, comp-off, device and anomaly services all do; `leave_approval.service.js` does not. → **EC-6 (leave approved after the run closed) is reachable in production today.** Arrears must be a *payroll-side reconciliation of frozen-vs-live*, not an assumption that the lock prevented drift.
7. **`payroll_run_item_components` does not persist `category`.** The line carries `category` transiently (added for EC-45's ESI exclusion) and it is dropped on insert. An arrear line would therefore be indistinguishable from any other adjustment line in every report and payslip. → §4.4 persists it.
8. **`payroll_run.service._commitVariablePay` loads lines by `source IN ('adjustment','loan','reimbursement')`** and stamps `applied_run_id` via `source_ref_id`. **If arrear lines used `source='arrear'` they would never be stamped and would be re-paid by the next run.** → **D-54**: arrears keep `source='adjustment'`.
9. **`employee_loan.service.foreclose()`** cancels every `scheduled` installment, forgives their interest, recomputes outstanding, and — for `settlementMode='recover_via_payroll'` — creates exactly one **approved** `recovery` adjustment for `recoveryPeriodMonth`, taking the rank-1 run advisory lock first. F&F loan recovery is a call, not a re-implementation.
10. **`recomputeLoanState`** already closes a loan when no `scheduled` installments remain and reopens it if a reversal restores them. (Kills parent item 3.)
11. **Comp-off approval** (`comp_off.service.js:95-150`) credits `leave_balances` (`total_accrued +1`, `current_balance +1`) for the CO type in the *earned* year, sets a 90-day expiry, and flips the row to `'approved'`. The expiry cron sweeps `where status='approved' AND expiry_date < today` → `'expired'`, skipping `'used'`. A new `'encashed'` value is inert to both.
12. **`attendance_comp_offs.status` is `STRING(20)`, not an enum** → no migration to add `'encashed'`.
13. **`leave_types` has no `is_encashable` column** (`is_paid`, `requires_document_threshold`, `sandwich_rule_applies`, `is_active`, `allowed_genders`, `allowed_marital_statuses` only). Encashable types are an org setting keyed by **`code`**, not id, matching the `'CO'`-by-code precedent.
14. **`_loadPopulation`** admits every active `user_roles` row with a tenant-plane role, drops anyone whose `joining_date > period_end`, and passes non-`active` users through as *candidates*; `_buildEntry` then raises `EXIT_DATE_REQUIRED` when `status !== 'active' && !override`. `clipToEmployment` returns `exited_before_period` → the entry is `null` → the user silently leaves the run. This is exactly the behaviour an exit record needs.
15. **`aggregate({ orgId, period, settings, overrides })` has no cohort parameter.** Off-cycle and F&F runs need one.
16. **`structure_version.utils.planRevision`** blocks `effective_from <= currentApproved.effective_from` (`RETRO_REVISION_NOT_SUPPORTED`). A revision effective *after* the live version's start but inside an already-closed month **is accepted today** and silently pays nothing for the closed months. That gap is arrears case **R2**.
17. **`projectAnnualTax`** already consumes `deductions.chapter_via.injected[section]`, caps it against `regime.chapter_via_limits`, and emits a `chapter_via` trace. EC-33 needs no change to it.
18. **The Chapter VI-A / projection logic exists in two places:** `statutory_calculation.service.js:284` (the run engine) and `employee_tax.service.js:203` (the projection/`/me/tax` read path). Both build `injected['80C']` identically. **Every Phase-7 tax change must land in both or the endpoint will disagree with the payslip.**
19. **`payroll_runs.engine_version` DB default is 5** (bumped 4→5 by migration `00044`); `create()` writes `5` explicitly.
20. **`payroll_settings` has 40 columns** across registry #35–#54. Phase 7 adds ~22 more.
21. **Cron convention:** `src/cron-jobs/*.cron.js`, no exports, bare `cron.schedule(expr, fn, { timezone: 'Asia/Kolkata' })`, `require`d from `src/server.js` **only when `os.platform() === 'linux'`**. Startup catch-up is a `setTimeout(…, 30000)` block in `server.js` calling a service method (`leaveRolloverService.runStartupCatchUp()`). Crons double-fire on multi-instance deploys — Phase 6 solved that with an atomic conditional-`UPDATE` claim rather than leader election. Phase 7 uses the same idiom.
22. **`payroll_attachments.status`** ENUM(`pending`,`available`,`deleted`); every reader filters `available`, so an abandoned upload is inert but permanent.
23. **`validate(schema,'query')` throws under Express 5** (`req.query` is getter-only). Every Phase-7 list/report query is validated **in the controller** via `validateOrThrow`.
24. **Route auth arrays:** `hrAuth = [authenticate, authorize(['hr']), requireFeature('payroll.access')]`; manager `authorize(['manager','hr'])`; self `[authenticate, requireFeature('payroll.access')]` with no `authorize()`. Payroll admits **no** `admin`/`super-admin` (**D-14**).

---

## 3. Directory Structure

### 3.1 New files

| Path | Purpose | Ref |
|---|---|---|
| `models/employee_exits.model.js` | the first-class exit record | §4.1 |
| `models/comp_off_encashments.model.js` | comp-off → cash, maker–checker | §4.2 |
| `repositories/employee_exit.repository.js` | exit CRUD + cohort lookup for the aggregator | §4.1 |
| `repositories/comp_off_encashment.repository.js` | — | §4.2 |
| `services/employee_exit.service.js` | exit lifecycle (record / correct / cancel) | §5.2 |
| `services/fnf_settlement.service.js` | the `prepare-settlement` orchestrator | §5.2 |
| `services/encashment.service.js` | one engine, two source adapters (comp-off · leave balance) | §5.5 |
| `services/payroll_arrear.service.js` | recompute-and-diff reconciliation | §5.3 |
| `services/payroll_automation.service.js` | the four job bodies + `runStartupCatchUp` | §5.7 |
| `utils/arrear_diff.utils.js` | **pure** component-level delta (frozen vs recomputed vs already-raised) | §5.3 |
| `utils/encashment_rate.utils.js` | **pure** per-day rate from a rate basis + divisor | §5.5 |
| `utils/notice_recovery.utils.js` | **pure** notice-days and recovery amount | §5.2 |
| `utils/exit_window.utils.js` | **pure** exit-date precedence resolver | §5.2 |
| `src/cron-jobs/payroll_calendar_reminders.cron.js` | cut-off · pay-day · declaration-window · proof-deadline | §5.7 |
| `src/cron-jobs/payroll_auto_draft.cron.js` | scheduled draft creation | §5.7 |
| `src/cron-jobs/payroll_run_sweeper.cron.js` | stale `calculating` runs | §5.7 |
| `src/cron-jobs/payroll_attachment_sweeper.cron.js` | `pending` + retention sweep | §5.7 |
| `src/common/templates/payroll_cutoff_reminder.html` | reminder body (Phase-6 template pattern) | §5.7 |
| `src/common/templates/payroll_action_reminder.html` | pay-day / declaration / proof reminders, one template, parameterised | §5.7 |
| `src/infrastructure/postgres-sql/migrations/00048-create-payroll-exits-and-corrections.js` | the whole schema delta | §4 |
| `tests/unit/payroll/*` | 11 new suites | §9 |

### 3.2 Extended files

| Path | Change | Ref |
|---|---|---|
| `services/payroll_attendance_aggregator.service.js` | `restrictToUserIds` cohort filter; exit-date source swap; exclude already-settled users | §5.1, §5.2 |
| `services/payroll_calculation.service.js` | `earnings_mode`; `perquisitePaise` accumulator; §80D premium basis | §5.4, §5.6 |
| `services/statutory_calculation.service.js` | perquisite into the income-tax base only; `injected['80D']`; same-period netting | §5.4, §5.6 |
| `services/employee_tax.service.js` | three changes: mirror the two tax changes (fact 18); sibling-safe `getSelfMonthly` (F-1); own `ENGINE_VERSION` 4 → 5 (F-9) | §5.6, §5.9 |
| `services/annual_statement.service.js` | sibling-safe FY fold — many items per month, not one (F-1) | §5.9 |
| `services/payroll_run.service.js` | cohort/`earnings_mode` on `create`; supplementary lock policy; §7.4 duplicate-earnings guard; `perquisite_amount` persistence | §5.1, §7 |
| `services/payroll_period_guard.service.js` | `arrearTargetFor()` — the routing half of EC-31; `allowSupplementary` mode (F-2) | §5.3, §5.8 |
| `services/employee_salary_structure.service.js` | on approval, report `arrear_required` periods (read-only signal) | §5.3 R2 |
| `services/benefit_plan.service.js` | validate the two new tax flags; header note supersedes D-37 | §5.6 |
| `services/payroll_settings.service.js` | validate #55–#57; reminder watermarks | §4.6 |
| `repositories/payroll_run_item.repository.js` | same-period sibling aggregate; settled-user lookup; `period_month` on items | §5.4, §7.4 |
| `repositories/payroll_adjustment.repository.js` | arrear provenance queries + already-raised sums | §5.3 |
| `repositories/payroll_attachment.repository.js` | sweep queries | §5.7 |
| `controllers/payroll_{hr,manager,self}.controller.js` | #195–#218 | §6 |
| `routes/payroll_{hr,manager,self}.routes.js` | #195–#218 | §6 |
| `validators/payroll_{hr,manager,self}.validator.js` | schemas; `run_type` widened; `adjustment.category` admits `arrear` **service-side only** | §6.5 |
| `src/server.js` | four `require`s + one `runStartupCatchUp` call | §5.7 |
| `src/common/utilities/email.utils.js` | two `TEMPLATE_MAP` entries + two senders | §5.7 |

**No other file outside `src/modules/payroll/` is modified.** In particular: **no file in `src/modules/attendance/` or `src/modules/leave/` is edited** (D-58).

### 3.3 Layer responsibilities

| Layer | Owns | Never |
|---|---|---|
| `utils/*` (pure) | arithmetic: arrear deltas, encashment rates, notice days, exit-window precedence | DB, `req`, dates from `new Date()` without an injected clock |
| `repositories/*` | one table each; every predicate carries `org_id` | business rules, cross-table orchestration |
| `services/*` | transactions, advisory locks, authority, audit, cross-module repository calls | HTTP shapes, `res` |
| `controllers/*` | query validation (Express 5), envelope, `next(error)` | authority decisions, money |
| `cron-jobs/*` | schedule + one service call + one log line | logic of any kind |

---

## 4. Database Schema — migration `00048-create-payroll-exits-and-corrections.js`

One migration, one transaction, fully reversible. All tables: UUID PK, `org_id` NOT NULL FK → `organizations` ON DELETE CASCADE, `created_at`/`updated_at`, `underscored: true`.

### 4.1 `employee_exits` (new, paranoid)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID NOT NULL FK | |
| `user_id` | UUID NOT NULL FK → `users` | |
| `exit_type` | ENUM(`resignation`,`termination`,`retirement`,`end_of_contract`,`death`,`absconding`) NOT NULL | |
| `resignation_date` | DATEONLY NULL | informational |
| `last_working_day` | DATEONLY NOT NULL | **the first-class `exit_date` D-15 asked for** |
| `notice_period_days` | INTEGER NOT NULL | defaulted from setting #55 at create |
| `notice_served_days` | INTEGER NOT NULL DEFAULT 0 | |
| `notice_recovery_waived` | BOOLEAN NOT NULL DEFAULT false | |
| `notice_recovery_days_override` | INTEGER NULL | HR override of the computed shortfall |
| `exit_reason` | TEXT NULL | |
| `status` | ENUM(`recorded`,`prepared`,`settled`,`cancelled`) NOT NULL DEFAULT `recorded` | |
| `settlement_prepared_at` | TIMESTAMPTZ NULL | idempotency watermark (§5.2) |
| `settlement_period_month` | STRING(7) NULL | the month the artefacts were frozen for; the F&F run's `period_month` must equal it (F-12) |
| `notice_adjustment_id` | UUID NULL FK → `payroll_adjustments` | prepared artefact |
| `encashment_ids` | JSONB NOT NULL DEFAULT `'[]'` | prepared artefacts |
| `loan_adjustment_ids` | JSONB NOT NULL DEFAULT `'[]'` | prepared artefacts |
| `fnf_run_id` | UUID NULL FK → `payroll_runs` | the settling run |
| `settled_at` | TIMESTAMPTZ NULL | set when `fnf_run_id` reaches `paid` |
| `recorded_by` / `cancelled_by` | UUID NULL FK → `users` | |
| `cancelled_at` | TIMESTAMPTZ NULL · `cancellation_reason` TEXT NULL | |
| `deleted_at` | TIMESTAMPTZ NULL | paranoid |

Indexes:
* `UNIQUE (org_id, user_id) WHERE status <> 'cancelled' AND deleted_at IS NULL` → **one live exit per employee**.
* `(org_id, status)`, `(org_id, last_working_day)`.

CHECKs: `notice_period_days >= 0`, `notice_served_days >= 0`, `notice_recovery_days_override >= 0`, `resignation_date <= last_working_day`.

### 4.2 `comp_off_encashments` (new, paranoid)

| Column | Type | Notes |
|---|---|---|
| `id` · `org_id` · `user_id` | | |
| `source_kind` | ENUM(`comp_off`,`leave_balance`) NOT NULL | one table, two adapters (§5.5) |
| `comp_off_ids` | JSONB NOT NULL DEFAULT `'[]'` | the exact `attendance_comp_offs` rows consumed |
| `leave_type_id` · `leave_type_code` | UUID NULL · STRING(20) NULL | for `leave_balance` |
| `balance_year` | INTEGER NULL | the `leave_balances.year` debited |
| `days` | DECIMAL(6,2) NOT NULL | |
| `rate_basis` | STRING(20) NOT NULL · `divisor_basis` STRING(24) NOT NULL · `divisor_days` INTEGER NOT NULL | frozen at creation |
| `per_day_amount` · `amount` | DECIMAL(14,2) NOT NULL | frozen |
| `period_month` | STRING(7) NOT NULL | payout target |
| `component_id` · `component_code` | UUID NOT NULL FK → `salary_components` · STRING(50) NOT NULL | |
| `status` | ENUM(`pending`,`approved`,`rejected`,`cancelled`) NOT NULL DEFAULT `pending` | the D-13 quartet |
| `proposed_by` · `approved_by` · `actioned_at` · `rejection_reason` | | |
| `adjustment_id` | UUID NULL FK → `payroll_adjustments` | created on approval |
| `exit_id` | UUID NULL FK → `employee_exits` | set when raised by F&F prepare |
| `created_by` · `deleted_at` | | |

Indexes: `(org_id, user_id, status)`, `(org_id, period_month)`, `(org_id, exit_id)`.
CHECKs: `days > 0`, `amount >= 0`, `divisor_days > 0`.

> **No unique constraint can cover `comp_off_ids`** (a JSONB array). Double-encashment of the same comp-off is prevented by the **row-level state machine** on `attendance_comp_offs` (`approved → encashed`, asserted under `FOR UPDATE`), which is a stronger guarantee than an index. See §7.5.

### 4.3 `payroll_runs` — additive + one index replacement

| Change | Detail |
|---|---|
| `cohort_user_ids` JSONB NULL | `NULL` = the whole org (every existing row, every regular run). A non-null array restricts the aggregator. |
| `earnings_mode` ENUM(`full`,`supplementary_only`) NOT NULL DEFAULT `full` | backfills `full`; **every existing run keeps its exact semantics**. |
| `source_exit_id` UUID NULL FK → `employee_exits` | set on an F&F run |
| `engine_version` DB default `5 → 6` | `create()` writes it explicitly anyway |
| **Index replace** | `DROP payroll_runs_org_period_type_unique_idx`; `CREATE UNIQUE INDEX payroll_runs_org_period_regular_unique_idx ON payroll_runs (org_id, period_month) WHERE run_type = 'regular' AND status <> 'cancelled' AND deleted_at IS NULL` |

> **Why the index narrows rather than widens.** The old index enforced one run per `(org, period, run_type)`. For `regular` that is the EC-10 duplicate-run guard and must stay — the new index is *identical* for regular rows (`run_type` is constant inside the predicate, so dropping it from the key changes nothing). For `off_cycle`/`final_settlement` the old index was an accident: an org with three leavers in March could file one F&F run, not three. The new index imposes no uniqueness on supplementary runs; their safety comes from §7.4's duplicate-earnings guard, which is the constraint that actually matters (money), not row count.

### 4.4 `payroll_run_items` / `payroll_run_item_components` — additive only

| Table | Column | Notes |
|---|---|---|
| `payroll_run_items` | `period_month` STRING(7) NULL | denormalized from the run for the §5.4 sibling aggregate and the §7.4 guard; **backfilled in-migration** from `payroll_runs.period_month`, then `SET NOT NULL`. Written by `_persistCohortRows`. Index `(org_id, user_id, period_month)`. |
| `payroll_run_items` | `perquisite_amount` DECIMAL(14,2) NOT NULL DEFAULT 0 | EC-32 visibility; 0 for every existing row |
| `payroll_run_item_components` | `category` STRING(30) NULL | fact 7 — persists what the line already carries; lets reports and the payslip label an arrear |
| `payroll_run_item_components` | `source_period_month` STRING(7) NULL | "Arrears (2026-03)" on the payslip with no extra query |

> The item backfill is the only data-touching statement in `00048`. It is a single correlated `UPDATE … FROM payroll_runs` and is idempotent.

### 4.5 `payroll_adjustments` — arrear provenance (additive)

| Column | Type | Notes |
|---|---|---|
| `source_kind` | ENUM(`retro_structure`,`attendance_recompute`,`leave_recompute`,`overtime_recompute`,`notice_recovery`,`encashment`,`manual`) NULL | |
| `source_period_month` | STRING(7) NULL | the period the money *belongs to* |
| `source_run_id` | UUID NULL FK → `payroll_runs` | the closed run being corrected |
| `source_run_item_id` | UUID NULL FK → `payroll_run_items` | |
| `arrear_batch_id` | UUID NULL | groups one reconciliation's output |
| `source_component_code` | STRING(50) NULL | which frozen component drifted |

Indexes: `(org_id, source_run_item_id)`, `(org_id, arrear_batch_id)`, `(org_id, source_period_month)`.

> **No unique index on `(source_run_item_id, source_component_code)`.** A second, later drift on the same component must be able to raise a *second, incremental* arrear. Idempotency comes from the already-raised subtraction in §5.3 step 4, which makes a repeated reconciliation produce a zero delta and therefore **no row at all** — a stronger property than a constraint that would reject the legitimate second correction.

### 4.6 `benefit_plans` + `payroll_settings`

`benefit_plans` (additive, supersedes D-37's "a plan has no tax effect"):
* `employer_contribution_taxable` BOOLEAN NOT NULL DEFAULT **false**
* `employee_premium_tax_section` STRING(16) NULL

Both default to today's behaviour, so **no existing plan changes any figure**.

`payroll_settings` — registry **#55–#57** plus four watermarks:

| Group | Columns |
|---|---|
| **#55 F&F policy** | `fnf_leave_encashment_enabled` BOOL false · `fnf_encashment_leave_type_codes` JSONB `'[]'` · `fnf_encashment_rate_basis` ENUM(`basic`,`basic_plus_da`,`gross`) `basic` · `fnf_encashment_divisor` ENUM(`fixed_30`,`calendar_days`,`standard_working_days`) `fixed_30` · `fnf_encashment_max_days` INT NULL · `fnf_encashment_component_id` UUID NULL · `fnf_notice_recovery_enabled` BOOL false · `fnf_notice_recovery_rate_basis` ENUM(same) `basic` · `fnf_default_notice_period_days` INT 30 · `fnf_notice_recovery_component_id` UUID NULL · `fnf_loan_recovery_mode` ENUM(`recover_via_payroll`,`settled_externally`,`manual`) `manual` |
| **#56 automation** | `payroll_auto_draft_enabled` BOOL false · `payroll_auto_draft_day` INT 1 · `payroll_cutoff_reminder_enabled` BOOL false · `payroll_payday_reminder_enabled` BOOL false · `tax_declaration_reminder_enabled` BOOL false · `payroll_attachment_retention_days` INT 2555 (7 y) |
| **#57 comp-off encashment** | `compoff_encashment_enabled` BOOL false · `compoff_encashment_rate_basis` ENUM(same) `basic` · `compoff_encashment_divisor` ENUM(same) `fixed_30` · `compoff_encashment_max_days_per_fy` INT NULL · `compoff_encashment_component_id` UUID NULL |
| watermarks | `last_cutoff_reminder_on` · `last_payday_reminder_on` · `last_declaration_reminder_on` · `last_proof_reminder_on` — all DATEONLY NULL |

**Every new feature flag defaults OFF.** Deploying `00048` changes no tenant's behaviour until HR opts in. The three component-id columns must reference an **active earning** `salary_components` row in the same org; validated in `payroll_settings.service.update`, not by FK (the catalog row can be soft-deleted).

> `payroll_settings.model.js` must gain **all** of these columns. Phase 6's Step 0 existed because three migration columns were missing from the model; §12 Step 1 ends with a schema-parity assertion test (`payroll_settings_schema.test.js` already exists — extend it) so that cannot recur.

### 4.7 What `00048` does **not** do

* No backfill of `employee_exits` from `users.status='inactive'` — an inferred last working day is a money input and must be HR-entered. Existing `EXIT_DATE_REQUIRED` items keep working through #47 until HR records the exit.
* No change to `attendance_comp_offs`, `leave_balances`, `leave_types`, `attendance_lock_periods`, or any Leave/Attendance table.
* No new `run_type` or `source` enum values (both already carry everything needed).
* No retention purge of payslip snapshots.

---

## 5. Core Logic

### 5.1 Cohort restriction and `earnings_mode`

`aggregate({ orgId, period, settings, overrides, restrictToUserIds = null, exitDates = new Map(), excludeUserIds = new Set() })`:

1. `_loadPopulation` is unchanged. Immediately after it, if `restrictToUserIds` is a `Set`, filter the population to it; then subtract `excludeUserIds`. Both default to no-ops → **identical behaviour for every regular run**.
2. If `restrictToUserIds` contains a user absent from the population, that user is reported back as `{ user_id, reason: 'not_in_population' }` on the aggregate's warning channel (so #38 create can 422 rather than silently pay nobody).
3. `_buildEntry` resolves the exit date by **precedence (§5.2)** instead of `override ? override.periodEnd : null`.

`payroll_calculation.computePayrollItem({ …, earningsMode = 'full' })`:

* `'full'` — unchanged, byte-for-byte.
* `'supplementary_only'` — Steps 3, 4, 5 (structure resolution, structure earnings, LOP) are skipped; no structure lines, no `lop_amount`, `payable_days = 0`. Step 6b (adjustment earnings, including arrears), the taxable/non-taxable reimbursement partition, and Step 7 (statutory, in netting mode) run normally. **Excluded from a supplementary run:** overtime (attendance-derived — belongs to the regular run), benefit contributions (a monthly recurrence the regular run charges), loan EMI and carry-forward recovery (once per month by definition). A `recovery` adjustment is *not* a loan EMI and does flow.
* A `supplementary_only` item with no adjustment and no reimbursement is an **error item** (`error_code: 'NO_SUPPLEMENTARY_LINES'`), never a ₹0 payslip — the EC-13 principle.

**Run-type defaults** (set in `payroll_run.service.create`, overridable only within these bounds):

| `run_type` | `cohort_user_ids` | `earnings_mode` | Period lock |
|---|---|---|---|
| `regular` | must be NULL | `full` (fixed) | create-or-adopt (unchanged) |
| `off_cycle` | **required**, 1–500 ids | `supplementary_only` (fixed) | adopt-only (**D-55**) |
| `final_settlement` | **required**, 1–50 ids | `full`, HR may set `supplementary_only` | adopt-only (**D-55**) |
| `arrear` | — | — | **rejected by the validator** (D-54) |

### 5.2 Exits & Full & Final settlement

**Exit-date precedence** (`exit_window.utils.resolveExitDate`), highest first:
1. the item's `period_override_reason`-bearing `period_end` (#47) — HR's explicit, audited narrowing for *this run*;
2. the live `employee_exits.last_working_day` (status `recorded`/`prepared`/`settled`);
3. the run's `period_end` (today's D-15 default).

`_buildEntry`'s `EXIT_DATE_REQUIRED` branch becomes `status !== 'active' && !override && !exitRecord`. Consequence, deliberate: **recording an exit makes the recurring monthly error item disappear**, and for months after the LWD the employee drops out of the run entirely (`exited_before_period`). §13.4.

**Exit lifecycle** (`employee_exit.service`):

```
recorded --prepare-settlement--> prepared --(F&F run paid)--> settled
   |                                 |
   +---------- cancel ---------------+   (only while not `settled`)
```

* **`record`** (#195) — Tier C, `hr` only. Validates: the target is a tenant-plane member of the org; `last_working_day >= joining_date`; no live exit already (409 `EXIT_ALREADY_RECORDED`); `last_working_day` may be past or future. `notice_period_days` defaults from setting #55. Audited.
* **`correct`** (#198) — patches `last_working_day`, notice fields, `exit_type`, `exit_reason`. Refused once `status='settled'` (409 `EXIT_ALREADY_SETTLED`). Refused while `status='prepared'` **unless** the caller resets first (409 `SETTLEMENT_ALREADY_PREPARED`) — correcting the LWD after encashment days were computed from it would leave the two inconsistent. Under the run advisory lock for the LWD's `period_month`, because it changes an input to a possibly-draft run (`requires_recalculation`).
* **`cancel`** (#199) — rejoined, or recorded in error. Requires that no `approved`/`paid` F&F run references it; if `prepared`, runs the §5.2 reset first, in the same transaction.

**`settlement-preview` (#200, read-only) / `prepare-settlement` (#201, writes).** Both compute the same plan through the same pure functions; only #201 persists. `prepare-settlement` is **one transaction**:

1. `lockRunForPeriod(orgId, fnfPeriodMonth, t)` — rank 1.
2. Load the exit `FOR UPDATE`. If `settlement_prepared_at IS NOT NULL` → **return the existing plan** (`{ idempotent: true }`, HTTP 200). True idempotency; a retried request after a timeout never doubles anything.
3. `assertPeriodOpenForVariablePay(orgId, fnfPeriodMonth, t)` — if the target month's regular run is already approved/paid, the F&F must target a later month or run `supplementary_only`; the guard's 422 is the correct answer and the error body names the next open month.
4. **Notice recovery** — `notice_recovery.utils`: `days = override ?? max(0, notice_period_days − notice_served_days)`; `0` if waived or `fnf_notice_recovery_enabled=false`. Rate from `fnf_notice_recovery_rate_basis` over the **last approved structure overlapping the LWD**, divided by the resolved divisor. Emits one **approved** `payroll_adjustments` deduction, `category='recovery'`, `source_kind='notice_recovery'`.
5. **Leave encashment** — for each code in `fnf_encashment_leave_type_codes`: resolve the type by code (skip missing/inactive with a warning), `getBalanceForUpdate(userId, typeId, balanceYear, orgId, t)` where `balanceYear` is resolved per source by §5.5 (the leave year for a balance, the comp-off's `earned_date` year for a comp-off — **never** `year(LWD)`, F-7), `days = min(current_balance, fnf_encashment_max_days ?? ∞)`; skip if `days <= 0`. Delegates to `encashment.service` (§5.5).
6. **Loan recovery** — for every `active` loan of the user: if `fnf_loan_recovery_mode='manual'`, **do nothing but report** the outstanding balance in the plan (HR settles deliberately); otherwise call `employeeLoanService.foreclose(loanId, orgId, actor, { settlementMode, recoveryPeriodMonth: fnfPeriodMonth, reason: 'F&F settlement' }, actor)` **inside this transaction**. `foreclose` takes the rank-1 lock re-entrantly (§7.1) and creates its own recovery adjustment — no new loan code.
7. Stamp `settlement_prepared_at`, `settlement_period_month` **[F-12 — §16]**, the artefact ids, `status='prepared'`. Audit one `exit.settlement_prepared` row carrying the full plan as `new_values`.

**`settlement/reset` (#202)** — the exact inverse, same lock order: cancel the notice and loan-recovery adjustments (only if `applied_run_id IS NULL`, else 409 `ADJUSTMENT_ALREADY_APPLIED`), cancel each encashment through `encashment.service.reverse` (re-crediting the leave wallet and flipping `encashed → approved` on the comp-off rows), clear the watermark, `status='prepared' → 'recorded'`. Refused if any artefact is already applied to an approved/paid run.

**Then HR runs the existing lifecycle**: `POST /runs` with `run_type='final_settlement'`, `user_ids=[…]` → `calculate` → `preview` → `approve` → `pay`. `pay()` sets `employee_exits.settled_at`/`status='settled'` for `source_exit_id` (one additive block in `pay()`, inside its transaction).

> **No new employee-facing endpoint.** The F&F run produces `payroll_run_items` and a `payslips` row, so #53–#56, #167, #191 and the annual statement already serve the leaver through the Phase 5/6 machinery. Adding an F&F statement endpoint would duplicate the payslip.

### 5.3 Arrears & retro pay (D-53)

**Principle: an arrear is not a new kind of money. It is an ordinary `payroll_adjustments` row with provenance, computed as a diff, paid by the next open run through the unmodified engine.**

`payroll_arrear.service.computeDrift(orgId, sourcePeriodMonth, { userIds = null })` — pure read, no writes:

1. Load the closed run for `sourcePeriodMonth` (`status IN ('approved','paid')`, `run_type='regular'`) and its `calculated` items (optionally cohort-filtered). **Two admissibility gates before anything is computed (F-3):**
   * `RECONCILABLE_ENGINE_VERSIONS = new Set([5, 6])` — a source run outside the set → `422 ENGINE_VERSION_NOT_RECONCILABLE`, message directing HR to enter the correction as a manual adjustment (#73) in an open month. A diff only means something when both sides came from arithmetically equivalent engines; freezing `settings_snapshot` freezes the *inputs*, not the *algorithm*. 5 and 6 qualify **only because** §9.5 proves them equivalent for inputs with no benefit tax flag and no sibling run.
   * Every settings key the recompute reads must be present in the frozen `settings_snapshot` — `buildSettingsSnapshot` is a curated allow-list and an older run's snapshot legitimately predates later phases' keys. A missing key → `422 SNAPSHOT_INCOMPLETE`, never a silent `undefined` falling back to a live engine default.
2. Re-run `aggregate()` for that period with **`settings` taken from the closed run's `settings_snapshot`** — so an `lop_basis`, rounding-policy, PF-rate or slab change made since approval can never leak into a correction — but with **live** attendance, leave, overtime and salary-structure data. This is the frozen-policy / live-facts split, and it is what makes a drift a *correction* rather than a *re-interpretation*.
3. Recompute each item with `computePayrollItem`, `earningsMode='full'`, **`statutoryContext: null`**. **Only an employee whose recompute yields a `calculated` item with figures is eligible (F-4).** An error item (`EXIT_DATE_REQUIRED`, `NO_SALARY_STRUCTURE`), a `null` aggregator entry (`exited_before_period`, because an exit has since been recorded), or a user now absent from the population is **skipped** and reported as `{ user_id, reason: 'RECOMPUTE_UNAVAILABLE', detail }` — never converted into a delta. Treating an unavailable recompute as "zero" would claw back an entire month's salary from someone who was paid correctly. Statutory heads are deliberately excluded from the diff: they are recomputed in the paying month on the arrear's own wages (Step 7 of the target run), which is both correct Indian practice and the only way TDS stays a single, monotonic YTD true-up. The diff is an **earnings-side diff only**.
4. Per component code, delta in paise:
   `delta = recomputed.amount − frozen.amount − Σ(already-raised arrears for (source_run_item_id, component_code) with status ∈ {pending, approved})`
   The third term is what makes reconciliation **idempotent and re-runnable**: run it twice and the second pass yields 0; a *second* back-dated change later yields only the new increment.
5. **Scope of the diff (F-16): earning lines with `source IN ('structure', 'overtime')` only.** Every other source is excluded by construction — `adjustment`, `reimbursement` and `loan` lines already have their own `applied_run_id` lifecycle and would be double-handled; `benefit` and `rounding` lines are engine-synthesised. This also means no `bonus`/`incentive` line can ever enter a diff, so EC-45's ESI exclusion (which keys on `category`, and would not recognise `category='arrear'`) is preserved by construction rather than by carrying another field. R1/R2/R3 below are all structure- or overtime-sourced, so nothing in scope is lost.
6. **Within a present item**, a component on one side and absent on the other is a delta of its full amount (a new component from a retro structure revision; a removed one). Overtime drift is one delta on the `OVERTIME` code. This rule never applies to a whole item — see step 3.
7. **Full-reversal brake (F-4).** An employee whose net delta reverses ≥ 99 % of the frozen item's gross is withheld and flagged `FULL_REVERSAL_SUSPECTED`. A genuine full clawback (someone paid for a month they had already left) is real but rare and must be a deliberate keystroke: committing it requires `allow_full_reversal: true` on #204, audited.
8. Return `{ source_period_month, source_run_id, target_period_month, skipped: [{ user_id, reason, detail }], employees: [{ user_id, employee_code, deltas: [{ component_code, direction, amount, frozen, recomputed, already_raised }], net_delta, reason_codes }] }` where `reason_codes ⊆ {structure_changed, ledger_changed, overtime_changed}`, derived by comparing the frozen `structure_snapshot`/`attendance_snapshot` against the recomputed ones.

`reconcile(orgId, sourcePeriodMonth, { userIds, targetPeriodMonth, reason, allowFullReversal = false }, actor)` — **one transaction**:

1. `lockRunForPeriod(orgId, targetPeriodMonth, t)` then `lockRunForPeriod(orgId, sourcePeriodMonth, t)` — **target before source**, a fixed total order (§7.1) so two reconciliations with swapped periods cannot deadlock.
2. `assertPeriodOpenForVariablePay(orgId, targetPeriodMonth, t)`. `targetPeriodMonth` defaults to `periodGuard.arrearTargetFor(orgId, sourcePeriodMonth, t)` — the earliest month `> sourcePeriodMonth` with no `approved`/`paid` regular run. This is the **routing half of EC-31**.
3. Recompute the drift **inside the transaction** (never trust a figure the client echoes back from #203), applying the same admissibility gates, source scoping and full-reversal brake. A withheld employee is reported, not committed, unless `allowFullReversal` is set.
4. For each non-zero delta create one `payroll_adjustments` row:
   * `status='approved'` when the actor is `hr` and (`payroll_require_separate_checker=false`), else `status='pending'` — the existing Phase-3 maker–checker decision function, unchanged;
   * `category='arrear'` · `adjustment_type = delta > 0 ? 'earning' : 'deduction'` · `amount = |delta|`;
   * `is_taxable`, `pf_applicable`, `esi_applicable`, `component_id`, `component_code`, `component_name` copied **from the frozen `structure_snapshot`'s component**, not from today's catalog — an arrear on Basic must attract PF exactly as that Basic did;
   * `period_month = targetPeriodMonth`; `source_*` and a shared `arrear_batch_id`;
   * `reason` = the operator's reason plus the machine reason codes.
5. Audit one `arrear.reconciled` row per employee with the full delta set, plus one batch-level row.

**Three retro cases, all through this one path:**

| Case | Trigger | Detection |
|---|---|---|
| **R1** back-dated leave approval / late regularization | Leave approval never checks the payroll lock (fact 6) | `attendance_snapshot` day-ledger diff |
| **R2** retro increment | a structure revision whose `effective_from` lies in a closed month (accepted by `planRevision` today — fact 16) | `structure_snapshot` diff |
| **R3** late-approved overtime | OT approved after the lock was released, or on an unlocked supplementary period | `OVERTIME` amount diff |

For **R2**, `employee_salary_structure.service.approve` gains one **read-only** addition: after the revision commits, it computes which closed `period_month`s the new `effective_from` reaches and returns `arrear_required: { periods: [...] }` on the response (and one `structure.arrear_required` audit row). It **does not** create adjustments — a compensation approval must not also be a money-movement event, and doing it in that transaction would couple a Tier-B approval to the run advisory lock of N periods. HR then calls #204. The reminder cron surfaces un-reconciled drift so this cannot be forgotten (§5.7).

### 5.4 Same-period statutory netting (D-56) — the correctness core of off-cycle/F&F

**The problem (fact 4).** `findStatutoryPeriodAggregates` reads `period_month < periodMonthExclusive`. An off-cycle or F&F run in a month that already has a closed regular run therefore sees `ytd = 0` for that month and would: charge the **full PT slab a second time**; recompute **TDS** ignoring the TDS already deducted that month; re-apply the **PF wage ceiling** from zero; and mis-evaluate the **ESI contribution-period continuation**.

**The fix — one uniform rule, no per-head special cases:**

> For a run whose `period_month` already has *closed sibling runs*, every statutory head is computed on the **month's cumulative basis** and reduced by **what the siblings already charged**, clamped at ≥ 0.

Mechanics:

1. New repository method `findSamePeriodSiblingAggregates(orgId, userIds, { periodMonth, excludeRunId }, t)` — same shape and same closed-run join as `findStatutoryPeriodAggregates`, but `run.period_month = :periodMonth AND run.id <> :excludeRunId`. Returns per user: `pf_wage, pf_employee, pf_employer, eps, pf_admin_charges, edli, esi_wage, esi_employee, esi_employer, esi_covered, pt, taxable_earnings, income_tax, perquisite`.
2. `payroll_statutory_aggregator` attaches it as `statutoryContext.samePeriodPrior` (absent → `null`).
3. `computeStatutory`, when `samePeriodPrior` is non-null:
   * each **base** becomes `current + prior` (`pfBasePaise`, `esiEligibilityPaise`, `ptGrossPaise`, `taxableEarningsPaise`);
   * each **charge** becomes `computed(cumulative) − prior_charged`, floored at 0, with a `STATUTORY_NETTING_NEGATIVE:{head}` warning if the floor bites;
   * `esiPriorState` additionally folds in the sibling's `esi_covered`, so the EC-19 continuation rule sees the month;
   * the TDS block needs no special case beyond the widened base — `ytd.tds` gains the sibling's `income_tax` and `computeMonthlyTds` is already an incremental true-up.
4. `findStatutoryPeriodAggregates` and `findCarryForwardBalances` (fact 5) keep `period_month < X` **unchanged** for the cross-month part; the same-month part is the new, separate query. Two queries, two clear responsibilities — and the existing one's semantics (and its tests) are untouched.

**Why this is a no-op for existing data.** Before Phase 7 the unique index made same-month siblings impossible, so `findSamePeriodSiblingAggregates` returns `[]` for every historical and every regular run, `samePeriodPrior` is `null`, and `computeStatutory` takes the identical branch it takes today. §9.5 proves it on fixtures.

**Side benefit, and a real fix:** an employee whose regular + off-cycle gross crosses a PT slab boundary now pays the **correct slab for the month**, not two independent slab lookups.

### 5.5 Encashment (comp-off and leave balance)

`encashment.service` — one engine, two source adapters, one lock order.

`create(orgId, userId, { sourceKind, compOffIds | leaveTypeCode, days, periodMonth, exitId }, requester, actor)`:

1. Authority: `hr` → Tier C direct; `manager` → Tier B, `getAccessibleUserIds` must contain `userId`, and the row lands `pending` unless `manager_direct_compensation_authority` is ON. The same `payroll_access.decideAuthority` chokepoint every other Tier-B path uses. No new authority code.
2. Gate on `compoff_encashment_enabled` / `fnf_leave_encashment_enabled` (409 `ENCASHMENT_DISABLED`).
2b. **Unit validation (F-7).** A comp-off is always exactly one day — the approval credit is a literal `+ 1`, `worked_hours` is informational and `worked_type` does not halve it. So for `source_kind='comp_off'`, require `days === comp_off_ids.length` and reject a fractional `days` (422 `INVALID_ENCASHMENT_DAYS`). Only the `leave_balance` adapter accepts fractional days.
3. Rate: `encashment_rate.utils.perDayAmount({ structure, rateBasis, divisorBasis, ledger })` — pure. The structure is the latest **approved** version overlapping the period; absent → 422 `NO_SALARY_STRUCTURE`. Component must be an active earning (setting #55/#57); absent → 422 `ENCASHMENT_COMPONENT_NOT_CONFIGURED`.
4. Persist the encashment with `rate_basis`, `divisor_basis`, `divisor_days`, `per_day_amount`, `amount` **frozen** — a later settings change cannot restate an approved encashment.

`approve(id, orgId, approver, actor)` — **one transaction**, lock order fixed:

1. `lockRunForPeriod(orgId, period_month, t)` (rank 1) → `pg_advisory_xact_lock('payroll:encash:{userId}')` (rank 3) → rows `FOR UPDATE` (rank 4).
2. `assertPeriodOpenForVariablePay(orgId, period_month, t)`.
3. Re-check scope (**EC-29** — the subject may have stopped reporting to the proposer) and, if `payroll_require_separate_checker`, proposer ≠ approver (**EC-30**).
4. **Source debit — the EC-27 half that matters.**
   * `comp_off`: for each id, `compOffRepository.findById(id, t, /*lock*/ true)`; assert `org_id` match, `status === 'approved'`, `expiry_date >= today`; update to `'encashed'` with `used_on_date = today`. Any failure → 409 `COMP_OFF_NOT_ENCASHABLE` naming the id, and the whole transaction rolls back.
   * **CO wallet year is per comp-off, not per settlement (F-7).** `comp_off.service.js:251` keys the wallet by `YEAR(earned_date)`, and `leave_balances` is unique on `(org_id, user_id, leave_type_id, year)`. So group `comp_off_ids` by `YEAR(earned_date)` and debit **each year's** row separately via `getBalanceForUpdate`. A December-2025 comp-off encashed in January 2026 debits the 2025 row. A year that has an approved comp-off but no balance row is a data inconsistency → 409 `CO_WALLET_MISSING`, never an implicit create.
   * `leave_balance`: `getBalanceForUpdate(userId, leaveTypeId, balance_year, orgId, t)`; assert `current_balance >= days`; `total_used += days`, `current_balance -= days`.
   * For `comp_off` the CO wallet is debited **as well** — a comp-off credited one day to `leave_balances` on approval, so encashing it must remove that day or the employee can take the leave *and* keep the cash.
   * **Idiom and clamping (F-8).** Both adapters use the *consumption* idiom `total_used += days; current_balance -= days`, matching `leave_approval.service.js:112-113` and keeping `current_balance = total_accrued + carried_forward − total_used − lapsed_balance` intact. Neither **ever clamps**: an insufficient balance is `409 INSUFFICIENT_LEAVE_BALANCE`. The clamp at `comp_off.service.js:253-255` exists to keep a *free* expiry sweep safe; here it would silently pay cash for a day that no longer exists. *(That sweep also debits `current_balance` without maintaining `lapsed_balance` — pre-existing, noted, deliberately not fixed.)*
5. Create the **approved** `payroll_adjustments` earning (`category='ad_hoc_earning'`, `source_kind='encashment'`), stamp `adjustment_id`, `status='approved'`, `approved_by`, `actioned_at`.
6. Audit `encashment.approved` with the consumed source ids.

`reverse(id, orgId, actor, t)` — used by exit reset and `cancel`: allowed only while the adjustment has `applied_run_id IS NULL`; flips `encashed → approved` (restoring `expiry_date` semantics — the row's `expiry_date` was never cleared), re-credits the wallet, cancels the adjustment, `status='cancelled'`.

**EC-27 closed, both directions:** an encashed comp-off is not `'approved'`, so `comp_off_expiry_sync.cron` (which filters `status='approved'`) can never lapse it; and the wallet debit means it can never fund a CO leave. An *expired* comp-off is not `'approved'` either, so it can never be encashed. The two paths are mutually exclusive by the row's state machine, under a row lock.

### 5.6 EC-32 perquisite and EC-33 §80D (D-51)

**EC-32 — employer benefit contribution as a taxable perquisite.**

Adding the `employer_contribution` line to `realEarningLines` would be **wrong**: it would inflate `gross_earnings`, the PF wage, the ESI eligibility base and the PT gross, and break the EC-17 `Σ(earning lines) == gross_earnings` reconciliation. Instead:

1. `payroll_calculation` Step 6c: while emitting benefit employer lines, accumulate `perquisitePaise += amt` when the plan has `employer_contribution_taxable === true`. The line is emitted exactly as today (`component_type='employer_contribution'`, into `ctc_cost`).
2. Pass `statutoryContext.perquisitePaise` to `computeStatutory`.
3. `computeStatutory`: `taxableEarningsPaise = Σ(is_taxable earnings) + perquisitePaise`. **Only** that base. `pfBasePaise`, `esiEligibilityPaise`, `ptGrossPaise` and `hraReceivedMonthlyPaise` are untouched.
4. Persist `payroll_run_items.perquisite_amount`; record it in `statutory_snapshot.perquisite` so the payslip, the register and Form 16 can all explain the gap between gross and taxable.

Because `taxable_earnings` is the column the FY scan, `employee_tax_summary`, the annual statement and Form 16 Part B all read, the perquisite reconciles everywhere **with no further change**.

**EC-33 — employee premium auto-credited to §80D.**

`projectAnnualTax` already caps and traces `deductions.chapter_via.injected[section]` (fact 17). So:

1. Accumulate `premiumBySection` from benefit **employee** contributions whose plan sets `employee_premium_tax_section`.
2. Annual basis = `monthly_premium × (count of FY months the enrollment window overlaps)`. Computed from `enrolled_from`/`enrolled_to`, which the engine already loads. **Not** `× 12` (wrong for a mid-year enrollment) and **not** a YTD scan (no per-section YTD column exists, and adding one would be new plumbing for a figure that is a flat monthly amount by construction). Stable month to month, so TDS does not oscillate. A mid-year contribution-amount edit makes it an estimate — the same property every projection input has; emit `BENEFIT_80D_BASIS_ESTIMATED` and record it as accepted.
3. `injected[section] = (injected[section] || 0) + annualPremium` — after the existing `injected['80C'] = epfAnnual`. A section absent from `regime.chapter_via_limits` contributes 0 and is traced; a `new`-regime employee (`allows_chapter_via=false`) is unaffected.

**Two independent version counters.** `payroll_runs.engine_version` goes 5 → 6 (the run engine). `employee_tax.service.js:58` carries its **own** `const ENGINE_VERSION = 4`, stamped into the persisted tax summary at `:440`; EC-33 changes that service's projection output, so it goes 4 → **5**. The two are separate sequences and must never be "aligned" — doing so would relabel historical summaries (F-9).

**Both changes land in two call sites (fact 18):** `statutory_calculation.service.js` (the run engine) **and** `employee_tax.service.js` (`/me/tax/projection` and the HR projection read). A test asserts the two produce identical projections for one fixture — otherwise an employee's projection endpoint disagrees with their own payslip.

`benefit_plan.service` validates `employee_premium_tax_section` against a whitelist of the sections the tax tables know (`80C, 80CCD1B, 80D, 80E, 80G, 80TTA`) and refuses `80C` for a premium (that channel belongs to EPF; double-injection would over-shelter). Its header comment's D-37 note is replaced with a pointer to D-51.

**`engine_version` 5 → 6.** Existing `approved`/`paid` runs keep 5 and are never recomputed (D-12). A `draft`/`calculated` run recalculated after deploy is written as 6 — and if that tenant has no tax-flagged plan and no sibling run, its numbers are unchanged (§9.5).

### 5.7 Automation

Four crons, each a bare `cron.schedule(…, { timezone: 'Asia/Kolkata' })` calling one method on `payroll_automation.service`. All bodies take `{ orgId = null }` — `null` iterates every org with `payroll.access` and a `payroll_settings` row (cron only), a set value restricts to that org (the HTTP trigger path, **F-13 §16**); a failure on one org is caught, logged and does not stop the loop (per-org isolation).

| File | Schedule | Body | Manual trigger |
|---|---|---|---|
| `payroll_calendar_reminders.cron.js` | `0 8 * * *` | four reminders (below) | **#212** |
| `payroll_auto_draft.cron.js` | `0 2 * * *` | on `payroll_auto_draft_day`, if `payroll_auto_draft_enabled` and no live regular run for the period → `payrollRunService.create()`. The period is **the most recent one whose `period_end` is strictly before today**, via `payroll_period.utils` (**F-14 §16**). Never calculates, never approves. | **#213** |
| `payroll_run_sweeper.cron.js` | `*/10 * * * *` | `status='calculating' AND calculation_started_at < now() − STALE_CALCULATION_MS` → `failed`, `failure_reason='calculation_stale_swept'`, audited. Reuses the existing constant, so the cron and the manual stale-claim recovery on `calculate()` can never disagree. | **#214** |
| `payroll_attachment_sweeper.cron.js` | `30 3 * * *` | `pending` older than 24 h → row deleted + best-effort object delete; `deleted` older than `payroll_attachment_retention_days` → row hard-deleted + object delete, **excluding `owner_type='form16_part_a'` unconditionally (F-10 §16)**. Object deletion failures are logged and the row is **kept** for the next pass (never orphan the pointer before the object). | **#215** |

**The four reminders**, each claimed by a watermark so a double-fire sends once:

```sql
UPDATE payroll_settings SET last_cutoff_reminder_on = :today
 WHERE org_id = :orgId AND last_cutoff_reminder_on IS DISTINCT FROM :today
 RETURNING id
```

Zero rows returned → another instance already claimed it → skip. Same idiom as Phase 6's `email_status` claim (**D-43**), no leader election.

1. **Attendance cut-off** — `today == attendance_cutoff_day` → HR email.
2. **Pay-day** — `today == pay_day` and no `approved`/`paid` regular run for the run's period → HR email naming the period and the run's current status. **Also lists un-reconciled arrear drift** for the last three closed periods (a cheap `computeDrift` headcount, not the full diff), which is what stops an R2 retro increment from being forgotten.
3. **Declaration window opening** — `today` is day 1 of `tax_declaration_window_start_month` → employee-facing email to members with no submitted declaration for the FY.
4. **Proof deadline approaching** — 14 days before `tax_proof_deadline_{month,day}` → email to employees with `submitted` declarations holding unverified items. **This is a reminder only** — Phase 4's basis switch remains a pure function of the run's period and the frozen `proof_deadline` and is never written by a cron.

**`runStartupCatchUp()`** (mirroring `leave_rollover.service`, called from the `server.js` 30-second `setTimeout`, wrapped in try/catch, never able to fail boot): sweep stranded `calculating` runs immediately (a crash during calculation is exactly the case node-cron will not replay), and, if today is on or after `payroll_auto_draft_day` and the period has no live run, create the draft. Reminders are **not** caught up — a missed reminder is noise, and sending yesterday's cut-off notice is worse than sending none.

**Three details the review pinned down:**

* **Tenant scoping (D-70, F-13).** Each service method takes `{ orgId }` and every query inside it carries `org_id`; the cron is the only caller that loops orgs (`findOrgsWithPayrollEnabled()`), and it calls the method once per org inside its own try/catch so one tenant's failure cannot abort the tick. The manual triggers **#212–#215 pass `req.user.org_id` and nothing else** — an org-unscoped trigger would let one tenant's HR advance another tenant's payroll state.
* **Which period the auto-draft creates (F-14).** The cron resolves `period_month` with the **same helper #38 uses**, not `today.slice(0, 7)`. With a non-calendar `payroll_cycle` and a `payroll_auto_draft_day` early in the month those two disagree, and drafting the wrong month creates a run for a period whose attendance cut-off has not passed. The idempotency check is `findLiveByPeriod(orgId, resolvedPeriod, REGULAR, { transaction })` on that resolved period, backed by the existing unique index.
* **What the attachment sweeper may delete (F-10, EC-102).** Only `status='pending'` rows older than 24 h **and** `owner_type IN ('reimbursement_claim_item', 'investment_declaration_item')`. `form16_part_a` objects are statutory-retention artefacts that outlive both the claim lifecycle and employment itself; `owner_id` is polymorphic with no FK, so nothing else protects them. An exit likewise never deletes or detaches attachments.

Emails go through `email.utils` + the existing SES provider. Two new templates and two `TEMPLATE_MAP` entries. **No attachments** (`SendEmailCommand` cannot attach — D-42).


### 5.8 Funding a closed regular period — the `allowSupplementary` guard mode (F-2)

Without this, an off-cycle run can be created and calculated but **can never be given anything to pay**: `assertPeriodOpenForVariablePay` (`payroll_period_guard.service.js:47`) resolves the period's run with a hardcoded `REGULAR`, so once the regular run is approved it refuses every variable-pay input for that month — adjustments, loans, bonuses, and §5.2/§5.5's own notice recovery, encashment and loan foreclosure.

`assertPeriodOpenForVariablePay(orgId, periodMonth, transaction, { allowSupplementary = false } = {})`:

| Regular run state | `allowSupplementary = false` (default) | `allowSupplementary = true` |
|---|---|---|
| absent / `draft` / `calculated` / `failed` | unchanged: flag it `requires_recalculation`, return it | identical |
| `calculating` | unchanged `409 RUN_CALCULATION_IN_PROGRESS` | identical |
| `approved` / `paid` | `422 PERIOD_CLOSED_FOR_ADJUSTMENT` | resolve a live (`draft`/`calculated`/`failed`) `off_cycle` or `final_settlement` run for the period → flag **it** `requires_recalculation` and return it; `calculating` → `409 RUN_CALCULATION_IN_PROGRESS`; none → `422 NO_OPEN_SUPPLEMENTARY_RUN` |

Two further requirements:

* **Flag every live supplementary run**, not just the first — any of them may be the run that picks the input up. The existing guard flags only the regular run, which is the second half of this defect: an input created against a live supplementary run would otherwise leave it stale-but-unflagged, and the `RUN_STALE` gate at approve (D-18) would not fire.
* The existing 422 message's clause *"retro settlement is a future arrears feature"* is now false and must be replaced with the real remedy: *"target a later month, reconcile it as an arrear (#204), or create an off-cycle run for this period."*

**Callers that pass `allowSupplementary: true`:** F&F notice recovery, encashment approval, F&F loan foreclosure, and the HR adjustment create path **only** when the request carries an explicit `target_run_id` resolving to a live supplementary run. Every other caller keeps the default `false`, so today's behaviour and today's tests are untouched. `payroll_arrear.service` keeps `false` deliberately: an arrear routes to a later open month by design (§5.3) and must not land in a supplementary run of the closed month.

### 5.9 Sibling-safe reads and inputs (F-1, F-5, F-15)

Dropping the one-run-per-month index (§4.3) invalidates an assumption that three read paths and one write path silently rely on. Each was safe only because a second run per month was impossible.

**5.9.1 FY reads must fold, not overwrite (F-1) — the highest-severity read defect in the phase.**

`annual_statement.service.js:74` (`payslipByMonth.set(p.period_month, p)`), `:81` (`liveByMonth.set(it.run.period_month, it)`) and `employee_tax.service.js:1198` (`new Map(items.map((i) => [i.run.period_month, i]))`) each build a **one-row-per-month map from a multi-row result set**. Last write wins. The FY queries do *not* filter `run_type` (`findFyItemsForUser` / `findFyStatutoryItemsForUser` filter only `status IN ('approved','paid')` plus the month list), so a supplementary run's row is fetched and then discarded — an employee with a regular *and* an F&F payslip in one month has one of them vanish from the annual statement (#184/#185/#192/#193) and the self monthly statutory statement (#121), while Form 16 Part B reports both. An employer-issued tax document disagreeing with the employer's own statement is a compliance incident.

* `annual_statement.build` — `payslipByMonth` and `liveByMonth` become `Map<month, Array>`; `monthsNeedingLive` excludes a month only when a **visible** payslip covers it; `_snapshotMonth` / `_liveMonth` run per entry and sum into the existing `TotalsAccumulator` / `ComponentSections`, which already accumulate correctly. The month row gains `entries: [{ run_id, run_type, … }]` and reports summed figures.
* **Held-payslip suppression is per payslip, not per month (F-15).** `annual_statement.service.js:93-97` currently treats "a payslip exists but is not visible" as *blank the whole month, never fall back to live*. One month can now hold a visible regular payslip and a held F&F payslip: the visible one must still report, the held one must be suppressed without blanking the month, and the held one must not fall back to its live item.
* `employee_tax.getSelfMonthly` (#121) — accumulate across items per month instead of keying one.
* **No change** to `findFyStatutoryMonthlyTotalsForOrg` (#118, SQL `GROUP BY period_month` with `SUM`s) or to Form 16's quarterly block (`employee_tax.service.js:274`, iterates and accumulates). Both are already sibling-safe; do not "fix" them.

**5.9.2 Input contention between siblings is resolved at calculate (F-5).**

`_commitVariablePay` already refuses an input another run has stamped — `ADJUSTMENT_ALREADY_APPLIED`, `REIMBURSEMENT_ALREADY_APPLIED`, `LOAN_INSTALLMENT_ALREADY_DEDUCTED`, each under `FOR UPDATE`. That guard is correct and is why Phase 7 adds no new anti-double-pay check; the money is safe in every ordering. But siblings make it reachable through normal operation for the first time: if an off-cycle run and the regular run are both *calculated* while one pending adjustment exists, both items include it, the first approval stamps it, and **the second approval hard-fails and cannot proceed until HR recalculates** — a 409 at approve, after a clean preview, during a payroll close.

* At **calculate**, a cohort-restricted run excludes adjustments, claims and installments already referenced by a `calculated` sibling run for the same period (one repository read over `payroll_run_item_components` joined to sibling runs). First run to calculate wins the input; the other never includes it.
* `preview()` returns `contended_inputs: []` — anything a sibling has claimed since this run was calculated — so contention is visible *before* approval.
* The `_commitVariablePay` guard stays exactly as is: it is the backstop, and its message already names recalculation as the remedy.

---

## 6. API Surface — #195 … #218

24 endpoints. No existing endpoint's response shape changes; three gain **additive** fields.

### 6.1 HR — `/api/v1/payroll/hr` — `hrAuth`

| # | Method & path | Purpose |
|---|---|---|
| 195 | `POST /exits` | record an exit |
| 196 | `GET /exits` | list (filters: `status`, `user_id`, `from`/`to`, `exit_type`; **query validated in controller**) |
| 197 | `GET /exits/:id` | detail + prepared artefacts + linked F&F run |
| 198 | `PATCH /exits/:id` | correct LWD / notice / type / reason |
| 199 | `POST /exits/:id/cancel` | cancel (reason required) |
| 200 | `GET /exits/:id/settlement-preview` | the plan, nothing persisted |
| 201 | `POST /exits/:id/prepare-settlement` | idempotent; creates the adjustment inputs |
| 202 | `POST /exits/:id/settlement/reset` | reverse prepared artefacts (reason required) |
| 203 | `GET /arrears/drift` | `?period_month=&user_id=` — read-only drift report |
| 204 | `POST /arrears/reconcile` | commit arrear adjustments (`period_month`, optional `user_ids`, optional `target_period_month`, `reason` required) |
| 205 | `GET /arrears` | arrear adjustments with provenance (`source_period_month`, `arrear_batch_id`, `applied_run_id`) |
| 206 | `POST /employees/:userId/encashments` | create (comp-off or leave balance) |
| 207 | `GET /encashments` | list (filters `status`, `user_id`, `period_month`, `source_kind`) |
| 208 | `GET /encashments/:id` | detail |
| 209 | `POST /encashments/:id/approve` | the §5.5 transaction |
| 210 | `POST /encashments/:id/reject` | reason required |
| 211 | `POST /encashments/:id/cancel` | pre-approval, or post-approval reversal while un-applied |
| 212 | `POST /jobs/calendar-reminders/run` | manual trigger |
| 213 | `POST /jobs/auto-draft/run` | manual trigger |
| 214 | `POST /jobs/run-sweeper/run` | manual trigger |
| 215 | `POST /jobs/attachment-sweeper/run` | manual trigger |

### 6.2 Manager — `/api/v1/payroll/manager` — `authorize(['manager','hr'])`

| # | Method & path | Tier | Purpose |
|---|---|---|---|
| 216 | `POST /employees/:userId/encashments` | **B** | propose encashment for a direct report; lands `pending` unless `manager_direct_compensation_authority` |
| 217 | `GET /encashments` | **A** | scoped to `getAccessibleUserIds`; amounts hidden when `manager_can_view_team_compensation=false` (EC-25) |

Managers get **no** exit, arrear or job endpoints — exits and arrears are Tier C (org-level financial authority), consistent with parent §6.

### 6.3 Self — `/api/v1/payroll` — no `authorize()`

| # | Method & path | Purpose |
|---|---|---|
| 218 | `GET /me/encashments` | own encashment history (days, amount, status, period, payslip link) |

### 6.4 Extended existing endpoints (no new numbers, additive only)

| Endpoint | Addition |
|---|---|
| **#38** `POST /runs` | `run_type` now accepts `off_cycle` / `final_settlement`; new optional `user_ids`, `earnings_mode`, `exit_id`. `arrear` **rejected**. With `exit_id`, asserts `period_month === exit.settlement_period_month` → else `422 SETTLEMENT_PERIOD_MISMATCH` naming the prepared month and offering `settlement/reset` as the remedy (**F-12**) |
| **#37** `GET /runs/eligibility` | new `?run_type=&user_ids=` mode returning the cohort's readiness; new `already_settled` block (users with a closed full-earnings item for the period — §7.4) and `arrear_drift` summary |
| **#39/#40** run list/detail | expose `run_type`, `earnings_mode`, `cohort_size`, `source_exit_id` |
| **#42** `preview()` | new `perquisite_total` and `arrear_total` blocks; new `contended_inputs: []` (**F-5**); on an F&F run, surfaces `carry_forward_out > 0` as a warning (EC-80); `department_breakdown` untouched (D-46) |
| **#43/#44** item list/detail | `perquisite_amount`; component lines gain `category` and `source_period_month` |
| **#49** `cancel()` | refuses when a same-period sibling is `approved`/`paid` and was approved after this run → `409 SIBLING_RUN_DEPENDS_ON_RUN` (**F-6**) |
| **#50** `pay()` | additively stamps `employee_exits.settled_at`/`status='settled'` when `source_exit_id` is set |
| **#184/#185/#192/#193** annual statement | month rows gain `entries[]` and report **summed** figures across every run in the month (**F-1**); response shape is otherwise unchanged |
| **#121** self monthly statutory | accumulates across sibling runs per month (**F-1**) |
| **#138/#141** benefit plan create/update | `employer_contribution_taxable`, `employee_premium_tax_section` |
| **#20** structure approve | additive `arrear_required: { periods: [] }` on the response |
| **#22/#23** settings get/update | the #55–#57 knobs |

### 6.5 Validation

* Every list/report query is validated **in the controller** via `validateOrThrow` (Express 5 — fact 23).
* `user_ids`: `Joi.array().items(uuid).min(1).max(500).unique()`; `max(50)` for `final_settlement`.
* `period_month`: the existing `^\d{4}-(0[1-9]|1[0-2])$` pattern.
* `days`: `Joi.number().precision(2).positive().max(365)`.
* `reason` / `rejection_reason` / `cancellation_reason`: `trim().min(1).max(1000)`, **required** on every reversing or overriding action.
* `adjustment.category` continues to **reject `arrear` on the public create path (#57)** — an arrear may only be created by `payroll_arrear.service`, which sets the provenance columns. A hand-written `arrear` with no `source_run_item_id` would be invisible to the idempotency subtraction and could be raised twice.
* `run_type='arrear'` rejected (D-54).

---

## 7. Transactional Behaviour & Concurrency

### 7.1 Lock order — extends the Phase-5/6 total order. Acquire top-down; never reverse.

| Rank | Lock | Taken by |
|---|---|---|
| 0 | `pg_advisory_xact_lock('payroll:lock:{orgId}')` | period-lock create/adopt in `approve()` (unchanged) |
| 1 | `pg_advisory_xact_lock('payroll:run:{orgId}:{period_month}')` | every run lifecycle method, `periodGuard`, `foreclose`, exit correct/prepare/reset, `arrear.reconcile`, `encashment.approve` |
| 2 | `pg_advisory_xact_lock('payroll:exit:{orgId}:{userId}')` | **new** — exit lifecycle and F&F prepare/reset |
| 3 | `payroll:claim:{claimId}` · `payroll:benefit:{userId}` · `payroll:loan:{userId}` · **`payroll:encash:{userId}`** | their owning services |
| 4 | row `FOR UPDATE` | runs, items, adjustments, loans, installments, claims, exits, encashments, `attendance_comp_offs`, `leave_balances` |

**Two rank-1 locks in one transaction** (`arrear.reconcile` holds both target and source): **target first, then source**, always. Since a target is by construction a later month than its source, "later month first" is a fixed total order over rank-1 keys and no two reconciliations can deadlock. Stated here because it is the only place in the module that holds two keys of the same rank.

Rank 1 is **re-entrant within a transaction** (`pg_advisory_xact_lock` on the same key by the same transaction is free), which is why `foreclose` can take it again inside `prepare-settlement`.

### 7.2 Transaction boundaries

| Operation | Boundary |
|---|---|
| `record` / `correct` / `cancel` exit | one transaction each; `correct` and `cancel` also flag `requires_recalculation` via `periodGuard` |
| `prepare-settlement` | **one** transaction covering notice + all encashments + all loan foreclosures + the watermark. Partial preparation is not a state this system will hold. |
| `settlement/reset` | one transaction, exact inverse |
| `encashment.approve` | one transaction: comp-off flips + wallet debit + adjustment + audit |
| `arrear.reconcile` | one transaction for the whole batch; the recompute happens **inside** it |
| `computeDrift` (#203) | no transaction, read-only, `REPEATABLE READ` not required (it is advisory) |
| run `create` / `calculate` / `approve` / `cancel` / `pay` | unchanged Phase 2/6 boundaries |
| cron bodies | **one transaction per org, per action** — never one transaction across orgs |
| attachment sweep | one transaction per batch of ≤200 rows; the S3 delete is **outside** it (best-effort, retried next pass) |

### 7.3 Idempotency & duplicate-request matrix

| Action | Duplicate-request behaviour |
|---|---|
| `POST /exits` | second call → `409 EXIT_ALREADY_RECORDED` (partial unique index is the backstop) |
| `POST /exits/:id/prepare-settlement` | **200 with the existing plan** (`idempotent: true`). Never doubles an adjustment. |
| `POST /arrears/reconcile` | the already-raised subtraction (§5.3 step 4) makes the second call produce **zero deltas and zero rows**, not duplicates |
| `POST /encashments/:id/approve` | second call → `409 ENCASHMENT_NOT_ACTIONABLE` (status guard under `FOR UPDATE`); the comp-off rows are already `'encashed'` so even a bypass would fail step 4 |
| `POST /runs` off-cycle/F&F | no unique index (by design); the advisory lock + the §7.4 guard prevent the *harmful* duplicate (double earnings), while a genuinely-wanted second off-cycle run is allowed |
| A variable-pay input claimed by two sibling runs | resolved at calculate (§5.9.2) so it is included by one run only; `_commitVariablePay`'s `*_ALREADY_APPLIED` guards remain the backstop and are never expected to fire in normal operation |
| cron manual triggers | watermark claim → zero-row `UPDATE` → no-op; auto-draft → `findLiveByPeriod` → no-op |
| attachment sweep | re-selects by age; a row already deleted is simply absent |
| `pay()` F&F stamp | idempotent `UPDATE` to a constant terminal state |

### 7.4 INV-P7-1 — the duplicate-earnings invariant (the highest-severity guard in this phase)

> **For any `(org_id, user_id, period_month)`, at most one `calculated` item across all `approved`/`paid` runs may carry structure earnings (`earnings_mode='full'`).**

Without it: HR files an F&F run for a leaver on 12 March; the regular March run then computes that leaver's full March salary again → **the employee is paid twice**. The reverse order double-pays identically.

Enforcement, two layers:

* **Prevention at calculate.** `aggregate()` receives `excludeUserIds` = users with a `calculated` item in an `approved`/`paid` `earnings_mode='full'` run for this `period_month` (new repo method, one query, using the `(org_id, user_id, period_month)` index from §4.4). The item never gets built, so `preview()` shows the truth and HR is never surprised at approval.
* **Enforcement at approve.** Inside `approve()`, **after** the rank-1 advisory lock and before the status flip: if `earnings_mode='full'`, re-query the same set over this run's cohort. Non-empty → `409 DUPLICATE_FULL_EARNINGS` with `employee_codes`. Because the rank-1 key `payroll:run:{orgId}:{period_month}` is run-type-agnostic (fact 3), **all approvals for a period serialise**, so this check-then-flip is atomic. No DB constraint can express it (it spans the item→run join), and the advisory lock is what makes the service-level check sound rather than a TOCTOU.

Why not a partial unique index on denormalized item columns: `earnings_mode` and the run's closed-ness both live on the run; copying two more mutable run attributes onto every item to serve one constraint would create three denormalization drift risks to remove one. The lock is cheaper and already held.

### 7.5 Race conditions explicitly handled

| Race | Resolution |
|---|---|
| Two `prepare-settlement` calls for one exit | rank-2 `payroll:exit:{org}:{user}` + exit row `FOR UPDATE` + watermark → one prepares, the other returns the plan |
| `prepare-settlement` vs. regular-run approval for the same month | both take rank 1 for the month; prepare's `assertPeriodOpenForVariablePay` 422s if approval won, approval's `RUN_STALE`/`requires_recalculation` catches the other order |
| Encashment approval vs. comp-off expiry cron | both lock the `attendance_comp_offs` row; expiry filters `status='approved'` so whichever commits first makes the other's guard fail cleanly (`COMP_OFF_NOT_ENCASHABLE` / row skipped) |
| Encashment approval vs. a CO leave application | both take `leave_balances` `FOR UPDATE` via `getBalanceForUpdate`; the loser sees an insufficient balance |
| Two encashments over overlapping `comp_off_ids` | rank-3 `payroll:encash:{userId}` serialises; the row state machine rejects the second |
| Reconcile vs. reconcile (same source, same users) | rank-1 on target then source; the already-raised sum is read **inside** the transaction, so the second sees the first's rows and yields 0 |
| Reconcile vs. approval of the target run | target's rank-1 lock; `assertPeriodOpenForVariablePay` 422s if the run closed first |
| Off-cycle approval vs. regular approval, same month | rank 1 serialises; the second's `samePeriodPrior` query sees the first (its `FOR UPDATE`-free read is inside the serialised window) so statutory netting is correct in **either** order |
| Cancelling a run a sibling has netted against | `cancel()` already takes rank 1 for the period; it now refuses when a later-approved same-period sibling exists (`SIBLING_RUN_DEPENDS_ON_RUN`), making cancellation **LIFO within a period**. Without this, the sibling's frozen statutory stays short by the cancelled run's share forever — D-12 forbids recomputing it (**F-6**) |
| Two sibling runs calculating against one pending adjustment | both take rank 1 to calculate, so the exclusion read in §5.9.2 is serialised: the second run sees the first's `calculated` claim and omits the input |
| Exit correction while an F&F run is `calculating` | `periodGuard` throws `409 RUN_CALCULATION_IN_PROGRESS` (retryable) |
| Auto-draft cron on two instances | `findLiveByPeriod` + the partial unique index; loser gets `DUPLICATE_RUN` and logs a skip |
| Run sweeper vs. a live calculation finishing | the sweep is a conditional `UPDATE … WHERE status='calculating' AND calculation_started_at < :cutoff`; a finishing calculation has already moved to `calculated` and matches zero rows |
| Attachment sweep vs. a confirming upload | the sweep targets `pending` rows older than 24 h; confirmation flips to `available` under a row lock |

### 7.6 Partial failure & recovery

* **Prepare-settlement mid-way failure** → whole transaction rolls back; `settlement_prepared_at` stays NULL; the exit is re-preparable. No half-prepared state exists.
* **Reconciliation of 500 employees** → one transaction. If it is too large in practice, the documented remedy is to call #204 with `user_ids` batches — **not** per-employee autocommit, which would leave a period half-corrected with no record of where it stopped. The `arrear_batch_id` makes a batched sequence auditable.
* **F&F run item error** → the existing per-item isolation applies (`status='error'`, blocks approval until fixed or excluded). Unchanged.
* **Cron partial failure** → per-org try/catch; a failed org is retried on the next tick. Watermarks are claimed *before* the send (at-least-once on reminders, at-most-once-per-day), which is the right trade for a notification with no payload.
* **S3 delete failure in the sweep** → row retained, logged, retried. Never the reverse.
* **Crash during `calculate`** → swept to `failed` within 10 minutes by the new cron, or on next boot by `runStartupCatchUp`, or recovered manually by re-calling `calculate` (the existing 30-minute stale-claim path). Three independent recovery routes, one shared constant.

---

## 8. Edge Cases — EC-73 … EC-104

Parent-register cases this phase closes: **EC-2** (F&F half), **EC-6**, **EC-22** (F&F half), **EC-27**, **EC-31** (routing half), **EC-32**, **EC-33**.

| # | Edge case | Resolution |
|---|---|---|
| **EC-73** | Exit recorded with an LWD in an already-`paid` month | `prepare-settlement` 422 `PERIOD_CLOSED_FOR_ADJUSTMENT`; the F&F must target the next open month as `supplementary_only`, and the closed month's shortfall (if any) goes through #204 arrears |
| **EC-74** | LWD corrected **after** settlement was prepared | 409 `SETTLEMENT_ALREADY_PREPARED` — reset first. Silently re-deriving encashment days from a changed LWD would leave frozen amounts disagreeing with their basis. |
| **EC-75** | LWD corrected after the F&F run is `approved` | refused (`EXIT_ALREADY_SETTLED` once `settled`; `RUN_NOT_…` while approved). D-12: the correction is an arrear in a later month. |
| **EC-76** | Employee with an exit record rejoins | `cancel` the exit (auto-reset if prepared) and, if needed, record a new joining via the profile. The partial unique index permits a second exit once the first is `cancelled`. |
| **EC-77** | Exit whose LWD precedes the employee's joining date | 422 at `record` |
| **EC-78** | Two live exits for one employee | partial unique index → `409 EXIT_ALREADY_RECORDED` |
| **EC-79** | F&F for an employee with **no** approved salary structure | item lands `error` `NO_SALARY_STRUCTURE` (EC-13 unchanged); notice/encashment rate resolution 422s at prepare, *before* anything persists |
| **EC-80** | Notice recovery exceeds net pay | the existing `negative_net_handling` path (clamp + `carry_forward_out`) applies unchanged. **Documented consequence:** the shortfall is carried, and on a final settlement there is no later run to recover it from — `preview()` surfaces `carry_forward_out > 0` on an F&F run as a warning HR must act on outside payroll. Not silently written off. |
| **EC-81** | Leave encashment when the balance is 0 or the type code is missing/inactive | skipped with a warning in the plan, never a ₹0 encashment row |
| **EC-82** | Encashment days exceed `max_days` | clamped to the cap; the clamp is reported in the plan and the audit row |
| **EC-83** | Comp-off already `used` / `expired` / `cancelled` at approval time | `409 COMP_OFF_NOT_ENCASHABLE` naming the id; whole transaction rolls back |
| **EC-84** | Comp-off expires **between** proposal and approval | the `expiry_date >= today` assertion is re-evaluated at approval under the row lock → rejected. The frozen amount is never paid for a lapsed day. |
| **EC-85** | Encashment approved, then the target run is cancelled | `_reverseVariablePay` un-applies the adjustment (`applied_run_id → NULL`); the encashment stays `approved` and is picked up by the next run. The wallet stays debited — correct, the day is still spent. |
| **EC-86** | Off-cycle run in a month whose regular run is `paid` | allowed; `samePeriodPrior` nets every statutory head (§5.4); `earnings_mode='supplementary_only'` means no structure earnings; INV-P7-1 is satisfied because the off-cycle run is not `full` |
| **EC-87** | F&F run approved **before** the regular run, same month | INV-P7-1 blocks the regular run from re-paying that employee (`excludeUserIds` at calculate; 409 at approve). The regular run for everyone else proceeds normally. |
| **EC-88** | Off-cycle run with a cohort user who is not in the population | 422 at create listing the ids, rather than an empty run |
| **EC-89** | Reconciliation for a period whose run was `cancelled` | no closed run → 404 `NO_CLOSED_RUN_FOR_PERIOD`. A cancelled run paid nothing, so there is nothing to correct. |
| **EC-90** | Drift that nets to exactly zero (a leave re-approved identically) | no adjustment rows created; the audit records a `arrear.reconciled` with `deltas: []` so the operator sees the check happened |
| **EC-91** | Perquisite pushes an employee's *taxable* income up but not their gross | intended. `gross_earnings` is unchanged; `taxable_earnings` rises; the payslip and Form 16 both show `perquisite_amount` so the difference is explainable. PF/ESI/PT bases are provably untouched (§9.4 asserts it). |
| **EC-92** | §80D injection for an employee on the **new** regime | `allows_chapter_via=false` → `projectAnnualTax` ignores `injected` entirely; the premium still deducts from net as an ordinary benefit line. No change, traced. |
| **EC-93** | A month holds **two** approved runs (regular + off-cycle) | every FY reader must fold them. `getEmployeeAnnual`/`getSelfAnnual` return one row per month whose figures are the **sum** of that month's runs plus an `entries[]` breakdown; #121 accumulates; Form 16's quarterly SQL already folds. Before **F-1**'s fix a `Map` keyed on `period_month` kept only the last row, so Form 16 reported income the statement denied. |
| **EC-94** | Adjustment/encashment approved for a month whose regular run is `paid`, while an off-cycle run for that month is `draft` | with `allowSupplementary` (§5.8) the guard flags the **off-cycle** run `requires_recalculation` and the input funds there. Without it the approval 422s and the off-cycle run could never be funded. |
| **EC-95** | Closed run stamped `engine_version` outside `RECONCILABLE_ENGINE_VERSIONS` | `422 ENGINE_VERSION_NOT_RECONCILABLE` naming the stamped and reconcilable versions. Recomputing a v3 run with v6 code would pay engine differences as arrears. |
| **EC-96** | Closed item's snapshot missing a key the recompute needs (pre-Phase-3 row, or a curated-allow-list gap) | `422 SNAPSHOT_INCOMPLETE` naming the key. Defaulting the missing input silently manufactures a delta. |
| **EC-97** | Reconciling a month an employee had **no** attendance window for (joined after / exited before) | the aggregator returns `null`; the user is **skipped** (`skipped[].reason='recompute_unavailable'`), never clawed back. Treating `null` as a zero-day month would reverse a legitimately-paid full month (**F-4**). |
| **EC-98** | Drift ≥ 99 % of the frozen gross for a user | `FULL_REVERSAL_SUSPECTED` in `skipped[]` unless the caller passes `allow_full_reversal: true`. A structure or cohort mistake surfaces as an operator decision instead of a negative net. |
| **EC-99** | One pending adjustment, two sibling runs calculating | the exclusion read in §5.9.2 runs under the rank-1 lock, so exactly one run claims it; `preview()` reports it in `contended_inputs`. `_commitVariablePay`'s `ADJUSTMENT_ALREADY_APPLIED` remains the backstop. |
| **EC-100** | Cancelling a run that a later-approved same-period sibling netted against | `409 SIBLING_RUN_DEPENDS_ON_RUN`. Cancellation is **LIFO within a period**: cancel the sibling first. The sibling's statutory is frozen and D-12 forbids recomputing it, so allowing the cancel would under-remit PF/PT/TDS permanently. |
| **EC-101** | Encashing a comp-off **earned** in a prior calendar year | the wallet debit groups requested ids by `YEAR(earned_date)` and debits each `(user, type, year)` balance row by its own count; a missing row → `409 CO_WALLET_MISSING` naming the year. Debiting the current year's row for last year's day corrupts both wallets (**F-7**). |
| **EC-102** | F&F settlement for an employee holding `form16_part_a` attachments | nothing is deleted or detached. `payroll_attachments.owner_id` is polymorphic with **no FK**, so an exit must not cascade; statutory retention outlives employment. Exit only stamps `settled_at`. |
| **EC-103** | One of a month's two payslips is `held` | suppress **that entry only** — the month still reports the other run's figures with `entries[]` marking the held one. Blanking the whole month (the pre-**F-15** idiom) hides income the employee was actually paid. |
| **EC-104** | HR manually triggers a Phase 7 job | the trigger runs for **`req.user.org_id` only**; the cron's own scheduled pass is the multi-tenant one. An org-unscoped manual trigger would let one tenant's HR move another tenant's payroll state. |

---

## 9. Tests

`node --test tests/unit` (D-10). Baseline **792 passing**; Phase 7 must not reduce it.

### 9.1 New pure-util suites (the bulk of the value)

| Suite | Asserts |
|---|---|
| `arrear_diff.test.js` | per-component deltas; added/removed components; the already-raised subtraction yielding 0 on a repeat and only the increment on a second drift; sign/direction mapping; flags copied from the frozen snapshot, not the live catalog; paise-exact, no float; **only `source IN ('structure','overtime')` lines enter the diff** — an `adjustment`/`loan`/`reimbursement` line present in one side and absent in the other produces **no** delta (F-16) |
| `encashment_rate.test.js` | all three rate bases × all three divisors; `max_days` clamp; a zero/negative balance; rounding to 2dp |
| `notice_recovery.test.js` | shortfall arithmetic; waiver; override; served > period; negative clamped to 0 |
| `exit_window.test.js` | the three-level precedence; LWD before period start; LWD after period end; no exit record (D-15 fallback) |
| `statutory_netting.test.js` | with `samePeriodPrior`: PT charged once for the month and at the **cumulative** slab; PF ceiling applied cumulatively; ESI continuation sees the sibling; TDS incremental; the ≥0 floor and its warning. **With `samePeriodPrior = null` the output equals the Phase-6 fixture byte-for-byte.** |
| `perquisite_basis.test.js` | perquisite reaches `taxable_earnings` **only**; `gross_earnings`, `pf_wage`, `esi_wage`, PT gross all unchanged; `Σ(earning lines) == gross_earnings` still holds |
| `chapter_via_80d.test.js` | injection capped by `chapter_via_limits['80D']`; enrollment-window month count; `80C` refused for a premium; new-regime no-op; the trace |
| `supplementary_earnings_mode.test.js` | `supplementary_only` emits no structure/LOP/OT/benefit/EMI lines; an empty supplementary item errors rather than paying ₹0 |
| `arrear_target_resolution.test.js` | `arrearTargetFor` skipping closed months; no open month → clear error |
| `cohort_restriction.test.js` | `restrictToUserIds`/`excludeUserIds` as set operations; unknown id reported; empty restriction ≠ whole org |
| `automation_watermark.test.js` | the conditional-`UPDATE` claim: two concurrent claimants, one send; same-day re-run is a no-op; date rollover re-arms |

### 9.2 Extended existing suites

`payroll_calculation.test.js` (earnings modes, perquisite), `statutory_calculation.test.js` (netting branch), `tax_projection.test.js` (§80D injection), `payroll_settings_schema.test.js` (**model↔migration parity for all ~22 new columns** — the assertion that prevents Phase 6's Step-0 defect recurring), `authority.test.js` (exit/arrear = Tier C, encashment = Tier B).

### 9.3 Service-level tests (mocked repositories, the Phase 2–5 pattern)

`fnf_settlement.test.js` (prepare idempotency; reset inverse; loan `foreclose` called with the right args, not reimplemented; `settlement_period_mismatch` on #38), `payroll_arrear_service.test.js` (frozen policy + live facts; transaction-internal recompute; batch id), `encashment_service.test.js` (both adapters; the EC-27 dual debit; reverse), `duplicate_full_earnings.test.js` (**INV-P7-1 in both orders**), `run_sweeper.test.js`, `attachment_sweeper.test.js` (row kept when the object delete fails).

Six suites exist specifically to hold the §16 fixes:

| Suite | Asserts | Fix |
|---|---|---|
| `annual_statement_sibling_fold.test.js` | a month with a regular **and** an off-cycle approved run returns one row whose gross/statutory are the **sum**, with a two-element `entries[]`; a `held` payslip suppresses only its own entry (EC-103); the live-item fallback folds the same way | F-1, F-15 |
| `self_monthly_statutory_fold.test.js` | #121 for that month equals the statement row and equals Form 16's quarterly figure for the containing quarter — the three-way equality that the month-keyed `Map` broke | F-1 |
| `period_guard_supplementary.test.js` | all six cells of the §5.8 table: default mode unchanged on every state (**the regression guard for Phases 3–6 callers**); supplementary mode adopting a `draft` off-cycle run, 409 on `calculating`, `NO_OPEN_SUPPLEMENTARY_RUN` when none exists | F-2 |
| `arrear_admissibility.test.js` | `engine_version` 4 → `ENGINE_VERSION_NOT_RECONCILABLE`; 5 and 6 both admitted; a snapshot missing a needed key → `SNAPSHOT_INCOMPLETE` naming it; both refusals happen **before** any adjustment row is built | F-3 |
| `arrear_skip_and_brake.test.js` | `aggregate()` returning `null` → `skipped[].reason='recompute_unavailable'` and **no** negative adjustment (EC-97); drift ≥ 99 % of frozen gross → `FULL_REVERSAL_SUSPECTED`, then admitted with `allow_full_reversal: true` (EC-98) | F-4 |
| `run_cancel_lifo.test.js` | cancelling a run with a later-approved same-period sibling → `409 SIBLING_RUN_DEPENDS_ON_RUN`; cancelling the sibling first, then the original, succeeds; an *earlier*-approved sibling does not block | F-6 |
| `encashment_wallet_year.test.js` | ids spanning two `earned_date` years debit two balance rows by their own counts; a missing row → `CO_WALLET_MISSING` naming the year; `current_balance` is **never clamped** at 0 — a would-be-negative result means a wallet bug and must surface (EC-101) | F-7, F-8 |

### 9.4 The invariant tests that matter most

1. **INV-P7-1** — F&F-then-regular and regular-then-F&F both leave exactly one full-earnings item per `(user, period_month)`.
2. **Statutory idempotence across a split month** — one employee paid ₹X in a regular run plus ₹Y in an off-cycle run in the same month has **identical** PT, and PF/ESI/TDS equal to a single ₹(X+Y) run, to the paise. This is the single test that proves §5.4. The assertion is on the **statutory heads**, not on `net_pay`: `net_pay_rounding` applies per item, so two items can legitimately differ from one combined item by up to `(runs − 1)` rupees of rounding. Asserting rounded net would make a correct implementation fail (F-11).
3. **Arrear round-trip** — approve a run, back-date a leave, reconcile, approve the next run: `Σ(all items for the employee across both runs) == Σ(a single correct run over both periods)` on gross earnings.
4. **EC-27** — an encashed comp-off is neither expirable by the cron nor spendable as CO leave; an expired one is not encashable.
5. **Perquisite containment** — `pf_wage`, `esi_wage`, PT gross and `gross_earnings` are bit-identical with the flag on and off; only `taxable_earnings` and `income_tax_amount` move.
6. **One month, two runs, three readers agree** — for a month carrying two approved runs, the annual statement (#184/#192), #121's monthly statutory, and Form 16 Part B's quarterly block report the **same** gross and the same PF/PT/TDS. Form 16's SQL folds by construction, so this invariant is what pins the other two to it; its absence is what let F-1 exist in the first place.

### 9.5 The `engine_version` 5→6 no-op proof  *(a functional dependency of arrears — F-3 §16)*

Re-run every existing calculation fixture under Phase-7 code with **no** tax-flagged benefit plan and **no** sibling run, and diff the persisted item + component rows against the Phase-6 expectations. **Zero differences required.** This is the gate that lets the version bump ship without re-verifying six phases of arithmetic by hand.

### 9.6 Edge-case register coverage

An assertion listing EC-1 … EC-104 against the test (or the documented deliberate decision) that resolves each. Parent §8 exit criterion: *"Every edge case in §9 has a test or a documented, deliberate decision."* The list is produced as a table in the completion report, not inferred.

### 9.7 Security pass (parent §8)

Over **all 218 endpoints**, mechanically:
1. Every route carries `authenticate` + `requireFeature('payroll.access')`; no route admits `admin`/`super-admin` (**D-14**).
2. Every HR route is `authorize(['hr'])`; every manager route filters through `getAccessibleUserIds`; every self route derives the user from `req.user.id` and **never** from a path or body parameter.
3. ID substitution on every `:userId`/`:id`: cross-tenant → 404 (never 403 — existence must not leak); in-tenant out-of-hierarchy → 403/404 per the EC-24 convention.
4. No salary figure, bank number, PAN or storage key in any error message, audit `new_values`, or log line. Grep-enforced for the new code.
5. Bank account numbers masked on read everywhere but the bank advice (D-49).
6. `manager_can_view_team_compensation=false` collapses #217 and every Phase-7 manager read to aggregates (EC-25).

### 9.8 Performance measurement (parent §7, deferred to this phase)

Seeded 1,000-employee org, one month of attendance/leave/OT. Record and publish:
* `aggregate()` wall time and **query count** — must be O(source tables × cohorts), not O(employees × days);
* `calculate()` end-to-end;
* `approve()` end-to-end (Phase 6's payslip composition included);
* `computeDrift()` over 1,000 items;
* peak RSS.

**Fix only what the measurement condemns.** No speculative optimisation. If `approve()` exceeds Phase 6's +40 % threshold (risk 1 there), that phase's documented post-commit fallback becomes live scope — and is built then, not now.

---

## 10. Exit Criteria

- [ ] Migration `00048` applied by the user; every table, column, CHECK and index of §4 present; the `period_month` backfill verified `NOT NULL` with zero nulls.
- [ ] An exit recorded for an inactive employee **removes** their recurring `EXIT_DATE_REQUIRED` error item, and they are absent from the next month's run.
- [ ] `prepare-settlement` called twice produces one set of artefacts; `reset` restores the wallet and the comp-off rows exactly.
- [ ] An F&F run over a mid-month leaver with a part-served notice, one encashable leave type with a balance, one active loan and one unpaid reimbursement produces **hand-verifiable** figures.
- [ ] **INV-P7-1 holds in both orders** (§9.4-1).
- [ ] **§9.4-2 passes to the paise** — split-month statutory equals single-run statutory.
- [ ] A back-dated leave approval on a `paid` period, reconciled, pays exactly the difference in the next run; reconciling again creates nothing.
- [ ] A retro increment into a closed month returns `arrear_required` and reconciles to the correct delta.
- [ ] An encashed comp-off is neither expired by the cron nor usable as CO leave (**EC-27**).
- [ ] A benefit plan with `employer_contribution_taxable` raises `taxable_earnings` and `income_tax_amount` and **nothing else** (§9.4-5).
- [ ] `employee_tax.service` and `statutory_calculation.service` produce identical projections for one fixture (fact 18).
- [ ] **§9.5 no-op proof: zero diffs** on existing fixtures under `engine_version` 6.
- [ ] **A month with two approved runs reports the same figures through all three readers** — annual statement, #121 and Form 16 Part B's quarterly block agree (§9.4-6). This is the F-1 gate: it must pass before any off-cycle run reaches a production tenant.
- [ ] An adjustment approved for a `paid` month whose off-cycle run is `draft` **funds that run** (`allowSupplementary`, §5.8); the same call without the flag still 422s `PERIOD_CLOSED_FOR_ADJUSTMENT` for every Phase 3–6 caller.
- [ ] Reconciling a run stamped `engine_version` 4 returns `422 ENGINE_VERSION_NOT_RECONCILABLE`; a snapshot missing a needed key returns `422 SNAPSHOT_INCOMPLETE`; neither writes a row.
- [ ] Reconciling a period an employee had no employment window for **skips** them (`recompute_unavailable`) instead of reversing the month; a ≥ 99 % drift is held back as `FULL_REVERSAL_SUSPECTED` until `allow_full_reversal` is passed.
- [ ] Cancelling a run whose same-period sibling was approved later returns `409 SIBLING_RUN_DEPENDS_ON_RUN`; cancelling in LIFO order succeeds.
- [ ] Encashing comp-offs earned in two different calendar years debits **two** wallet rows by their own counts; a missing wallet row returns `409 CO_WALLET_MISSING` naming the year.
- [ ] Four crons registered, `linux`-guarded, `Asia/Kolkata`; each manual trigger works; each is a proven no-op on a second same-day call; `runStartupCatchUp` sweeps a stranded `calculating` run.
- [ ] Performance numbers from §9.8 **recorded in the completion report** — measured, not estimated.
- [ ] §9.7 security pass: no salary leak across tenant or hierarchy boundary; findings table empty or each item resolved.
- [ ] §9.6 coverage table complete for EC-1 … EC-104.
- [ ] `npm test` ≥ 792 passing, 0 failing, with every §9.1 suite present.
- [ ] Docs: `api_registry.md` + `combined_api_analysis.md` carry #195–#218; `org_settings_registry.md` carries #55–#57; the parent's stale line-3 STATUS banner rewritten; D-51…D-70 recorded in the parent §3; EC-73…EC-104 in parent §9; the Phase 1–7 completion report written.

---

## 11. Risks & Decisions

### 11.1 Decisions — D-51 … D-70

**D-51 — Perquisite and §80D enter through dedicated bases, never through `realEarningLines`.** A taxable employer contribution adds to `taxableEarningsPaise` only; an §80D premium adds to `chapter_via.injected`. Rationale: putting an `employer_contribution` line into the earnings array would inflate gross, the PF wage, the ESI base, the PT base and break EC-17 reconciliation. `projectAnnualTax` is **not modified** — the `injected` channel (EC-44) already does exactly what EC-33 needs. Both changes are mirrored into `employee_tax.service` because the projection logic exists twice (fact 18).

**D-52 — Off-cycle runs stay keyed to a calendar `period_month`.** An arbitrary date window would break six things at once: the `payroll:run:{org}:{period}` advisory key, the `payroll_runs` unique index, `financialYearOf`/`fyMonths` FY resolution, the ESI contribution-period partition, the `payslips` `(run_id, user_id)` + period identity, and every `period_month`-keyed report and registry entry. An off-cycle run is a *second run inside a month*, not a run over a custom range. If custom ranges are ever needed they are a new phase with its own period abstraction.

**D-53 — An arrear is an ordinary `payroll_adjustments` row with provenance, computed as an earnings-side diff of frozen-vs-live, paid by the next open run through the unmodified engine.** No new engine path, no new money table. Statutory is deliberately **excluded from the diff** and recomputed in the paying month on the arrear's own wages — correct practice, and the only formulation under which TDS stays one monotonic YTD true-up. Idempotency comes from subtracting already-raised arrears, which also makes a *second* later drift raise only its increment.

**D-54 — `run_type='arrear'` and `component.source='arrear'` stay reserved and unused.** D-12 settles arrears as lines in the next run, so an arrear *run* has no purpose. More sharply: `_commitVariablePay` stamps `applied_run_id` only on lines with `source IN ('adjustment','loan','reimbursement')`; an arrear line carrying `source='arrear'` would **never be stamped and would be re-paid by the following run**. Arrears therefore keep `source='adjustment'` and are identified by the newly-persisted `category='arrear'` (§4.4).

**D-55 — `off_cycle` and `final_settlement` runs adopt a period lock but never create one.** `attendance_lock_periods` has no `user_id` (fact 1), so a single-leaver F&F creating a lock would freeze attendance for the whole org mid-month. Adopt a fully-covering lock if one exists (`lock_reused=true`); otherwise approve with `lock_period_id=NULL`. The existing cancel guard (`lock_reused === false && lock_period_id`) already handles NULL, so no cancel-path change is needed. The input-drift risk this accepts is precisely the arrears case, which this phase now handles.

**D-56 — Same-period statutory netting.** For a run with closed sibling runs in its `period_month`, every statutory head is computed on the month's cumulative basis minus what the siblings charged, floored at 0. One rule, all heads, no per-head branching. Delivered as a **separate** repository query so `findStatutoryPeriodAggregates`'s `period_month < X` semantics and its tests are untouched. Provably inert for all existing data because the old unique index made same-month siblings impossible.

**D-57 — One reminder cron, four reminder kinds, four watermarks.** Parent §8 lists cut-off, declaration-window and (implicitly) pay-day reminders. Four cron files firing daily against the same org list would be three redundant scans. Claiming is a conditional `UPDATE … RETURNING` on a per-kind DATEONLY watermark — the Phase-6 D-43 idiom, multi-instance safe, no leader election. Reminders are **not** replayed by `runStartupCatchUp`: yesterday's cut-off notice is worse than none.

**D-58 — Payroll writes cross-module state through the other module's *repositories*, never its services or models.** Encashment updates `attendance_comp_offs.status` via `compOffRepository.updateById` and `leave_balances` via `leaveBalanceRepository.getBalanceForUpdate`/`update`, inside payroll's transaction. This follows parent D-2 ("consumes existing *repositories*, never other modules' models directly") and means **no live Leave or Attendance service code is edited in this phase**. `'encashed'` needs no migration because the status column is `STRING(20)` and is inert to every attendance read (fact 11/12). The accepted cost: the CO wallet debit duplicates three lines of balance arithmetic that `comp_off.service` also contains. That is cheaper and far safer than adding a payroll-shaped method to a live attendance service.

**D-59 — `prepare-settlement` is idempotent-by-return, not idempotent-by-error.** A second call returns the existing plan with `idempotent: true` rather than 409. A client retry after a gateway timeout is the common case, and a 409 there forces an operator to reason about whether the first call landed. Correction goes through the explicit `reset`.

**D-60 — Retro structure approval *signals*, it does not settle.** `employee_salary_structure.service.approve` returns `arrear_required: { periods }` and audits it; it creates no adjustments. Creating them there would make a Tier-B compensation approval also a money-movement event and would force that transaction to take the rank-1 run lock for N periods. The pay-day reminder surfaces un-reconciled drift so the signal cannot be lost.

**D-61 — F&F loan recovery calls `foreclose()`; it does not reimplement recovery.** `employee_loan.service.foreclose({ settlementMode:'recover_via_payroll', recoveryPeriodMonth })` already cancels scheduled installments, forgives their interest, recomputes outstanding, closes the loan and creates exactly one approved `recovery` adjustment under the correct lock order (fact 9). The F&F orchestrator's only addition is *which* loans and *which* month. `fnf_loan_recovery_mode='manual'` (the default) reports the balance and recovers nothing — a leaver's loan recovery is a decision, not an automation.

**D-62 — `category` and `source_period_month` are persisted on `payroll_run_item_components`.** The line already carries `category` transiently (added for EC-45) and it is dropped on insert, which would make an arrear line indistinguishable from any other adjustment in every report and on every payslip. Persisting both is additive, NULL for all existing rows, needs no extra query at composition time, and removes the latent fragility of an EC-45-critical field existing only in memory.

**D-63 — The `calendar_resolver` / Leave day-rule duplication is not consolidated.** Phase 2 §11.3 recommended it for Phase 7. It is a behavioural refactor of live, tested Leave code, the parent's §8 does not assign it, and `CLAUDE.md` forbids unrelated refactoring. The mitigations Phase 2 put in place (module header citing the leave file by path/line, leave fixtures copied verbatim into `calendar_resolver.test.js`) stand. Re-raised in §13.4 as a standing recommendation with its own review.

**D-64 — Every FY/period reader folds sibling runs; none of them keys a `Map` on `period_month`.** Once a month can hold two approved runs (D-52), `new Map(items.map((i) => [i.run.period_month, i]))` is a silent data-loss idiom: the last row wins and the earlier run's income vanishes from the annual statement and #121 while Form 16's `GROUP BY` still reports it. Three sites are converted to accumulate (`annual_statement.service` payslip + live-item folds, `employee_tax.service.getSelfMonthly`); `findFyStatutoryMonthlyTotalsForOrg` and Form 16's quarterly query already aggregate in SQL and are **not** touched. The statement's month row gains `entries[]` so a reader can see the split. New code must accumulate by month, never overwrite. (F-1, EC-93.)

**D-65 — `assertPeriodOpenForVariablePay` gains an `allowSupplementary` mode; its default behaviour is unchanged.** The guard hardcodes `runType = REGULAR`, so on a `paid` month it 422s `PERIOD_CLOSED_FOR_ADJUSTMENT` even when an `off_cycle` run for that month is sitting in `draft` — an off-cycle run could be created and calculated but never funded, which makes the whole supplementary feature unusable in the exact case it exists for. The new mode resolves a live `off_cycle`/`final_settlement` run and flags **that** run `requires_recalculation` (§5.8). Phases 3–6 callers keep the default and their behaviour is regression-tested cell by cell. (F-2, EC-94.)

**D-66 — Arrears only reconcile runs whose `engine_version` is in `RECONCILABLE_ENGINE_VERSIONS` and whose snapshots are complete.** Recomputing a closed run with today's code and diffing against a *different* engine's output pays engine differences as arrears — real money for a code change nobody approved. The set is `{5, 6}` and is admissible **only because** §9.5 proves 5 and 6 are byte-identical on the fixtures; §9.5 is therefore a functional dependency of arrears, not a merge formality. Adding a version to the set requires the same proof. Refusals (`ENGINE_VERSION_NOT_RECONCILABLE`, `SNAPSHOT_INCOMPLETE`) happen before any adjustment row is built. (F-3, EC-95, EC-96.)

**D-67 — An unavailable recompute is a skip, never a clawback; a near-total reversal needs an explicit opt-in.** `aggregate()` returns `null` when the user has no employment window in the period (`joined_after_period` / `exited_before_period`), which a naive diff reads as "zero days worked" and reverses a legitimately-paid full month. Such users land in `skipped[]`. Independently, any per-user drift ≥ 99 % of the frozen gross is held back as `FULL_REVERSAL_SUSPECTED` unless the caller passes `allow_full_reversal: true`: it is far more often a cohort or structure mistake than a real correction. The diff itself is scoped to `source IN ('structure','overtime')` — `adjustment`/`loan`/`reimbursement` lines are one-shot and already `applied_run_id`-guarded, so including them would double-pay every variable line in the reconciled month. (F-4, F-16, EC-97, EC-98.)

**D-68 — Run cancellation is LIFO within a period.** `cancel()` refuses when a same-period sibling was approved **after** the target run (`409 SIBLING_RUN_DEPENDS_ON_RUN`). The sibling's statutory was computed net of this run's `samePeriodPrior` contribution and is frozen; D-12 forbids recomputing it, so cancelling the earlier run would leave PF/PT/TDS permanently short for that month with no corrective path. (F-6, EC-100.)

**D-69 — Balance consumption follows the Leave module's idiom and is never clamped.** Encashment writes `total_used += days; current_balance -= days` on the row it locked, matching `leave_approval.service`. Comp-off requests are grouped by `YEAR(earned_date)` and each `(user, type, year)` wallet is debited by its own count — debiting the current year's row for a prior year's day corrupts two wallets at once. A would-be-negative `current_balance` is a wallet bug and must surface as a failed assertion, not be silently clamped to 0. The comp-off expiry sweep's unmaintained `lapsed_balance` is pre-existing and deliberately left alone. (F-7, F-8, EC-101.)

**D-70 — Manual job triggers are org-scoped; only the scheduled pass is multi-tenant.** #212–#215 run for `req.user.org_id` and nothing else. A trigger that reused the cron's org loop would let one tenant's HR advance another tenant's payroll state — a tenant-isolation break dressed as an ops convenience. Relatedly, an exit never deletes or detaches `payroll_attachments`: `owner_id` is polymorphic with no FK, and `form16_part_a` objects outlive employment for statutory retention. (F-10, F-13, EC-102, EC-104.)

### 11.2 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Double payment** via an F&F and a regular run in one month | **CRITICAL** | INV-P7-1 at two layers (§7.4), serialised by the run-type-agnostic rank-1 lock; two-order test (§9.4-1); `already_settled` block on #37 so HR sees it pre-flight |
| 2 | **Double statutory charge** (PT slab, PF ceiling, TDS) on a supplementary run | **CRITICAL** | D-56 netting; the §9.4-2 paise-exact split-month test is the gate |
| 3 | The `engine_version` 5→6 bump silently changes a figure for an existing tenant | **HIGH** | both new arithmetic paths are inert without new inputs; all new flags default OFF; §9.5 zero-diff fixture proof is a merge gate |
| 4 | Arrears re-raised on a repeated reconciliation → over-payment | **HIGH** | already-raised subtraction computed **inside** the reconcile transaction (§5.3-4); repeat-yields-zero test; the public adjustment create path continues to reject `category='arrear'` |
| 5 | Encashment double-spends a comp-off (cash **and** leave) | **HIGH** | dual debit under row locks (§5.5-4); the `approved → encashed` state machine; EC-27 test both directions |
| 6 | Arrear recompute uses *today's* policy and restates history | **HIGH** | frozen `settings_snapshot` + live facts split (§5.3-2), asserted in `arrear_diff.test.js` |
| 7 | The two tax call sites drift (payslip vs `/me/tax/projection`) | **MEDIUM** | fact 18 called out in §3.2 and §5.6; an equality test across the two services |
| 8 | A 500-employee reconciliation in one transaction is too long | **MEDIUM** | documented remedy is `user_ids` batching with a shared `arrear_batch_id`; measured in §9.8 before merge. **Not** per-employee autocommit, which would half-correct a period. |
| 9 | Notice recovery exceeding net on a final settlement leaves an unrecoverable carry-forward | **MEDIUM** | EC-80: surfaced as an explicit `preview()` warning on F&F runs rather than silently written off; resolution is an out-of-payroll business action |
| 10 | Crons double-fire on a multi-instance deploy | **LOW** | watermark claim (D-57); auto-draft idempotent via the unique index; sweeper is a conditional `UPDATE` |
| 11 | `payroll_settings.model.js` misses a migration column again (the Phase-6 Step-0 defect) | **LOW** | §9.2 model↔migration parity assertion over all ~22 new columns |
| 12 | The exit-date source swap changes run composition for tenants with inactive users | **LOW but user-visible** | intended fix; §13.4 release note; those tenants' `EXIT_DATE_REQUIRED` items disappear only once HR records an exit |

---

## 12. Build Order & Dependencies

Each step ends in a runnable, testable state. Do not start a step before its predecessor's verification passes.

| Step | Work | Verify |
|---|---|---|
| **0** | **Ops gate.** Confirm with the user: no new dependencies (Phase 7 adds **zero**); migration `00048` will be handed back for them to run; the `engine_version` 5→6 bump and the three §13.4 behaviour changes are accepted. | explicit go-ahead |
| **1** | Migration `00048` + all models + repositories + `payroll_settings` #55–#57 with validation | `payroll_settings_schema.test.js` parity assertion green; migration reviewed statically (do **not** run it — the user owns migrations) |
| **2** | **Pure utils first**: `arrear_diff`, `encashment_rate`, `notice_recovery`, `exit_window` | their four suites green; purity tests (no db/model/repository import) |
| **3** | §5.4 statutory netting + §5.6 perquisite/§80D + the `employee_tax.service` mirror; bump `engine_version` | `statutory_netting`, `perquisite_basis`, `chapter_via_80d` green; **§9.5 zero-diff proof green** — this is the gate for everything downstream |
| **4** | Cohort restriction, `earnings_mode`, exit-date precedence in the aggregator and calculator | `cohort_restriction`, `supplementary_earnings_mode` green; existing `payroll_calculation.test.js` unchanged |
| **5** | **INV-P7-1**: `excludeUserIds` at calculate + the approve-time guard; #38/#37 widened | `duplicate_full_earnings.test.js` green **in both orders** — do not proceed past this step until it is |
| **6** | `employee_exit.service` + #195–#199 | exit lifecycle tests; recorded exit clears `EXIT_DATE_REQUIRED` |
| **7** | `encashment.service` (both adapters) + #206–#211, #216–#218 | `encashment_service`, EC-27 both directions |
| **8** | `fnf_settlement.service` + #200–#202; `pay()` settles the exit | `fnf_settlement` (idempotency, reset inverse, `foreclose` delegation); end-to-end F&F hand-verification |
| **9** | `payroll_arrear.service` + `arrearTargetFor` + #203–#205 + D-60 signal on structure approve | `payroll_arrear_service`, `arrear_target_resolution`, the §9.4-3 round-trip |
| **10** | Four crons + `payroll_automation.service` + `runStartupCatchUp` + templates + `server.js` wiring + #212–#215 | `automation_watermark`, `run_sweeper`, `attachment_sweeper`; each manual trigger a proven second-call no-op |
| **11** | §9.8 performance measurement; §9.7 security pass; §9.6 coverage table | numbers and findings **recorded**, not estimated |
| **12** | Documentation close-out: `api_registry.md`, `combined_api_analysis.md`, `org_settings_registry.md` #55–#57, parent §3 (D-51…D-70) / §8 / §9 / **line-3 STATUS banner**, Phase 1–7 completion report | all four registries reconcile with the route files exactly |

**Critical path: 3 → 5 → 8/9.** Step 3 can change every figure in the system; step 5 is the only thing between an F&F run and a double payment. Neither is recoverable by a later code fix once money has moved — D-12 forbids mutating the closed run, so the correction becomes an arrear against a customer who has already been overpaid.

### 12.1 Dependencies the §16 review added

* **`allowSupplementary` (D-65) ships in step 1**, with the rest of the guard and settings work. Steps 7 and 9 both fund inputs into off-cycle runs; without the mode they 422 and neither feature can be demonstrated end-to-end.
* **Sibling-safe FY reads (D-64) ship in step 4**, before step 5 or step 8 can put a second approved run in a month. Shipped later, the first production off-cycle run under-reports the annual statement and #121 while Form 16 reports the truth — a compliance incident that is invisible until an employee compares the two documents.
* **Step 3 is a hard predecessor of step 9.** Arrears recompute closed runs, so the `RECONCILABLE_ENGINE_VERSIONS` gate (D-66) is only sound while v5 and v6 provably agree. Step 9 does not start until §9.5's zero-diff proof is green.
* **Step 6 precedes step 8**, and #38's `SETTLEMENT_PERIOD_MISMATCH` assertion (F-12) lands with step 8 — a settlement prepared for one month and consumed by a run for another leaves the notice/encashment artefacts orphaned and the exit never `settled`.
* **D-68's LIFO cancel guard lands with step 3**, not step 8: the moment netting exists, an unguarded `cancel()` can permanently under-remit statutory.

---

## 13. Deployment & Production Readiness

### 13.1 Deploy order

1. Hand migration `00048` to the user; they run it. It is additive except the one index replacement and the `period_month` backfill, both safe on a live table (the new index is created before the old is dropped).
2. Deploy code. Every new feature flag is OFF, so tenant behaviour is unchanged at t=0.
3. Crons register only on `linux` — verify the four registration log lines in the boot log.
4. Enable per tenant, deliberately: #56 automation first (harmless), then #55/#57 when the org has configured its encashment components.

### 13.2 Configuration

| Knob | Where | Default |
|---|---|---|
| F&F encashment / notice policy | `payroll_settings` #55 | all OFF; `fnf_loan_recovery_mode='manual'` |
| Automation & retention | `payroll_settings` #56 | all OFF; retention 2555 days |
| Comp-off encashment | `payroll_settings` #57 | OFF |
| Benefit tax treatment | per `benefit_plans` row | `employer_contribution_taxable=false`, `employee_premium_tax_section=NULL` |
| `PAYROLL_ATTACHMENT_SWEEP_BATCH` | env, default 200 | |
| `STALE_CALCULATION_MS` | existing constant, 30 min | shared by the cron and the manual path |

### 13.3 Rollback

* Code rollback is safe: `00048` is additive, the new columns are ignored by Phase-6 code, and no existing column changed type or nullability. The one exception is the **index replacement** — a Phase-6 rollback would permit a second off-cycle run per month that the old index forbade; since no off-cycle run can exist without Phase-7 code, this is inert.
* Migration rollback (`down`) drops the two tables, the added columns, and restores the original unique index. It fails loudly if any `off_cycle`/`final_settlement` run exists — correct: silently dropping the index those rows depend on would be worse.
* **Data written by Phase 7 is not rolled back by a code rollback.** An approved arrear adjustment or encashment stays in the database and will be picked up by a re-deployed Phase 7. This is intentional: money already decided must not vanish.

### 13.4 Behaviour changes to announce

1. **Recording an exit changes run composition.** A tenant with `inactive` users currently sees a recurring `EXIT_DATE_REQUIRED` error item for each, every month. Once HR records an exit, that item disappears and the employee leaves subsequent runs entirely. Run headcount, `error_count` and totals will change for those tenants. **Identify affected tenants before deploy** (any org with a non-`active` user holding a tenant-plane role and an approved structure).
2. **`engine_version` becomes 6 on recalculation.** A `draft`/`calculated` run recalculated after deploy is stamped 6. Its figures are unchanged (§9.5) unless the tenant has set a benefit tax flag. Approved and paid runs are never touched.
3. **A second run per month is now possible.** The unique index no longer forbids `off_cycle`/`final_settlement` siblings. The safety property is INV-P7-1, not row count — anyone reasoning about "one run per month" must read §7.4.
4. **The annual statement and #121 now sum every run in a month.** For any month that ends up with two approved runs, `/annual-statement` and `/me/tax/statutory-summary` report the combined figures (with an `entries[]` breakdown) instead of one run's. No existing tenant's numbers change until they create their first off-cycle or F&F run, because today every month has exactly one run. Form 16 already reported the combined figure, so this removes a discrepancy rather than creating one.
5. **Standing recommendations re-raised, not built:** the **TAN column** on `organization_profiles` (D-47 — Form 16 Part B is not submission-grade without it); a **`checkLock` call in the Leave approval path** (fact 6 — the Leave module can still mutate a locked period, which is why arrears exist; adding the guard is a Leave-module change with its own review); and the **`calendar_resolver` consolidation** (D-63).

### 13.5 Observability

* Every cron logs one line per tick **only when it did something** (Phase 6's convention — 96 empty ticks a day would bury the meaningful ones): `[Cron] payroll_auto_draft: orgs=N created=N skipped=N errors=N`.
* `payroll_audit_logs` gains these actions, all written **inside** the changing transaction: `exit.recorded`, `exit.corrected`, `exit.cancelled`, `exit.settlement_prepared`, `exit.settlement_reset`, `exit.settled`, `arrear.reconciled`, `arrear.batch_committed`, `encashment.created`, `encashment.approved`, `encashment.rejected`, `encashment.cancelled`, `encashment.reversed`, `run.swept_stale`, `attachment.swept`, `structure.arrear_required`.
* Audit `new_values` carry **amounts and day counts** (they are the record) but **never** a bank number, PAN, storage key or raw attendance row.
* Every arrear adjustment is traceable both ways: forward `source_run_item_id → applied_run_item_id`, backward from any payslip line via `source_ref_id` + `source_period_month`.
* Warning codes surfaced on the item: `STATUTORY_NETTING_NEGATIVE:{head}`, `BENEFIT_80D_BASIS_ESTIMATED`, `ENCASHMENT_DAYS_CLAMPED`, `NOTICE_RECOVERY_CARRIED_FORWARD`.

### 13.6 Security checklist

Runs as §9.7, plus Phase-7-specific:
* Exit and arrear endpoints are **`hr`-only**; a manager probing `/hr/exits` gets 403 from `authorize`, never a partial read.
* #216/#217 re-check `getAccessibleUserIds` **at approval**, not only at proposal (**EC-29**).
* #217 honours `manager_can_view_team_compensation` (**EC-25**) — amounts stripped, not the row hidden, so the manager can still see that an encashment exists for their report without seeing its value.
* `comp_off_ids` in a request body are validated as UUIDs **and** re-verified to belong to the target user in the target org under a row lock — never trusted from the client.
* The drift report (#203) exposes salary deltas and is `hr`-only.
* Job trigger endpoints (#212–#215) are `hr`-only and rate-limited by the watermark itself (a second call the same day is a no-op).

---

## 14. Error Code Reference

| Code | HTTP | Raised by |
|---|---|---|
| `EXIT_ALREADY_RECORDED` | 409 | #195 — a live exit exists |
| `EXIT_NOT_FOUND` | 404 | #197–#202 |
| `EXIT_ALREADY_SETTLED` | 409 | #198/#199 — `status='settled'` |
| `SETTLEMENT_ALREADY_PREPARED` | 409 | #198 — reset before correcting |
| `SETTLEMENT_NOT_PREPARED` | 409 | #202 |
| `SETTLEMENT_ARTEFACT_APPLIED` | 409 | #202 — an artefact already reached an approved run |
| `EXIT_HAS_CLOSED_SETTLEMENT` | 409 | #199 — an approved/paid F&F run references it |
| `INVALID_EXIT_WINDOW` | 422 | LWD before joining, or resignation after LWD |
| `NO_CLOSED_RUN_FOR_PERIOD` | 404 | #203/#204 |
| `NO_OPEN_TARGET_PERIOD` | 409 | `arrearTargetFor` found none |
| `ARREAR_NOTHING_TO_SETTLE` | 200 *(not an error)* | #204 with zero deltas — returns an empty batch |
| `ENCASHMENT_DISABLED` | 409 | setting #55/#57 OFF |
| `ENCASHMENT_COMPONENT_NOT_CONFIGURED` | 422 | component id unset or not an active earning |
| `ENCASHMENT_NOT_ACTIONABLE` | 409 | approve/reject on a non-`pending` row |
| `ENCASHMENT_NOT_REVERSIBLE` | 409 | the adjustment is already applied |
| `COMP_OFF_NOT_ENCASHABLE` | 409 | not `approved`, expired, or another org's |
| `INSUFFICIENT_LEAVE_BALANCE` | 409 | wallet debit would go negative |
| `DUPLICATE_FULL_EARNINGS` | 409 | **INV-P7-1** at approve |
| `COHORT_REQUIRED` | 422 | off-cycle / F&F create with no `user_ids` |
| `COHORT_USER_NOT_IN_POPULATION` | 422 | #38 — unknown/ineligible cohort id |
| `NO_SUPPLEMENTARY_LINES` | *item `error_code`* | a `supplementary_only` item with nothing to pay |
| `INVALID_RUN_TYPE` | 422 | `run_type='arrear'` (D-54) |
| `INVALID_TAX_SECTION` | 422 | `employee_premium_tax_section` not whitelisted, or `80C` |
| `NO_OPEN_SUPPLEMENTARY_RUN` | 422 | variable-pay input for a closed regular period with no live supplementary run (**F-2**) |
| `ENGINE_VERSION_NOT_RECONCILABLE` | 422 | #203/#204 — source run outside `RECONCILABLE_ENGINE_VERSIONS` (**F-3**) |
| `SNAPSHOT_INCOMPLETE` | 422 | #203/#204 — the frozen `settings_snapshot` lacks a key the recompute reads (**F-3**) |
| `SIBLING_RUN_DEPENDS_ON_RUN` | 409 | #49 cancel — a later-approved same-period sibling netted against this run (**F-6**) |
| `SETTLEMENT_PERIOD_MISMATCH` | 422 | #38 with `exit_id` — run period ≠ `settlement_period_month` (**F-12**) |
| `CO_WALLET_MISSING` | 409 | comp-off encashment — no CO balance row for an approved comp-off's earned year (**F-7**) |
| `FULL_REVERSAL_SUSPECTED` | *report flag* | #203/#204 — withheld until `allow_full_reversal` (**F-4**) |
| `RECOMPUTE_UNAVAILABLE` | *report flag* | #203/#204 — employee skipped, never clawed back (**F-4**) |
| Reused unchanged | | `PERIOD_CLOSED_FOR_ADJUSTMENT` (422) · `RUN_CALCULATION_IN_PROGRESS` (409) · `RUN_STALE` (409) · `PERIOD_LOCKED` (403) · `ADJUSTMENT_ALREADY_APPLIED` (409) · `SEPARATE_CHECKER_REQUIRED` (403) · `HIERARCHY_VIOLATION` (403) · `NO_SALARY_STRUCTURE` (422) · `COMPENSATION_VIEW_DISABLED` (403) |

---

## 15. Final Acceptance Criteria

Phase 7 — and the Payroll module — is complete when **all** of the following hold:

1. Every §1.3 row marked **NEW** is implemented; no row marked **ALREADY DONE** or **NOT APPLICABLE** was re-planned or rebuilt; every §1.2 exclusion is still excluded.
2. Endpoints **#195–#218** exist, are numbered, and appear in `api_registry.md` and `combined_api_analysis.md`; the route files and both registries reconcile **exactly**.
3. `org_settings_registry.md` contains **#55–#57** in that file's exact field structure.
4. Migration `00048` has been run by the user; §10's schema checks pass, including the zero-null `period_month` backfill.
5. `package.json` gained **zero** dependencies.
6. **§9.5's zero-diff proof passes** — the `engine_version` 5→6 bump demonstrably changes no existing figure.
7. **INV-P7-1 (§9.4-1) and split-month statutory equality (§9.4-2) both pass**, the latter to the paise. These two are non-negotiable: each guards against an irreversible over-payment.
8. The arrear round-trip (§9.4-3), EC-27 (§9.4-4) and perquisite containment (§9.4-5) all pass.
9. `npm test` passes with **no reduction from 792** and every §9.1 suite present.
10. §9.6's EC-1 … EC-104 coverage table is complete — each case has a test **or** a documented, deliberate decision. *(Parent §8 exit criterion.)*
11. §9.8's 1,000-employee numbers are **recorded in the completion report**, with query counts, and the aggregator is demonstrably O(source tables × cohorts). *(Parent §7 + §8 exit criterion.)*
12. §9.7's security pass finds **no salary leak across a tenant or hierarchy boundary**, and no payroll route admits `admin`/`super-admin`. *(Parent §8 exit criterion.)*
13. The parent document is amended: D-51…D-70 in §3, the §1.3 scope reconciliation in §8, EC-73…EC-104 in §9, #55–#57 in §10, §11 items 1–4 closed, and **the stale line-3 STATUS banner rewritten** to state Phases 1–7 implemented.
14. A **Payroll Module Phase 1–7 completion report** exists at `public/md_payrolls/payroll_module_phase_1_to_7_completion_report.md`, mirroring `public/md_leave/md_phases/leave_module_phase_1_to_6_completion_report.md`, carrying the §9.6 coverage table, the §9.8 measurements and the §9.7 findings.
15. No file outside `src/modules/payroll/` is modified except `src/server.js` (four `require`s + one catch-up call), `src/common/utilities/email.utils.js` (two senders + two `TEMPLATE_MAP` entries), two new templates under `src/common/templates/`, the four new files under `src/cron-jobs/`, and the migration. **No file in `src/modules/attendance/` or `src/modules/leave/` is touched** (D-58).
16. **Every §16 finding F-1 … F-16 is closed**, each with the test named in its entry. F-1, F-2 and F-3 are additionally reviewed by a second pair of eyes before any tenant is allowed to create an `off_cycle` or `final_settlement` run.

---

## 16. Final Review Findings — F-1 … F-16 (integrated into §1–§15)

Added after a senior-level review of §1–§15 against the tree. **Every finding below was confirmed by reading the code at the cited line — none is speculative.** Each is in scope for Phase 7 and is a merge blocker at the severity shown. Three (F-1, F-2, F-3) are defects in this plan's own design rather than gaps in the existing system; F-2 in particular would have shipped an off-cycle feature that cannot be used.

### F-1 — Sibling runs silently vanish from tax documents · **CRITICAL** · data loss

**Location.** `annual_statement.service.js:74` (`payslipByMonth.set(p.period_month, p)`) and `:81` (`liveByMonth.set(it.run.period_month, it)`); `employee_tax.service.js:1198` (`new Map(items.map((i) => [i.run.period_month, i]))`).

**Problem.** All three build a **one-row-per-month** map from a multi-row result set. Last write wins. The FY queries do **not** filter `run_type` (verified: `findFyItemsForUser` / `findFyStatutoryItemsForUser` filter only `status IN ('approved','paid')` plus the month list), so a supplementary run's item *is* fetched — and then discarded.

**Failure scenario.** An employee has a regular March payslip and an F&F March payslip. The annual statement (#184/#185/#192/#193) and the self monthly statutory statement (#121) report **one** of them; the other month's gross, TDS, PF and PT disappear. The employee's own statement then disagrees with Form 16 Part B — whose quarterly block (`employee_tax.service.js:274`, `quarterMap`) iterates and **accumulates**, so it is already correct. A tax document that disagrees with the employer's own statement is a compliance incident, and the plan as written would have shipped it the first time any tenant filed an F&F run.

**Fix.** Make all three fold rather than overwrite:
* `annual_statement.build` — `payslipByMonth` and `liveByMonth` become `Map<month, Array>`; `monthsNeedingLive` excludes a month only when a **visible** payslip covers it; `_snapshotMonth` / `_liveMonth` are called per entry and their figures summed into the existing `TotalsAccumulator` / `ComponentSections`, which already accumulate correctly. The month row gains `entries: [{ run_id, run_type, … }]` and reports summed figures.
* `employee_tax.getSelfMonthly` (#121) — accumulate per month across items instead of keying one.
* **No change** to `findFyStatutoryMonthlyTotalsForOrg` (#118) — it is a SQL `GROUP BY period_month` with `SUM`s and is already sibling-safe. Do not "fix" it.

**Test.** One employee, one month, two approved runs → annual statement gross, TDS and PF equal the sum of both; the #121 totals equal the Form 16 quarterly totals for that quarter. That equality is the regression guard.

### F-2 — An off-cycle run cannot be funded: the variable-pay guard only knows the regular run · **CRITICAL** · feature dead on arrival

**Location.** `payroll_period_guard.service.js:47` — `findLiveByPeriod(orgId, periodMonth, REGULAR, …)`, hardcoded; `approved`/`paid` → `422 PERIOD_CLOSED_FOR_ADJUSTMENT`.

**Problem.** Every variable-pay input goes through this guard — `payroll_adjustment.service` (create/update/cancel), `employee_loan.service`, `bonus_rule.service`, and (per §5.2/§5.5) this plan's own notice recovery, encashment and loan foreclosure. Once a month's **regular** run is approved, the guard refuses any input for that month. But paying something in that month via an off-cycle run is *exactly* the use case §5.1 exists for. The plan would deliver a run type that can be created and calculated but can never be given anything to pay.

Second half of the same defect: the guard marks only the **regular** run `requires_recalculation`. An input created for a month with a live off-cycle run would leave that run stale-but-unflagged, so the `RUN_STALE` gate at approve (D-18) would not fire and the run would approve with figures that predate its own inputs.

**Fix.** `assertPeriodOpenForVariablePay(orgId, periodMonth, transaction, { allowSupplementary = false } = {})`:
1. Regular run absent / `draft` / `calculated` / `failed` → unchanged behaviour, flag it stale, return it.
2. Regular run `calculating` → unchanged `409 RUN_CALCULATION_IN_PROGRESS`.
3. Regular run `approved`/`paid`:
   * `allowSupplementary === false` → the existing `422 PERIOD_CLOSED_FOR_ADJUSTMENT`, with the message's "retro settlement is a future arrears feature" clause **replaced** by the now-real remedy: *"target a later month, reconcile it as an arrear (#204), or create an off-cycle run for this period."*
   * `allowSupplementary === true` → look for a live (`draft`/`calculated`/`failed`) `off_cycle` or `final_settlement` run for the period. Found → flag **that** run `requires_recalculation` and return it. `calculating` → `409 RUN_CALCULATION_IN_PROGRESS`. None → `422 NO_OPEN_SUPPLEMENTARY_RUN`, message naming the remedy.
4. When several live supplementary runs exist, flag **all** of them — any may be the one that picks the input up.

**Callers passing `allowSupplementary: true`:** F&F notice recovery, encashment approval, F&F loan foreclosure, and the HR adjustment create path **only when the request carries an explicit `target_run_id`** resolving to a live supplementary run. Everywhere else the default stays `false`, so today's behaviour and today's tests are untouched. `payroll_arrear.service` keeps `false`: an arrear routes to a later open month by design (§5.3) and must not silently land in a supplementary run of the closed month.

### F-3 — Arrear drift diffs figures produced by a different engine version · **HIGH** · pays money that was never owed

**Location.** §5.3 steps 2–3 as originally written; `payroll_run.service.js:541` (`engine_version: 5`); `payroll_statutory_aggregator.service.js:56` — a pre-Phase-4 snapshot carries **no statutory block at all**.

**Problem.** `computeDrift` recomputes a closed period with **today's code** and subtracts the figure the engine produced **then**. Freezing `settings_snapshot` freezes the *inputs*, not the *algorithm*. Any engine change between the two versions therefore surfaces as "drift" and is paid out as an arrear. A v3 (pre-statutory) or v4 (pre-Phase-5 reimbursement/benefit handling) run recomputed under v6 would produce large, entirely fictitious deltas.

**Fix.**
* `const RECONCILABLE_ENGINE_VERSIONS = new Set([5, 6])` in `payroll_arrear.service`. A source run outside the set → `422 ENGINE_VERSION_NOT_RECONCILABLE`, message stating the correction must instead be entered as a manual adjustment (#57) in an open month.
* 5 and 6 are diff-compatible **only because** §9.5 proves v6 ≡ v5 for inputs with no benefit tax flag and no sibling run. **This promotes §9.5 from a safety check to a functional dependency of the arrears feature** — if the zero-diff proof fails, `RECONCILABLE_ENGINE_VERSIONS` collapses to `{6}` and arrears become unusable for every run approved before the Phase 7 deploy. Build step 3 must therefore be complete before step 9 starts, which §12 already requires for an independent reason.
* Additionally refuse when the source run's `settings_snapshot` lacks any key the recompute reads — `buildSettingsSnapshot` (`payroll_run.service.js:128`) is a curated allow-list and an older run's snapshot legitimately lacks later phases' keys. A missing key is a hard `422 SNAPSHOT_INCOMPLETE`, never a silent `undefined` falling back to an engine default.

### F-4 — A missing recompute would claw back an entire month's salary · **HIGH** · catastrophic false arrear

**Location.** §5.3 step 5 as originally written ("a component present in one side and absent in the other is a delta of its full amount"), combined with `payroll_attendance_aggregator.service.js:279-285` — `exitDate` → `clipToEmployment` → `exited_before_period` → `return null`, plus the `EXIT_DATE_REQUIRED` / `NO_SALARY_STRUCTURE` error-item branches.

**Problem.** That rule was written for a *component* appearing on one side only. Applied to a **whole item** it produces a full-month clawback. Three routine situations trigger it: the employee is now `inactive` and (before an exit record exists) recomputes to an **error item** with no figures; an exit has since been recorded with an LWD before the source period, so the employee is dropped from the population entirely; the employee's structure was since soft-deleted, so the recompute is `NO_SALARY_STRUCTURE`. In each case the employee was legitimately paid, and the reconciliation would recover the whole month from their next payslip.

**Fix.**
* Reconciliation considers **only** employees whose recompute produced a `calculated` item with figures. An error item, a `null` entry, or an absent user → **skip**, with `{ user_id, reason: 'RECOMPUTE_UNAVAILABLE', detail }` in the report and the audit row. Never a delta.
* The absent-on-one-side rule is scoped explicitly to **components within a present item**.
* Any employee whose net delta is a full reversal of the frozen item (|net| ≥ 99 % of frozen gross) is withheld and reported as `FULL_REVERSAL_SUSPECTED`; committing it requires `allow_full_reversal: true` on #204, audited. A genuine full clawback (an employee paid for a month they had already left) is real but rare and must be a deliberate keystroke, not a side effect.

### F-5 — Two sibling runs competing for one adjustment: the second approval hard-fails · **HIGH** · operational deadlock (no double payment)

**Location.** `payroll_run.service.js` `_commitVariablePay` — for adjustments: `if (adj.status !== 'approved' || adj.applied_run_id != null) throw new AppError(409, …, 'ADJUSTMENT_ALREADY_APPLIED')`; the same guard exists for loan installments (`LOAN_INSTALLMENT_ALREADY_DEDUCTED`) and claims (`REIMBURSEMENT_ALREADY_APPLIED`).

**Assessment.** The money is safe — this is a correct, row-locked anti-double-pay guard, and it is why Phase 7 needs no new one. But with sibling runs it becomes reachable through normal operation for the first time: if an off-cycle run and the regular run are both *calculated* while a pending adjustment exists, both items include it; the first approval stamps `applied_run_id`, and the second approval throws and **cannot proceed at all** until HR recalculates. A 409 at approve, after a clean preview, is a bad failure during a payroll close.

**Fix (prevention, not another guard).**
* At **calculate** time a cohort-restricted run excludes adjustments, claims and installments already referenced by a *`calculated`* sibling run for the same period (new repository read over `payroll_run_item_components` joined to sibling runs). First run to calculate wins the input; the other never includes it.
* `preview()` reports `contended_inputs: []` for anything a sibling has claimed since this run was calculated, so the contention is visible **before** approval.
* Keep the `_commitVariablePay` guard exactly as is — it is the backstop and its message already names recalculation as the remedy.

### F-6 — Cancelling an approved run that a sibling netted against · **MEDIUM-HIGH** · permanently under-deducted statutory

**Location.** `payroll_run.service.js:1772` — `if (run.status !== 'approved' || run.paid_at) throw … 'RUN_NOT_CANCELLABLE'`. An **approved, unpaid** run *can* be cancelled.

**Problem.** Under D-56, off-cycle run B computes its statutory as `cumulative(A+B) − charged(A)`. Cancel A and B's frozen figures now under-charge PT, PF and TDS by A's share for that month, with no mechanism to notice: B is closed and D-12 forbids recomputing it. The month's challan is short and the employee's Form 16 understates TDS.

**Fix.** In `cancel()`, under the rank-1 lock already held: refuse when another non-cancelled run for the same `period_month` is `approved`/`paid` **and** was approved after this run — `409 SIBLING_RUN_DEPENDS_ON_RUN`, naming the sibling. Cancellation within a period is therefore LIFO: cancel the dependent sibling first. Implemented as a `statutory_snapshot.same_period_prior_run_ids` check where that array is present, falling back to `approved_at` ordering where it is not.

### F-7 — Comp-off encashment would debit the wrong year's wallet · **MEDIUM** · wrong balance row

**Location.** `comp_off.service.js:251` — `const year = new Date(locked.earned_date).getFullYear()`; the credit at `:128-129` is `total_accrued + 1` / `current_balance + 1`.

**Problem.** §5.5 said `year(LWD)`. The CO wallet is keyed by the comp-off's **`earned_date` year**, and `leave_balances` is unique on `(org_id, user_id, leave_type_id, year)`. A comp-off earned in December 2025 and encashed in January 2026 would debit a 2026 row that either does not exist or holds a different year's entitlement.

**Fix.** Group `comp_off_ids` by `YEAR(earned_date)` and debit each year's balance row separately, each via `getBalanceForUpdate`. A missing balance row for a year that has an approved comp-off is a data inconsistency → `409 CO_WALLET_MISSING`, not an implicit create. Additionally: a comp-off is **always exactly one day** (the credit is a literal `+ 1`; `worked_hours` is informational and `worked_type` does not halve it) → for `source_kind='comp_off'`, require `days === comp_off_ids.length` and reject fractional days.

### F-8 — Encashment must use the consumption idiom and must never clamp · **MEDIUM** · silent value loss

**Location.** Leave taken: `leave_approval.service.js:112-113` — `total_used += paidDays; current_balance = proposedBalance`. Comp-off lapse: `comp_off.service.js:253-255` — debits `current_balance` only, **clamped at 0**.

**Fix.** Encashment is consumption, not lapse: `total_used += days; current_balance -= days` for **both** adapters, matching the leave module's own debit idiom and keeping `current_balance = total_accrued + carried_forward − total_used − lapsed_balance` intact. **Never clamp** — an insufficient balance is `409 INSUFFICIENT_LEAVE_BALANCE` (§14). The clamp in the expiry sweep exists to keep a *free* sweep safe; here it would silently pay cash for a day that no longer exists.

*Noted, deliberately not fixed:* the expiry sweep debits `current_balance` without incrementing `lapsed_balance`, leaving that column unmaintained on the comp-off path. Pre-existing, outside Phase 7's scope, left alone per `CLAUDE.md`.

### F-9 — `employee_tax.service` carries its own, separate engine-version counter · **MEDIUM** · mislabelled tax summaries

**Location.** `employee_tax.service.js:58` — `const ENGINE_VERSION = 4`, stamped into the persisted summary at `:440`.

**Problem.** §5.6 said "`engine_version` 5 → 6", meaning `payroll_runs.engine_version`. This is a **second, independent counter** that Phases 5 and 6 never touched. EC-33 changes this service's projection output, so leaving it at 4 mislabels every summary computed after the deploy as if the projection were unchanged.

**Fix.** Bump it to **5**, with a comment stating the two counters are independent sequences (`payroll_runs.engine_version` = 6; tax-summary `ENGINE_VERSION` = 5) so a future phase does not "align" them and invalidate historical labels.

### F-10 — The attachment sweeper must never purge Form 16 Part A · **MEDIUM** · statutory retention breach

**Location.** `payroll_attachments.model.js:7-30` — `owner_id` is **polymorphic with no FK**; `owner_type ENUM('reimbursement_claim_item','investment_declaration_item','form16_part_a')`.

**Problem.** Nothing in the database prevents deleting an attachment a finalized Form 16 depends on, and the §5.7 retention purge would eventually reach it. Form 16 Part A is an employer-issued statutory document.

**Fix.** The retention purge excludes `owner_type = 'form16_part_a'` unconditionally; those rows are retained until an explicit statutory retention policy is planned separately. The 24-hour `pending` purge still applies to all owner types (an abandoned pre-signed upload is inert by design). The sweeper logs a `skipped_statutory` count so the exclusion is observable.

### F-11 — A month split across two runs rounds net pay twice · **LOW** · ≤ ₹1 drift per extra run

`net_pay_rounding='nearest_rupee'` emits a signed `ROUNDING_ADJUSTMENT` line per run (`payroll_calculation.service.js:642-667`). Two runs in a month round independently, so the month's total can differ by up to ₹1 from a single combined run. **Accepted and documented:** each run is a separate payment instrument and must reconcile to its own rounded net; forcing a month-level rounding identity would require mutating a closed run (D-12). §9.4-2's paise-exact equality test therefore asserts equality on **statutory heads**, not on rounded net pay — state that in the test so it is not read as a tolerance.

### F-12 — Prepared F&F artefacts can be orphaned by a run in the wrong month · **MEDIUM** · unpaid settlement

**Problem.** `prepare-settlement` freezes notice, encashment and loan-recovery adjustments at `fnfPeriodMonth`, but nothing forces the F&F **run** to use that month. HR files the run for the following month and the artefacts sit unapplied and invisible, with the exit stuck at `prepared`.

**Fix.** Persist `settlement_period_month` STRING(7) NULL on `employee_exits` (add to §4.1), written by `prepare-settlement`. `POST /runs` with `exit_id` asserts `period_month === exit.settlement_period_month` → else `422 SETTLEMENT_PERIOD_MISMATCH`, naming the prepared month and offering `settlement/reset` as the remedy. #197 surfaces the prepared month, and #37's eligibility readout reports prepared-but-unapplied exits for the queried period.

### F-13 — Manual job triggers would run every org's work inside one tenant's HTTP request · **MEDIUM** · cross-tenant blast radius, request timeout

**Problem.** §5.7 made #212–#215 "manual triggers" of the cron bodies, and the cron bodies iterate **all** orgs. An HR user in org A would drive work for orgs B…Z, synchronously, under an HTTP timeout.

**Fix.** Every `payroll_automation.service` job body takes `{ orgId = null }`: `null` → iterate all orgs (cron only); set → that org only (the HTTP path, always `req.user.orgId`, never a body parameter). The response returns that org's counters. A manual attachment sweep is additionally capped at one batch (`PAYROLL_ATTACHMENT_SWEEP_BATCH`) and reports `has_more` rather than looping until the table is clean.

### F-14 — "Auto-draft day" is ambiguous about which period it drafts · **LOW** · a run for the wrong month

**Fix.** Define it precisely: on day `payroll_auto_draft_day`, the cron drafts the run for **the most recent period whose `period_end` is strictly before today**, resolved through the existing `payroll_period.utils` so `payroll_cycle`, `period_start_day` and `pay_day_in_next_month` are honoured rather than re-derived. If that period already has a live run, no-op. If `payroll_auto_draft_day` falls inside the period it would draft, skip and log — never draft a period that has not ended.

### F-15 — Held-payslip suppression must be evaluated per payslip, not per month · **MEDIUM**

Part of F-1's fix, called out separately because it is easy to miss: `annual_statement.service.js:93-97` treats "a payslip exists but is not visible" as *suppress the whole month, never fall back to live*. With siblings, one month can hold a visible regular payslip and a held F&F payslip. The visible one must still be reported and the held one suppressed; the month must not be blanked, and the held one must not fall back to its live item.

### F-16 — The drift diff must be restricted by line `source` · **MEDIUM** · double-handling and a laundered ESI exclusion

**Location.** `statutory_calculation.service.js:150` — `const isBonusIncentive = (line) => line.source === 'adjustment' && (line.category === 'bonus' || line.category === 'incentive')`, the EC-45 ESI exclusion.

**Problem.** §5.3 recomputes the whole item and diffs "per component code", which would sweep in adjustment, reimbursement, loan, benefit and rounding lines. Two consequences: inputs that already have their own `applied_run_id` lifecycle (F-5) would be double-handled by an arrear; and a cancelled bonus adjustment would return as a negative arrear line carrying `category='arrear'`, which **is not** `'bonus'`/`'incentive'`, so the EC-45 ESI exclusion would be silently lost.

**Fix.** The diff is computed over earning lines with `source IN ('structure', 'overtime')` only; every other source is excluded by construction and asserted in `arrear_diff.test.js`. No bonus or incentive line can then ever enter a diff, so EC-45's exclusion is preserved by construction rather than by carrying another field. R1/R2/R3 (§5.3) are all structure- or overtime-sourced, so nothing in the phase's actual scope is lost.

### 16.1 Consequential amendments to §1–§15

**Status: all amendments below are applied.** §1–§15 now carry the corrected design; §16 is retained as the review record and the rationale for each ruling, not as a to-do list. Where a body section and this section could ever be read as disagreeing, **the body section governs** — it is what gets implemented.

| Section | Amendment |
|---|---|
| §3.2 | Add to the extended-file list: `services/annual_statement.service.js` (F-1); `services/employee_tax.service.js` now carries **three** changes — the §5.6 tax mirror, `getSelfMonthly` (F-1) and `ENGINE_VERSION` (F-9); `services/payroll_period_guard.service.js` gains the `allowSupplementary` mode (F-2) |
| §4.1 | Add `settlement_period_month` STRING(7) NULL (F-12) |
| §5.3 | Diff restricted to `source IN ('structure','overtime')` (F-16); reconcilable-version and snapshot-completeness gates (F-3); skip-not-clawback rule and `allow_full_reversal` (F-4) |
| §5.5 | Wallet year per `earned_date` (F-7); consumption idiom, never clamped (F-8); `days === comp_off_ids.length` for the comp-off adapter (F-7) |
| §5.7 | `{ orgId }` scoping for every job body (F-13); auto-draft period definition (F-14); `form16_part_a` exclusion from the retention purge (F-10) |
| §7.3 | Add: sibling input contention resolved at calculate, surfaced by `preview()` (F-5) |
| §7.5 | Add: cancel-vs-sibling-netting → LIFO cancellation within a period (F-6) |
| §9.4 | Add invariant **6**: the annual statement, #121 and the Form 16 quarterly block all agree for a month with two approved runs (F-1). Invariant 2's paise-exact equality is asserted on **statutory heads**, not on rounded net pay (F-11) |
| §9.5 | Promoted from safety check to a **functional dependency** of the arrears feature (F-3) |
| §12 | Step 3 must fully pass before step 9 begins (F-3); F-1's fix belongs to step 4 — it is a prerequisite of shipping any sibling run, not a reporting nicety; F-2's guard mode belongs to step 1 alongside the settings work, since §5.2 and §5.5 both depend on it |
| §14 | New codes: `NO_OPEN_SUPPLEMENTARY_RUN` (422) · `ENGINE_VERSION_NOT_RECONCILABLE` (422) · `SNAPSHOT_INCOMPLETE` (422) · `SIBLING_RUN_DEPENDS_ON_RUN` (409) · `SETTLEMENT_PERIOD_MISMATCH` (422) · `CO_WALLET_MISSING` (409) · plus two report flags that are not errors: `FULL_REVERSAL_SUSPECTED`, `RECOMPUTE_UNAVAILABLE` |
| §15 | New criterion **16**: every F-1 … F-16 finding is closed, each with the test named in its entry; F-1, F-2 and F-3 additionally reviewed by a second pair of eyes before the first tenant enables any supplementary run type |
| §5.2 | `settlement_period_month` set at prepare; `getBalanceForUpdate(userId, typeId, balanceYear, orgId, t)` with the per-source year rule (F-7) |
| §5.6 | The two independent engine-version counters called out — `payroll_run.service`'s 5 → 6 **and** `employee_tax.service`'s own `ENGINE_VERSION` 4 → 5 (F-9) |
| §5.8 (new) | The `allowSupplementary` guard mode, its three-state table and its caller list (F-2) |
| §5.9 (new) | Sibling-safe FY reads, the explicit do-not-touch list, and input-contention resolution (F-1, F-5, F-15) |
| §6.4 | #38 `SETTLEMENT_PERIOD_MISMATCH` (F-12); #42 `contended_inputs` (F-5); #49 `SIBLING_RUN_DEPENDS_ON_RUN` (F-6); #184/#185/#192/#193 and #121 fold siblings (F-1) |
| §8 | New edge cases **EC-93 … EC-104**, one per finding that is genuinely a new boundary condition |
| §9.1/§9.3 | Diff-source assertions on `arrear_diff`; six new service suites (`annual_statement_sibling_fold`, `self_monthly_statutory_fold`, `period_guard_supplementary`, `arrear_admissibility`, `arrear_skip_and_brake`, `run_cancel_lifo`, `encashment_wallet_year`) |
| §10 | Six new exit criteria covering F-1 … F-8 |
| §11.1 | New rulings **D-64 … D-70** |
| §12.1 (new) | The dependency ordering the review forced: D-65 into step 1, D-64 into step 4, step 3 before step 9, D-68 with step 3 |
| §13.4 | New behaviour-change note 4: the annual statement and #121 now sum a month's runs |

### 16.2 Reviewed and found sound — no change needed

Recorded so these are not re-litigated during implementation:

* **`payslips` uniqueness** is `UNIQUE (run_id, user_id) WHERE status='active'` (migration `00047`), **not** `(user, period_month)` — two payslips in one month are already legal at the schema level. `createForApproval` needs no change.
* **`_commitVariablePay`'s** three anti-double-pay guards are correct and row-locked. F-5 improves the experience around them, not the guard.
* **`findLiveByPeriod`** already takes `runType` as a parameter, so the duplicate-run check and the auto-draft cron are naturally scoped to `regular`.
* **Payroll never calls `lockService.checkLock`** — it only creates, adopts and deletes locks. A supplementary run for an already-locked month is therefore not blocked, which is exactly what D-55 requires.
* **`payroll_run_items` has exactly one creation path** (`_persistCohortRows`), so §4.4's `period_month NOT NULL` is safe to enforce.
* **`findFyStatutoryMonthlyTotalsForOrg` (#118)** aggregates in SQL and is sibling-safe.
* **Form 16's quarterly block** (`employee_tax.service.js:274`) accumulates per item and is sibling-safe.
* **`buildSettingsSnapshot`** already carries every aggregator/calculator knob the arrear recompute needs (`lop_basis`, `in_progress_treatment`, `overtime_*`, `standard_working_hours_per_day`, `negative_net_handling`, …); F-3's `SNAPSHOT_INCOMPLETE` guard covers only older runs whose snapshots predate a key.
* **`attendance_comp_offs.status` is `STRING(20)`** with no DB enum, and `used_on_date` / `used_leave_id` already exist — `'encashed'` needs no migration, as §1.3 stated.
