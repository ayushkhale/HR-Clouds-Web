# Phase 5 — Reimbursements & Benefits

*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_payrolls/implementation_plan.md) — the module's single source of truth. Every decision below implements a decision recorded there (`D-1` … `D-29`), or adds one (`D-30` … `D-36`) that the parent must be amended to carry. **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**
> **Predecessors:** [phase1](public/md_payrolls/phases/phase1_implementation_plan.md), [phase2](public/md_payrolls/phases/phase2_implementation_plan.md), [phase3](public/md_payrolls/phases/phase3_implementation_plan.md), [phase4](public/md_payrolls/phases/phase4_implementation_plan.md) — **all four implemented and verified in the live code** (`npm test` → **402 passing, 0 failing**, measured 2026-09-11). Phase 5 changes none of their table semantics and breaks none of their endpoint contracts; it **extends** seven of their artefacts additively (§3.2).
> **Status:** Not started.
> **Depends on:** Phase 1 (`salary_components.component_type = 'reimbursement'`, `payroll_settings`, `payroll_audit_logs`, `money.utils`, `payroll_access.utils.decideAuthority`), Phase 2 (run lifecycle, `computePayrollItem`, cohort batching, `settings_snapshot` freeze, `payroll_run_item_components.component_type/source = 'reimbursement'`), Phase 3 (**D-18 commit-at-approval / reverse-at-cancel**, `payroll_period_guard`, the deduction waterfall, `calculation_warnings`), Phase 4 (statutory bases derived from `realEarningLines` only — which is what keeps a reimbursement out of PF/ESI/TDS **by construction**). Reads **nothing new** from Attendance or Leave.

---

## 1. Goal & Boundary

**Goal.** Phase 2 answered *"what does this person earn?"*, Phase 3 *"what else is added or recovered?"*, Phase 4 *"what is withheld?"*. Phase 5 answers the two remaining money questions in the parent's scope: **"what did this person spend on the company's behalf, who approved paying it back, and how does it reach their bank without being taxed or paid twice?"** — and **"what recurring benefit is the company providing, what does each side contribute, and how does that land on the payslip?"**

Three capabilities:

1. **Reimbursement claims** — a category catalog with server-enforced limits, an employee submission portal with receipt attachments, a **multi-level approval chain** (manager → HR), and an approved claim flowing into the next open run as a **non-taxable, non-LOP payout that is not part of gross**.
2. **Benefit plans & enrollments** — health/life/accident/meal/travel plans with an employee contribution and/or an employer contribution, landing on every run of an active enrollment as a recurring deduction and/or employer-contribution line.
3. **Attachment storage on S3** — the binary-file capability the module has deferred three times (parent §11 item 4, D-19, D-29), built once, module-wide, over a neutral table. It serves reimbursement receipts **and** the two Phase-4 artefacts that were promised it: investment proofs (beside `investment_declaration_items.proof_reference`) and Form 16 Part A (beside `employee_tax_summaries`'s Part-A columns). Pre-signed URLs for upload **and** for in-browser display; the binary never transits the API process.

### 1.1 Explicitly in scope

* **7 tables** (the parent's six + `payroll_attachments`, justified in **D-30**), 7 models, 7 repositories, 6 services, **4 new pure utility modules**, **39 endpoints (#128–#166)** — 20 HR (#128–#147), 6 Manager (#148–#153), 13 Self (#154–#166).
* **S3 object storage** (**D-30, decided**) for reimbursement receipts, investment proofs **and** Form 16 Part A — closing the parent's §11 item 4, D-19's deferral and D-29's promise in one place. Two new dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
* Extension of `computePayrollItem` with **Step 6c** (benefit employer contributions), **Step 8a′** (benefit employee deductions) and **Step 8f** (the reimbursement payout, *after* the clamp, *before* rounding) — still a pure function, still no `db` import.
* A **fourth** cohort-batched, read-only aggregator (**D-34**), keeping query count O(cohorts).
* 3 new engine-owned columns on `payroll_run_items` (§4.8), all added to `ENGINE_OWNED_COLUMNS` **and** `ZERO_FIGURES`.
* One `ALTER TYPE … ADD VALUE` — `'benefit'` on `payroll_run_item_components.source` (§4.9, the module's first; read that section before writing the migration).
* Reimbursement commit/reverse riding on the **existing** Phase-3 `_commitVariablePay` / `_reverseVariablePay` transactions (**D-35**) — no new consumption mechanism.
* 3 new org settings (registry **#51–#53**).
* `engine_version` **4 → 5**.
* Unit suites for every pure module; extension of `payroll_calculation.test.js`.

### 1.2 Explicitly NOT in scope (do not build these here)

| Deferred | Phase |
|---|---|
| `payslips` table, **PDF rendering of anything**, CSV export, bank advice, payroll register / cost-center / deduction reports, bulk download, email dispatch | 6 |
| **EC-26** — missing bank details blocking `paid` (the parent assigns it to Phase 6 with the bank advice) | 6 |
| Crons (claim-ageing reminders, enrollment-window notices), arrears/retro reimbursement, off-cycle & F&F runs, benefit recovery at exit, comp-off encashment | 7 |
| Multi-currency claims, FX conversion, duplicate-receipt detection, category spend analytics | — *(parent §1.3 explicitly defers these to a later Expense module over the same tables)* |
| OCR / receipt parsing, corporate-card feeds, per-diem rules, mileage-rate tables | — *(not in the parent; do not invent)* |
| Benefit **proration** for mid-month enrollment, coverage tiers, dependant management, claims against the insurer | — *(not in the parent; see **D-36** for the deliberate no-proration rule)* |
| **Taxing an employer benefit contribution as a perquisite** (gym membership, non-exempt meal card) | 6 — *(**D-37**; a real tax gap, deliberately not closed here. Workaround and reasoning below)* |
| **Auto-crediting a benefit premium deduction toward §80D** in the Phase-4 declaration | 6 — *(**D-37**; the employee declares it manually today, exactly as they would an outside policy)* |

> **D-37 — benefit plans carry no tax semantics in Phase 5, and no unread column pretends otherwise.** Two genuine gaps exist and both are deferred: an employer contribution to a *non-exempt* benefit is a taxable perquisite that should raise `taxable_earnings`, and an employee premium on a health plan should count toward §80D relief. Neither is closed here, for a structural reason rather than an appetite one: **`taxable_earnings` is derived exclusively from `component_type: 'earning'` lines** ([`statutory_calculation.service.js:163`](src/modules/payroll/services/statutory_calculation.service.js#L163), filtering `realEarningLines`), so a Step-6c `employer_contribution` line **cannot reach it by setting a flag**. Closing the gap needs a new taxable channel into `computeStatutory` and a matching change to the TDS annualisation — surgery on Phase 4's most delicate path, for a requirement the parent never states.
>
> **Do not add an `is_taxable` or `is_perquisite` column to `benefit_plans` as a placeholder.** An unconsumed flag is worse than an absent one: HR would set it, believe tax was being withheld, and be wrong silently for a whole financial year. This is the same class of defect as an enum value with no writer, which this plan already refuses elsewhere (§4.7).
>
> **What to do in the meantime, using what already exists:** a taxable perquisite is modelled today as a Phase-3 recurring **earning adjustment** with `is_taxable: true`, which enters `taxable_earnings` and TDS correctly through the supported path; §80D relief is claimed through the Phase-4 investment declaration, the same way an employee declares a policy bought outside the company. State both in the `#138` create-plan API contract so an HR user choosing a benefit plan knows what it does and does not do to tax.

> **Honesty guard.** Phase 4 removed the "no statutory withholding" guard; Phase 5 adds no new one. What it **does** add is a semantic that a reviewer will otherwise misread: **a reimbursement payout is not an earning.** It never appears in `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage`, the PT base or `ctc_cost`. It appears **only** in `net_pay` and in the new `reimbursement_amount` column. A Phase-5 payload where `gross_earnings` moved because a travel claim was paid is a defect, not a feature — and it would silently over-withhold PF, ESI, PT and TDS on money that is not income.

### 1.3 Scope reconstruction — what the parent assigned Phase 5 vs. what actually remains

The parent's §8 Phase-5 scope was written before Phases 1–4 existed. Several of its bullets were satisfied in passing by later phases, and two of its assumptions are now wrong. This table is the reconciliation; **it, not the parent's §8, is the scope of work.**

| Parent's Phase-5 requirement | Status after Phases 1–4 | What Phase 5 actually does |
|---|---|---|
| `reimbursement_categories` with limits, taxable flag, receipt requirement | **New** | Build (§4.1). No default catalog — the Phase-4 §11 item 4 reasoning on PT slabs applies |
| `reimbursement_claims` + line items with attachments | **New**; the enum values are pre-built | Build (§4.2/§4.3). `component_type`/`source = 'reimbursement'` **already exist** on both enums from Phases 1–2 — no `ALTER TYPE` |
| `reimbursement_approvals`, multi-level manager → finance/HR | **New** | Build (§4.4). **Tier A**, not Tier B — the parent's own RBAC table says manager-authoritative, so the D-13 propose→approve machinery is *not* reused here |
| "reusing `approval_chain.utils`" | **Partially valid — and unsafe as written** | The util is reused for *routing* only, wrapped by a pure resolver that maps its `admin` escalation to `hr` (**D-32**). Consuming it directly would route claims to a role D-14 gives zero payroll capability |
| "reusing `getAccessibleUserIds`" | **Already implemented** | Consumed unchanged through `decideAuthority`. No new authority logic, no new role list |
| Status pipeline `submitted → under_review → approved/rejected → processed` | **New** | Built (§6.5), plus a `draft` authoring state — the Phase-4 declaration precedent, and a prerequisite for attaching receipts before submission |
| "Approved claims flow into the next run as non-taxable, non-LOP payout components" | **New**, but the engine seam exists | Engine Step 8f (§5.5). The `component_type: 'reimbursement'` exclusion from gross and statutory bases is **free by construction** (§2 item 3) |
| "paying a run marks claims `processed`" | **Reconciled with D-18** | The anti-double-pay *stamp* rides on run **approval** (D-18, existing machinery); the `processed` *status* flips at run **pay** (**D-35**). Both, not either |
| `benefit_plans` + `employee_benefit_enrollments` | **New** | Build (§4.5/§4.6). Needs the module's first `ALTER TYPE` for `source = 'benefit'` (§4.9) |
| "File attachments: decide storage (local vs S3) at phase start" | **DECIDED 2026-09-11 — S3** | **D-30.** Scope is wider than the parent knew: D-29 also assigned investment proofs and Form 16 Part A to this phase, so one `payroll_attachments` table serves all three (§4.7, §6.7) |
| **EC-23** — "approved after the run closed → next-cycle payout, never double-paid" | **Largely already solved** | Phase 3's `payroll_period_guard` + `requires_recalculation` + `409 RUN_STALE` already deliver "never mutate a closed run". Phase 5 adds only forward *resolution* of the payout month (§6.4) and reuses the guard verbatim — **no new staleness or double-pay mechanism is built** |
| **EC-26** — missing bank details block `paid` | **Not Phase 5** | The parent's own §8 assigns it to Phase 6 with the bank advice. Explicitly out of scope (§1.2) |
| Org setting "reimbursement approval levels + per-category limits" | **New** | Registry #51 (levels, payout lookahead) + #52 (category policy, table-held) + #53 (benefits). §4.10 |

**Nothing in the parent's Phase-5 list is dropped.** Two items shrink because earlier phases already built their hard part (EC-23, `getAccessibleUserIds`), one is corrected before use (`approval_chain.utils`), one is reconciled against a later decision (`processed` vs D-18), and one grows (attachments, because D-29 added to it).

---

## 2. Pre-Flight Checks (do these before writing code)

Each is a fact verified in the live Phase-1/2/3/4 code. Each one silently breaks Phase 5 if missed.

1. **Next migration number is `00044`.** The latest is `00043-create-payroll-statutory-tax.js`. Payroll migrations are **not contiguous** (`00039`, `00041`, `00042` belong to other modules) — check `ls`, do not assume.
2. **`component_type = 'reimbursement'` already exists on both enums** — [`salary_components.model.js:26`](src/modules/payroll/models/salary_components.model.js#L26) and [`payroll_run_item_components.model.js:43`](src/modules/payroll/models/payroll_run_item_components.model.js#L43). **`source = 'reimbursement'` already exists** too ([`:84`](src/modules/payroll/models/payroll_run_item_components.model.js#L84)). Phases 1 and 2 declared the full enums deliberately. **Phase 5 needs no `ALTER TYPE` for reimbursements** — only for `benefit` (§4.9).
3. **A `component_type: 'reimbursement'` line is excluded from gross and from every statutory base by construction, and this is load-bearing.** [`payroll_calculation.service.js:419`](src/modules/payroll/services/payroll_calculation.service.js#L419) computes `realEarningLines = components.filter(c => c.component_type === EARNING && c.source !== 'rounding')`, and that array is *both* the gross base *and* the sole input to `computeStatutory` ([`:435`](src/modules/payroll/services/payroll_calculation.service.js#L435)). `statutory_calculation.service` re-filters only *within* the array it is handed ([`:139`–`:164`](src/modules/payroll/services/statutory_calculation.service.js#L139-L164)); it never re-reads `components`. **Emitting a reimbursement as `component_type: 'earning'` would therefore put it into PF, ESI, PT and TDS simultaneously.** This is the single most expensive mistake available in this phase.
4. **`payroll_run_item_components` has no `is_hra` / `is_statutory` column.** Phase 4 reads those flags off the *in-memory* line objects sourced from `employee_salary_structure_components`. Phase-5 lines must still set them on the in-memory object (`is_hra: false`, `is_statutory: false`) so `computeStatutory`'s filters are total; they simply are not persisted. Do not "fix" this by adding columns.
5. **`ENGINE_OWNED_COLUMNS`** ([`payroll_run_item.repository.js:22`](src/modules/payroll/repositories/payroll_run_item.repository.js#L22)) is the UPSERT allow-list. **All 3 new `payroll_run_items` columns must be added**, or recalculation silently freezes the first calculation's reimbursement and benefit figures.
6. **`ZERO_FIGURES`** ([`payroll_run.service.js:68`](src/modules/payroll/services/payroll_run.service.js#L68)) must gain the same 3 columns. Its own comment states why: a recalculation that turns a calculated item into an `error` must **overwrite**, not preserve, stale figures. An omission here leaves a paid-looking reimbursement on an errored item.
7. **`buildSettingsSnapshot` is an explicit allow-list** ([`payroll_run.service.js:116`](src/modules/payroll/services/payroll_run.service.js#L116)), and `create` hard-codes **`engine_version: 4`** at [`:439`](src/modules/payroll/services/payroll_run.service.js#L439), immediately above the statutory-block assembly at [`:441`](src/modules/payroll/services/payroll_run.service.js#L441). **Phase 5 must change that literal to `5` *and* the column default (§4.8)** — both, or a run created before the code deploy reports the wrong engine. Add `reimbursement_payout_lookahead_months` + `benefit_deductions_enabled` to the snapshot allow-list; a knob missing from it reads `undefined` in the engine.
8. **`_commitVariablePay` fetches component lines by source: `['adjustment', 'loan']`** ([`payroll_run.service.js:1296`](src/modules/payroll/services/payroll_run.service.js#L1296)). Phase 5 must add `'reimbursement'`. It must **not** add `'benefit'` — benefits are derived, never consumed (**D-33**).
9. **Do not route benefit lines through `source: 'adjustment'`.** `_commitVariablePay` maps every `adjustment` line with a non-null `source_ref_id` that is not an engine code into `payrollAdjustmentRepo.findByIdsForUpdate` ([`:1307`](src/modules/payroll/services/payroll_run.service.js#L1307), [`:1345`](src/modules/payroll/services/payroll_run.service.js#L1345)) and throws `409 ADJUSTMENT_ALREADY_APPLIED` when the id is absent. A benefit line carrying an enrollment id as `source_ref_id` would therefore **break every run approval in the org**. This is why §4.9 adds a real `benefit` enum value rather than reusing the D-20 reserved-code trick.
10. **`payroll_period_guard.assertPeriodOpenForVariablePay(orgId, periodMonth, transaction)`** ([`payroll_period_guard.service.js:44`](src/modules/payroll/services/payroll_period_guard.service.js#L44)) is the EC-31 gate and **already takes the rank-1 advisory lock and sets `requires_recalculation`**. Phase 5 reuses it verbatim for claim payout targeting; `lockRunForPeriod` is exported alongside it for callers that need the lock without the assertion.
11. **`approval_chain.utils.resolveApprover(requesterId, orgId)`** ([`src/modules/leave/utils/approval_chain.utils.js`](src/modules/leave/utils/approval_chain.utils.js)) returns `{ approver_user_id, escalated_to_role }` and **can return `escalated_to_role: 'admin'`** (line 21, on self-reporting/CEO). `admin` is a **platform-plane role with no payroll capability whatsoever** (**D-14**). Consuming this util unmapped would either route a claim to a role that cannot see it or invite someone to widen a payroll role list. See **D-32** — Phase 5 wraps it and maps `admin → hr`. It also imports `db` directly and swallows errors into an `hr` escalation, which is acceptable for routing but means **it must never be the authority check**.
12. **`decideAuthority`** ([`payroll_access.utils.js`](src/modules/payroll/utils/payroll_access.utils.js)) is the authority chokepoint and already handles `manager_can_view_team_compensation`, `payroll_require_separate_checker` and `manager_direct_compensation_authority`. Phase 5 **consumes it unchanged** — no new authority logic, no new role list. Reimbursement approval is **Tier A** (manager-authoritative), not Tier B, so `canPropose`/`canApproveFor` are not the relevant fields; `scope` is.
13. **`toPaise` rejects negatives by default** (`422 NEGATIVE_MONEY`, [`money.utils.js:67`](src/modules/payroll/utils/money.utils.js#L67)). Every Phase-5 amount is stored and transported **positive**; direction is carried by `component_type`. `source: 'rounding'` remains the only negative line in the system, and Assert 1 ([`payroll_calculation.service.js:547`](src/modules/payroll/services/payroll_calculation.service.js#L547)) enforces it — a reimbursement or benefit line with a negative amount must throw `INVALID_COMPONENT_AMOUNT`.
14. **Assert 2 is `reconGross − totalDeductions + shortfall + rounding == netPaise`** ([`:553`–`:559`](src/modules/payroll/services/payroll_calculation.service.js#L553-L559)). Adding a reimbursement to net **without** adding the matching term to this assert makes **every run with a claim fail `CTC_RECONCILIATION_FAILED`**. §5.5 specifies the exact new form.
15. **Express 5: `req.query` is getter-only.** Every list/filter endpoint validates query params **inside the controller** via `validateOrThrow`.
16. **No upload infrastructure exists** — verified at phase start: no `multer`, no `busboy`, no `@aws-sdk/client-s3`, no `pdfkit`. `@aws-sdk/client-ses` **is** present, so AWS SDK v3 core and the credential-provider chain are already in the image. `express.json({ limit: '10mb' })` is the only body parser and **Phase 5 does not raise it** — the binary never reaches Express (**D-30**, §5.4). Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; add nothing else.
17. **PostgreSQL version must be confirmed before writing the migration.** `ALTER TYPE … ADD VALUE` inside a transaction requires **PG 12+**, and `ADD VALUE IF NOT EXISTS` likewise. No `ALTER TYPE` exists anywhere in the 43 current migrations — §4.9 is the module's first, and it has a `down()` consequence PostgreSQL gives no way around.
18. **Route-order trap.** Register `/reimbursements/categories*` and `/reimbursements/claims*` before any `/reimbursements/:param`; register `/me/reimbursements/attachments/:id/*` as its own static branch so it cannot be captured by `/me/reimbursements/claims/:id`. There must be **no bare `:param` directly under `/reimbursements` or `/me/reimbursements`** — the Phase-4 §2 item 20 rule, restated.
19. **`npm test` is green at 402 tests.** That is the regression baseline; any Phase-5 commit that reduces it is a defect, not a trade-off.
20. **The ESI eligibility base and the PF wage are flag-gated; the PT gross is not.** [`statutory_calculation.service.js:159`](src/modules/payroll/services/statutory_calculation.service.js#L159) filters on `esi_applicable === true`, [`:155`](src/modules/payroll/services/statutory_calculation.service.js#L155) on `pf_applicable === true`, but [`:162`](src/modules/payroll/services/statutory_calculation.service.js#L162) sums **every** usable earning line into `ptGrossPaise`. This is why a taxable reimbursement can be an `earning` without touching ESI or PF, and why it unavoidably touches PT (§5.5). Neither behaviour is incidental — both are relied on.
21. **`tax_period.utils.financialYearOf(periodMonth, fyStartMonth)` already exists and is exported.** Phase 5's per-period limit windows (§5.1) use it. Do not re-derive the FY boundary inline or in SQL; the org's `fy_start_month` is configurable and two definitions will disagree the first time one is not April.
22. **`btree_gist` must be available** for §4.6's EXCLUDE constraint. `00000-enable-uuid-extension.js` already runs `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`, so the migration role has the privilege; confirm the contrib package is installed on self-hosted servers (it ships by default on RDS, Aurora and Cloud SQL). §4.6 states the fallback if it is genuinely unavailable.

---

## 3. Directory Structure

### 3.1 Additions

```text
src/modules/payroll/
├── models/
│   ├── reimbursement_categories.model.js           ← new
│   ├── reimbursement_claims.model.js               ← new
│   ├── reimbursement_claim_items.model.js          ← new
│   ├── reimbursement_approvals.model.js            ← new
│   ├── benefit_plans.model.js                      ← new
│   ├── employee_benefit_enrollments.model.js       ← new
│   └── payroll_attachments.model.js                ← new (D-30)
├── repositories/                                   ← one per model, same names
├── services/
│   ├── reimbursement_category.service.js           ← new (catalog + limit policy)
│   ├── reimbursement_claim.service.js              ← new (authoring + submission)
│   ├── reimbursement_approval.service.js           ← new (the chain; D-32)
│   ├── benefit_plan.service.js                     ← new (plans + enrollments)
│   ├── attachment.service.js                       ← new (D-30 storage adapter façade)
│   └── payroll_payout_aggregator.service.js        ← new (D-34, batched, read-only)
└── utils/
    ├── reimbursement_limits.utils.js               ← PURE (per-claim / per-period caps)
    ├── approval_chain_resolver.utils.js            ← PURE (level materialisation; D-32)
    ├── benefit_contribution.utils.js               ← PURE (per-period contribution amounts)
    └── payout_selector.utils.js                    ← PURE (which claims / enrollments this run)
```

`payroll_payout_aggregator.service.js` follows the Phase-3/Phase-4 sibling pattern exactly: read-only, cohort-scoped, writes nothing. The four utils import **no `db`**, and their suites assert it — the Phase-2 precedent.

### 3.2 Extensions to existing files (additive only)

| File | Change |
|---|---|
| `services/payroll_calculation.service.js` | Two new optional inputs (`reimbursements`, `benefitContributions`); Steps 6c, 8a′, 8f; the amended Assert 2 (§5.5). **Stays pure**; omitting both inputs reproduces Phase-4 output byte-for-byte |
| `services/payroll_run.service.js` | `engine_version: 5` + column default; `buildSettingsSnapshot` gains 2 keys; a per-cohort payout-aggregation call; the 3 new item columns in `_buildCohortRows`; `ZERO_FIGURES` gains them; `_commitVariablePay` / `_reverseVariablePay` gain the reimbursement block (**D-35**); `#37 eligibility` and `#42 preview` gain payout counters |
| `repositories/payroll_run_item.repository.js` | 3 new names in `ENGINE_OWNED_COLUMNS` |
| `services/payslip_read.service.js` | A `reimbursements` block and a `benefits` block on `_projectDetail`; `reimbursement_amount` on `_projectListRow` |
| `services/salary_component.service.js` | Reserve the two new engine component codes (§5.5) alongside the existing four |
| `models/payroll_run_item_components.model.js` | `source` enum gains `'benefit'` (§4.9) |
| `validators/payroll_hr.validator.js`, `payroll_manager.validator.js`, `payroll_self.validator.js` | New schemas; `updateSettingsSchema` gains the three §4.7 keys |
| `controllers/`, `routes/` (**all three audiences**) | Extended in place. **No fourth route audience, no new auth stack** |

`payroll_attendance_aggregator.service.js`, `payroll_variable_pay_aggregator.service.js`, `payroll_statutory_aggregator.service.js`, `statutory_calculation.service.js` and `payroll_period_guard.service.js` are **not modified**.

### 3.3 Layer responsibilities — who owns what

The module's existing separation is strict and Phase 5 does not bend it. Where a Phase-5 responsibility could plausibly sit in two layers, this table is the ruling.

| Layer | Owns | Must never |
|---|---|---|
| **Route** | Path shape and order, auth stack selection, `validate()` on body/params | Contain business logic; validate `req.query` (Express 5 — getter-only, §2 item 15) |
| **Controller** | `validateOrThrow` on query params, unwrapping `req.user`, shaping the response envelope, `try/catch → next(error)` | Decide authority; open a transaction; touch a repository |
| **Service** | Transactions, advisory locks, authority resolution (`getAccessibleUserIds` → `decideAuthority`), state transitions, audit writes, calling pure utils | Contain arithmetic that could be pure; be called by another service that it also calls (no cycles — `payroll_period_guard`'s standalone existence is the precedent) |
| **Repository** | Query construction, `transaction` forwarding, `org_id` in every predicate, lean attribute lists | Contain business rules; decide what is selectable (that is `payout_selector.utils`) |
| **Pure utils** | All money arithmetic, limit maths, chain shape, contribution amounts, selection predicates | Import `db`, a repository, a model, `Date.now()` or randomness — **their suites assert this** |
| **`attachment.service`** | The S3 façade only: sign, verify, key construction | Resolve authority — that is the caller's job (§6.7), because authority depends on the *owner*, which the attachment service does not load |

**Two specific rulings, because both have an obvious wrong answer:**

* **Limit enforcement lives in the service, not the repository**, even though it needs a DB read. The service reads prior spend and hands it to the pure `reimbursement_limits.utils` (§5.1); the repository only sums. This keeps the *rule* testable without a database and the *query* replaceable without touching the rule.
* **Claim selection for a run lives in `payout_selector.utils`, not in the aggregator's WHERE clause.** The aggregator's query is a coarse fetch; the precise "is this claim payable by this run" predicate — including the `applied_run_id IS NULL OR = runId` idempotency clause — is pure and unit-tested. The Phase-3 `variable_pay_selector` precedent, verbatim.

---

## 4. Database Schema — Migration `00044-create-payroll-reimbursements-benefits.js`

Same shape as `00043`: one `queryInterface.sequelize.transaction()`, tables in FK dependency order, partial unique indexes `WHERE deleted_at IS NULL`, CHECK constraints via raw `ALTER`, `down()` reversing and dropping every **newly created** enum type with `CASCADE`.

**Conventions.** UUID PK `defaultValue: Sequelize.UUIDV4` · `org_id` UUID NOT NULL FK → `organizations` (`CASCADE`/`CASCADE`) · `created_at`/`updated_at` NOT NULL · `underscored: true`.

**Paranoid policy (extends D-16).** All seven new tables are **paranoid** — each is a user-authored financial or evidentiary artefact whose deletion must leave a tombstone. `reimbursement_approvals` is paranoid too: it is *generated*, but it records who approved money, and an auditor must be able to see a chain that was superseded.

**Create order:** `CREATE EXTENSION IF NOT EXISTS btree_gist` (§4.6) → `reimbursement_categories` → `reimbursement_claims` → `reimbursement_claim_items` → `reimbursement_approvals` → `benefit_plans` → `employee_benefit_enrollments` **+ its EXCLUDE constraint** → `payroll_attachments`, then the `addColumn`s on `payroll_settings` and `payroll_run_items`, then the `ALTER TYPE` (§4.9).

### 4.1 `reimbursement_categories`

| Column | Type | Notes |
|---|---|---|
| `name` | STRING(150) NOT NULL | |
| `code` | STRING(50) NOT NULL | uppercase alnum + `_`; unique per org |
| `description` | TEXT NULL | |
| `is_taxable` | BOOLEAN NOT NULL DEFAULT false | **Changes the emitted line's `component_type` — see D-31.** Default `false` is the parent's stated behaviour |
| `requires_receipt` | BOOLEAN NOT NULL DEFAULT true | Enforced at **submission**, per line item, against `payroll_attachments` |
| `receipt_required_above_amount` | DECIMAL(14,2) NULL | NULL = always required when `requires_receipt`. Lets an org skip receipts for trivial amounts without turning the rule off |
| `max_amount_per_claim` | DECIMAL(14,2) NULL | NULL = uncapped. `CHECK (> 0)` when set |
| `max_amount_per_period` | DECIMAL(14,2) NULL | NULL = uncapped |
| `limit_period` | ENUM(`month`,`financial_year`) NOT NULL DEFAULT `financial_year` | the window `max_amount_per_period` is measured over |
| `component_id` | UUID NULL FK `salary_components` (RESTRICT) | optional catalog mapping for Phase-6 report joins. Must **not** be an `is_statutory` component (**D-23**) |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes** — UNIQUE `(org_id, code)` WHERE `deleted_at IS NULL` · `(org_id, is_active)`.

**No default catalog ships.** Expense categories are org policy, not statute — the **§11 item 4 reasoning from Phase 4** (no default PT slabs) applies identically: a seeded "Travel / Meals / Internet" set would look authoritative and be wrong for most orgs. `#128` creates them; the API analysis documents an example set.

### 4.2 `reimbursement_claims`

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID NOT NULL FK users (CASCADE) | the claimant |
| `claim_number` | STRING(30) NOT NULL | human reference, `RC-YYYYMM-NNNN`, assigned **at submission** (§7.2) |
| `title` | STRING(200) NOT NULL | |
| `status` | ENUM(`draft`,`submitted`,`under_review`,`approved`,`rejected`,`cancelled`,`processed`) NOT NULL DEFAULT `draft` | §6.5 |
| `total_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | Σ items, recomputed in the same transaction as any item change. **Never** the engine's source of truth — the engine reads `approved_amount` |
| `approved_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | Σ of item `approved_amount`. **This is what is paid.** Zero until the final approval level commits |
| `current_level` | SMALLINT NOT NULL DEFAULT 0 | 0 = not submitted; otherwise the level awaiting action |
| `total_levels` | SMALLINT NOT NULL DEFAULT 0 | frozen at submission (§7.2) — a later settings change must not re-shape an in-flight chain |
| `submitted_at` | DATE NULL | |
| `finalized_at` | DATE NULL | when the last level approved or any level rejected |
| `rejection_reason` | TEXT NULL | |
| `cancellation_reason` | TEXT NULL | |
| `payout_period_month` | STRING(7) NULL | `'YYYY-MM'`. **NOT NULL in effect from final approval onward** (§6.4) — see the boxed note |
| `applied_run_id` | UUID NULL FK `payroll_runs` (SET NULL) | stamped at run approval (**D-35**) |
| `applied_run_item_id` | UUID NULL FK `payroll_run_items` (**SET NULL** — items are hard-deleted by `pruneAbsent`, Phase 3 §2 item 7) | |
| `applied_at` · `processed_at` | DATE NULL | `applied_at` at run approval, `processed_at` at run pay |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes**
* `reimbursement_claims_engine_idx` — `(org_id, payout_period_month, status)` WHERE `applied_run_id IS NULL AND deleted_at IS NULL` → the engine's exact selection predicate, mirroring `payroll_adjustments_engine_idx`.
* UNIQUE `(org_id, claim_number)` WHERE `deleted_at IS NULL` · `(org_id, user_id, status)` · `(org_id, status, current_level)` (the approval queue) · `(applied_run_id)`.

> **`payout_period_month` is nullable in the schema and mandatory in the lifecycle.** It cannot be NOT NULL: a `draft` claim exists before any payout decision. But **no claim may reach `approved` with it NULL** — §7.3 sets it inside the final-approval transaction, and the engine's predicate requires it. Phase 3's lesson is the reason it is set at all rather than left as "the next run": *"'next run' is ambiguous and ambiguity is how money gets paid twice."* A CHECK constraint cannot express "NOT NULL when status = 'approved'" portably across the soft-delete cases, so the invariant is enforced in the service and asserted in §10.

### 4.3 `reimbursement_claim_items`

`claim_id` FK (CASCADE) · `org_id` · `user_id` (denormalised for the cohort read) · `category_id` UUID NOT NULL FK `reimbursement_categories` (**RESTRICT** — a category in use cannot be deleted out from under a claim) · `expense_date` DATEONLY NOT NULL · `amount` DECIMAL(14,2) NOT NULL `CHECK (amount > 0)` · `approved_amount` DECIMAL(14,2) NULL (NULL until acted on; **`<= amount`**, never more) · `merchant` STRING(150) NULL · `description` TEXT NULL · `item_status` ENUM(`pending`,`approved`,`rejected`) NOT NULL DEFAULT `pending` · `approver_remarks` TEXT NULL · `display_order` INTEGER NOT NULL DEFAULT 0.

**Denormalised at creation from the category row (snapshot, not join):** `category_code` STRING(50) NOT NULL · `category_name` STRING(150) NOT NULL · `is_taxable` BOOLEAN NOT NULL · `component_id` UUID NULL.

> **Why snapshot the category's behaviour.** This is the Phase-1 §4.5 decision applied one layer down, for the same reason: HR flipping a category's `is_taxable` in March must not retroactively change how a January claim was paid and taxed. The `category_id` FK is retained for provenance and reporting joins.

**Indexes** — `(claim_id, display_order)` · `(org_id, user_id, expense_date)` (the §5.1 limit window scan) · `(org_id, category_id)`.

**No unique constraint** — an employee legitimately files two taxi fares on one date.

### 4.4 `reimbursement_approvals`

`claim_id` FK (CASCADE) · `org_id` · `level` SMALLINT NOT NULL (1-based) · `approver_role` ENUM(`manager`,`hr`) NOT NULL · `assigned_approver_id` UUID NULL FK users (SET NULL) — resolved at submission for routing and visibility · `status` ENUM(`pending`,`approved`,`rejected`,`skipped`) NOT NULL DEFAULT `pending` · `acted_by` UUID NULL FK users (SET NULL) · `acted_at` DATE NULL · `remarks` TEXT NULL.

**Indexes** — UNIQUE `(claim_id, level)` WHERE `deleted_at IS NULL` → **this index is what makes "a claim cannot skip a level" structural** · `(org_id, status, assigned_approver_id)` (the "awaiting me" queue) · `(org_id, approver_role, status)`.

> **`assigned_approver_id` routes; it does not authorise.** Authority is re-resolved live at action time through `getAccessibleUserIds` + `decideAuthority` (**D-32**). A manager who inherits the reporting line after submission can act; one who has lost it cannot. Recording the assignment anyway gives the employee a truthful "with <name>" status and gives HR a stale-queue signal, without creating the Phase-1 EC-29 failure mode where a reorg makes a record permanently unactionable.

### 4.5 `benefit_plans`

| Column | Type | Notes |
|---|---|---|
| `name` | STRING(150) NOT NULL | |
| `code` | STRING(50) NOT NULL | unique per org |
| `benefit_type` | ENUM(`health_insurance`,`life_insurance`,`accident_insurance`,`meal`,`travel`,`other`) NOT NULL | |
| `provider_name` | STRING(150) NULL | |
| `description` | TEXT NULL | |
| `employee_contribution_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | **monthly, flat.** `CHECK (>= 0)` |
| `employer_contribution_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | monthly, flat. `CHECK (>= 0)` |
| `employee_component_id` · `employer_component_id` | UUID NULL FK `salary_components` (RESTRICT) | optional catalog mapping; neither may be `is_statutory` (**D-23**) |
| `coverage_amount` | DECIMAL(14,2) NULL | informational (sum insured) |
| `effective_from` | DATEONLY NOT NULL | |
| `effective_to` | DATEONLY NULL | NULL = open |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes** — UNIQUE `(org_id, code)` WHERE `deleted_at IS NULL` · `(org_id, is_active, effective_from)`.

> **Flat monthly amounts only — percentage contributions are deliberately not built.** The parent says *"linked to runs as employee deduction and/or employer contribution"* and nothing about percentage-of-salary premiums. A percentage benefit would need a base definition, a mid-month-revision rule and its own reconciliation test, all speculative. An org needing salary-banded premiums models them as **two plans and two enrollments** today. If a real requirement appears, the column set extends without restructuring.

### 4.6 `employee_benefit_enrollments`

`user_id` UUID NOT NULL FK users (CASCADE) · `plan_id` UUID NOT NULL FK `benefit_plans` (**RESTRICT**) · `org_id` · `enrolled_from` DATEONLY NOT NULL · `enrolled_to` DATEONLY NULL (NULL = open) · `status` ENUM(`active`,`ended`,`cancelled`) NOT NULL DEFAULT `active` · `employee_contribution_override` DECIMAL(14,2) NULL (NULL = inherit the plan) · `employer_contribution_override` DECIMAL(14,2) NULL · `enrolled_by` UUID NULL FK users (SET NULL) · `ended_by` UUID NULL FK users (SET NULL) · `end_reason` TEXT NULL.

**Denormalised at enrollment (snapshot, not join):** `plan_code` STRING(50) NOT NULL · `plan_name` STRING(150) NOT NULL — same reproducibility reasoning as §4.3.

**Indexes**
* `employee_benefit_enrollments_engine_idx` — `(org_id, user_id, status, enrolled_from)` → the engine's cohort predicate.
* UNIQUE `(user_id, plan_id)` WHERE `status = 'active' AND deleted_at IS NULL` → an employee cannot hold two **live** enrollments in one plan. **This index alone does not prevent a double charge** — see the EXCLUDE constraint below, which is what actually does.
* `(org_id, plan_id, status)`.

#### The overlap EXCLUDE constraint — the constraint that actually prevents a double premium

> **The partial unique index has a hole, and money falls through it.** It only constrains rows where `status = 'active'`, but §5.7 query 2 deliberately also selects `status = 'ended'` enrollments whose `enrolled_to >= periodStart` — an enrollment ended mid-period must still charge that period (**D-36**). So: enroll U in plan P for Jan–Jun, end it; re-enroll U in P from April. One row is `ended`, one is `active`, the partial index is satisfied, and **April, May and June are each charged two premiums**, silently, for as long as the overlap lasts. Two `ended` rows overlapping (enroll → end → re-enroll backdated → end) slips through even more easily, because the index constrains neither of them. This is reachable through `#143` alone, with no concurrency and no unusual input — only a backdated `enrolled_from`.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for `uuid WITH =` inside a GiST index

ALTER TABLE employee_benefit_enrollments
  ADD CONSTRAINT employee_benefit_enrollments_no_month_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    plan_id WITH =,
    daterange(
      date_trunc('month', enrolled_from::timestamp)::date,
      CASE WHEN enrolled_to IS NULL THEN 'infinity'::date
           ELSE (date_trunc('month', enrolled_to::timestamp) + INTERVAL '1 month' - INTERVAL '1 day')::date
      END,
      '[]'
    ) WITH &&
  ) WHERE (status <> 'cancelled' AND deleted_at IS NULL);
```

**Four things about this statement are load-bearing, and each is a way to get it wrong:**

1. **The range is expanded to whole months, not to the literal dates.** Because **D-36** charges a full premium for any month an enrollment touches, the unit of double-charging is the *month*, not the day. A plain `daterange(enrolled_from, enrolled_to)` would happily accept `[Jan 1 – Mar 15]` alongside `[Mar 20 – …]` — no date overlap, **two premiums in March**. Truncating to month boundaries is what makes the constraint match what §5.3 actually charges.
2. **Bounds are `'[]'` (inclusive).** `enrolled_to` is a DATEONLY the enrollment is live *on*. With `'[)'`, an enrollment ending 31 March and one starting 31 March would not collide.
3. **Every expression must be IMMUTABLE.** `date_trunc(text, timestamp)` is; `date_trunc(text, timestamptz)` is **STABLE** and PostgreSQL will reject the index with *"functions in index expression must be marked IMMUTABLE"*. The explicit `::timestamp` cast is therefore mandatory, not stylistic — dropping it turns a working migration into a confusing failure.
4. **`cancelled` is excluded, `ended` is not.** A `cancelled` enrollment is one that never took effect and never charges; an `ended` one charged real months and must still block an overlap with them.

**`btree_gist` is a stock PostgreSQL contrib module** (present on RDS, Aurora, Cloud SQL and every standard distribution), with no application dependency and no runtime cost. The repo already establishes the precedent and the privilege: `00000-enable-uuid-extension.js` runs `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`. Create it in `00044` the same way, and **do not drop it in `down()`** — an extension is shared infrastructure, and the constraint disappears with the table anyway.

**If the extension is genuinely unavailable in a target environment**, the §7.5 service check plus the `payroll:benefit:{userId}` advisory lock is a correct fallback on its own (every writer takes the lock, so check-then-insert is serialised per user). Ship that rather than nothing — but ship the constraint when you can, because it is the only layer that survives a Phase-6 bulk-enrollment endpoint, a support script, or a manual `INSERT` that forgets the rule.

**Legitimate cases this refuses, and their remedy:** ending a plan and re-enrolling the same employee in the **same** plan within the same month is rejected (`409 ENROLLMENT_PERIOD_OVERLAP`). That is correct — under D-36 both rows would charge that month. To change a contribution mid-relationship, set `employee_contribution_override` on the existing enrollment; to genuinely restart cover, end it and re-enroll from the **first of a later month**.

### 4.7 `payroll_attachments` — **D-30**

Module-wide, polymorphic, neutrally named. It is the 7th table and the parent's §4 Phase-5 list must be amended to carry it (§9). **It serves all three of the module's attachment needs — reimbursement receipts, investment-proof documents and Form 16 Part A — which is what closes D-29 and the parent's §11 item 4 in one place rather than three.**

| Column | Type | Notes |
|---|---|---|
| `owner_type` | ENUM(`reimbursement_claim_item`,`investment_declaration_item`,`form16_part_a`) NOT NULL | the three consumers, each with a real endpoint in §6 — no value is declared without a writer |
| `owner_id` | UUID NOT NULL | **no FK — polymorphic**, matching the `payroll_audit_logs` precedent already in this module. For `form16_part_a` it is the `employee_tax_summaries.id` |
| `user_id` | UUID NOT NULL FK users (CASCADE) | the subject the file belongs to; the scoping key for every read |
| `file_name` | STRING(255) NOT NULL | sanitised; **never used as a path component** (§5.4) |
| `content_type` | STRING(100) NOT NULL | allow-list enforced at three points (§5.4) |
| `size_bytes` | INTEGER NOT NULL | `CHECK (size_bytes > 0 AND size_bytes <= 10485760)` — 10 MB |
| `checksum_sha256` | STRING(64) NULL | from a single-part ETag only; NULL for multipart (§5.4) |
| `storage_backend` | ENUM(`s3`,`reference`) NOT NULL DEFAULT `s3` | `reference` is for a TRACES-hosted Part A the org links rather than uploads (§5.4) |
| `storage_key` | TEXT NOT NULL | the object key under `s3`; the external URL under `reference` |
| `status` | ENUM(`pending`,`available`,`deleted`) NOT NULL DEFAULT `pending` | `pending` until `#163` confirms the object actually landed |
| `uploaded_by` | UUID NULL FK users (SET NULL) | |
| `confirmed_at` | DATE NULL | |

**Indexes** — `(org_id, owner_type, owner_id)` · `(org_id, user_id)` · `(org_id, status, created_at)` (the orphan sweep, §11 item 6).

**CHECKs** — `status = 'available'` requires `confirmed_at IS NOT NULL`; `storage_backend = 'reference'` requires `status = 'available'` (a linked URL has nothing to confirm). Both via raw `ALTER`.

> **A `pending` attachment does not exist as far as every other rule is concerned.** The receipt-requirement check (§5.1), the claim detail payload and every view-URL endpoint filter `status = 'available'`. This is what makes an abandoned pre-signed upload harmless rather than a claim that looks documented and is not — and it is why `confirmUpload` verifies against `HeadObject` instead of trusting the client's word that the PUT succeeded.

### 4.8 `payroll_run_items` additions — 3 columns

`addColumn` on the Phase-2 table. **All 3 must be added to `ENGINE_OWNED_COLUMNS` (§2 item 5) and `ZERO_FIGURES` (§2 item 6).**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `reimbursement_amount` | DECIMAL(14,2) NOT NULL | `0` | Σ of the item's `component_type = 'reimbursement'` lines. **Not** part of gross, taxable, PF/ESI or CTC |
| `benefit_employee_amount` | DECIMAL(14,2) NOT NULL | `0` | Σ of `source = 'benefit'` deduction lines |
| `benefit_employer_amount` | DECIMAL(14,2) NOT NULL | `0` | Σ of `source = 'benefit'` employer-contribution lines (already inside `total_employer_contributions` and `ctc_cost`) |

Also `changeColumn` `payroll_runs.engine_version` default `4` → `5`.

### 4.9 The `source` enum addition — the module's first `ALTER TYPE`

`payroll_run_item_components.source` gains **`'benefit'`**. Reasons it must be a real enum value and not a reserved component code under `source: 'adjustment'` are in §2 item 9 — the reserved-code route would route enrollment ids into `payrollAdjustmentRepo.findByIdsForUpdate` and break every run approval in the org.

```sql
ALTER TYPE "enum_payroll_run_item_components_source" ADD VALUE IF NOT EXISTS 'benefit';
```

**Three binding constraints on how this is written:**

1. **PG 12+ only** (§2 item 17). Confirm the server version before writing the migration. On PG < 12 this statement cannot run inside a transaction block at all and the migration must be split.
2. **The new value cannot be *used* in the transaction that adds it.** Migration `00044` only *adds* the label — it inserts no `payroll_run_item_components` row and declares no DEFAULT or CHECK referencing `'benefit'`. That keeps it safe. Do not "helpfully" backfill anything using it in the same migration.
3. **`down()` cannot remove it.** PostgreSQL has no `DROP VALUE`. The options are to rebuild the type (rewriting a populated column on a table that may hold millions of rows, under a transaction, with every dependent view and index — genuinely dangerous) or to leave the unused label in place. **Leave it, and say so in the migration's `down()` as a comment.** An unreferenced enum label is inert; a type rebuild on live payroll component data is not. This asymmetry must be stated in the migration itself, because the module's `down()` discipline otherwise trains a reader to expect full reversal.

**Verify the deploy order.** The Sequelize model's `source` enum (§3.2) must not be deployed ahead of the migration, or any insert naming `'benefit'` fails. Standard for this repo (migrations run before app start), but worth confirming in the release checklist.

### 4.10 `payroll_settings` additions — registry **#51–#53**

`addColumn`; every column NOT NULL with a default, so no data migration.

| Column | Type | Default | Registry # |
|---|---|---|---|
| `reimbursement_approval_levels` | SMALLINT NOT NULL | `2` | 51 |
| `reimbursement_payout_lookahead_months` | SMALLINT NOT NULL | `2` | 51 |
| `benefit_deductions_enabled` | BOOLEAN NOT NULL | **`false`** | 53 |

CHECKs: `reimbursement_approval_levels BETWEEN 1 AND 2`, `reimbursement_payout_lookahead_months BETWEEN 0 AND 6`.

**`benefit_deductions_enabled` ships OFF deliberately** — the `overtime_payable` (Phase 2) and `pf_enabled` (Phase 4) precedent. A benefit enrollment charges **every enrolled employee every month automatically**, with no per-month approval step anywhere. Defaulting ON would let an HR user create a plan, enroll a team, and discover the deduction only on the payslip. HR opts in, and `#37 eligibility` reports the enrolled headcount and monthly total before the first run that would charge it.

**`reimbursement_approval_levels` is capped at 2** because the parent specifies exactly *"manager → finance/HR"*. A configurable depth-N chain is speculative generality; the column is a SMALLINT so raising the cap later is a CHECK change, not a redesign.

Registry **#52** documents `reimbursement_categories` fields (limits, receipt requirement, taxability) — table-held, exactly like #47/#48 document `statutory_configs`. The registry's rule is about org-configurable *decisions*, not about which table holds them.

### 4.11 Migration hygiene

* `down()` reverses in exact inverse order: remove the 3 `payroll_run_items` columns, the 3 `payroll_settings` columns, restore `engine_version` default to `4`, drop the 7 tables, then drop **only the newly created** enum types with `CASCADE`: `enum_reimbursement_categories_limit_period`, `enum_reimbursement_claims_status`, `enum_reimbursement_claim_items_item_status`, `enum_reimbursement_approvals_approver_role`, `enum_reimbursement_approvals_status`, `enum_benefit_plans_benefit_type`, `enum_employee_benefit_enrollments_status`, `enum_payroll_attachments_owner_type`, `enum_payroll_attachments_storage_backend`, `enum_payroll_attachments_status`.
* **`enum_payroll_run_item_components_source` is NOT dropped** (§4.9 constraint 3) — it is a pre-existing type in active use.
* **`btree_gist` is NOT dropped** either (§4.6). An extension is database-wide shared infrastructure; another module may come to depend on it, and `DROP EXTENSION` would take their indexes with it. The EXCLUDE constraint is removed by the `dropTable` that owns it, so nothing leaks. Say this in `down()` beside the enum comment — both are deliberate incompletenesses in a `down()` the module otherwise trains readers to expect to be total.
* **Verify both directions:** `db:migrate` → `db:migrate:undo` → `db:migrate`, and confirm a run calculated between the two `up`s still reads correctly.

---

## 5. Core Logic

### 5.1 `reimbursement_limits.utils.js` (pure)

```
checkClaimLimits({ items, categoriesById, priorApprovedByCategoryPeriod, fyStartMonth })
  → { ok, violations: [{ item_index, category_code, period_key, rule,
                         limit, prior, attempted, remaining }] }
```

* **Per-claim cap** — `max_amount_per_claim` is compared against the **sum of that category's items within this one claim**, across all periods, not per line. Splitting a ₹20,000 dinner into four ₹5,000 lines must not defeat a ₹10,000 cap.
* **Per-period cap — bucketed by `(category, period_key)`, never by category alone.** `max_amount_per_period` is compared against `prior_approved_in_that_window + this_claim's_items_in_that_same_window`. The window is the calendar month or the financial year per `limit_period`, keyed off each item's **`expense_date`** (not the submission date) — an expense belongs to the period it was incurred in, which is the only reading that cannot be gamed by delaying a submission.

> **One claim can straddle two windows, and collapsing them corrupts both.** A claim filed on 5 April holding a 28 March hotel bill and a 2 April taxi fare spans two financial years. Bucket by category alone and the March spend consumes the April cap and vice versa: with a ₹50,000 FY cap, ₹20,000 already spent in FY 2025‑26, a ₹40,000 March item and a ₹30,000 April item, the correct answer is *"March violates, April is fine"* — and a single per-category figure cannot produce it. It will either reject the legitimate April expense or admit the March one. The straddling claim is not exotic; it is what month-end and year-end expense filing looks like.
>
> Therefore `priorApprovedByCategoryPeriod` is keyed **`` `${category_id}|${period_key}` ``** → paise, and the in-claim subtotal for the per-period rule is grouped on the **same composite key**. `period_key` is `'YYYY-MM'` for `limit_period = 'month'` and the FY label for `financial_year`. **Derive the FY with `tax_period.utils.financialYearOf(periodMonth, fyStartMonth)`** — already in the module, already tested, already the definition Phase 4 withholds tax against. Do not re-derive "April to March" inline; an FY boundary computed two ways in one codebase is a bug waiting for a fiscal year that does not start in April.

* `priorApprovedByCategoryPeriod` is supplied by the caller (the service does the DB read), keeping this function pure and directly unit-testable — the `decideAuthority` pattern.
* **`violations` carries the arithmetic, not just the verdict** (`limit`, `prior`, `attempted`, `remaining`, and the `period_key` the breach occurred in). The approver UI and the `422` payload both need the number to act on; see §6.1 #134 / §6.2 #149.
* **Prior spend counts `approved` and `processed` claims and the `approved_amount`, not the claimed amount.** An employee who claims ₹50,000 and is approved for ₹10,000 has consumed ₹10,000 of their cap. `submitted`/`under_review` claims are **excluded**: a pending claim is not spend, and counting it would let an employee block their own future claims by filing and abandoning one.
* **Uncapped is `NULL`, not `0`.** A zero cap means "this category may not be claimed", and both must be expressible.

### 5.2 `approval_chain_resolver.utils.js` (pure) — **D-32**

```
buildChain({ claimantId, claimantRole, resolvedManagerId, escalatedRole, levels })
  → { chain: [{ level, approver_role, assigned_approver_id }], collapsed: bool, reason }
```

The service calls `approval_chain.utils.resolveApprover` (the DB read) and hands the *result* to this pure function. Rules, in order:

1. **Normalise the escalated role through an allow-list, not a deny-list:** `escalatedRole ∈ {'manager','hr'} ? escalatedRole : 'hr'`. Today [`approval_chain.utils.js`](src/modules/leave/utils/approval_chain.utils.js) returns only `'hr'` (line 16, no mapping / DB error) or `'admin'` (line 21, self-reporting), so in the current tree this is exactly *"map `admin` → `hr`"*. **Write it as an allow-list anyway.** The enum belongs to the *leave* module and Phase 5 does not own it; a deny-list matching the literal `'admin'` silently stops protecting the moment that module adds `'super-admin'`, `'finance'` or anything else. `admin` and every other platform-plane role hold **no** payroll capability (**D-14**), and routing a claim to one would make it unactionable. This normalisation is the whole reason the util is wrapped rather than consumed directly (§2 item 11).
2. `levels = 1` → a single `hr` level. The manager tier is not used at all.
3. `levels = 2` with a resolvable manager who is **not the claimant** → `[{1, manager, managerId}, {2, hr, null}]`.
4. `levels = 2` with no resolvable manager, or an escalation, or the manager **is** the claimant → **collapse to a single `hr` level**, `collapsed: true`, `reason ∈ { NO_REPORTING_MANAGER, ESCALATED, SELF_REPORTING }`.
5. **A level whose only possible approver is the claimant is never emitted.** Two `hr` levels are never produced — that would be one HR user approving twice, which is theatre, not control.

`assigned_approver_id` is `null` for an `hr` level: the HR queue is role-addressed, not person-addressed, so any org `hr` may act.

> **A claim can never be routed to a platform role, and three independent layers say so.** Rules 2 and 4 discard the escalated role entirely (`levels = 1`, and every `levels = 2` escalation, both collapse to a single `hr` level), so it never survives into a chain in the first place; rule 1 normalises it regardless; and `reimbursement_approvals.approver_role` is `ENUM('manager','hr')` (§4.4), so a leaked value would fail the INSERT rather than persist. The redundancy is deliberate and **must not be "simplified" away** — the day rule 4 is relaxed to preserve a manager level through an escalation, rule 1 becomes the only thing standing between a claim and an unactionable queue. The worst case if all three were removed is not a stranded claim but a `500` at submission with the claim left `draft`; the point of the layers is that none of them is ever reached.

> **`resolveApprover` swallows DB errors into an `hr` escalation** (its `catch` returns `{ approver_user_id: null, escalated_to_role: 'hr' }`), so payroll cannot distinguish *"this employee genuinely has no manager"* from *"the mapping lookup failed"*. A transient DB fault during `#159` therefore collapses a 2-level chain to HR-only. **This is accepted, and it is accepted because it fails safe in the direction that matters:** the level it drops is the *lower* one, and HR — the authority that actually releases the money — remains mandatory in every collapsed chain. It is recorded here because the behaviour is invisible at the call site and a reader would otherwise assume an escalation means what it says. Do **not** "fix" it by editing the leave util (shared, and its `admin` escalation may be meaningful there), and do not add a confirming re-read: a second query on every escalation path buys nothing that HR's mandatory presence does not already guarantee.

> **The claimant may never approve their own claim — hard invariant, no setting.** Enforced in the pure builder (a self-level is never emitted) *and* again at action time in §7.3 (`acted_by !== claim.user_id` → `403 SELF_APPROVAL_FORBIDDEN`). Both are required: the builder protects the chain, the action check protects against a chain built before this rule shipped or a role change mid-flight. The consequence for a **sole-HR org** is real and must not be papered over: that HR user's own reimbursement claims are unapprovable until a second `hr` is invited. The error message names that remedy explicitly — the EC-30 precedent, where a message offering no remedy left a sole-HR org believing it was stuck.

### 5.3 `benefit_contribution.utils.js` (pure) — **D-36**

```
contributionsForPeriod({ enrollments, plansById, periodStart, periodEnd })
  → { contributions: [{ enrollment_id, plan_id, plan_code, plan_name,
                        employee_amount, employer_amount,
                        employee_component_id, employer_component_id }],
      warnings: [] }
```

* An enrollment contributes to a period when it **overlaps** it: `enrolled_from <= periodEnd AND (enrolled_to IS NULL OR enrolled_to >= periodStart)`, and the **plan** is likewise effective over the period.
* **`status = 'cancelled'` is ignored here, not only by the caller.** The overlap test above is purely date-based, so a function that trusted its input to be pre-filtered would charge a cancelled enrollment the moment any caller passed an unfiltered list. The filter costs one clause; the layering assumption costs a wrong deduction.
* **At most one contribution per `plan_id` — duplicates are collapsed and reported, never charged twice.** If two overlapping enrollments in the same plan reach this function, emit the **earliest-starting** one (ties broken by `enrollment_id` for determinism) and push `DUPLICATE_BENEFIT_ENROLLMENT:{plan_code}` onto `warnings`, which the engine surfaces on the run item exactly as Phase 4 surfaces `STATUTORY_STRUCTURE_LINE_IGNORED`. The §4.6 EXCLUDE constraint should make this unreachable; this is the layer that holds if the constraint was never created (an environment without `btree_gist`) or was bypassed by a data fix. **Deduplicate *and* warn — never one without the other:** silently collapsing hides a data error that needs correcting, and charging twice takes money from an employee's net pay every month until someone notices.
* **No proration, ever (D-36).** An enrollment live for one day of the month charges the full monthly amount. An insurance policy is in force for a month or it is not; and D-21 already established for adjustments that scaling an authorised rupee figure by attendance is how disputes are created. Stated on the API contract so no one re-derives it differently.
* Override precedence: `enrollment.employee_contribution_override ?? plan.employee_contribution_amount`; same for employer. `0` is a valid override meaning "free for this employee" — so the coalesce must test `!= null`, **not** truthiness.
* A zero contribution on either side **emits no line** — the Phase-4 §5.7 rule ("a payslip must not carry a ₹0 row that implies something was computed") applies identically.
* Both amounts are returned as **positive**; direction is `component_type` (§2 item 13).

### 5.4 `attachment.service.js` and the S3 adapter — **D-30 (DECIDED)**

> **D-30 — object storage is S3, addressed exclusively through pre-signed URLs, for upload *and* for display.** Decided 2026-09-11 by the product owner. One new dependency: **`@aws-sdk/client-s3`** plus **`@aws-sdk/s3-request-presigner`**. This is an explicit, recorded amendment to **D-11** ("exactly one new dependency: `pdfkit`"), justified because `@aws-sdk/client-ses` is already a dependency — the AWS SDK v3 core, the credential-provider chain and the region/config plumbing are already in the image, so this is an incremental client, not a new ecosystem. **The binary never transits the API process** in either direction: no `multer`, no `busboy`, no temp-file lifecycle, no body-size increase, no memory spike on a 10 MB receipt, and no app-tier bandwidth coupling. The parent's §11 item 4 and D-19's "revisit if Phase 5 needs real file attachments" are both closed by this.

`payroll_attachments.storage_backend` remains a stored ENUM(`s3`,`reference`) — **not** as a deploy-time toggle but because both values are genuinely reachable: `reference` covers a **TRACES-hosted Form 16 Part A** that an org links to rather than re-uploads (Phase 4 already models exactly that with `form16_part_a_reference_url`), and it keeps a bucket or provider migration a data change rather than a schema change. There is no `PAYROLL_ATTACHMENT_BACKEND` env switch; the backend is a property of the row, chosen by the endpoint that created it.

**The three operations.** All take the org from `req.user.orgId` and never from the body.

* **`issueUploadUrl({ orgId, userId, ownerType, ownerId, fileName, contentType, sizeBytes, uploadedBy })`**
  → inserts the row `pending` and returns `{ attachment_id, upload_url, expires_at, required_headers }`. **TTL 10 minutes.**
  The signature **binds `Content-Type` and `Content-Length`**, so a URL issued for a 200 KB JPEG cannot be used to upload a 500 MB executable. The client must send those exact headers; `required_headers` tells it what they are.
* **`confirmUpload({ attachmentId, orgId, userId })`**
  → `HeadObject`. The object must exist, its `ContentLength` must equal the declared `size_bytes`, and its `ContentType` must equal the declared `content_type`. Any mismatch → `422 ATTACHMENT_VERIFICATION_FAILED` and the row stays `pending`. On success: `status = 'available'`, `confirmed_at`, and `checksum_sha256` from the ETag **only when it is a single-part MD5** (no `-N` suffix); a multipart ETag is not a checksum and must be left NULL rather than stored as if it were one.
* **`issueViewUrl({ attachmentId, orgId, disposition })`**
  → a pre-signed **GET**, **TTL 5 minutes**, returned only after the caller's authority over the *owning entity* has been resolved (§6.7). `disposition ∈ { inline, attachment }` sets `ResponseContentDisposition`; `ResponseContentType` is pinned to the row's stored `content_type`. This is the "signed URL even to show the stored document" path — the browser renders it in place, and no proxying route exists.

**Object key:** `org/{orgId}/{ownerType}/{ownerId}/{attachmentId}`. **`file_name` is never a path component** — it is user-controlled and a traversal vector; it is carried only in `ResponseContentDisposition` at view time, quoted and sanitised.

**Content-type allow-list — and why it is a security control, not a convenience.** Exactly: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

> **Inline display is what makes the allow-list load-bearing.** Because these URLs are rendered in the browser (`disposition: inline`), any format the browser will execute becomes stored XSS on the bucket's origin. **`image/svg+xml` is therefore excluded and must stay excluded** — SVG is script-capable. So are `text/html`, `text/xml` and everything else. Enforce the list at **three** points, because each alone is defeatable: the Joi schema on `#161`/`#162`/`#147`; the signed `Content-Type` on the PUT (the client cannot upload a type the signature does not name); and `confirmUpload`'s `HeadObject` comparison (which catches a mismatch between what was declared and what actually landed). Additionally serve every object with **`X-Content-Type-Options: nosniff`** via the bucket's default response headers, so a mislabelled file is not sniffed into an executable type.

**Bucket configuration (deployment, not code — §13).** Private (no public ACL, Block Public Access on), **SSE-S3 or SSE-KMS at rest**, versioning on, and a **CORS rule allowing `PUT` from the application origin** — without it the browser upload fails with an opaque CORS error that looks like a signing bug and will cost an afternoon. TLS is enforced by a bucket policy denying `aws:SecureTransport = false`.

**Errors.** An S3 call that fails is not a payroll failure: `issueViewUrl` and `issueUploadUrl` surface `503 ATTACHMENT_STORAGE_UNAVAILABLE` and **no claim, run or approval state changes**. Pre-signing is a local cryptographic operation and does not call AWS, so it cannot fail on network — only `HeadObject` in `confirmUpload` and the lifecycle sweep actually touch the network. Apply a **3-second timeout and no retry** on `HeadObject`: a slow bucket must not hold a transaction open, and `#163` is safely retryable by the client.

### 5.5 `payroll_calculation.service.js` — engine extension

`computePayrollItem` gains **two** optional inputs and stays backwards-compatible (omitting both reproduces Phase-4 output byte-for-byte, which its existing suite asserts):

```
computePayrollItem({ …existing…,
                     reimbursements = [],          // resolved, approved, per-item approved_amount
                     benefitContributions = [] })  // §5.3 output for this employee
```

**Step 6c — benefit employer contributions.** One line per contribution with `employer_amount > 0`: `component_type: 'employer_contribution'`, `source: 'benefit'`, `source_ref_id: enrollment_id`, `component_code: plan_code`, `is_taxable: false`, `is_lop_applicable: false`, `pf_applicable: false`, `esi_applicable: false`, `is_part_of_ctc: true`, `is_hra: false`, `is_statutory: false`, `full_month_amount == amount`, `display_order: 2000 + index`. Pushed **before** `totalEmployerPaise` is summed, so it flows into `ctc_cost` automatically — no change to that line of the engine.

**Step 8a′ — benefit employee deductions.** One line per contribution with `employee_amount > 0`: `component_type: 'deduction'`, `source: 'benefit'`, `is_part_of_ctc: false`, other flags as above, `display_order: 2100 + index`. Pushed **before `baseDeductionsPaise` is summed** — i.e. immediately before the existing Step-8b adjustment-deduction block — so a benefit premium is **always applied** and is subtracted before the loan-EMI affordability test. A benefit premium is a contractual recurring obligation, exactly like a structure deduction; it is not negotiable against a loan installment, for the same reason Phase 4 placed statutory ahead of the EMI.

**Display-order band 2000–2999 is reserved for benefits**, sitting between statutory (1000–1999) and adjustment earnings (8000+).

**Step 8f — the reimbursement payout.** Placed **after** the Step-9 clamp and **before** the rounding block. One line per approved claim item with `approved_amount > 0`:

| Case | Emitted as |
|---|---|
| `is_taxable = false` (default) | `component_type: 'reimbursement'`, `source: 'reimbursement'`, `is_taxable: false` |
| `is_taxable = true` | `component_type: 'earning'`, `source: 'reimbursement'`, `is_taxable: true`, **`pf_applicable: false`, `esi_applicable: false`**, `is_lop_applicable: false` |

Both carry `source_ref_id: claim_item_id`, `component_code: category_code`, `full_month_amount == amount`, `is_part_of_ctc: false`, `display_order: 8500 + index`.

> **D-31 — a reimbursement is a payout, not an earning, and `is_taxable` on the category is what switches it.** The non-taxable form uses `component_type: 'reimbursement'`, which the engine's `realEarningLines` filter excludes from gross and from every statutory base **by construction** (§2 item 3) — no new filter is written, and that is precisely why the design is safe. The taxable form is genuinely an allowance/perquisite, so it is emitted as an **earning** and correctly enters gross, `taxable_earnings` and the PT base — while `pf_applicable`/`esi_applicable` stay `false`, so it never reaches the PF or ESI wage. It also enters `ctc_cost` in that form, which is correct: a taxable reimbursement *is* compensation. The two forms are mutually exclusive and decided by one snapshot flag on the claim item (§4.3).
>
> **The taxable form must be emitted before Step 7 to reach the statutory bases.** Therefore: taxable reimbursement lines are pushed with the Step-6b adjustment earnings; **only the non-taxable form is deferred to Step 8f**. Implement this as one partition at the top of the reimbursement block, not as two scattered loops.
>
> **Why a taxable reimbursement cannot knock a low-wage employee out of ESI — and what exactly guarantees it.** The concern is real and the answer is not "it's fine": a ₹20,000-gross employee receiving a ₹5,000 taxable reimbursement must **not** be assessed against the ₹21,000 ESI threshold at ₹25,000 and lose statutory insurance for the whole contribution period (**EC-19** freezes coverage at entry, so a single bad month costs six). What prevents it is that the ESI eligibility base is **flag-gated, not gross-gated**: [`statutory_calculation.service.js:159-161`](src/modules/payroll/services/statutory_calculation.service.js#L159-L161) builds it as `usableLines.filter(l => l.esi_applicable === true && !isOt(l) && !isBonusIncentive(l))`, and `computeEsi` tests *that* figure against the threshold — it never reads `gross_earnings`. **`esi_applicable: false` in the table above is therefore load-bearing, not decorative**, and the same is true of `pf_applicable: false` for the PF wage ([`:155`](src/modules/payroll/services/statutory_calculation.service.js#L155)). Set either flag to `true` — or let it default from a catalog component by copying the Step-6b adjustment row builder — and the employee is silently disqualified while every reconciliation assert still passes. §10.2 pins this with a named threshold test, not a balance check. (This is also the legally correct treatment: reimbursement of actual expenses is not "wages" under the ESI Act.)
>
> **PT is deliberately different, and the asymmetry is not an oversight.** `ptGrossPaise` ([`:162`](src/modules/payroll/services/statutory_calculation.service.js#L162)) is `sumPaise(usableLines)` with **no flag gate at all** — PT is levied on the whole payable gross. So the taxable form *does* enter the PT base and the non-taxable form does not, purely by virtue of `component_type`. That is the right outcome — a taxable reimbursement is compensation, an expense refund is not — but it means **PT has no per-line opt-out**, and anyone who later wants a taxable reimbursement excluded from PT must change `component_type`, not add a flag. Do not "fix" the asymmetry by inventing a `pt_applicable` column.

**Step 9 — net, clamp and the amended reconciliation.** The existing clamp is unchanged and operates on wages only:

```
netRawPaise      = grossPaise − totalDeductionsPaise        // unchanged
                   → clamp / block / shortfall as today      // unchanged
reimbursementPaise = Σ(component_type === 'reimbursement')   // NEW, post-clamp
netBeforeRounding  = netRawPaise + reimbursementPaise         // NEW
                   → rounding block operates on this figure
```

**Assert 2 becomes:**

```
reconNet = reconGross − totalDeductionsPaise + shortfallPaise + reimbursementPaise + roundingPaise
```

> **Why the reimbursement sits outside the clamp — and why that is the load-bearing choice, not a stylistic one.** If a reimbursement were inside `netRawPaise`, an employee whose wages were fully consumed by deductions would have their **out-of-pocket expenses swallowed by the negative-net carry-forward** (Phase 3 D-20) and recovered from them again next month. They would have funded a company expense and been charged for it. Keeping the payout outside the clamp also means the loan-EMI affordability test (8c) and the carry-forward recovery cap (8d) remain purely wage-based, so whether an EMI is charged does not flip depending on whether a travel claim happened to clear in the same month — a non-determinism the employee cannot predict and the schedule should not carry. This is the same employee-favourable, explain-on-the-payslip stance Phase 3 took on foreclosure interest.
>
> Rounding applies to the **combined** figure so the credited amount is a whole rupee when `net_pay_rounding = nearest_rupee`. The `ROUNDING_ADJUSTMENT` line remains the only line permitted to be negative (Assert 1, unchanged).

**Two new reserved engine component codes** must be rejected by the component-catalog validator alongside the existing four (`OVERTIME`, `ROUNDING_ADJUSTMENT`, `NET_PAY_SHORTFALL_CARRIED`, `CARRY_FORWARD_RECOVERY`): **`REIMBURSEMENT`** and **`BENEFIT`** — used as the fallback `component_code` when a category or plan has no catalog mapping. The Phase-3 §2 item 18 reasoning applies unchanged: an org creating a component with a colliding code would put two indistinguishable lines on one payslip.

The returned `item` gains the three §4.8 figures. `statutory_status` and every Phase-4 figure are untouched.

**Backwards compatibility is a hard requirement and a test:** omitting both new inputs must reproduce Phase-4 output byte-for-byte for every money figure, and the existing `payroll_calculation.test.js` assertions must pass **unchanged**.

### 5.6 `payout_selector.utils.js` (pure)

```
selectClaimsForRun({ claims, periodMonth, runId })  → [...]
selectEnrollmentsForRun({ enrollments, periodStart, periodEnd }) → [...]
```

* A claim is selectable when `status === 'approved'` **and** `payout_period_month === periodMonth` **and** (`applied_run_id` is null **or** equals this run). The second clause is what makes recalculating an already-approved run a no-op rather than a data-loss event — the Phase-3 `selectApplicableAdjustments` rule, verbatim.
* A `processed` claim is **never** selectable. A `rejected`, `cancelled`, `draft`, `submitted` or `under_review` claim is never selectable.
* Only **`item_status = 'approved'`** items of a selected claim produce lines, at their `approved_amount`. A partially-approved claim pays exactly the approved lines and nothing else.
* Enrollment selection delegates the overlap test to §5.3 and additionally drops `status != 'active'` unless the enrollment was active during the window and ended inside it — an enrollment ended mid-period **still charges that period** (D-36's no-proration rule, applied symmetrically at both ends).

### 5.7 `payroll_payout_aggregator.service.js` — **D-34**

The Phase-3/Phase-4 sibling pattern verbatim: read-only, batched, **cohort-scoped**, writes nothing. Called from `payroll_run.service.calculate` inside the existing cohort loop, so peak memory stays one cohort and query count stays O(cohorts).

```
aggregateForCohort({ orgId, cohort, periodMonth, periodStart, periodEnd, runId })
  → Map<user_id, { reimbursementItems: [], benefitContributions: [] }>
```

**Two queries per cohort** — the whole phase's engine input:

1. `reimbursement_claims` ⋈ `reimbursement_claim_items` — `org_id`, `user_id IN cohort`, `status = 'approved'`, `payout_period_month = periodMonth`, `(applied_run_id IS NULL OR applied_run_id = runId)`, item `item_status = 'approved'`. Hits `reimbursement_claims_engine_idx`.
2. `employee_benefit_enrollments` ⋈ `benefit_plans` — `org_id`, `user_id IN cohort`, `status = 'active' OR (status = 'ended' AND enrolled_to >= periodStart)`, `enrolled_from <= periodEnd`. Hits `employee_benefit_enrollments_engine_idx`. **Skipped entirely when `settings.benefit_deductions_enabled` is false** — one fewer query for an org that has not opted in.

Then `benefit_contribution.utils.contributionsForPeriod` and `payout_selector.utils` shape the result in memory. `contributionsForPeriod` returns `{ contributions, warnings }` (§5.3); **carry its `warnings` through to the engine's `warnings` array on the run item** — a `DUPLICATE_BENEFIT_ENROLLMENT` that the aggregator drops on the floor defeats the point of detecting it.

**Total: +2 per cohort.** A 3,000-employee run moves from ~124 (P2+P3+P4) to ~154 queries — still O(cohorts), never O(headcount).

**Rates are not frozen here, and that is correct.** Unlike Phase 4's statutory tables (**D-26**), benefit contribution amounts and claim approved-amounts are **not rate tables** — they are per-employee facts an operator must be able to correct and have take effect on recalculation. This is the exact distinction Phase 4 §5.8 drew for `organization_locations.state`: *freeze what an auditor must see unchanged; read live what an operator must be able to correct.* A claim whose approved amount was mistyped must be fixable by re-approving and recalculating, not by cancelling the run.

---

## 6. API Surface

Envelope, controller class/singleton style, `try/catch → next(error)`, the leave `validate` wrapper, and the three auth stacks (`hrAuth` = `['hr']`, `managerAuth` = `['manager','hr']`, `selfAuth`) are **all unchanged**. Phase 5 introduces no new role list; D-14's tenant-plane-only rule holds.

**Route-order rules (§2 item 18):** under `/reimbursements`, register `/categories*` and `/claims*` before anything else and define **no bare `:param`**. Under `/me/reimbursements`, register `/categories`, `/attachments/:attachmentId/*` and `/claims*` as distinct static branches.

### 6.1 HR — `/api/v1/payroll/hr` *(`hrAuth`)* — Tier C + final approver

| # | Method | Path | Notes |
|---|---|---|---|
| 128 | POST | `/reimbursements/categories` | `409 CATEGORY_CODE_EXISTS` on the partial unique index |
| 129 | GET | `/reimbursements/categories` | Filters `is_active` — **validate in controller** |
| 130 | GET | `/reimbursements/categories/:id` | |
| 131 | PUT | `/reimbursements/categories/:id` | Limits/taxability editable; **changes never affect existing claim items** (§4.3 snapshot) |
| 132 | DELETE | `/reimbursements/categories/:id` | Deactivate. `409 CATEGORY_IN_USE` if any non-terminal claim item references it. Never hard-delete |
| 133 | GET | `/reimbursements/claims` | The org queue. Filters `status`, `user_id`, `category_id`, `payout_period_month`, `current_level`, date range; paginated |
| 134 | GET | `/reimbursements/claims/:id` | Header + items + the full approval chain + available attachments + **`category_limits[]`** (below) |
| 135 | POST | `/reimbursements/claims/:id/approve` | HR level. Body `{ items: [{ item_id, approved_amount, item_status, approver_remarks? }], remarks? }` — HR may approve **less**, never more (§7.3). Final level sets `payout_period_month` (§6.4) |
| 136 | POST | `/reimbursements/claims/:id/reject` | `rejection_reason` required. Terminal |
| 137 | GET | `/attachments/:attachmentId/view-url` | **Generic across all three `owner_type`s.** `?disposition=inline\|attachment` (default `inline`). Authority is resolved **per owner type** before signing (§6.7) |
| 138 | POST | `/benefit-plans` | The API contract must state **D-37** plainly: a plan has **no tax effect** — an employer contribution is not taxed as a perquisite and an employee premium does not feed §80D. Both are declared/modelled through existing Phase-3/Phase-4 paths (§1.2) |
| 139 | GET | `/benefit-plans` | Filters `is_active`, `benefit_type` |
| 140 | GET | `/benefit-plans/:id` | Includes active-enrollment count and monthly cost total |
| 141 | PUT | `/benefit-plans/:id` | Contribution changes apply **from the next calculation**, not retroactively (§5.7) |
| 142 | DELETE | `/benefit-plans/:id` | Deactivate. `409 PLAN_HAS_ACTIVE_ENROLLMENTS` — end the enrollments first, explicitly |
| 143 | POST | `/benefit-plans/:id/enrollments` | `{ user_id, enrolled_from, overrides? }`. `409 ALREADY_ENROLLED` on the partial unique index |
| 144 | GET | `/benefit-plans/:id/enrollments` | Paginated |
| 145 | GET | `/employees/:userId/benefit-enrollments` | One employee's enrollments, active and ended |
| 146 | POST | `/employees/:userId/benefit-enrollments/:enrollmentId/end` | `{ enrolled_to, end_reason }`. §7.5 |
| 147 | POST | `/employees/:userId/tax/form16/:financialYear/part-a/attachment` | **D-29 completion.** Issues a pre-signed PUT for the TRACES-issued Part A PDF, `owner_type: 'form16_part_a'`, `owner_id = employee_tax_summaries.id`. Body may instead carry `{ reference_url }` to link a TRACES-hosted copy (`storage_backend: 'reference'`, stored `available`). Does **not** alter Phase-4 `#115`'s `ack_number` / `issued_on` columns — it adds the document beside them |

> **An approver must be told the limit, not discover it by being refused.** §7.3 step 9 re-checks category limits against the amounts being approved, so an approver who reduces a ₹40,000 claim to ₹30,000 can still be refused `422 CATEGORY_LIMIT_EXCEEDED` — and with nothing but that code they are left doing the arithmetic by hand or guessing at the figure that will fit. `#134` and `#149` therefore both return **`category_limits[]`**: one row per `(category, period_key)` present in the claim, carrying `{ category_code, period_key, limit_period, limit, prior_approved, claimed_in_this_claim, remaining }`, computed with the **same repository method** §7.2 and §7.3 use — so the number shown is the number enforced. `remaining` is `null` when the category is uncapped. This is the approver-side mirror of what `#154` already gives the employee, and the `422` payload carries the same figures (§5.1) so the information is available even to a client that skipped the pre-fetch.
>
> No secrecy rule is touched: a category cap is org policy, and the consumed figure is the claimant's own expense history, which the approver is already being asked to rule on. No salary figure of any kind is involved (§6.2).

### 6.2 Manager — `/api/v1/payroll/manager` *(`managerAuth`)* — Tier A

Every handler: `getAccessibleUserIds` → `decideAuthority` → act. **Scope check precedes existence check**; out-of-scope and non-existent return an identical `403 FORBIDDEN` (**EC-24**).

| # | Method | Path | Notes |
|---|---|---|---|
| 148 | GET | `/reimbursements/claims` | Direct reports' claims + those awaiting this manager's level. Filters as #133, re-scoped server-side |
| 149 | GET | `/reimbursements/claims/:id` | Scoped. Items, chain, available attachments and **`category_limits[]`** (§6.1) — the manager is the first approver and needs the headroom figure before it refuses them |
| 150 | POST | `/reimbursements/claims/:id/approve` | **Level 1, Tier A — no HR sign-off.** Same body as #135; a manager may approve less, never more |
| 151 | POST | `/reimbursements/claims/:id/reject` | `rejection_reason` required. Terminal |
| 152 | GET | `/attachments/:attachmentId/view-url` | **`owner_type: 'reimbursement_claim_item'` only.** A manager requesting a declaration proof or a Form 16 Part A gets `403` — D-28 withholds tax detail from managers, and this endpoint must not become the hole in it (§6.7) |
| 153 | GET | `/team/benefit-enrollments` | Direct reports' enrollments. With `manager_can_view_team_compensation = false` → **aggregates only** (headcount, plan mix), zero per-head contribution figures (**EC-25**) |

> **Reimbursement approval is Tier A and is not gated by `manager_can_view_team_compensation`.** That toggle governs visibility of *what someone is paid* (D-8). An expense claim is not compensation, and a manager who cannot see a claim they are the assigned approver of cannot do the job the parent's RBAC table assigns them (*"Approve team reimbursement (level 1) — Tier A"*). The claim payload a manager sees carries **no salary figure of any kind**, so the toggle has nothing to protect here. `#152` **is** gated, because a benefit contribution is compensation.

### 6.3 Self — `/api/v1/payroll` (under `/me`) *(`selfAuth`)*

| # | Method | Path | Notes |
|---|---|---|---|
| 154 | GET | `/me/reimbursements/categories` | Active categories + limits + **my consumed amount and remaining headroom** per category for the current window |
| 155 | POST | `/me/reimbursements/claims` | Create a `draft` with items |
| 156 | GET | `/me/reimbursements/claims` | Own claims. Filters `status`, `payout_period_month`; paginated |
| 157 | GET | `/me/reimbursements/claims/:id` | Own claim + items + chain + attachments + payout state |
| 158 | PUT | `/me/reimbursements/claims/:id` | **Replace the whole item set** while `draft`. `409 CLAIM_NOT_DRAFT` otherwise |
| 159 | POST | `/me/reimbursements/claims/:id/submit` | `draft` → `submitted`. Materialises the chain, assigns `claim_number`, enforces receipts and limits. §7.2 |
| 160 | POST | `/me/reimbursements/claims/:id/cancel` | Any of `draft`, `submitted`, `under_review` — **including after a level has approved**. `409 CLAIM_NOT_CANCELLABLE` from `approved`, `processed`, `rejected` or `cancelled`. §7.4a |
| 161 | POST | `/me/reimbursements/claims/:id/items/:itemId/attachments` | Receipt upload URL. `draft` only. `owner_type: 'reimbursement_claim_item'`. §5.4 |
| 162 | POST | `/me/tax/declarations/items/:itemId/attachments` | **D-29 completion.** Investment-proof upload URL, `owner_type: 'investment_declaration_item'`. Allowed while the declaration is `draft`, `submitted` or `under_review` and not `rejected` — **the same window as Phase-4 `#127`**, which records the proof *reference*; this adds the document. Does **not** touch any amount or the header status |
| 163 | POST | `/me/attachments/:attachmentId/confirm` | **Generic.** `pending` → `available` after `HeadObject` verification (§5.4). Own attachments only |
| 164 | DELETE | `/me/attachments/:attachmentId` | **Generic.** Own only. A receipt is deletable while its claim is `draft`; a proof while its declaration is not `verified`/`rejected`. Soft-delete + `status = 'deleted'` |
| 165 | GET | `/me/attachments/:attachmentId/view-url` | **Generic**, own only. `?disposition=inline\|attachment` |
| 166 | GET | `/me/benefits` | Own enrollments: plan, contributions, effective dates, and this FY's total deducted (from approved/paid run items) |

> **An employee never sees another employee's claim, and `:id` is always resolved with `user_id = req.user.id` in the WHERE clause**, never fetched-then-checked. A foreign id returns `403`, identical to a non-existent one (**EC-24**).

### 6.4 Payout-period resolution — **EC-23**, and where it diverges from EC-31

On the **final** approval level (and only there), the service resolves `payout_period_month`:

1. Start at the current calendar month.
2. Walk forward up to `reimbursement_payout_lookahead_months` (default 2), testing each month's live `regular` run:
   * **no run / `draft` / `calculated` / `failed`** → take it. If a run exists, `assertPeriodOpenForVariablePay` sets `requires_recalculation = true`, so the existing `409 RUN_STALE` gate forces HR to recalculate before approving (**D-18**).
   * **`calculating`** → `409 RUN_CALCULATION_IN_PROGRESS`, retryable. Do not skip past it; the run may land `calculated` a second later and skipping would defer an eligible claim by a month for no reason.
   * **`approved` / `paid`** → this month is closed; advance.
   * **`cancelled`** → not a live run; take the month.
3. Exhausted the lookahead → `422 NO_OPEN_PAYOUT_PERIOD`, naming the months tried. The approval is **refused**, not silently deferred.

> **Why an approver does not get `PERIOD_CLOSED_FOR_ADJUSTMENT`.** Phase 3's guard throws for an adjustment because HR *chose* a `period_month` and must re-target it. A reimbursement approver is a line manager acting on a receipt; they have no view of payroll state and no business picking a run. Resolving forward is the same guarantee expressed as behaviour instead of an error — **EC-23** is satisfied either way ("approved after the run closed → next-cycle payout, never double-paid"), and the closed run is never touched (**D-12**). The guard itself is still what enforces that: step 2 calls `assertPeriodOpenForVariablePay` for the month it settles on, so the `requires_recalculation` flag and the rank-1 advisory lock come from the existing shared code path, not a reimplementation.

### 6.5 Claim state machine

```
draft ──submit──► submitted ──L1 approve──► under_review ──L2 approve──► approved ──run approve──► approved*
  │                   │                          │                          │       (applied_run_id set)
  │                   │ ──reject──► rejected     │ ──reject──► rejected      └──run pay──► processed
  │                   │                          │
  └───────────────────┴──────── cancel ──────────┴────────► cancelled
```

* `under_review` exists **only when `total_levels = 2`**. With one level, `submitted → approved` directly.
* **Cancellation is available for the whole pre-approval life of the claim**, `under_review` included — a level-1 approval does not lock the employee in (§7.4a).
* `approved` with `applied_run_id` set is still `approved` — consumption is a stamp, not a status (**D-35**). The status moves to `processed` at run **pay**, which is the parent's stated behaviour.
* **No edge leaves `processed`, `rejected` or `cancelled`.** A correction after payment is Phase-7 arrears (**D-12**).
* Run **cancel** clears the stamp and the claim returns to plain `approved`, eligible for the next run of that period (§7.6).

### 6.6 Extended existing endpoints (no new numbers)

| # | Endpoint | Addition |
|---|---|---|
| 37 | `GET /hr/runs/eligibility` | `payouts: { approved_claims_count, approved_claims_total, claims_awaiting_approval_count, benefit_deductions_enabled, active_enrollment_count, benefit_employee_total, benefit_employer_total }`. The enrollment counters are the pre-flight warning for the **first** run after `benefit_deductions_enabled` is switched on |
| 42 | `GET /hr/runs/:id/preview` | `payouts: { reimbursement_total, reimbursement_item_count, taxable_reimbursement_total, benefit_employee_total, benefit_employer_total }` |
| 44 | `GET /hr/runs/:id/items/:itemId` | The 3 new figures + the reimbursement and benefit component lines |
| 53–56 | Payslip list & detail (manager + self) | `reimbursement_amount` on the list row; `reimbursements[]` (category, amount, claim number) and `benefits[]` (plan, employee, employer) blocks on the detail. **The `net_pay` explanation must state that the reimbursement is included in net but not in gross** — otherwise the payslip appears not to add up |
| 106 | `GET /hr/tax/declarations/:id` | Each item gains `attachments[]` (`available` only) so a verifier can open the proof while verifying (#137) |
| 107 | `POST /hr/tax/declarations/:id/verify` | Unchanged contract. The verifier reaches the document through #137; **`#162`'s attachments do not gate verification** — HR may still verify against an off-system proof, exactly as today |
| 114/126 | Form 16 Part B payload | Gains `part_a_attachment` (`{ attachment_id, file_name, storage_backend }` or null) so the owner can open Part A via #165 |

### 6.7 Attachment authority — resolved per `owner_type`, never per attachment

`#137` (HR), `#152` (Manager) and `#165` (Self) are one service method over three audiences. The attachment row itself carries **no** authority; authority is always resolved against the **owning entity**, loaded fresh, before any URL is signed:

| `owner_type` | Self | Manager | HR |
|---|---|---|---|
| `reimbursement_claim_item` | own claim only | `getAccessibleUserIds` ∋ claimant **or** manager is an assigned approver on the chain | any claim in org |
| `investment_declaration_item` | own declaration only | **`403` always (D-28)** | any declaration in org |
| `form16_part_a` | own summary only | **`403` always (D-28)** | any summary in org |

**Three rules that must not be relaxed:**

1. **A manager is never granted a tax document.** D-28 withheld declaration detail from managers deliberately; a generic attachment endpoint is exactly the kind of side door that quietly reverses such a decision. `#152` rejects the two tax owner types **before** looking the attachment up, so the response is identical whether or not the id exists.
2. **`status != 'available'` → `404 ATTACHMENT_NOT_FOUND`**, uniformly, for every audience. A `pending` or `deleted` row is not a resource.
3. **Out-of-scope and non-existent are byte-identical `403`** (**EC-24**) — the attachment id is a UUID, but the owning claim or declaration id is the enumeration target, and resolving authority on the owner before existence is what closes it.

A signed URL is **not** a capability the module tracks after issuance: it is short-lived (5 min), scoped to one object, and unguessable. Revoking access before expiry is not supported and is not attempted — the TTL is the control. Each issuance is audit-logged (`attachment.view_url_issued`) with the actor, the attachment and the owner type, so *who looked at what* is reconstructable even though the URL is not.

---

## 7. Transactional Behaviour

Unmanaged transactions only, `if (!t.finished) await t.rollback()`. Every state transition writes `payroll_audit_logs` **inside its own transaction**.

### 7.1 Lock ordering (extends the Phase-3 §7.1 / Phase-4 §7.0 total order)

```
1. payroll:run:{orgId}:{period_month}                  ← ALWAYS first when a live run may be touched
2. payroll:lock:{orgId}                                ← period-lock resolution (run approval only)
3. payroll:loan:{userId} / payroll:structure:{userId}
   payroll:tax:{userId}:{fy} / payroll:claim:{claimId}
   payroll:benefit:{userId}
4. row locks (FOR UPDATE), parents before children
```

**`payroll:claim:{claimId}`** is taken by every writer that mutates one claim's aggregate: edit (#158), submit (#159), cancel (#160), approve (#135/#150), reject (#136/#151). **`payroll:benefit:{userId}`** is taken by enrollment create (#143) and end (#146). Attachment writers (#161–#165, #147) take **no** advisory lock — they mutate only their own row, and the receipt-requirement check reads them under the claim lock at submission.

> **Claim approval takes a rank-1 lock and a rank-3 lock, in that order.** The final approval level resolves the payout period (§6.4), which calls `assertPeriodOpenForVariablePay` and therefore takes `payroll:run:{orgId}:{month}`. The claim lock must be acquired **after** it. Getting this backwards creates the same cycle Phase 3 §11 item 7 documented between foreclosure and run approval: run approval walks run → claim (§7.6), so a claim writer walking claim → run deadlocks. **This rule must appear as a comment in `reimbursement_approval.service.js`,** not only here.

### 7.2 Submit a claim (#159)

One transaction: `payroll:claim:{claimId}` → load the claim `FOR UPDATE` with items → `status === 'draft'` else `409 CLAIM_NOT_DRAFT` (idempotent against a double-click) → at least one item else `422 CLAIM_HAS_NO_ITEMS` → **receipt enforcement**: every item whose category `requires_receipt` and whose `amount >` `receipt_required_above_amount` (or always, when NULL) must have ≥ 1 `payroll_attachments` row with `status = 'available'`, else `422 RECEIPT_REQUIRED` naming the item → **limit enforcement** (§5.1) against prior `approved`/`processed` spend read **inside this transaction**, else `422 CATEGORY_LIMIT_EXCEEDED` with the full violation list → resolve the chain (§5.2) and `bulkCreate` the `reimbursement_approvals` rows → assign `claim_number` → `status = 'submitted'`, `current_level = 1`, `total_levels = chain.length`, `submitted_at`, `total_amount` recomputed from items → audit `reimbursement_claim.submitted` → commit.

**The prior-spend read, precisely — one query, bucketed in memory (§5.1).** The naive read ("total approved spend per category for this user") is wrong whenever a claim straddles two limit windows. Instead:

1. From the claim's items, build the distinct set of **`(category_id, period_key)`** pairs, using each item's `expense_date` and that item's **snapshotted** `limit_period` (§4.3 — the category may have been edited since).
2. Take the union date range spanned by those windows — `[min(window_start), max(window_end)]`, at most two adjacent windows in practice.
3. One query over `reimbursement_claim_items` ⋈ `reimbursement_claims`: `org_id`, `user_id`, `claims.status IN ('approved','processed')`, `items.item_status = 'approved'`, `expense_date BETWEEN <union range>`, `category_id IN (...)`, **excluding this claim's own id** (so an approval re-check does not count the claim against itself). Select `category_id, expense_date, approved_amount`. Hits `(org_id, user_id, expense_date)` (§4.3).
4. Bucket the rows in memory into `` `${category_id}|${period_key}` `` → paise and hand that map to `checkClaimLimits`.

Bucketing in the application rather than in `GROUP BY` keeps a single index-friendly range scan instead of a per-category `CASE` expression over `limit_period`, and it keeps the FY definition in `financialYearOf` rather than duplicated in SQL. Claim item counts are small; this is not a scale trade-off.

**`total_levels` is frozen here.** An HR user changing `reimbursement_approval_levels` afterwards must not re-shape an in-flight chain — the Phase-2 `settings_snapshot` principle, applied to a workflow.

**`claim_number` generation** is `RC-{YYYYMM}-{seq}` where `seq` is `COUNT(*) + 1` over the org's claims submitted in that month, computed **under the claim lock**. Two concurrent submissions by different employees do not share a claim lock, so the UNIQUE `(org_id, claim_number)` index is the real backstop: on a unique violation, retry once with the recomputed count. Bounded retry, no sequence table.

### 7.3 Approve a level (#135, #150) — the critical section

1. Begin transaction.
2. **Authority chokepoint before any existence lookup** — for a manager: `getAccessibleUserIds` → `decideAuthority`; out of scope → `403 FORBIDDEN`, identical to a non-existent id (**EC-24**). For HR: `scope === 'global'` and `role === 'hr'` (**D-14**).
3. **`payroll:run:{orgId}:{candidate_month}` first when this is the final level** (§7.1) — the payout resolution of §6.4 runs here, before the claim lock.
4. `payroll:claim:{claimId}` → load the claim `FOR UPDATE`, its items and its `reimbursement_approvals` rows.
5. `status ∈ { submitted, under_review }` else `409 CLAIM_NOT_ACTIONABLE`.
6. Load the **`pending` row at `current_level`**. The actor must be permitted for that row's `approver_role`: `manager` → the actor holds the claimant in `getAccessibleUserIds`; `hr` → the actor is org `hr`. Mismatch → `403 NOT_YOUR_APPROVAL_LEVEL`. **This — plus the UNIQUE `(claim_id, level)` index and the `current_level` cursor — is what makes a level unskippable.**
7. **`acted_by !== claim.user_id`** else `403 SELF_APPROVAL_FORBIDDEN` (§5.2).
8. Per item: `approved_amount <= amount` else `422 APPROVED_EXCEEDS_CLAIMED`; every `item_id` must belong to this claim (`403`, never `404` — the enumeration rule). An item not named in the body **retains the previous level's decision**, defaulting to `approved_amount = amount` at level 1.
9. **Re-run the §5.1 limit check against the amounts being approved**, under this transaction, using the **identical four-step bucketed read as §7.2** — same `(category_id, period_key)` keying, same self-exclusion of this claim. Amounts can have been reduced or another claim approved since submission; the cap must hold on what is actually paid, not on what was filed. Violation → `422 CATEGORY_LIMIT_EXCEEDED` **carrying the full `violations` array** (limit, prior, attempted, remaining, period key) so the approver can retry with a figure that fits instead of guessing. Extract the read into one repository method used by both §7.2 and this step — two implementations of a limit window will drift, and the drift is only visible as an inconsistent verdict between submit and approve.
10. Mark the approval row `approved`, `acted_by`, `acted_at`, `remarks`.
11. **More levels remain** → `current_level += 1`, `status = 'under_review'`. **Final level** → `status = 'approved'`, `finalized_at`, `approved_amount = Σ item approved_amount`, and `payout_period_month` from §6.4 (which already took the rank-1 lock and set `requires_recalculation` on the target run). If every item was rejected → `status = 'rejected'` instead, with `approved_amount = 0`.
12. Audit `reimbursement_claim.level_approved` (and `.approved` on the final level) with the level, actor, per-item deltas and the resolved payout period. Commit.

**Idempotency.** Steps 5–6 are status- and cursor-guarded: a retry after a timeout finds the level already `approved` and returns `409 CLAIM_NOT_ACTIONABLE` or `403 NOT_YOUR_APPROVAL_LEVEL`, never a double transition and never a second payout.

### 7.4 Reject (#136, #151)

Same frame through step 7, then: `rejection_reason` required → the level row `rejected` → every remaining `pending` level `skipped` → every item `item_status = 'rejected'`, `approved_amount = 0` → claim `rejected`, `finalized_at`, `approved_amount = 0`, **`payout_period_month` left NULL** → audit → commit. A rejected claim is excluded from §5.7 query 1 outright, so it can never reach a payslip.

### 7.4a Cancel a claim (#160) — the claimant's withdrawal

One transaction: `payroll:claim:{claimId}` → load the claim `FOR UPDATE` with its approval rows → **`user_id === req.user.id`** resolved in the WHERE clause, never fetched-then-checked (§6.3) → `status ∈ { draft, submitted, under_review }` else `409 CLAIM_NOT_CANCELLABLE` → every `pending` approval row → `skipped` (approved rows are left exactly as they are) → `status = 'cancelled'`, `cancellation_reason`, `finalized_at` → audit `reimbursement_claim.cancelled` with the level it was cancelled at → commit. `payout_period_month` is left NULL, and no item statuses are rewritten.

> **Cancelling from `under_review` is safe, and blocking it was friction with no integrity benefit.** A claim at `under_review` has had level 1 approved and nothing else: it is not `approved`, so §5.6 never selects it, so no run references it and no money is committed. The only thing the old rule protected was a manager's sunk review effort — at the cost of forcing an employee who spots their own mistake to phone HR and ask to be *rejected*, which is both slower and a worse audit record than a truthful `cancelled`.
>
> **The cancel-versus-approve race needs no new machinery, but it does need both guards to stay as written.** Both paths take `payroll:claim:{claimId}` and load the claim `FOR UPDATE`, so they serialise. If approve commits first the claim is `approved` and cancel fails its status guard with `409 CLAIM_NOT_CANCELLABLE`; if cancel commits first the claim is `cancelled` and §7.3 step 5 fails with `409 CLAIM_NOT_ACTIONABLE` — and because the approver's whole transaction rolls back, the `requires_recalculation` flag §6.4 would have set on the target run is rolled back with it. Neither order produces a partially-cancelled claim or a stranded run flag. **`approved` stays non-cancellable** for exactly this reason in reverse: by then §6.4 has committed a payout period and HR may already have recalculated a run around it, so withdrawal there is a Phase-7 correction, not a self-service action.

### 7.5 Benefit enrollment (#143) and ending it (#146)

**Enroll:** one transaction → `payroll:benefit:{userId}` → verify the plan is active and effective → **`enrolled_from` must not fall inside a period whose run is `approved`/`paid`**, else `422 PERIOD_CLOSED_FOR_ADJUSTMENT` via `assertPeriodOpenForVariablePay` on that month (rank-1 before rank-3, §7.1) → **month-overlap assertion (below)** → insert → audit → commit.

> **The month-overlap assertion, in the service, before the insert.** Select every non-`cancelled`, non-deleted enrollment for `(user_id, plan_id)` and reject when any of them shares a **month** with the new range — the same month-granular test §4.6's EXCLUDE constraint encodes, expressed in the service so the caller gets `409 ENROLLMENT_PERIOD_OVERLAP` naming the conflicting enrollment's dates instead of a raw constraint violation. **Both layers are required and neither is redundant:** the service check produces an actionable error and is the only protection if `btree_gist` was unavailable; the constraint is the only protection against a code path that forgets to take the lock. This check replaces `409 ALREADY_ENROLLED` as the *general* case — that code remains for the narrower live-duplicate collision on the partial unique index, which a concurrent request can still hit first.
>
> The check is race-safe **because** it runs under `payroll:benefit:{userId}`: every writer of this table takes that lock, so check-then-insert is serialised per user. Do not move this check outside the lock, and do not add an enrollment writer that skips it.

**End:** same frame → the enrollment must be `active` → `enrolled_to >= enrolled_from` → **`enrolled_to`'s month must be open** for the same reason → `status = 'ended'`, `ended_by`, `end_reason` → audit → commit. The enrollment **still charges the month it ended in** (D-36, no proration) — stated in the response so it is never a surprise.

Ending cannot *create* an overlap — it only ever shrinks a range, or closes an open-ended one — so no overlap check is needed on this path. It is nevertheless run under the same lock, because it moves the boundary the enroll path tests against.

### 7.6 Run approval and cancel — the reimbursement commit (**D-35**)

Phase 5 adds **no new consumption mechanism**. It extends the two existing Phase-3 blocks, inside their existing transactions:

**`_commitVariablePay` (§7.4 of Phase 3)** — add `'reimbursement'` to the `findByItemIdsAndSources` source list (§2 item 8), build `runItemByClaim` from each line's `source_ref_id` → **claim item id** → its `claim_id`, then per claim: `SELECT … FOR UPDATE`, assert `status === 'approved' && applied_run_id IS NULL` else `409 REIMBURSEMENT_ALREADY_APPLIED` naming the claim number (forcing a recalculation), then stamp `applied_run_id`, `applied_run_item_id`, `applied_at`. Extend the `run.variable_pay_committed` audit payload with `claims_applied`.

**`_reverseVariablePay` (§7.5 of Phase 3)** — `reimbursement_claims WHERE applied_run_id = ?` `FOR UPDATE` → clear `applied_run_id`, `applied_run_item_id`, `applied_at`. Status is already `approved` and stays so. Extend the audit payload with `claims_reversed`.

**`pay` (#50)** — **new, small block inside the existing transaction**: `reimbursement_claims WHERE applied_run_id = run.id AND status = 'approved'` → `status = 'processed'`, `processed_at`. Audit `run.reimbursements_processed` with the count. This is the parent's *"paying a run marks claims `processed`"*, and it is safe as a terminal transition because a `paid` run is never cancellable (**D-12**).

**Benefits are not stamped at all (D-33).** An enrollment is not consumed — it recurs. Its lines are fully derived from the enrollment and the plan every calculation, **the §4.6 month-overlap EXCLUDE constraint prevents duplication** (the partial unique index alone does not — see §4.6), and one run per period prevents double charging. Adding a commit/reverse block for benefits would create a reversal path that can fail, for no correctness gain — the Phase-4 **D-27** reasoning ("no second copy of the truth to fall out of sync"), applied here.

> **Why the claim stamp rides on approval and the status flip on payment.** D-18 established that calculation only *references* and approval *consumes*, because calculation is re-runnable and would otherwise double-consume. That is unchanged. The extra `processed` transition at payment exists because the parent defines it as the employee-visible end state and because "the money left the building" is genuinely a different fact from "this claim is committed to run X". The two are recorded separately and the stamp is the one that guarantees single payment.

---

## 8. Tests (`node:test`) — D-10

Runner and script are in place (`npm test` → `node --test "tests/unit/**/*.test.js"`, **402 passing at baseline**). All new suites are pure — no database, no network.

| File | Must cover |
|---|---|
| `tests/unit/payroll/reimbursement_limits.test.js` | per-claim cap applied to the **category subtotal within one claim**, so four ₹5,000 lines do not defeat a ₹10,000 cap; per-period cap with `month` and `financial_year` windows keyed on **`expense_date`**, not submission date; prior spend counts `approved_amount` of `approved`/`processed` claims and **excludes** `submitted`/`under_review`; `NULL` cap = uncapped vs `0` cap = forbidden; the boundary where spend exactly equals the cap is allowed and one paise more is not. **The straddling claim, as its own named test:** one claim holding a 28‑March item and a 2‑April item, an FY cap, and prior spend in the March FY only → the March item violates and the April item passes, each reported with its own `period_key`. Assert the same shape for a `month` cap across a 31st/1st pair. **A single-bucket implementation passes every other case in this row and fails only this one** — which is why it is called out rather than left to a general "windows" case |
| `tests/unit/payroll/approval_chain_resolver.test.js` | `levels = 2` with a manager → two levels; **`escalated_to_role: 'admin'` maps to `hr`** (D-14) and never emits an `admin` level; **the allow-list holds for a role the leave module does not return today** — feed `'super-admin'`, `'finance'` and `'nonsense'` and assert each yields `hr`, because this is the guard against a cross-module enum change (§5.2 rule 1); no manager → collapses to one `hr` level; **manager === claimant → collapses**, never self-approval; `levels = 1` → one `hr` level; two `hr` levels are never produced; **every emitted `approver_role` is `manager` or `hr` in every branch** (a table-driven sweep over the input space, matching the §4.4 ENUM); `collapsed` and `reason` are reported |
| `tests/unit/payroll/benefit_contribution.test.js` | overlap at both period boundaries; an enrollment starting on the last day of the month charges the **full** month (**D-36**); one ending on the first day likewise; plan `effective_to` bounds it; **a `0` override wins over a non-zero plan amount** (the `!= null` coalesce, not truthiness); a zero contribution emits **no line**; both amounts positive; **`status = 'cancelled'` contributes nothing even when its dates overlap** (§5.3 filters internally, it does not trust the caller); **two overlapping enrollments in one plan yield exactly one contribution plus `DUPLICATE_BENEFIT_ENROLLMENT:{plan_code}`** — assert the emitted line is the earliest-starting one and that the total charged equals one premium, not two |
| `tests/unit/payroll/payout_selector.test.js` | only `approved` claims with the matching `payout_period_month`; a claim applied to **this** run is re-selected (recalculation idempotency) and one applied to a **different** run is not; `processed`/`rejected`/`cancelled`/`draft` never selected; only `item_status = 'approved'` items produce lines, at `approved_amount`; a partially-approved claim pays exactly its approved lines |
| `tests/unit/payroll/payroll_calculation.test.js` *(extend)* | **omitting `reimbursements` and `benefitContributions` reproduces Phase-4 output byte-for-byte** — every existing assertion passes unchanged; a **non-taxable** reimbursement does **not** move `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage` or `ctc_cost`, and **does** move `net_pay`; a **taxable** reimbursement **does** move gross, `taxable_earnings` and the PT base but **not** `pf_wage` or `esi_wage`; **the ESI threshold case explicitly** — an employee on ₹20,000 ESI-applicable wages receiving a ₹5,000 **taxable** reimbursement is still `covered`, with `esi_wage` at ₹20,000 and `trace.eligibility_wage` unchanged, proving the `esi_applicable: false` flag is what excludes it rather than luck of ordering (§5.5); the same employee **does** lose coverage when the ₹5,000 is a genuine `esi_applicable` earning, so the test can tell the two apart; a benefit employee deduction is applied **before** the loan-EMI affordability test, so an employee who could afford the EMI without it has the EMI **skipped** (EC-15 interaction); a benefit employer contribution raises `ctc_cost` and nothing else; **an employee whose wages clamp to ₹0 still receives the full reimbursement, and `carry_forward_out` is computed on wages only** (§5.5); `Σ earnings − Σ deductions + shortfall + reimbursement + rounding == net_pay` **exactly** with structure + OT + adjustments + statutory + benefits + loan + carry-forward + reimbursement + rounding all present; rounding applies to the **combined** net; a negative reimbursement or benefit line throws `INVALID_COMPONENT_AMOUNT`; the module still imports no `db` |
| `tests/unit/payroll/salary_component_reserved_code.test.js` *(extend)* | `REIMBURSEMENT` and `BENEFIT` join the four existing reserved codes → `422 RESERVED_COMPONENT_CODE` |
| `tests/unit/payroll/authority.test.js` *(extend)* | a manager may approve a direct report's claim and not a non-report's; **reimbursement approval is not gated by `manager_can_view_team_compensation`** while `#153` is; a claimant can never approve their own claim |
| `tests/unit/payroll/attachment_authority.test.js` *(new, pure)* | the §6.7 matrix in full — **a manager is refused `investment_declaration_item` and `form16_part_a` in every scope, including for their own direct report** (D-28); self is refused another user's owner id; HR is allowed all three in-org and none cross-org; a non-`available` row yields `404` for every audience; out-of-scope and non-existent are byte-identical. The resolver takes the owner row and requester context as **arguments** and does no I/O, so the matrix is table-driven |
| `tests/unit/payroll/attachment_key_and_type.test.js` *(new, pure)* | the allow-list accepts exactly jpeg/png/webp/pdf and **rejects `image/svg+xml`** — this test is the standing guard against it being re-added (§11 item 1a); a declared type differing from the verified type fails; the object key is always `org/{orgId}/{ownerType}/{ownerId}/{attachmentId}` even when `file_name` contains `../` or a null byte; `file_name` is quoted and sanitised in `ResponseContentDisposition` |

**Integration checks stay manual** (no HTTP harness exists; do not build one here) — §10 covers them.

---

## 9. Documentation Deliverables (part of the phase, not afterwork)

1. **`public/md_system/api_registry.md`** — three new sections (`## Payroll Module - HR Administration (Phase 5)`, `- Manager Operations (Phase 5)`, `- Employee Self-Service (Phase 5)`), one row per endpoint **#128–#166**, matching the existing 13-column format.
2. **`public/md_settings/org_settings_registry.md`** — entries **#51–#53** (§4.10), using the file's exact seven-field structure and citing real enforcement files. *(And delete the stray `</content></invoke>` markup the parent's Appendix records — Phase 3 and Phase 4 were each meant to and did not. **This is the third miss; treat it as an exit-criterion checkbox, not a note.**)*
3. **`public/md_payrolls/combined_api_analysis.md`** — a Phase-5 section with request/response contracts for all 39 endpoints, including the three-step attachment handshake (issue → PUT direct to S3 → confirm) with its `required_headers`, the approval-chain payload shape, and — stated prominently — **the reimbursement-is-not-an-earning semantic (D-31)** and its effect on `gross_earnings` vs `net_pay`.
4. **`public/md_payrolls/phases/phase5_api_analysis.md`** and **`phase5_business_walkthrough.md`** — mirroring the Phase-1/2/3/4 artefacts. The walkthrough must narrate the **claim lifecycle end to end** (draft → attach receipt → submit → manager approves partially → HR approves → payout period resolves to next month because this month is closed → run calculates → run approves → run pays → `processed`), because that sequence spans nine endpoints, two lock ranks and three edge cases and is the one flow nobody can infer from the endpoint list.
5. **`public/md_payrolls/implementation_plan.md`** — a single edit repairing all of the following:
   * §0 status line → Phases 1–4 implemented, Phase 5 in progress.
   * §3 → add **D-30 … D-37** from this plan.
   * §4 → Phase-5 table list corrected from six to **seven** (`payroll_attachments`, D-30); note the `payroll_run_items` additions and the `source` enum addition.
   * §5 Step 6 → point at §5.5 of this plan and record that a reimbursement is **not** part of gross; Step 9 → record the amended reconciliation identity.
   * §9 → add **EC-48 … EC-56** (§10.4).
   * §11 → mark open decision **4 (attachment storage)** as DECIDED (**D-30**, S3, 2026-09-11).
   * **§3 D-11 → amend, do not silently contradict.** D-11 reads "exactly one new dependency: `pdfkit`". Phase 5 adds two AWS SDK clients. Record the amendment *inside D-11* with its justification (§5.4) so a future reader sees a decision that changed, not a rule that was ignored — and so the "hand-written CSV, no `exceljs`" half of D-11, which still stands, is not read as also abandoned.
   * §1.3 out-of-scope → note that the Employee-Panel M9 Expense module's extras still layer over these same `reimbursement_*` tables (D-7 unchanged).

---

## 10. Exit Criteria — Phase 6 does not begin until every line is checked

### 10.1 Schema & wiring

- [ ] `00044` migrates up, down, and up again cleanly (every **newly created** enum type dropped with `CASCADE`; the 3 `payroll_run_items` columns and 3 `payroll_settings` columns removed; `engine_version` default restored to `4`). `enum_payroll_run_item_components_source` is **not** dropped, and `down()` says why (§4.9). **`btree_gist` is created and *not* dropped** (§4.6) — shared infrastructure, and the EXCLUDE constraint goes with its table regardless.
- [ ] The `employee_benefit_enrollments_no_month_overlap` constraint is present after `up` and **actually rejects** a month-overlapping insert issued as raw SQL, not merely through the service. If the constraint could not be created (no `btree_gist`), record that explicitly in the phase report — the §7.5 service check is then the **only** layer preventing a double premium.
- [ ] The seven new models load; **every Phase-1/2/3/4 endpoint is regression-checked** — `/hr/settings`, `/hr/components`, `/hr/runs/:id/calculate`, `/hr/adjustments`, `/hr/loans/:id/approve`, `/hr/statutory/config`, `/hr/tax/declarations`, `/me/salary-structure`, `/me/payslips/:runId`, `/me/tax/summary`.
- [ ] A run calculated with **no claims and no enrollments** produces figures **byte-identical** to the Phase-4 engine for the same inputs, with `engine_version: 5`.
- [ ] `PUT /hr/settings` → `GET /hr/settings` round-trips every payroll setting **#35–#53**.
- [ ] Creating a salary component coded `REIMBURSEMENT` or `BENEFIT` → `422 RESERVED_COMPONENT_CODE`.
- [ ] `npm test` passes: the 402-test baseline **and** the six new suites plus the three extended ones. No existing test is modified to accommodate Phase 5.
- [ ] `package.json` gains **exactly two** dependencies — `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. No `multer`, no `busboy`, no `pdfkit`, and `express.json`'s 10 MB limit is unchanged.

### 10.1a Attachment storage (D-30)

- [ ] **End-to-end in a real browser:** issue upload URL → PUT the file directly to S3 → confirm → request an **inline** view URL → the receipt renders in an `<img>`/`<iframe>` without download. This is the criterion the decision was made for; a `curl`-only check does not exercise CORS.
- [ ] A PUT with a **different `Content-Type`** than the one signed is rejected by S3; a PUT with a larger `Content-Length` likewise. Neither produces an `available` row.
- [ ] `confirmUpload` against an object that was never uploaded → `422 ATTACHMENT_VERIFICATION_FAILED`, row stays `pending`, and the claim still cannot be submitted if that item requires a receipt.
- [ ] A multipart ETag leaves `checksum_sha256` **NULL** rather than storing a non-checksum.
- [ ] An expired URL (past TTL) is rejected by S3, and re-requesting `#165` issues a fresh one without altering any row.
- [ ] `image/svg+xml` is rejected at the Joi layer; a file renamed to `.jpg` but served as SVG fails `HeadObject` verification.
- [ ] `file_name` containing `../../etc/passwd` produces the standard `org/{orgId}/...` key and is never interpreted as a path.
- [ ] With `PAYROLL_S3_BUCKET` unset, the app boots, logs a startup error, and every attachment endpoint returns `503 ATTACHMENT_STORAGE_UNAVAILABLE` — while **every non-attachment payroll endpoint works normally** (§13.1).
- [ ] Simulated S3 outage during `#163`: `503`, and the claim, run and approval state are byte-unchanged.
- [ ] **D-29 closed** — an investment proof uploads against a `submitted` declaration via `#162` without a reopen, HR opens it via `#137` while verifying (`#107`), and a Form 16 Part A uploads via `#147` and is readable by its owner via `#165`. No `owner_type` value exists without a working writer.

### 10.2 Reimbursement arithmetic and the payslip identity

- [ ] **D-31, the headline criterion** — a ₹5,000 **non-taxable** reimbursement raises `net_pay` by exactly ₹5,000 and leaves `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage`, `professional_tax_amount`, `income_tax_amount` and `ctc_cost` **completely unchanged**, verified by a before/after on the same employee and period.
- [ ] A ₹5,000 **taxable** reimbursement raises `gross_earnings`, `taxable_earnings` and the PT base, and leaves `pf_wage` and `esi_wage` unchanged.
- [ ] **The ESI threshold is not breached by a taxable reimbursement** — an employee with ₹20,000 ESI-applicable wages who receives a ₹5,000 taxable reimbursement remains **covered**, with `esi_wage` = ₹20,000, in the **first** month of an ESI contribution period (the month coverage is actually assessed, **EC-19**). Check this on the assessment month specifically: a continuation month passes trivially and proves nothing.
- [ ] `Σ earnings − Σ deductions + shortfall + reimbursement + rounding == net_pay` **exactly** on every item with structure, OT, adjustments, statutory, benefits, loan EMI, carry-forward, reimbursement and rounding all present (**EC-17**).
- [ ] **An employee whose wages clamp to ₹0 still receives their full reimbursement**, `carry_forward_out` reflects the wage shortfall only, and the next period's `CARRY_FORWARD_RECOVERY` does not recover the reimbursement (**EC-49**).
- [ ] With `net_pay_rounding = nearest_rupee`, rounding is applied to **net including the reimbursement**, and the `ROUNDING_ADJUSTMENT` line still reconciles.
- [ ] A benefit employee deduction is subtracted **before** the loan-EMI affordability test: an employee who could afford the EMI without the premium has the EMI **skipped entirely**, with `LOAN_EMI_SKIPPED` (**EC-15 interaction**).
- [ ] A benefit employer contribution raises `ctc_cost` and `total_employer_contributions` by exactly its amount and changes nothing else.
- [ ] `benefit_deductions_enabled = false` → no benefit line is emitted even for actively enrolled employees, and the aggregator issues **one fewer query per cohort**.

### 10.3 Workflow, limits and attachments

- [ ] **A claim cannot skip an approval level** (parent exit criterion) — with `reimbursement_approval_levels = 2`, an HR user calling `#135` while `current_level = 1` gets `403 NOT_YOUR_APPROVAL_LEVEL`, and the claim is unchanged.
- [ ] **An approved claim is paid exactly once and never re-paid by a re-run** (parent exit criterion) — recalculating a `calculated` run twice, then approving, stamps the claim once; `SELECT count(*) FROM reimbursement_claims WHERE applied_run_id IS NOT NULL` is identical before and after the second recalculation.
- [ ] **A rejected claim never reaches a payslip** (parent exit criterion) — a claim rejected at level 1 produces no component line in any subsequent run.
- [ ] **Category limits are enforced server-side** (parent exit criterion) — a submission breaching `max_amount_per_claim` or `max_amount_per_period` is refused with `422 CATEGORY_LIMIT_EXCEEDED` listing every violation; splitting one expense into four lines does not defeat the per-claim cap.
- [ ] The limit is **re-checked at approval** against the approved amounts: a claim that passed at submission but would breach the cap after another claim was approved meanwhile is refused.
- [ ] **A claim straddling two limit windows is judged per window** — one claim with a 28‑March and a 2‑April item, against an FY cap already partly consumed in the March FY, rejects only the March item and names `period_key` in the violation. The April item is **not** blocked by March's spend.
- [ ] `#134` and `#149` return `category_limits[]` whose `remaining` matches, to the paise, the figure §7.3 step 9 would enforce — verified by approving exactly `remaining` (succeeds) and then `remaining + 1` paise (refused).
- [ ] `requires_receipt` with no `available` attachment → `422 RECEIPT_REQUIRED` naming the item; a `pending` (unconfirmed) attachment does **not** satisfy it.
- [ ] An attachment upload URL is content-type and size bound: uploading a different content type or a larger file against the issued URL fails at the storage layer, not silently.
- [ ] An employee cannot fetch a download URL for another employee's attachment (`403`, identical to a non-existent id); a manager can for a direct report and cannot for a non-report.
- [ ] **EC-48** — a claim approved when the current month's run is already `approved` resolves forward to the next open month and is paid there; the closed run is byte-unchanged.
- [ ] A claim approved when **no** month within `reimbursement_payout_lookahead_months` is open → `422 NO_OPEN_PAYOUT_PERIOD` naming the months tried; **nothing is persisted**, the claim stays `under_review`.
- [ ] A claim approved into a `calculated` run sets `requires_recalculation`, and approving that run then fails `409 RUN_STALE` until it is recalculated.
- [ ] Approving a claim while its target period's run is `calculating` → `409 RUN_CALCULATION_IN_PROGRESS`, nothing written.

### 10.4 Edge cases newly registered by this phase

- [ ] **EC-48** Claim approved after its natural period closed → resolved forward, never mutating the closed run. *(above — this is the parent's **EC-23** made concrete.)*
- [ ] **EC-49** Reimbursement survives the negative-net clamp. *(above)*
- [ ] **EC-50** Claimant is their own approver (self-reporting manager, or a sole-HR org's own claim) → the chain never emits a self-level; a direct attempt is `403 SELF_APPROVAL_FORBIDDEN` with a message naming the remedy (invite a second `hr`).
- [ ] **EC-51** The reporting line changes between submission and approval → the **new** manager can act, the **former** manager gets `403`, and the claim is never stranded. (Deliberately *unlike* Phase-1 EC-29, which blocks a stale Tier-B proposal — a Tier-B proposal binds compensation and must not survive a reorg; an expense receipt must still get paid. §4.4 records the reasoning.)
- [ ] **EC-52** A category is deactivated while a claim referencing it is in flight → the claim completes on its **snapshotted** category behaviour; `#132` refuses the deactivation with `409 CATEGORY_IN_USE` while non-terminal claims exist.
- [ ] **EC-53** **An employee is never charged two premiums for one plan in one month — through any route.** Three separate checks, because three separate layers are involved: *(a)* two **concurrent** `#143` calls → one `active` enrollment, the second refused; *(b)* **the sequential backdated path that the partial unique index does not catch** — enroll Jan–Jun, end it, then re-enroll from 1 April → `409 ENROLLMENT_PERIOD_OVERLAP`, and the same attempt executed as raw SQL is refused by the §4.6 EXCLUDE constraint; *(c)* an overlap inserted with the constraint dropped still yields **one** benefit line plus a `DUPLICATE_BENEFIT_ENROLLMENT` warning on the run item (§5.3), never two deductions. Also assert the day-granular near-miss — `[Jan 1–Mar 15]` followed by `[Mar 20–…]` — is **rejected**, since both would charge March.
- [ ] **EC-56** A claim whose items span two limit windows is evaluated per `(category, period_key)`, and the FY boundary used is `tax_period.utils.financialYearOf` under the org's configured `fy_start_month` — not a hard-coded April. *(above)*
- [ ] **EC-54** An enrollment ends mid-month → the full premium is charged for that month (D-36), and **no** premium the following month; the response states it at the moment of the decision.
- [ ] **EC-55** An attachment is uploaded but never confirmed, or confirmed against a claim later cancelled → it stays `pending`/orphaned, is invisible to every rule, satisfies no receipt requirement, and is swept by the §11 item 6 job without touching any live claim.

### 10.5 Lifecycle, concurrency & idempotency

- [ ] Two concurrent `POST /claims/:id/approve` at the same level → one approval, the second `409 CLAIM_NOT_ACTIONABLE`; `current_level` advances exactly once.
- [ ] Two concurrent `POST /claims/:id/submit` → one submission, one chain, one `claim_number`; no duplicate `reimbursement_approvals` rows (the UNIQUE `(claim_id, level)` index holds).
- [ ] **An employee cancels from `under_review` after level 1 approved** → `cancelled`, the level-1 `approved` row is preserved for audit, remaining levels are `skipped`, and the claim never reaches a run (§7.4a). Cancelling an **`approved`** claim is refused with `409 CLAIM_NOT_CANCELLABLE`.
- [ ] **Concurrent cancel and final approve on the same claim** → exactly one wins; the loser gets `409 CLAIM_NOT_CANCELLABLE` or `409 CLAIM_NOT_ACTIONABLE`; and when approve loses, the target run's `requires_recalculation` is **unchanged** (its transaction rolled back with it) — verify the flag, not just the claim.
- [ ] Two employees submitting simultaneously get **distinct** `claim_number`s; a unique-violation retry is observable in logs at most once.
- [ ] **Approving and then cancelling a run reverses every claim stamp exactly** — `applied_run_id`, `applied_run_item_id` and `applied_at` return to NULL, status stays `approved`, and re-approving a fresh run for the same period pays the claim exactly once.
- [ ] Paying a run moves every applied claim to `processed` with `processed_at`; a `processed` claim is never selected by a later run.
- [ ] **No benefit enrollment is stamped, reversed or mutated by run approval, cancel or pay** (D-33) — verified by a row-level before/after diff on `employee_benefit_enrollments` across the full cycle.
- [ ] A claim item whose run item is pruned (`pruneAbsent`) leaves `applied_run_item_id` NULL rather than erroring — the FK is `SET NULL` (§2 item 9 / Phase-3 §2 item 7).
- [ ] Recalculating a run twice produces identical reimbursement and benefit figures and identical item UUIDs (**D-16**), and all 3 new columns change when the underlying claim or enrollment changes (proving `ENGINE_OWNED_COLUMNS` is complete).
- [ ] An item that becomes an `error` on recalculation has all 3 new columns reset to zero (proving `ZERO_FIGURES` is complete).
- [ ] Deadlock check: a claim approval and a run approval issued concurrently for the same period complete without a deadlock (§7.1 ordering).

### 10.6 Authority & secrecy

- [ ] An `employee` token on any `/hr` or `/manager` Phase-5 route → `403`; an `admin` / `super-admin` token → `403` everywhere (**D-14**).
- [ ] **No approval chain ever routes to `admin`** (D-32) — verified by seeding a self-reporting claimant and confirming the chain collapses to `hr`.
- [ ] A manager fetching a **non-report's** claim → `403`, byte-identical to the response for a non-existent claim id (**EC-24**).
- [ ] `manager_can_view_team_compensation = false` → `#153` returns aggregates only, while `#148`–`#152` still work (§6.2), and no claim payload carries any salary figure.
- [ ] An employee sees only their own claims, attachments and enrollments; substituting another user's id anywhere under `/me` returns their own data or `403`, never someone else's.
- [ ] HR of Org A cannot read or mutate any Org B category, claim, plan, enrollment or attachment; a pre-signed URL issued in Org A cannot address an Org B object key.
- [ ] **A manager is refused every tax attachment** (§6.7 rule 1, D-28) — `#152` against an `investment_declaration_item` or `form16_part_a` returns `403` even for a direct report, and the response is identical whether the id exists. Verified by route-level substitution, not only by unit test.
- [ ] Every view-URL issuance writes `attachment.view_url_issued` to `payroll_audit_logs` with actor, attachment and owner type; **no signed URL, `storage_key` or bucket name appears in any audit row, log line or error message**.
- [ ] Every category/plan change, claim submission, level approval, rejection, cancellation, enrollment, enrollment end, commit and reversal appears in `payroll_audit_logs` with actor, level and reason. No attachment `storage_key` and no pre-signed URL ever appears in an audit row, a log line or an error message.

### 10.7 Performance

- [ ] A 500-employee run with claims and benefits issues **2 extra queries per cohort** over the Phase-4 baseline (verified by query log); a 3,000-employee run stays at ~154 queries, confirming O(cohorts).
- [ ] Peak RSS during a 3,000-employee run stays flat across cohorts — **no attachment binary is ever loaded into the app process** (the pre-signed design guarantees this; confirm no code path reads object bytes).

---

## 11. Risks & Decisions Needed

| # | Item | Recommendation | Needed by |
|---|---|---|---|
| 1 | **Attachment storage** — the parent's §11 item 4, deferred by D-19 and explicitly handed to this phase by **D-29**. | **DECIDED 2026-09-11 — S3 with pre-signed URLs for upload *and* display (D-30, §5.4).** Two new dependencies (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`), a recorded amendment to D-11, justified because `@aws-sdk/client-ses` already puts the SDK v3 core and credential chain in the image. Local disk was rejected (fails multi-instance, no backup story); base64-in-DB was rejected (bloats the primary datastore with binaries Phase 6 must stream). **Residual risk moves from "which backend" to "the bucket is now a hard runtime dependency of claim submission"** — §13 is the provisioning checklist, and §5.4's error rule keeps an S3 outage from corrupting payroll state: uploads and views fail `503`, no claim or run transitions. | **Closed** |
| 1a | **Inline display makes the content-type allow-list a security control.** Serving user-uploaded files inline from the bucket origin turns any script-capable format into stored XSS. | Exclude `image/svg+xml` and every markup type — permanently. Enforce at **three** points (Joi, the signed `Content-Type` on the PUT, and `HeadObject` at confirm), because each alone is defeatable, plus `X-Content-Type-Options: nosniff` on the bucket. §5.4. **Do not add SVG later "for logos"** — that is the exact request that reopens this hole. | Before §5.4 |
| 2 | **A reimbursement emitted as an `earning` would silently enter PF, ESI, PT and TDS.** The engine hands `realEarningLines` to `computeStatutory` (§2 item 3), so one wrong `component_type` over-withholds on money that is not income — and every reconciliation assert still passes, so nothing fails loudly. | **D-31** — non-taxable claims use `component_type: 'reimbursement'`, which the existing filter excludes **by construction**; the taxable form is deliberately an `earning` with `pf_applicable`/`esi_applicable` false. **Treat "the totals reconcile" as insufficient evidence here** — the Phase-4 §11 item 15 warning applies verbatim — which is why §10.2's first criterion is a numeric before/after on six specific columns, not a balance check. | Before §5.5 |
| 3 | **`approval_chain.utils` can escalate to `admin`**, a platform role with no payroll capability (**D-14**), and it swallows DB errors into an `hr` escalation. | **D-32** — wrap it, never consume it directly. The pure `approval_chain_resolver` maps `admin → hr`, collapses impossible levels, and never emits a self-approval level. The util remains the *routing* source; `getAccessibleUserIds` + `decideAuthority` remain the *authority* source, re-resolved live at action time. Do **not** edit the leave util — it is shared and its `admin` escalation may be meaningful there. | Before §5.2 |
| 4 | **Benefits need a `source` value and the module has never run an `ALTER TYPE`.** Reusing `source: 'adjustment'` would route enrollment ids into `payrollAdjustmentRepo.findByIdsForUpdate` and **break every run approval in the org** (§2 item 9). | Add `'benefit'` to the enum (§4.9). Confirm PG ≥ 12, use `ADD VALUE IF NOT EXISTS`, add nothing that *uses* the value in the same transaction, and **document in `down()` that the label cannot be removed** — a type rebuild on a populated payroll component table is far more dangerous than an inert enum label. This is the one place Phase 5 knowingly breaks the module's full-reversal migration discipline, and it is PostgreSQL's constraint, not a choice. | Before §4.9 |
| 5 | **Benefit proration for a mid-month enrollment.** Charging a full premium for one day of cover will be questioned. | **D-36 — no proration.** An insurance policy is in force for a month or it is not, and D-21 already settled that scaling an authorised rupee figure by attendance creates disputes. Applied symmetrically at both ends (a mid-month *end* also charges the full month), stated in the `#143`/`#146` responses at the moment of the decision, and covered by EC-54. An org needing daily accrual must model it as a monthly plan change. | Before §5.3 |
| 5a | **The partial unique index on `(user_id, plan_id) WHERE status = 'active'` does not prevent a double premium**, because §5.7 deliberately also selects `ended` enrollments that overlap the period (D-36). Enroll → end → re-enroll with a backdated `enrolled_from` and the employee is charged twice a month, silently, through `#143` alone. | **Three layers, and the granularity is the month, not the day** (§4.6): a GiST **EXCLUDE constraint on month-truncated ranges** (requires `btree_gist` — a stock contrib module, and `00000` already establishes the `CREATE EXTENSION` precedent and privilege), a service-level overlap assertion under `payroll:benefit:{userId}` returning `409 ENROLLMENT_PERIOD_OVERLAP` (§7.5), and **dedupe-with-warning in `contributionsForPeriod`** (§5.3) so money is never taken twice even if both upstream layers are absent. A plain date-range exclusion is **not** sufficient — `[Jan 1–Mar 15]` and `[Mar 20–…]` do not overlap as dates and charge March twice. | Before §4.6 |
| 5b | **A claim straddling two limit windows corrupts both.** Items dated 28 March and 2 April fall in different financial years; a `priorApprovedByCategory` map keyed by category alone must give a wrong verdict on at least one of them. | Key prior spend by **`(category_id, period_key)`** and group the in-claim subtotal the same way (§5.1); derive the FY with the existing `tax_period.utils.financialYearOf`, never inline. One repository method serves both §7.2 and §7.3 so submit and approve cannot disagree. | Before §5.1 |
| 6 | **Orphaned attachments.** A pre-signed upload that is issued and abandoned leaves a `pending` row and possibly an object; a cancelled claim leaves confirmed attachments with no live owner. | Accept, bounded. A `pending` row is invisible to every rule (§4.7) so it can never make a claim look documented. Add a **Phase-7 sweep** (the cron phase already owns scheduled work) deleting `pending` rows older than 24 hours and their objects, and `deleted` rows older than the retention window. Do **not** build a cron in this phase — the parent assigns all scheduled work to Phase 7, and an un-swept `pending` row costs a row and an object, not a correctness failure. Record the storage cost as accepted. | Design |
| 7 | **A sole-HR org cannot have its own HR user's reimbursement claims approved** (§5.2's hard self-approval bar). | Accept and message it precisely, following the **EC-30** precedent: name the remedy (invite a second `hr`, which the invitation matrix permits) rather than returning a bare `403`. Self-approval of an expense claim is the module's clearest fraud vector and is not worth a configurable escape hatch. Flag it in the phase completion report so it is not discovered in production. | Before §5.2 |
| 8 | **The reimbursement sits outside the negative-net clamp**, so an employee with ₹0 wages still receives a payout while carrying a shortfall forward. An accountant may read that as the company paying someone who owes it money. | Correct and intended (§5.5). The employee funded a company expense from their own pocket; recovering it against a wage shortfall would charge them for the company's costs. Surface both figures separately on the payslip (`net_pay`, `reimbursement_amount`, `carry_forward_out`) so the position is legible rather than netted into one number. | Design |
| 9 | **`total_levels` is frozen at submission**, so an org raising `reimbursement_approval_levels` does not re-shape in-flight claims. | Accept — the `settings_snapshot` principle applied to a workflow. The alternative (re-resolving the chain on every action) means a claim's required approvals can change under the approver's feet mid-review. Document that a settings change applies to claims submitted **after** it. | Before §7.2 |
| 10 | **39 endpoints and 7 tables**, and the one dangerous change (the engine's net identity) is a three-line edit buried in the middle. | §12's ordering keeps each step verifiable and deployable: bucket → schema → repositories → **pure utils with their tests** → categories/plans → attachments → claims & chain → enrollments → aggregator → **engine wiring + run commit** → routes → docs. The engine is not wired until step 9, by which point every arithmetic decision is under a passing test. | Sequencing |
| 10a | **Benefit plans have no tax semantics**, so an employer-paid taxable perquisite is untaxed and an employee health premium earns no automatic §80D relief. | **D-37** — deferred to Phase 6, and **not** papered over with an `is_taxable` column that nothing reads. `taxable_earnings` is built from `earning` lines only, so an `employer_contribution` line cannot reach it by flag; closing this needs a new taxable channel plus a TDS-annualisation change. Until then the perquisite is a Phase-3 taxable earning adjustment and §80D is declared through Phase 4 — both supported paths. State the limitation on `#138` (§1.2). | Design |
| 11 | **Documentation debt keeps recurring.** Phase 3 flagged the stale parent status line, Phase 4 repaired it and flagged the same pattern, and the stray `</content></invoke>` markup in `org_settings_registry.md` has now survived **two** phases that were each supposed to delete it. | Make §9 an **exit-criterion checkbox** (§10 references it), not a closing note. Specifically verify the markup deletion and the D-30…D-37 insertion into the parent's §3 before declaring the phase complete. | Before Phase 6 |

---

## 12. Build Order & Dependencies

Each step leaves the system **deployable and green**. Steps 0–4 change no runtime behaviour; the engine does not see payouts until step 9, and no HTTP surface exists until step 10.

| # | Step | Depends on | Done when |
|---|---|---|---|
| 0 | **Provision the bucket and credentials (§13)** — bucket, IAM policy, CORS, SSE, env vars in every environment | — | A scratch script signs a PUT, uploads a JPEG, signs an inline GET and the browser renders it. **Do this first**: step 5 is untestable without it, and CORS failures look like signing bugs |
| 1 | Migration `00044` (§4) + 7 models + the 3 `payroll_run_items` columns + the 3 settings columns + `btree_gist` + the **month-overlap EXCLUDE constraint** (§4.6) + the `source` enum addition + `engine_version` default | PG ≥ 12 confirmed (§2 item 17); `btree_gist` available (§2 item 22) | `db:migrate` → `undo` → `migrate` clean; Phase-1/2/3/4 endpoints regression-checked; the enum label is present and `down()` documents why it and the extension stay; **a month-overlapping enrollment inserted by raw SQL is rejected by the constraint** |
| 2 | 7 repositories; `ENGINE_OWNED_COLUMNS` and `ZERO_FIGURES` gain all 3 names; **the one shared prior-spend read** for §5.1, used by both §7.2 and §7.3 | 1 | The prior-spend read returns correct sums **bucketed by `(category_id, period_key)`** for a hand-seeded pair of adjacent financial years, excludes the claim being evaluated, and uses `financialYearOf` rather than an inline April boundary; recalculation still preserves exclusions and period overrides |
| 3 | **Pure utils** — `reimbursement_limits`, `approval_chain_resolver`, `benefit_contribution`, `payout_selector` (§5.1–§5.3, §5.6) | — *(parallel with 1–2)* | Their four suites pass, **including the three cases that a plausible-but-wrong implementation passes everything else on**: the claim straddling two limit windows, the allow-list against an unknown escalated role, and two overlapping enrollments collapsing to one charge plus a warning |
| 4 | `reimbursement_category.service` + `benefit_plan.service` (plans only) + reserved component codes + `updateSettingsSchema` keys | 1, 2 | Categories and plans round-trip; settings round-trip for #35–#53; `REIMBURSEMENT`/`BENEFIT` rejected |
| 5 | `attachment.service` + the S3 adapter (§5.4) + the §6.7 authority resolver | 0, 1 | Upload → confirm → **inline view** round-trips in a real browser; a `pending` row satisfies no receipt rule; content-type and content-length binding verified by attempting a mismatched PUT; `HeadObject` mismatch leaves the row `pending` |
| 6 | `reimbursement_claim.service` (draft authoring, submit §7.2, **cancel §7.4a**) + `reimbursement_approval.service` (§7.3, §7.4, §6.4) | 2, 3, 4, 5 | Chain materialisation, level enforcement, self-approval bar, limit re-check and payout resolution all behave; **cancelling from `under_review` works and cancelling an `approved` claim does not**; `category_limits[]` on #134/#149 matches what §7.3 enforces; the §7.1 lock-order comment is in place |
| 7 | Enrollments — `benefit_plan.service` enroll/end (§7.5) | 4 | A concurrent duplicate is refused by the partial unique index; **a backdated re-enrollment that month-overlaps an `ended` one is refused with `409 ENROLLMENT_PERIOD_OVERLAP` by the service check, and by the constraint when issued as raw SQL**; a closed period blocks enrollment dating |
| 8 | `payroll_payout_aggregator.service` (§5.7) | 2, 6, 7 | Correct maps for a hand-seeded cohort; **2-per-cohort** query count confirmed; the benefit query is skipped when the setting is off |
| 9 | **Engine wiring + run commit/reverse** — `computePayrollItem` Steps 6c/8a′/8f and the amended Assert 2; `payroll_run.service` `engine_version`/snapshot/cohort call/3 columns; `_commitVariablePay`, `_reverseVariablePay` and `pay` (§7.6) | 3, 8 | Extended `payroll_calculation.test.js` passes **and** every Phase-4 assertion passes unchanged with both inputs omitted; a seeded claim and enrollment appear as component lines; recalculate ×2 → approve → cancel → approve leaves claim state exactly as it started |
| 10 | Controllers → routes → validators, in audience order **HR (#128–#147) → Manager (#148–#153) → Self (#154–#166)**; payslip/preview/eligibility projection updates (§6.6); the §6.7 attachment authority matrix | 4, 5, 6, 7, 9 | Route-order check passes (no bare `:param` under `/reimbursements` or `/me/reimbursements`); a manager is refused both tax owner types on #152; the payslip explains that the reimbursement is in net but not in gross |
| 11 | Documentation & registries (§9), **including the twice-missed markup deletion** | 10 | All five deliverables updated; D-30…D-37 present in the parent; registry complete through #53; the parent's Phase-5 table list reads seven |

**Critical-path note.** Steps 3 → 9 are the chain that can corrupt money, and step 9 is the only one that touches code Phases 2, 3 and 4 already proved correct. Do not begin step 9 until step 3's suites are green and step 8's query count is measured. The specific failure to guard against is **D-31's**: a reimbursement emitted with the wrong `component_type` silently inflates the PF, ESI, PT and TDS bases while every reconciliation assert continues to pass. Verify the six-column before/after of §10.2 on a deliberately seeded claim before wiring the run commit — a balance check will not catch it.

---

## 13. Deployment & Production Readiness

Everything below is environment work, not code, and **step 0 of §12 depends on it**.

### 13.1 New environment variables

| Variable | Required | Notes |
|---|---|---|
| `PAYROLL_S3_BUCKET` | yes | Dedicated bucket. **Do not share with any public-asset bucket** |
| `PAYROLL_S3_REGION` | yes | Falls back to the existing `AWS_REGION` if unset |
| `PAYROLL_S3_KMS_KEY_ID` | optional | Set to use SSE-KMS instead of SSE-S3 |
| `PAYROLL_ATTACHMENT_UPLOAD_TTL_SECONDS` | no (default `600`) | |
| `PAYROLL_ATTACHMENT_VIEW_TTL_SECONDS` | no (default `300`) | |

Credentials come from the **existing** provider chain already used by `@aws-sdk/client-ses` — instance role in deployed environments, profile or static keys locally. **Do not add a second credential mechanism.**

**Fail closed at boot**, matching the Phase-1 `PAYROLL_ENCRYPTION_KEY` precedent: if the payroll module is mounted and `PAYROLL_S3_BUCKET` is unset, log a startup error and make every attachment endpoint return `503 ATTACHMENT_STORAGE_UNAVAILABLE`. **Do not silently degrade to `reference`-only** — an org would discover the gap when a receipt could not be attached to a claim already under review.

### 13.2 Bucket configuration

* **Block Public Access: ON**, all four settings. No object ACLs. Every read is pre-signed.
* **Default encryption:** SSE-S3, or SSE-KMS when `PAYROLL_S3_KMS_KEY_ID` is set.
* **Versioning: ON** — a soft-deleted attachment row must not be silently unrecoverable.
* **Bucket policy** denying `aws:SecureTransport = false`.
* **Default response headers** including `X-Content-Type-Options: nosniff` (§5.4).
* **CORS:** allow `PUT` and `GET` from the application origin(s), `Content-Type` in `AllowedHeaders`, `ETag` in `ExposeHeaders`. Missing CORS is the single most likely first-day failure and it surfaces as an opaque browser error that reads like a signature problem.
* **Lifecycle:** abort incomplete multipart uploads after 1 day. **No object expiry** — retention is a legal question this plan does not answer; §11 item 6's sweep deletes only `pending` orphans.

### 13.3 IAM policy

Minimum grant, scoped to the bucket prefix — nothing broader:

```
s3:PutObject, s3:GetObject, s3:HeadObject, s3:DeleteObject   on  arn:aws:s3:::<bucket>/org/*
kms:Encrypt, kms:Decrypt, kms:GenerateDataKey                on  <key>   (SSE-KMS only)
```

**No `s3:ListBucket`** — the application never enumerates, and withholding it means a leaked credential cannot inventory other tenants' receipts.

### 13.4 Rollout order and rollback

1. Provision bucket + IAM + env vars in the target environment (inert — nothing reads them yet).
2. Run migration `00044`. **Before the code deploy**, because the model declares `source: 'benefit'` (§4.9).
3. Deploy the application.
4. Leave `benefit_deductions_enabled = false` (the default) until HR has created plans and reviewed `#37 eligibility`'s enrolled headcount and monthly total. **The first run after switching it on charges every enrolled employee.**

**Rollback.** Reverting the code is safe at any point — the new endpoints simply disappear and the engine falls back to Phase-4 behaviour, because both new `computePayrollItem` inputs are optional. Reverting the **migration** is safe only if no run has been calculated at `engine_version: 5`; after that, `down()` drops the three item columns and with them the reimbursement and benefit figures of those runs. Treat the first engine-5 run as the point of no return, and note that `down()` cannot remove the `'benefit'` enum label in any case (§4.9).

### 13.5 Observability

Log (never the `storage_key`, never a signed URL — §10.6):

* `attachment.upload_url_issued` / `.confirmed` / `.verification_failed` — with `attachment_id`, `owner_type`, actor.
* `attachment.view_url_issued` — the §6.7 audit row; this is the "who looked at whose receipt" trail.
* `reimbursement.claim_submitted` / `.level_approved` / `.rejected` / `.payout_period_resolved` — with the resolved month, so an unexpected deferral is diagnosable.
* Counters worth a dashboard before the first month-end: claims awaiting approval by age, claims approved with no open payout period (`NO_OPEN_PAYOUT_PERIOD` rate), `ATTACHMENT_STORAGE_UNAVAILABLE` rate, and `pending`-attachment count (a rising count means the browser upload is failing, most likely CORS).

---

## 14. Error Code Reference

Every code Phase 5 introduces, with its status and origin. Existing codes reused unchanged (`RUN_STALE`, `RUN_CALCULATION_IN_PROGRESS`, `PERIOD_CLOSED_FOR_ADJUSTMENT`, `FORBIDDEN`, `NEGATIVE_MONEY`, `INVALID_COMPONENT_AMOUNT`, `CTC_RECONCILIATION_FAILED`, `RESERVED_COMPONENT_CODE`) are **not** re-listed — do not invent variants of them.

| Code | HTTP | Raised by |
|---|:--:|---|
| `CATEGORY_CODE_EXISTS` | 409 | #128 — partial unique index |
| `CATEGORY_IN_USE` | 409 | #132 — non-terminal claim items reference it |
| `CLAIM_NOT_DRAFT` | 409 | #158, #159, #161 — edit/submit/attach outside `draft` |
| `CLAIM_HAS_NO_ITEMS` | 422 | #159 |
| `RECEIPT_REQUIRED` | 422 | #159 — names the offending item |
| `CATEGORY_LIMIT_EXCEEDED` | 422 | #159 and §7.3 step 9 — carries the full violation list **with `period_key`, `limit`, `prior`, `attempted` and `remaining`** so the approver can retry with a figure that fits (§5.1) |
| `CLAIM_NOT_ACTIONABLE` | 409 | #135/#150, #136/#151 — wrong status, or a retry after the level already moved |
| `NOT_YOUR_APPROVAL_LEVEL` | 403 | §7.3 step 6 — **the unskippable-level guard** |
| `SELF_APPROVAL_FORBIDDEN` | 403 | §7.3 step 7 — message names the remedy (§5.2) |
| `APPROVED_EXCEEDS_CLAIMED` | 422 | §7.3 step 8 |
| `CLAIM_NOT_CANCELLABLE` | 409 | #160 — the claim is already `approved`, `processed`, `rejected` or `cancelled`. **Not** raised merely because a level approved (§7.4a) |
| `NO_OPEN_PAYOUT_PERIOD` | 422 | §6.4 — names every month tried |
| `REIMBURSEMENT_ALREADY_APPLIED` | 409 | §7.6 commit — names the claim number, forces a recalculation |
| `ALREADY_ENROLLED` | 409 | #143 — the narrow live-duplicate case, raised by the partial unique index when a concurrent request wins the race |
| `ENROLLMENT_PERIOD_OVERLAP` | 409 | #143 — the general case (§7.5): the new range shares a **month** with an existing non-`cancelled` enrollment in the same plan. Names the conflicting enrollment's dates. Also the code surfaced when the §4.6 EXCLUDE constraint fires |
| `PLAN_HAS_ACTIVE_ENROLLMENTS` | 409 | #142 |
| `ATTACHMENT_VERIFICATION_FAILED` | 422 | #163 — `HeadObject` size/type mismatch; row stays `pending` |
| `ATTACHMENT_NOT_FOUND` | 404 | §6.7 rule 2 — any non-`available` row, every audience |
| `ATTACHMENT_STORAGE_UNAVAILABLE` | 503 | §5.4 / §13.1 — S3 unreachable or bucket unconfigured. **No payroll state changes** |
| `PT_SLAB_RANGE_INVALID`-style set errors | — | *(none in Phase 5)* |

**Two conventions inherited and not restated per-endpoint:** out-of-scope and non-existent always return an identical `403 FORBIDDEN` (**EC-24**), and every list endpoint validates query params in the controller (§2 item 15).
