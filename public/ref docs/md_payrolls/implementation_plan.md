# Payroll & Compensation Module — Implementation Plan

> **STATUS:** **Phases 1 & 2 implemented** (Foundation & Run Engine). **Phase 3** (Variable Pay) **in progress**. Phases 4–7 not started.
> **SCOPE:** Employee Panel (Module 5 — *Payroll & Salary*) + Manager Panel (Module 4 — *Payroll & Compensation*).
> **SOURCES:** `public/HRMS/Employee/Employee_md/Payroll & Salary Module.md`, `public/HRMS/Manager/mds/Payroll & Compensation.md`, `analysis/HRMS_FULL_PROJECT_UNDERSTANDING.md`, and the live Attendance/Leave code.

---

## 0. How to use this document

This file is the **single source of truth** for the Payroll & Compensation module for its entire development lifecycle.

* **Do not** write per-phase detail here. When we start a phase, create `public/md_payrolls/phases/phase{N}_implementation_plan.md` (mirroring `public/md_leave/md_phases/`).
  * Phase 1 → [phases/phase1_implementation_plan.md](public/md_payrolls/phases/phase1_implementation_plan.md) *(written 2026-08-31; **implemented — see status above**)*
* **Amend this file** whenever a decision changes — it must never go stale relative to the code.
* **After every phase**, three registries must be updated (existing project rules):
  1. `public/md_system/api_registry.md` — one row per new endpoint. ✅ *Phase 1: `## Payroll Module` HR/Manager/Self sections, 36 rows.*
  2. `public/md_settings/org_settings_registry.md` — every new org-configurable knob, following its AI-INSTRUCTION field structure. Payroll entries continue from **#35**. ✅ *Phase 1: entries #35–#40 (`payroll_settings` singleton).*
  3. `public/md_payrolls/combined_api_analysis.md` — request/response contracts (create on Phase 1). ✅ *Created; contracts for all 36 endpoints incl. the `percent_of_gross` definitional note.*

---

## 1. Scope & Requirements Traceability

### 1.1 Employee Panel — *Payroll & Salary Module*

| # | Requirement | Delivered in |
|---|---|---|
| 1 | Payslip access & download (monthly PDF, annual statement, history) | P2 (JSON) → **P6** (PDF/annual) |
| 2 | Salary structure transparency (basic, HRA, allowances, fixed vs variable) | **P1** |
| 3 | Tax info: monthly/annual TDS, investment declaration, projection, Form 16 | **P4** |
| 4 | Deductions (PF/ESI/PT) + reimbursement status & submission | P4 (deductions), **P5** (reimbursements) |
| 5 | Loan & advance: EMI schedule, pending balance, deduction status | **P3** |
| 6 | Bonus & incentive details (earned + upcoming) | **P3** |

### 1.2 Manager Panel — *Payroll & Compensation*

| # | Requirement | Delivered in |
|---|---|---|
| 1 | Generate monthly payroll (period select → summary → auto-calculate → preview → execute, with audit history) | **P2** |
| 2 | View/modify salary structures (templates by role/dept, CRUD, component breakdown, versioning + effective dates + authorship) | **P1** |
| 3 | Process bonuses, incentives, deductions (dashboard, manual + bulk, rules engine, preview impact) | **P3** |
| 4 | Manage reimbursements & benefits (submission portal, multi-level approval, benefit administration, tracking) | **P5** |
| 5 | Download salary reports & payslips (payslip generator, bulk export, payroll register / cost-center / deduction summary, custom reports, CSV/PDF) | **P6** |

### 1.3 Explicitly out of scope (flag if requested later)

* **Actual money movement.** We produce a **bank advice / NEFT export file** and mark a run `paid`. No banking or payment-gateway integration. (Razorpay in this codebase is *subscription billing*, an unrelated concern — do not couple to it.)
* **Form 16 Part A.** Legally issued by TRACES. We generate **Part B** + an annual salary/tax statement; Part A is an upload-and-attach flow.
* **Full Expense module (Employee Panel M9).** Payroll owns the reimbursement *claim + payout* lifecycle (see D-7); M9's extras (multi-currency FX, duplicate detection, category analytics) layer on later over the same tables.
* **Performance-driven bonus automation.** The Performance module does not exist. Bonus rules ship with a pluggable eligibility source (D-9); the performance hook is wired when that module lands.

---

## 2. Verified Current-State Facts This Plan Depends On

Everything below was read from the live codebase — do not re-derive it.

| Area | Fact | Consequence for Payroll |
|---|---|---|
| Module scaffold | No `src/modules/payroll` exists | Greenfield |
| Feature flag | **`payroll.access` is already seeded** (`seeders/004-seed-features.js`), enabled on `growth_monthly`/`growth_yearly` in `005-seed-plan-features.js` | Reuse it; add sub-keys via `008-seed-payroll-features.js` following the `007-seed-leave-feature.js` pattern |
| Migrations | 37 files, latest `00036-…`; one migration creates a whole module's tables | Next is `00037-create-payroll-module.js` |
| Model autoload | `MODEL_ROOTS` in `src/infrastructure/postgres-sql/models.index.js` | **Must add `modules/payroll/models`** or models silently vanish |
| Route mounting | `src/app.js:41-44` requires each `*.index.js` and invokes it with `app` | Add `require('./modules/payroll/payroll.index')(app)` |
| `req.user` | Frozen `{ id, role, orgId, … }` — org key is **`orgId`**, not `org_id` | Use `req.user.orgId` |
| Manager scoping | `src/common/utilities/hierarchy_access.utils.js` → `getAccessibleUserIds(orgId, requesterUser)`; `null` = global (hr/admin/super-admin), `[]` = none, `[ids]` = direct reports. Module files are one-line re-exports | Payroll re-exports the same util. **Never** trust `employee_profiles.reporting_person` |
| Attendance statuses **persisted** | `in_progress`, `present`, `half_day`, `absent`, `on_leave` (`status` is a free `STRING(30)`, no DB enum) | Handle unknown values defensively |
| Attendance statuses **virtual** | `weekly_off` / `holiday` are **never written** — those days have **no row at all** (auto-mark-absent skips them) | **Payroll cannot count rows to get paid days.** It must resolve the calendar itself |
| Working-day resolver | `leave_calculator.utils.calculateLeaveDays()` returns `{ total_days, breakdown[{date, is_working_day, reason}] }`, already handling holidays + weekly-offs + calendar exceptions + targeting | **Reuse this** as the authoritative working-day source |
| Existing aggregators | `report.service.getMonthlyReport` (ignores `on_leave` entirely), `clock.service.getSummary`, `user_attendance_read.getGraphData` (only one handling calendar gaps + `joining_date`; per-user, N async lookups/day) | None is payroll-grade. Payroll builds its own **batched** aggregator (D-2) |
| LOP signal | Lives **only** on `leave_requests.paid_days` / `unpaid_days` (scalars for the whole request) + `leave_types.is_paid`. `attendance_records.status='on_leave'` carries **no** paid/unpaid info | Must join `attendance_records.leave_id → leave_requests` and allocate unpaid days per-date (D-4) |
| Overtime | `attendance_overtime` — `overtime_minutes`, `status` (`pending`/`approved`/`rejected`). **No rate multiplier anywhere.** Calculation service deliberately never mutates `approved`/`rejected` rows "because payroll may have acted on it" | Payroll owns the OT rate. Only `approved` OT is payable. No date-range repo query exists — add one |
| Lock periods | `lock.service.checkLock(orgId, dateString, transaction)` throws `403 PERIOD_LOCKED` — error text literally says *"locked for payroll"*. Called by every attendance mutation | **This is the payroll lock.** Do not build a second one (D-3). `attendance_records.is_locked` is a **dead column** — never read/written |
| Comp-off | `attendance_comp_offs` credits the `'CO'` leave type balance on approval; 90-day expiry hard-coded. **No encashment path exists** | Comp-off encashment is net-new payroll work (P7) |
| Compensation data | **No salary/CTC/bank column exists anywhere.** Profiles are role-split: `employee_profiles`, `manager_profiles`, `hr_profiles` | Payroll owns all compensation tables; use the `_resolveRoleProfile` fallback pattern from `leave_application.service.js` |
| Cron | `src/cron-jobs/*.cron.js`, no exports, registered by `require` in `server.js` **only when `os.platform() === 'linux'`**; `timezone: 'Asia/Kolkata'`. node-cron does not replay missed runs — leave added `runStartupCatchUp()` + manual HR trigger endpoints | Copy this pattern exactly for period close |
| Audit | **No shared audit utility.** `attendance_audit_logs` has a good generic schema but **no service ever writes to it**. Leave has none | Payroll builds `payroll_audit_logs` on that schema **and actually wires the writes inside the service transaction** |
| Transactions | Unmanaged only: `const t = await db.sequelize.transaction()` … `commit()`/`rollback()`. Advisory-lock pattern exists: `SELECT pg_advisory_xact_lock(hashtext(:key))` before row locks | Reuse both idioms |
| Errors / envelope | `AppError(status, message, errorCode)`; `{ success, message, data }` on success, `{ success:false, message, errorCode }` on error; controllers are class instances, every handler `try/catch → next(error)` | Match exactly |
| `validate()` | Re-declared per routes file; **use the leave version** (`leave_admin.routes.js:13-21`) — attendance's copy omits `try/catch`, a latent Express 5 bug | Copy the leave version |
| Express 5 gotcha | `req.query` is getter-only — `validate(schema, 'query')` **throws**. Validate query inside the controller via `validateOrThrow` | Applies to every payroll list/report endpoint |
| Tests | **No runner.** `npm test` = `echo "Error: no test specified"`. Only Postman/OpenAPI artifacts in `tests/` | See D-10 |
| Dependencies | No PDF, no Excel, no multer, no S3 client. `@aws-sdk/client-ses` present; `joi`, `dayjs`, `node-cron`, `sequelize` present | See D-11 |

---

## 3. Architectural Decisions

> Each decision is binding. Changing one requires editing this section and noting the date.

**D-1 — Three route audiences, mounted by path.** *(Amended 2026-08-31 — see D-14.)*
`src/modules/payroll/payroll.index.js` mounts at `/api/v1/payroll`:
* `payroll_self.routes.js` → `/api/v1/payroll` (all routes under `/me`) — `[authenticate, requireFeature('payroll.access')]`, **no `authorize()`** (any authenticated org member acts on their own data).
* `payroll_manager.routes.js` → `/api/v1/payroll/manager` — `authorize(['manager','hr'])`, every handler scoped by `getAccessibleUserIds`.
* `payroll_hr.routes.js` → `/api/v1/payroll/hr` — `authorize(['hr'])`.

The more specific prefixes (`/hr`, `/manager`) must mount **before** the bare `/api/v1/payroll`.

**Resolving the RBAC conflict:** the project RBAC matrix says *Payroll management = HR/Admin only*, while the Manager Panel doc describes full payroll operation. Both are satisfied because the **"Manager Panel" is the shared back-office UI**, the role of the person logged in decides which route set answers, and — per **D-13** — a manager is a genuine actor over their **direct reports** (they *initiate/propose* compensation changes and hold full authority on what is naturally theirs), while org-level and statutory authority stays with **`hr`**. Org-wide payroll *runs*, *component catalog*, *structure templates*, and *statutory config* live on the `/hr` routes. This mirrors attendance's existing `manager/` vs `hr/` split — but with a stricter role list, per **D-14**.

**D-2 — Payroll owns its attendance/leave aggregator.**
New `payroll_attendance_aggregator.service.js`. It must be **batched** (one query per data source for the whole org-month, then assembled in memory) — `getGraphData` does N async lookups per missing day per user and will not survive a 500-employee run. It consumes existing *repositories*, never other modules' models directly (the accepted cross-module idiom).

**D-3 — Reuse `lock.service` as the payroll lock.** Approving a run calls `lockService.createLock(orgId, userId, { start_date, end_date, reason })`, which makes every downstream attendance/regularization/overtime/comp-off mutation for that period fail closed with `403 PERIOD_LOCKED`. Cancelling a run before payment releases the lock. **No second lock table.**

**D-4 — Per-day payroll ledger snapshot.**
`leave_requests.unpaid_days` is a **scalar for the whole request**, and a request can straddle two months — so a run cannot know which *dates* were unpaid. Payroll therefore materialises, per run item, a per-date classification and persists it as an immutable snapshot.
**Allocation rule (deterministic, documented, testable):** within a leave request, working days are consumed **chronologically — paid days first, then unpaid**. So a 5-working-day request with `paid_days=2, unpaid_days=3` marks days 1–2 paid and days 3–5 LOP. This survives recalculation and is auditable. *We are not modifying the Leave module's schema.*

**D-5 — Money precision.** At rest: `DECIMAL(14,2)`. In computation: **integer paise** (multiply by 100, integer math, divide once at the end). No floats, no new decimal library. Rounding policy is an org setting (D default: half-up to 2dp at component level; the *net pay* is the balancing figure so component sums always reconcile to the total).

**D-6 — Immutability & render-on-demand payslips.** A payslip is a **frozen JSONB snapshot** written when a run is approved (structure, every component, day ledger, statutory basis, rates). The PDF is *rendered deterministically from that snapshot on request* — so no blob storage, no S3 dependency, no retention/GC problem, and the PDF can never drift from the data. Bulk download streams a ZIP generated on the fly. Re-issuing bumps `payslips.version`; the prior version is retained.

**D-7 — Reimbursement claims live in the payroll module.** The Manager Payroll doc explicitly owns "Manage Reimbursements and Benefits" with manager→finance approval, and payroll must pay claims out. Building a second claim table later in an Expense module would fork the data. Tables are named neutrally (`reimbursement_*`, not `payroll_reimbursement_*`) so Employee Panel M9 becomes a richer UI over the same store.

**D-8 — Manager visibility of direct-report compensation is ON by default (configurable off).** A reporting manager cannot make compensation decisions for someone whose pay they cannot see, so a `manager` may view the salary structure, payslips, bonuses and loans of their **direct reports** (scoped by `getAccessibleUserIds`), plus team cost aggregates. Orgs that keep pay confidential even from line managers set `manager_can_view_team_compensation = true → false`, which collapses a manager to aggregates-only. Scope and the toggle are enforced **server-side in the service layer**, never the controller. A manager never sees anyone outside their reporting subtree, and never org-wide salary data.

**D-9 — Bonus rules use a pluggable eligibility source.** A rule declares `eligibility_source ∈ { manual, all_employees, department, csv_upload, performance_rating }`. Only the first four are implemented now; `performance_rating` validates but returns "source unavailable" until the Performance module exists. No hard dependency. Managers may create bonus rules/adjustments scoped to their direct reports (per D-13); such rules cannot target `all_employees` or another team.

**D-10 — Introduce `node:test` as the test runner.** `CLAUDE.md` mandates tests for behavioural changes, and payroll arithmetic is the one place in this system where a silent bug becomes a legal/financial liability. `node:test` + `node:assert` are **built into Node 22 — zero new dependencies**. Phase 1 adds `"test": "node --test tests/unit"` and the first unit tests. The pure calculators (proration, LOP, PF/ESI/PT/TDS, EMI) must be side-effect-free functions so they are testable without a database.

**D-11 — Exactly one new dependency: `pdfkit`.** Justification: payslips and Form 16 are hard requirements and no PDF capability exists. `pdfkit` is pure JS with no native/Chromium footprint — `puppeteer` would add a ~300 MB Chromium layer to an Alpine Docker image for a document we fully control. **CSV exports are hand-written** (no `csv`/`exceljs` dependency); `.xlsx` is deferred until someone actually asks. To be confirmed before Phase 6.

**D-12 — Never mutate a closed run.** Once a run is `approved`, its items/components/snapshots are read-only. Any later correction (back-dated leave approval, retro increment, late OT) is settled as an **arrear/adjustment line in the next run**, carrying `source_ref` back to the original period. A run may be `cancelled` (releasing the lock) only while it is `approved` and **not yet** `paid`.

**D-13 — Hierarchy-scoped maker–checker for compensation actions.** As the reporting person, a manager is a real actor over their **direct reports** (resolved via `user_reporting_mappings` → `getAccessibleUserIds`, never the denormalized `reporting_person`). Every compensation action falls into exactly one tier:

* **Tier A — Manager-authoritative (scoped to direct reports).** The manager acts directly, no HR sign-off: view compensation (D-8), first-level reimbursement approval, team-scoped reports, and *creating a proposal* for any Tier-B action.
* **Tier B — Manager proposes → HR/Admin approves (maker–checker).** Financially binding changes: salary revision / increment, one-off bonus / incentive, ad-hoc earning or deduction, and loan / advance grant. A manager **initiates** the action for a direct report; it is persisted in a `proposed`/`pending` state and takes effect **only** after an HR/Admin *checker* approves. HR/Admin may also initiate Tier-B directly; whether a self-approval by the same HR user is allowed (segregation of duties) is the org setting `payroll_require_separate_checker` (default OFF; when ON, the approver must differ from the proposer). This is the concrete resolution of the earlier "maker–checker" open decision.
* **Tier C — HR/Admin-exclusive (org-level / statutory authority).** Not delegable to managers: salary **component catalog** and **structure templates**, **payroll run** execute/approve/cancel/pay (and its period lock), **statutory & tax configuration**, **investment-proof verification**, and **org-wide** bulk export. A manager has no route into these.

**Terminology note:** wherever this document says **"HR/Admin"**, read it as the **tenant-plane `hr` role only** — see **D-14**.

**Mechanics (no new generic approval table).** Tier-B state lives on the per-entity tables already planned, extended with a uniform quartet — `status` (`proposed`|`approved`|`rejected`|`cancelled`), `proposed_by`, `approved_by`, `actioned_at` — plus `rejection_reason`. So a `manager`-proposed salary revision is an `employee_salary_structures` row in `proposed` state that HR activation flips to effective; a manager bonus is a `payroll_adjustments`/`bonus_rules` row in `pending`. Only `approved` Tier-B records are ever read by the calculation engine — a `proposed` or `rejected` record can never reach a payslip. Every proposal, approval and rejection writes to `payroll_audit_logs` with both actor ids. HR/Admin can grant a specific manager direct Tier-B authority for their reports via the org setting `manager_direct_compensation_authority` (default OFF) — turning their proposals into immediate effect without a separate checker.

**D-14 — Payroll is tenant-plane only; `admin` / `super-admin` are excluded.** *(Added 2026-08-31.)*
This codebase has two authority planes: **tenant** (`hr` · `manager` · `employee`, operating inside one org) and **platform** (`super-admin` · `admin` · `worker`, operating on the SaaS product itself). `hr` — not `admin` — is the highest authority **inside** an organization. Verified: the org creator is provisioned as `hr` ([organization.service.js:99-123](src/modules/organization/services/organization.service.js#L99-L123)); the invitation matrix runs `hr → employee | manager | hr` while `super-admin → admin | worker`; `admin`/`super-admin` are `is_assignable: false`; and `user_roles.org_id` is nullable with a dedicated `WHERE org_id IS NULL` unique index for system-scoped roles.

Therefore **no payroll route admits `admin` or `super-admin`.** Platform operators must not hold standing read/approve access to a tenant's salary data. Consequences, all binding:

* **Wherever this document says "HR/Admin", it means the tenant-plane `hr` role.** The `Tier C — HR/Admin-exclusive` set in D-13 is `hr`-exclusive.
* **The Tier-B checker pool is the org's `hr` users only.** `payroll_require_separate_checker` is thus a genuine *two-HR* feature; a sole-HR org must invite a second `hr` (permitted by the invitation matrix) or leave the setting off. Enabling it below two active HR users is rejected up front.
* **`getAccessibleUserIds` returning `null` is not sufficient** to grant global scope — that shared util treats all of `['hr','admin','super-admin']` as global approvers because Attendance and Leave depend on that shape. Payroll additionally checks `role === 'hr'`. **Do not narrow `GLOBAL_APPROVER_ROLES`**; it would silently change two other modules.
* **Accepted trade — no break-glass.** No impersonation mechanism exists today, so an org whose only HR user is deactivated has no platform-side recovery path for payroll data. If break-glass is needed later, build a consented, audited impersonation flow in the auth module that issues a tenant-plane `hr` token — never by widening a payroll role list.
* **Deliberate inconsistency.** Attendance uses `['hr','admin','super-admin']` and Leave uses `['hr','super-admin']`. Payroll's `['hr']` is stricter on purpose. Do not "harmonize" it back; retro-fitting the other modules is a separate reviewed change.

---

## 4. Data Model Overview

Introduced per phase. All tables: UUID PK, `org_id` NOT NULL with FK → `organizations` (CASCADE), `created_at`/`updated_at`, `underscored: true`, and `paranoid` where records are user-authored.

**Phase 1 — Compensation master**
`salary_components` · `salary_structure_templates` · `salary_structure_template_components` · `employee_salary_structures` (versioned, effective-dated) · `employee_salary_structure_components` · `employee_bank_accounts` · `payroll_settings` (org singleton) · `payroll_audit_logs`

**Phase 2 — Run engine**
`payroll_runs` · `payroll_run_items` · `payroll_run_item_components` (day ledger stored as JSONB on the item, per D-4)

**Phase 3 — Variable pay**
`payroll_adjustments` · `bonus_rules` · `employee_loans` · `loan_installments`

**Phase 4 — Statutory & tax**
`statutory_configs` · `professional_tax_slabs` · `tax_regimes` · `tax_slabs` · `investment_declarations` · `investment_declaration_items` · `employee_tax_summaries`

**Phase 5 — Reimbursements & benefits**
`reimbursement_categories` · `reimbursement_claims` · `reimbursement_claim_items` · `reimbursement_approvals` · `benefit_plans` · `employee_benefit_enrollments`

**Phase 6 — Delivery**
`payslips` (frozen snapshot + version) · `payroll_report_exports` (async export jobs + audit of who exported what)

### Key structural notes

* **`salary_components`** carries the behavioural flags the engine reads: `component_type` (`earning`|`deduction`|`employer_contribution`|`reimbursement`), `calculation_type` (`flat`|`percent_of_basic`|`percent_of_gross`|`percent_of_ctc`|`balancing`), `value`, `is_taxable`, `is_lop_applicable`, `is_prorated_on_joining`, `pf_applicable`, `esi_applicable`, `display_order`, `is_active`.
* **`employee_salary_structures`** is the versioning spine: `effective_from`, `effective_to` (NULL = current), `version`, `revision_reason`, plus the D-13 maker–checker quartet (`status`, `proposed_by`, `approved_by`, `actioned_at`). Only `approved` versions participate in overlap/gap enforcement and in calculation; a manager's `proposed` revision sits alongside without disturbing the current effective row until HR approves it. Approved ranges per employee must be **non-overlapping and gap-free** — enforced in a transaction (close the old row before opening the new). This satisfies the Manager doc's *"versioning/logs, effective dates, change authorship"* while giving managers a controlled way to drive increments.
* **`payroll_runs`** unique partial index on `(org_id, period_month, run_type) WHERE status != 'cancelled'` — prevents a duplicate regular run for a month.
* **`payroll_run_items`** unique `(run_id, user_id)`; holds `structure_snapshot` + `attendance_snapshot` JSONB so a payslip is reproducible even if the employee's structure later changes.

---

## 5. The Calculation Contract

This is the core of the module. It must be a **pure, deterministic function** of its inputs so it can be unit-tested and re-run without side effects.

```
computePayrollItem({ employee, structure, period, attendanceLedger, adjustments,
                     loans, reimbursements, statutoryConfig, taxContext }) → item
```

**Step 1 — Establish the period window.** `period_start`/`period_end` = calendar month in the org/location timezone, clipped to `[joining_date, exit_date]`.

**Step 2 — Build the day ledger** (per D-2/D-4). For each date in the window, classify exactly once:
* No attendance row + holiday or weekly-off (resolved via the *leave calculator's* working-day logic) → **paid, non-working**
* `present` / `in_progress` → paid 1.0 *(`in_progress` handling is an org setting — treat as present or flag)*
* `half_day` → paid 0.5, LOP 0.5 (unless the other half is a paid leave)
* `absent` → **LOP 1.0**
* `on_leave` → follow `leave_id` → `leave_requests`; if `leave_types.is_paid = false` → LOP; else apply the D-4 chronological paid-then-unpaid allocation
* Date before joining / after exit → excluded entirely (never phantom-absent)

Output: `{ payable_days, lop_days, standard_working_days, calendar_days, per_date[] }`.

**Step 3 — Resolve the structure(s).** Select every `employee_salary_structures` version overlapping the window. If a revision took effect mid-month, compute **each sub-period separately and sum** (EC-3).

**Step 4 — Earnings.** Evaluate components in `display_order`, respecting `calculation_type` dependencies (`percent_of_basic` before `percent_of_gross`; one `balancing` component absorbs rounding drift). → `gross_earnings_full`.

**Step 5 — LOP deduction.** `per_day_rate = gross_LOP_applicable / divisor`, where `divisor` is the org's `lop_basis` (`calendar_days` | `standard_working_days` | `fixed_30`). Deduct `per_day_rate × lop_days`, applied only to components with `is_lop_applicable = true`.

**Step 6 — Variable additions.** Approved overtime (`overtime_minutes ÷ 60 × hourly_rate × ot_multiplier`, payroll-owned rate), approved bonuses/incentives, arrears, approved reimbursements (non-taxable, **not** LOP-applicable, **not** part of PF/ESI wages).

**Step 7 — Statutory.** PF (on PF wage, ceiling + `restrict_to_ceiling`), ESI (only if gross ≤ threshold, honouring the contribution-period continuation rule), PT (state slab), TDS (annual projection ÷ remaining months, net of declarations). Employee shares deduct from net; employer shares are recorded as cost, not deducted.

**Step 8 — Other deductions.** Loan EMI, advances, manual deductions.

**Step 9 — Net pay.** `net = gross_earnings − total_deductions`. If negative → clamp to 0 and carry the shortfall forward (EC-14). Assert `Σ components == totals` before persisting.

**Step 10 — Persist.** Item + component lines + snapshots, inside the run's transaction.

---

## 6. RBAC Surface

"Manager" always means **scoped to direct reports** via `getAccessibleUserIds`. Tiers refer to **D-13** (A = manager-authoritative, B = manager proposes → HR approves, C = HR-exclusive). The **HR** column means the tenant-plane `hr` role; platform `admin`/`super-admin` appear nowhere in this table and hold **no** payroll capability (**D-14**).

| Capability | Tier | Employee | Manager (direct reports) | HR (tenant) |
|---|:--:|:--:|:--:|:--:|
| My payslips / structure / tax / loans / declarations / claims | — | ✅ | ✅ | ✅ |
| Submit reimbursement claim | — | ✅ | ✅ | ✅ |
| View direct-report salary / payslip / compensation | A | ❌ | ✅ *(default ON, org-toggleable — D-8)* | ✅ |
| View team payroll **cost aggregates** | A | ❌ | ✅ | ✅ |
| Approve team reimbursement (level 1) | A | ❌ | ✅ | ✅ |
| Team-scoped reports (register / deduction summary for reports) | A | ❌ | ✅ | ✅ |
| Propose salary revision / increment for a direct report | B | ❌ | ✅ *(HR approves)* | ✅ |
| Propose bonus / incentive for a direct report | B | ❌ | ✅ *(HR approves)* | ✅ |
| Propose ad-hoc earning / deduction for a direct report | B | ❌ | ✅ *(HR approves)* | ✅ |
| Recommend loan / advance for a direct report | B | ❌ | ✅ *(HR approves)* | ✅ |
| Approve Tier-B proposals | B | ❌ | ❌ *(unless `manager_direct_compensation_authority` ON)* | ✅ |
| Salary component catalog & structure **templates** CRUD | C | ❌ | ❌ | ✅ |
| Execute / approve / cancel / pay payroll run | C | ❌ | ❌ | ✅ |
| Statutory & tax configuration, investment-proof verification | C | ❌ | ❌ | ✅ |
| Org-wide reports & bulk export | C | ❌ | ❌ | ✅ |

**Every** manager-facing endpoint (read *or* propose) must call `getAccessibleUserIds` and reject out-of-scope ids **before** any existence lookup, so a 403 is returned identically for "not yours" and "doesn't exist" (no enumeration) — the pattern already established in `leave_approver.controller.js` and the manager-panel authorization audit. A Tier-B proposal must re-verify scope at **approval** time too, in case the reporting mapping changed after the proposal was filed.

---

## 7. Cross-Cutting Requirements

* **Concurrency.** Executing a run takes `pg_advisory_xact_lock(hashtext(org_id || ':' || period_month))` *before* any row locks, matching the existing lock-ordering convention. Two concurrent executions for one period must produce one run, not two.
* **Idempotency.** Re-calculating a `draft`/`calculated` run **replaces** its items transactionally. A client retry after a timeout must never double-pay or duplicate a loan installment.
* **Partial failure.** A 500-employee run must not be all-or-nothing. Items are processed in batches; a failing employee gets `status='error'` + `error_reason`, and the run still reaches `calculated`. **A run cannot be approved while any item is in `error`** — each must be fixed or explicitly `excluded` (with reason).
* **Immutability & audit.** Every state transition, structure revision, adjustment, approval, and export writes to `payroll_audit_logs` (actor, entity, old/new JSONB, reason, IP) **inside the same transaction** as the change. This is the module's compliance backbone and the fix for the unwired `attendance_audit_logs` precedent.
* **Multi-tenancy.** `org_id` in every predicate, every index, every FK. No exceptions.
* **PII/secrecy.** Salary figures must never leak through list endpoints, error messages, or logs. Bank account numbers are masked on read (last 4 only) and never returned in list responses.
* **Performance target.** A 1,000-employee monthly run should complete in a bounded, batched pass — measured in Phase 7, with the aggregator doing O(number of source tables) queries, not O(employees × days).

---

## 8. Phases

> **Rule (inherited from the Leave module): no phase begins until the previous one is tested and verified.**

---

### Phase 1 — Foundation: Compensation Master & Salary Structures

**Goal.** Stand the module up and let HR define *what* people are paid, before anything calculates.

**Scope.**
* Migration `00037-create-payroll-module.js` (Phase-1 tables); register `modules/payroll/models` in `MODEL_ROOTS`; create `payroll.index.js` and mount it in `app.js`.
* `salary_components` catalog + seeded defaults (Basic, HRA, Conveyance, Special Allowance, PF, PT).
* Salary structure **templates** by role/department, with component composition.
* **Employee salary structure assignment** with effective-dated versioning, revision reason and authorship; assigning a revision closes the previous version in one transaction. Include the D-13 maker–checker quartet from the start so the proposal path is not a retrofit.
* `payroll_settings` (org singleton, incl. the D-13 toggles `manager_can_view_team_compensation`, `payroll_require_separate_checker`, `manager_direct_compensation_authority`) + `employee_bank_accounts` (masked on read).
* `payroll_audit_logs` + repository, **wired** from the first write (records both proposer and approver on Tier-B transitions).
* Admin CRUD (component catalog, templates, direct structure assignment/approval); **Manager**: view a direct report's structure/history and **propose a revision** (Tier B, lands `proposed`); Employee read: *my salary structure* (current + history).
* **Test harness:** `npm test` → `node --test`, plus unit tests for component evaluation, structure-version resolution, and the scope resolver deciding manager-vs-HR authority.

**Integration.** Org/profile lookups (`_resolveRoleProfile` fallback across the three role-split profile tables) + `getAccessibleUserIds` for the manager propose/view paths.

**Exit criteria.** HR can define a template, assign it, revise it mid-year, and see a correct version history; a **manager can propose an increment for a direct report** but it does not take effect until HR approves, and cannot be filed for a non-report (403); an employee can see their own structure and **cannot** see anyone else's; both proposer and approver appear in `payroll_audit_logs`; component-evaluation unit tests pass.

---

### Phase 2 — Payroll Engine Core: Attendance/Leave Aggregation & the Run

**Goal.** The Manager doc's headline flow — *select period → review summary → auto-calculate → preview → execute* — working end to end on attendance and leave data.

**Scope.**
* `payroll_attendance_aggregator.service.js` — batched org-month day ledger (§5 Step 2), reusing the leave calculator's working-day resolver and the attendance repositories. New repo method for **approved OT in a date range** (does not exist today).
* `payroll_calculation.service.js` — the pure engine (§5 Steps 3–9), LOP-only at this stage.
* Run lifecycle: `draft → calculating → calculated → approved → paid`, plus `cancelled`/`failed`; advisory lock; per-item error isolation; recalculation idempotency.
* **Preview** endpoint returning the full summary (headcount, gross, deductions, net) without committing.
* **Approval** calls `lockService.createLock` for the period; **cancel** (pre-payment only) releases it.
* Employee read: **my payslip as JSON** for approved runs — so the Employee panel is usable before PDF exists.

**Integration.** `attendance_records` + `attendance_overtime` + `leave_requests`/`leave_types` (paid/unpaid split) + `lock.service`. Reads only — payroll never writes to attendance or leave tables.

**Exit criteria.** A run over a month containing a holiday, a weekly-off, a full-day absence, a paid leave, a half-day, a partly-unpaid leave straddling the month boundary, a mid-month joiner and a mid-month leaver produces **hand-verifiable** figures; two concurrent executions yield one run; approving locks the period and a subsequent attendance edit fails with `403 PERIOD_LOCKED`; an employee with no salary structure surfaces as `error`, not as ₹0.

---

### Phase 3 — Variable Pay: Bonuses, Incentives, Adjustments, Loans & Advances

**Goal.** Manager-panel section 3 + Employee-panel sections 5 and 6.

**Scope.**
* `payroll_adjustments` — one-off earnings/deductions, single or **bulk (CSV)**, on the D-13 maker–checker path: HR/Admin act directly; a **manager proposes for direct reports** and it stays `pending` until an HR/Admin checker approves.
* `bonus_rules` engine — flat / % of gross / % of basic, with the pluggable eligibility source (D-9) and a **preview-impact** endpoint that simulates the effect on net pay **without** persisting. Manager-created rules are scope-locked to their reports and enter `pending`.
* `employee_loans` + `loan_installments` — principal, tenure, interest, generated EMI schedule, outstanding balance, foreclosure, and automatic pull into the run. Manager can **recommend** a loan/advance for a direct report (Tier B); only an HR/Admin-approved loan generates an installment schedule.
* Manager read (scoped): direct reports' bonus/adjustment/loan status and history.
* Employee read: bonus/incentive history + upcoming, loan EMI schedule and pending balance.

**Integration.** Engine step 6/8 reads **only `approved`** Tier-B records; adjustments and EMIs become run item components with `source` + `source_ref_id` traceability. `getAccessibleUserIds` scopes every manager propose/read path; approval re-checks scope and (if `payroll_require_separate_checker` ON) proposer ≠ approver.

**Exit criteria.** A bulk bonus upload previews correctly and applies to exactly the intended employees; a **manager proposal for a direct report needs HR approval to reach a payslip**, and a proposal targeting a non-report is rejected (403); an EMI deducts once and only once per month and is skipped-and-rescheduled (never partially double-charged) when net pay is insufficient; a rejected or still-`pending` adjustment never reaches a payslip.

---

### Phase 4 — Statutory & Tax: PF, ESI, PT, TDS, Declarations, Form 16

**Goal.** Employee-panel sections 3 and 4 (the compliance half of the module).

**Scope.**
* `statutory_configs` (PF rates, wage ceiling, `restrict_to_ceiling`, EPS split, admin charges; ESI rates + gross threshold; enable flags) and state-wise `professional_tax_slabs`.
* `tax_regimes` + `tax_slabs` (old/new), standard deduction, Chapter VI-A limits, 4% cess.
* **Investment declarations**: employee submits, HR verifies proofs, declaration window enforced; declared-vs-proof reconciliation at year end.
* **TDS projection engine**: projected annual income → tax → `(annual tax − TDS already deducted) ÷ remaining months`.
* **Form 16 Part B** + annual salary/tax statement; Part A upload-and-attach.
* Employee read: monthly + annual TDS, projection, declaration status, Form 16 download.

**Integration.** Engine step 7; PF/ESI wage bases come from the `pf_applicable`/`esi_applicable` component flags defined in Phase 1.

**Exit criteria.** PF respects the ceiling both ways; ESI correctly stops/continues at the threshold per the contribution-period rule; a regime switch recomputes projection without corrupting already-deducted TDS; Form 16 Part B reconciles exactly with the sum of that year's payslips.

---

### Phase 5 — Reimbursements & Benefits

**Goal.** Manager-panel section 4; Employee-panel section 4 (reimbursement half).

**Scope.**
* `reimbursement_categories` (per-category limits, taxable flag, receipt requirement), `reimbursement_claims` + line items with attachments, `reimbursement_approvals` (**multi-level: manager → finance/HR**, reusing `approval_chain.utils` and `getAccessibleUserIds`).
* Status pipeline `submitted → under_review → approved/rejected → processed`, with timestamps and comment trail.
* Approved claims flow into the next run as non-taxable, non-LOP payout components; paying a run marks claims `processed`.
* `benefit_plans` + `employee_benefit_enrollments` (health insurance, travel, meal) linked to runs as employee deduction and/or employer contribution.
* File attachments: decide storage (local vs S3) at phase start — see §11.

**Integration.** Engine step 6; approval chain shared with Leave.

**Exit criteria.** A claim cannot skip an approval level; an approved claim is paid exactly once and never re-paid by a re-run; a rejected claim never reaches a payslip; category limits are enforced server-side.

---

### Phase 6 — Payslips, Reports & Exports

**Goal.** Manager-panel section 5; Employee-panel sections 1 and 2 (delivery layer).

**Scope.**
* `payslips` — frozen JSONB snapshot written at run approval; **PDF rendered on demand** from the snapshot (D-6), versioned.
* Employee: monthly payslip PDF, payslip history, **annual salary statement** with cumulative breakdown.
* Admin: bulk payslip download (streamed ZIP), **email dispatch** via the existing `@aws-sdk/client-ses` utility (`email.utils.js`).
* Reports: **payroll register**, **cost-center/department distribution**, **deduction summary**, plus filterable custom reports (date range, department, employee, component). HR/Admin get org-wide; a **manager gets the same reports auto-scoped to their direct reports** (Tier A) — org-wide data and bulk export stay HR/Admin (Tier C).
* Exports: **CSV** (hand-written) and PDF. `payroll_report_exports` records who exported what and when.
* **Bank advice / NEFT file** generation for a `paid` run.

**Integration.** Reads Phase 2–5 outputs only. Department/location come from `organization_departments` / `organization_locations`. Manager report endpoints filter through `getAccessibleUserIds`.

**Exit criteria.** A regenerated payslip PDF is byte-comparable in content to the original for an unchanged snapshot; bulk download of 500 payslips streams without exhausting memory; an employee can only fetch their own payslip and a **manager only their direct reports'** (both verified by ID substitution); a manager report never includes a non-report's figures; every export is audit-logged.

---

### Phase 7 — Automation, Corrections & Hardening

**Goal.** Make it survive real month-ends.

**Scope.**
* **Crons** (`linux`-guarded, `Asia/Kolkata`, no exports, with manual HR trigger endpoints and `runStartupCatchUp` — mirroring `leave_monthly_accrual.cron.js`): payroll cut-off reminder, auto-draft creation, loan EMI schedule maintenance, declaration-window open/close.
* **Arrears & retro pay** (D-12): back-dated leave approval, retro increment, late-approved OT — all settled as next-run arrear lines carrying `source_ref` to the original period.
* **Off-cycle runs** and **Full & Final settlement** for exits (final salary + leave encashment + loan recovery + notice-period adjustment).
* **Comp-off encashment** (net-new; no path exists today).
* Full **edge-case regression** (§9), concurrency/load test of a 1,000-employee run, and a **security pass** focused on salary-data exposure and IDOR.
* Documentation close-out: `api_registry.md`, `org_settings_registry.md`, `combined_api_analysis.md`, phase completion report.

**Exit criteria.** Every edge case in §9 has a test or a documented, deliberate decision; a 1,000-employee run completes within the agreed budget; the security pass finds no salary leak across tenant or hierarchy boundaries.

---

## 9. Edge Case Register

Each must be resolved by an explicit, tested decision — not left to chance.

| # | Edge case | Phase |
|---|---|:--:|
| EC-1 | Mid-month joiner — prorate; never count pre-joining dates as absent | 2 |
| EC-2 | Mid-month exit/termination — prorate, recover loans, trigger F&F | 2 / 7 |
| EC-3 | Salary revision effective mid-month — split the month, compute per sub-period, sum | 2 |
| EC-4 | `lop_basis` choice (calendar / working / fixed-30) changes the per-day rate materially | 2 |
| EC-5 | Unpaid leave straddling two months — scalar `unpaid_days` must be allocated per-date (D-4) | 2 |
| EC-6 | Leave approved **after** the run closed → arrear/negative adjustment next cycle | 7 |
| EC-7 | Regularization or OT approval attempted on a locked period → must fail `403 PERIOD_LOCKED` | 2 |
| EC-8 | Holiday/weekly-off days have **no attendance row** — must not be counted absent | 2 |
| EC-9 | `in_progress` at month end (never clocked out) — org-configurable treatment | 2 |
| EC-10 | Duplicate run for the same period — unique partial index + idempotent recalculation | 2 |
| EC-11 | Concurrent execution of the same run — advisory lock | 2 |
| EC-12 | Partial failure across 500 employees — per-item error, resumable, blocks approval | 2 |
| EC-13 | Employee with no salary structure → `error` item, never a silent ₹0 | 2 |
| EC-14 | Negative net pay (deductions > earnings) → clamp to 0, carry shortfall forward | 3 |
| EC-15 | Loan EMI with insufficient net pay → skip and reschedule, never partial-double-charge | 3 |
| EC-16 | Loan foreclosure / early closure mid-schedule | 3 |
| EC-17 | Rounding drift — component sums must reconcile to gross/net exactly (balancing component) | 2 |
| EC-18 | PF wage ceiling and `restrict_to_ceiling` on/off | 4 |
| EC-19 | ESI threshold crossing mid-contribution-period — must continue to period end | 4 |
| EC-20 | Tax regime switch mid-year — recompute projection without corrupting deducted TDS | 4 |
| EC-21 | Investment declared but proof never submitted → recompute TDS at the proof deadline | 4 |
| EC-22 | Employee deactivated mid-month while a run is in progress | 2 / 7 |
| EC-23 | Reimbursement approved after the run closed → next-cycle payout, never double-paid | 5 |
| EC-24 | IDOR: employee fetching another's payslip; manager fetching/proposing for a non-report | 1 / 2 / 6 |
| EC-25 | Manager compensation visibility toggled off — aggregates only, no per-head salary | 2 |
| EC-26 | Missing bank details → run may calculate, but cannot be marked `paid` | 6 |
| EC-27 | Comp-off encashment vs expiry — must not both credit cash and lapse the balance | 7 |
| EC-28 | Period boundary in a multi-timezone org — period is the calendar month in the org/location timezone | 2 |
| EC-29 | Tier-B proposal whose subject stops reporting to the proposer before approval → scope re-checked at approval, stale proposal blocked | 1 / 3 |
| EC-30 | `payroll_require_separate_checker` ON but proposer is the only HR/Admin → approval blocked with a clear reason, not silently self-approved | 1 |
| EC-31 | Manager proposes a Tier-B change that would land in an already-locked/closed period → routed to arrears (D-12), never mutates the closed run | 3 / 7 |

---

## 10. Org Settings To Register

These are the payroll knobs that must be added to `public/md_settings/org_settings_registry.md` as a new `## Payroll Module` section, numbered from **#35**, using that file's exact field structure. Register each one **in the phase that introduces it**, not retroactively.

| Setting | Phase |
|---|:--:|
| Payroll cycle & cut-off day (period definition, run day) | 1 |
| `manager_can_view_team_compensation` (**default ON**, D-8) | 1 |
| `payroll_require_separate_checker` — Tier-B approver ≠ proposer (**default OFF**, D-13) | 1 |
| `manager_direct_compensation_authority` — managers' Tier-B proposals take effect without a separate checker (**default OFF**, D-13) | 1 |
| LOP calculation basis (`calendar_days` \| `standard_working_days` \| `fixed_30`) | 2 |
| Rounding policy (component-level rounding + balancing component) | 2 |
| `in_progress`-at-month-end treatment | 2 |
| Overtime rate multiplier + whether OT is payable at all | 2 |
| Negative-net-pay handling (clamp + carry forward vs block) | 3 |
| Loan policy: max amount, max tenure, interest rate, max concurrent loans | 3 |
| PF configuration (rates, wage ceiling, `restrict_to_ceiling`, EPS split, admin charges) | 4 |
| ESI configuration (rates, gross threshold, enabled) | 4 |
| Professional tax state slabs | 4 |
| Default tax regime + declaration window dates | 4 |
| Reimbursement approval levels + per-category limits | 5 |
| Payslip auto-publish and auto-email on run approval | 6 |
| Leave encashment policy for F&F (which types, rate basis) | 7 |

---

## 11. Open Decisions — Needed Before the Relevant Phase

1. **Statutory jurisdiction.** This plan assumes **India** (PF/ESI/PT/TDS, Form 16), consistent with the product's INR pricing and the existing `uan_number`/`pan_number` fields. Confirm before Phase 4 — a second country would require abstracting the statutory layer.
2. **`pdfkit` dependency** (D-11). Confirm before Phase 6.
3. **Test runner** (D-10). `node:test` is proposed as zero-dependency. Confirm at Phase 1 — this is the phase that establishes it.
4. **Attachment storage** for reimbursement receipts and Form 16 Part A. No upload infrastructure exists (no multer, no S3 client). Decide local-disk vs S3 before Phase 5.
5. **~~Manager compensation visibility default~~ — DECIDED (2026-08-31).** Per user direction, the reporting manager is a first-class actor for their direct reports: view is **ON by default** (D-8) and managers hold Tier-A authority plus Tier-B proposal rights (D-13). Org can still restrict via the toggles.
6. **~~Payroll approval workflow depth~~ — DECIDED (2026-08-31).** Adopted the D-13 hierarchy-scoped maker–checker: managers propose Tier-B, HR/Admin approve. Separation-of-duties among HR (proposer ≠ approver) remains **configurable** via `payroll_require_separate_checker` (default OFF) rather than hard-coded.

---

## Appendix — Housekeeping Note

`public/md_settings/org_settings_registry.md` ends with stray `</content></invoke>` markup after line 343 (a tool artifact, not content). Worth deleting when that file is next edited for the Payroll section.
