# Phase 1 — Foundation: Compensation Master & Salary Structures
*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_payrolls/implementation_plan.md) — the module's single source of truth. Every decision below implements a decision recorded there (`D-1` … `D-13`). **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**
> **Status:** Not started. No `src/modules/payroll` directory exists.
> **Depends on:** Nothing in Payroll. Consumes Organization (profiles, departments) and the shared hierarchy resolver. Does **not** touch Attendance or Leave — that begins in Phase 2.

---

## 1. Goal & Boundary

**Goal.** Stand the payroll module up and let an organization define **what a person is paid**, with a versioned, effective-dated, fully audited compensation record — before anything calculates a rupee.

Phase 1 delivers the *configuration engine and the authority model*. It is the phase that establishes the four things every later phase depends on:

1. **The component catalog** — the behavioural flags (`is_lop_applicable`, `pf_applicable`, `is_taxable`, …) that the Phase 2 engine and Phase 4 statutory layer read. Get these wrong and every later phase inherits the error.
2. **The structure versioning spine** — non-overlapping, gap-free, effective-dated salary versions. Phase 2's mid-month-revision handling (EC-3) is only possible if this invariant holds.
3. **The D-13 maker–checker authority model** — built in from the first table, not retrofitted.
4. **The audit backbone and the test harness** — the two things this codebase currently lacks (`attendance_audit_logs` exists but is never written to; `npm test` is a stub).

### 1.1 Explicitly in scope

* 8 tables, 8 models, 8 repositories, 6 services, 3 route audiences, 3 pure utility modules.
* Salary component catalog (org-scoped, with an idempotent default-catalog bootstrap).
* Salary structure templates by department / designation / employment type, with component composition and a **non-persisting preview**.
* Per-employee salary structure assignment with versioning, effective dating, revision reason and authorship.
* The D-13 Tier-B proposal path: **manager proposes an increment for a direct report → HR approves**.
* `payroll_settings` org singleton (Phase-1 knobs only) and `employee_bank_accounts` (encrypted at rest, masked on read).
* `payroll_audit_logs`, **written inside the same transaction as every change** from the very first commit.
* `node:test` harness + the first unit suites.

### 1.2 Explicitly NOT in scope (do not build these here)

| Deferred | Phase |
|---|---|
| Any attendance/leave reading, day ledger, LOP | 2 |
| Payroll runs, payslips, net pay, any *calculated payout* | 2 |
| Bonuses, adjustments, loans (their own Tier-B entities) | 3 |
| **Real PF/ESI/PT/TDS arithmetic.** P1 only carries the *wage-base flags*; statutory components ship **inactive** (see §4.1) | 4 |
| Reimbursements, benefits, attachments | 5 |
| PDFs, CSV export, reports | 6 |
| Crons, arrears, F&F | 7 |

> **Honesty guard.** Because statutory computation does not exist until Phase 4, Phase 1 must never present a structure as a "take-home" or "net" figure. Every response field is named `annual_ctc`, `monthly_gross`, `monthly_amount` — never `net_pay` or `in_hand`. A reviewer seeing "net" in a Phase-1 payload should treat it as a defect.

---

## 2. Pre-Flight Checks (do these before writing code)

These are cheap, and each one has burned a previous module.

1. **Feature gating will 403 you immediately.** `payroll.access` is seeded (`004-seed-features.js:38`) but mapped **only to `growth_monthly` / `growth_yearly`** (`005-seed-plan-features.js:23-24`). A dev org on `free` or `starter_*` gets `403 FEATURE_NOT_AVAILABLE` on **every** payroll endpoint. Before testing, either put the dev org on a growth plan or insert the `plan_features` row. **Do not "fix" this by removing `requireFeature`.**
2. **`MODEL_ROOTS` registration is mandatory.** Add `path.join(__dirname, '../../modules/payroll/models')` to [models.index.js:10-19](src/infrastructure/postgres-sql/models.index.js#L10-L19). Without it the models load silently as nothing and every query fails with `Cannot read properties of undefined`.
3. **Model name collisions throw at boot.** `loadModelsFrom` throws `Duplicate model detected`. Confirm no existing model is named `PayrollSettings`, `SalaryComponent`, etc. (none are today).
4. **Use `req.user.orgId`** (camelCase). `req.user` is a frozen object — never mutate it.
   4a. **Payroll is tenant-plane only.** `hr` is the top org authority; `admin`/`super-admin` are platform roles and are excluded from every payroll route. Read **§6.0 before writing any routes file** — this is the one place Payroll deliberately diverges from Attendance and Leave.
5. **Express 5: `req.query` is getter-only.** `validate(schema, 'query')` **throws**. Every list/filter endpoint in §6 validates query params *inside the controller* via `validateOrThrow`.
6. **Copy the leave `validate` wrapper**, not the attendance one — [leave_admin.routes.js:14-21](src/modules/leave/routes/leave_admin.routes.js#L14-L21) has the `try/catch` that attendance's copy omits.
7. Next migration number is **`00037`** (latest is `00036-phase6-leave-eligibility-and-restrictions.js`).

---

## 3. Directory Structure

```text
src/modules/payroll/
├── payroll.index.js
├── controllers/
│   ├── payroll_hr.controller.js
│   ├── payroll_manager.controller.js
│   └── payroll_self.controller.js
├── models/
│   ├── salary_components.model.js
│   ├── salary_structure_templates.model.js
│   ├── salary_structure_template_components.model.js
│   ├── employee_salary_structures.model.js
│   ├── employee_salary_structure_components.model.js
│   ├── employee_bank_accounts.model.js
│   ├── payroll_settings.model.js
│   └── payroll_audit_logs.model.js
├── repositories/          (one per model, same names)
├── routes/
│   ├── payroll_hr.routes.js
│   ├── payroll_manager.routes.js
│   └── payroll_self.routes.js
├── services/
│   ├── salary_component.service.js
│   ├── salary_structure_template.service.js
│   ├── employee_salary_structure.service.js   ← the spine; owns the versioning transaction
│   ├── payroll_settings.service.js
│   ├── bank_account.service.js
│   └── payroll_audit.service.js
├── utils/
│   ├── payroll_access.utils.js        ← re-export of hierarchy_access + authority resolver
│   ├── money.utils.js                 ← PURE (integer paise)
│   ├── component_evaluator.utils.js   ← PURE (the CTC → components engine)
│   ├── structure_version.utils.js     ← PURE (overlap / gap / version decisions)
│   └── payroll_defaults.js            ← the default component catalog (data, not logic)
└── validators/
    ├── payroll_hr.validator.js
    ├── payroll_manager.validator.js
    └── payroll_self.validator.js
```

> **Naming: `hr`, not `admin` (§6.0).** The parent plan's **D-1** originally named these `payroll_admin.*` at `/api/v1/payroll/admin`. Because `admin` is a *platform-plane* role in this codebase, that name reads as "platform administrator" precisely where it must not. Renamed to `hr` in files, URL path, and middleware. **Cost is zero — no payroll code exists yet** — and it matches the existing `hr_attendance.routes.js` precedent. D-1 in the parent plan has been amended to match.

Use `utils/` (leave convention), **not** `utilities/` — attendance has both and it is a wart, not a pattern to copy.

**Wiring (2 one-line edits to existing files, both required):**
* [models.index.js](src/infrastructure/postgres-sql/models.index.js) → add `modules/payroll/models` to `MODEL_ROOTS`.
* [app.js:44](src/app.js#L44) → add `require('./modules/payroll/payroll.index')(app)` **after** the leave line and **before** `errorHandlerMiddleware`.

`payroll.index.js` (mirrors [leave.index.js](src/modules/leave/leave.index.js)):
```js
'use strict'
const payrollHrRoutes      = require('./routes/payroll_hr.routes')
const payrollManagerRoutes = require('./routes/payroll_manager.routes')
const payrollSelfRoutes    = require('./routes/payroll_self.routes')

module.exports = (app) => {
  // Order matters: the more specific prefixes must mount before the bare one.
  app.use('/api/v1/payroll/hr',      payrollHrRoutes)
  app.use('/api/v1/payroll/manager', payrollManagerRoutes)
  app.use('/api/v1/payroll',         payrollSelfRoutes)
}
```

> **Mount-order trap.** `payroll_self.routes.js` must mount **last**. If the bare `/api/v1/payroll` router mounts first and defines a `/:something` route, it will swallow `/hr/...`. Keep self routes under an explicit `/me` prefix (§6.3) so this can never bite.

---

## 4. Database Schema — Migration `00037-create-payroll-module.js`

Follow the [00030-create-leave-module.js](src/infrastructure/postgres-sql/migrations/00030-create-leave-module.js) shape exactly: a single `queryInterface.sequelize.transaction()`, tables created in FK dependency order, `down()` dropping in reverse **and dropping every `enum_*` type with `CASCADE`**.

**Universal conventions for all 8 tables:** UUID PK `defaultValue: Sequelize.UUIDV4` · `org_id` UUID NOT NULL FK → `organizations` (`CASCADE`/`CASCADE`) · `created_at`/`updated_at` NOT NULL · `underscored: true` · `paranoid` (`deleted_at`) on everything **except `payroll_audit_logs`** (append-only) · every unique index is **partial** (`where: { deleted_at: null }`) so soft-deleted rows do not hold the constraint hostage.

### 4.1 `salary_components` — the behavioural catalog

The most consequential table in the phase: these flags are the contract Phases 2 and 4 consume.

| Column | Type | Notes |
|---|---|---|
| `name` | STRING(150) NOT NULL | |
| `code` | STRING(50) NOT NULL | uppercase alnum + `_`; unique per org |
| `component_type` | ENUM(`earning`,`deduction`,`employer_contribution`,`reimbursement`) NOT NULL | |
| `calculation_type` | ENUM(`flat`,`percent_of_basic`,`percent_of_gross`,`percent_of_ctc`,`balancing`) NOT NULL | |
| `value` | DECIMAL(14,4) NOT NULL DEFAULT 0 | currency amount when `flat`; percentage (0–100) otherwise; ignored when `balancing` |
| `is_basic` | BOOLEAN NOT NULL DEFAULT false | the anchor `percent_of_basic` resolves against. **Max one per org** |
| `is_part_of_ctc` | BOOLEAN NOT NULL DEFAULT true | employer contributions are CTC but not gross — this is what keeps CTC math correct |
| `is_taxable` | BOOLEAN NOT NULL DEFAULT true | read by Phase 4 |
| `is_lop_applicable` | BOOLEAN NOT NULL DEFAULT true | read by Phase 2 §5 Step 5 |
| `is_prorated_on_joining` | BOOLEAN NOT NULL DEFAULT true | read by Phase 2 (EC-1) |
| `pf_applicable` | BOOLEAN NOT NULL DEFAULT false | PF wage base marker, read by Phase 4 |
| `esi_applicable` | BOOLEAN NOT NULL DEFAULT false | ESI wage base marker, read by Phase 4 |
| `is_statutory` | BOOLEAN NOT NULL DEFAULT false | **P1 marker.** A statutory component's `value` is a placeholder until Phase 4 replaces it with `statutory_configs`. Ships `is_active = false` |
| `is_system` | BOOLEAN NOT NULL DEFAULT false | seeded by the bootstrap; cannot be hard-deleted, `code`/`component_type`/`calculation_type` immutable |
| `display_order` | INTEGER NOT NULL DEFAULT 0 | evaluation order within a calculation tier |
| `description` | TEXT | |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes**
* `salary_components_org_code_unique_idx` — UNIQUE `(org_id, code)` WHERE `deleted_at IS NULL`
* `salary_components_org_basic_unique_idx` — UNIQUE `(org_id)` WHERE `is_basic = true AND is_active = true AND deleted_at IS NULL`
* `salary_components_org_balancing_unique_idx` — UNIQUE `(org_id)` WHERE `calculation_type = 'balancing' AND is_active = true AND deleted_at IS NULL`
* `salary_components_org_active_idx` — `(org_id, is_active)`

> The two partial unique indexes are load-bearing. §5.2's evaluator *assumes* at most one basic and at most one balancing component; enforcing it in the database means the evaluator can throw on violation rather than silently pick one.

**Default catalog** (`payroll_defaults.js`, applied by the idempotent bootstrap in §6.1). Values are conventional Indian defaults, all org-editable:

| code | name | type | calculation | value | flags |
|---|---|---|---|---|---|
| `BASIC` | Basic Salary | earning | `percent_of_ctc` | 50 | `is_basic`, `pf_applicable`, `esi_applicable`, taxable, LOP, prorated, system |
| `HRA` | House Rent Allowance | earning | `percent_of_basic` | 40 | `esi_applicable`, taxable, LOP, prorated, system |
| `CONVEYANCE` | Conveyance Allowance | earning | `flat` | 1600.00 /mo | `esi_applicable`, taxable, LOP, prorated, system |
| `SPECIAL_ALLOWANCE` | Special Allowance | earning | `balancing` | — | `esi_applicable`, taxable, LOP, prorated, system |
| `PF_EMPLOYEE` | Provident Fund (Employee) | deduction | `percent_of_basic` | 12 | `is_statutory`, **`is_active = false`**, system |
| `PF_EMPLOYER` | Provident Fund (Employer) | employer_contribution | `percent_of_basic` | 12 | `is_statutory`, **`is_active = false`**, `is_part_of_ctc`, system |
| `PROFESSIONAL_TAX` | Professional Tax | deduction | `flat` | 200.00 /mo | `is_statutory`, **`is_active = false`**, system |

The four statutory rows are seeded **inactive on purpose**: they reserve the codes and let HR see what is coming, while guaranteeing Phase 1 cannot produce a number that looks like a real statutory deduction. Phase 4 activates them and moves their values into `statutory_configs`.

### 4.2 `salary_structure_templates`

| Column | Type | Notes |
|---|---|---|
| `name` | STRING(150) NOT NULL | |
| `code` | STRING(50) NOT NULL | unique per org |
| `description` | TEXT | |
| `department_id` | UUID NULL FK `organization_departments` (SET NULL) | targeting; NULL = any |
| `designation` | STRING(150) NULL | free string — matches `employee_profiles.designation`, which has no lookup table |
| `employment_type` | ENUM(`full_time`,`part_time`,`contract`,`intern`) NULL | mirrors `employee_profiles.employment_type`; NULL = any |
| `definition_mode` | ENUM(`ctc_driven`,`component_driven`) NOT NULL DEFAULT `ctc_driven` | |
| `currency` | STRING(3) NOT NULL DEFAULT `'INR'` | |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_by` | UUID NULL FK users (SET NULL) | |

Targeting fields are **advisory only in Phase 1** — they drive the "suggested template" UI hint, not an automatic assignment. Auto-assignment on hire is deliberately not built; silently assigning a salary is not something to infer.

### 4.3 `salary_structure_template_components`

`template_id` FK (CASCADE) · `component_id` FK (**RESTRICT** — a component in use cannot be deleted out from under a template) · `value` DECIMAL(14,4) NULL (NULL = inherit catalog `value`) · `calculation_type` ENUM NULL (NULL = inherit) · `display_order` INTEGER NULL (NULL = inherit).
UNIQUE `(template_id, component_id)` WHERE `deleted_at IS NULL`.

### 4.4 `employee_salary_structures` — the versioning spine

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID NOT NULL FK users (CASCADE) | |
| `template_id` | UUID NULL FK templates (SET NULL) | provenance only; the structure is self-contained |
| `annual_ctc` | DECIMAL(14,2) NOT NULL | |
| `monthly_gross` | DECIMAL(14,2) NOT NULL | derived, stored for list reads |
| `currency` | STRING(3) NOT NULL DEFAULT `'INR'` | |
| `effective_from` | DATEONLY NOT NULL | |
| `effective_to` | DATEONLY NULL | NULL = current |
| `version` | INTEGER NULL | **assigned only at approval**, monotonic per user (see §5.3) |
| `revision_type` | ENUM(`initial`,`increment`,`correction`,`promotion`,`restructure`) NOT NULL DEFAULT `initial` | |
| `revision_reason` | TEXT NULL | required for every version after the first |
| `status` | ENUM(`proposed`,`approved`,`rejected`,`cancelled`) NOT NULL DEFAULT `proposed` | **D-13 quartet** |
| `proposed_by` | UUID NOT NULL FK users (RESTRICT) | |
| `approved_by` | UUID NULL FK users (SET NULL) | |
| `actioned_at` | DATE NULL | |
| `rejection_reason` | TEXT NULL | |

**Indexes**
* `emp_salary_struct_current_unique_idx` — UNIQUE `(user_id)` WHERE `status = 'approved' AND effective_to IS NULL AND deleted_at IS NULL`
  → **the single most important constraint in the phase**: an employee can have exactly one open-ended approved structure. Concurrency bugs become constraint violations instead of two live salaries.
* `emp_salary_struct_version_unique_idx` — UNIQUE `(user_id, version)` WHERE `version IS NOT NULL AND deleted_at IS NULL`
* `emp_salary_struct_org_user_eff_idx` — `(org_id, user_id, effective_from)`
* `emp_salary_struct_org_status_idx` — `(org_id, status)` (the HR proposal queue)

> **Why `version` is NULL until approval.** Two competing proposals (one from the manager, one from HR) would otherwise fight over the same version number and one insert would fail with a confusing constraint error. Deferring assignment to the approval transaction makes proposals cheap and collision-free.

### 4.5 `employee_salary_structure_components` — snapshot, not reference

`structure_id` FK (CASCADE) · `component_id` FK (**RESTRICT**, provenance) · `value` DECIMAL(14,4) · `monthly_amount` DECIMAL(14,2) NOT NULL · `annual_amount` DECIMAL(14,2) NOT NULL · `display_order` INTEGER NOT NULL DEFAULT 0.

**Plus a full copy of the catalog row's behaviour at the moment of approval:**
`component_code` STRING(50) · `component_name` STRING(150) · `component_type` ENUM · `calculation_type` ENUM · `is_taxable` · `is_lop_applicable` · `is_prorated_on_joining` · `pf_applicable` · `esi_applicable` · `is_part_of_ctc` (all BOOLEAN NOT NULL).

> **Decision — denormalize the flags (this phase's most important schema call).** If Phase 2 reads flags by joining live `salary_components`, then an HR user flipping `is_lop_applicable` in March silently changes how January's already-approved structure behaves — and re-running any historical calculation produces a different answer. Snapshotting makes an approved structure a **self-contained, reproducible contract**, which is the same principle as D-6's frozen payslip, applied one level earlier. The `component_id` FK is retained purely for provenance and reporting joins.

UNIQUE `(structure_id, component_id)` WHERE `deleted_at IS NULL`. Index `(structure_id, display_order)`.

### 4.6 `employee_bank_accounts`

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID NOT NULL FK users (CASCADE) | |
| `account_holder_name` | STRING(150) NOT NULL | |
| `account_number_encrypted` | TEXT NOT NULL | AES-256-GCM, `iv:authTag:ciphertext` (base64) |
| `account_number_last4` | STRING(4) NOT NULL | the only part ever returned |
| `encryption_key_version` | SMALLINT NOT NULL DEFAULT 1 | makes key rotation possible without a schema change |
| `ifsc_code` | STRING(20) NOT NULL | validated `^[A-Z]{4}0[A-Z0-9]{6}$` |
| `bank_name` | STRING(150) NOT NULL | |
| `branch_name` | STRING(150) NULL | |
| `account_type` | ENUM(`savings`,`current`) NOT NULL DEFAULT `savings` | |
| `is_primary` | BOOLEAN NOT NULL DEFAULT true | |
| `is_verified` | BOOLEAN NOT NULL DEFAULT false | |
| `verified_by` / `verified_at` | UUID FK users (SET NULL) / DATE | |

UNIQUE `(user_id)` WHERE `is_primary = true AND deleted_at IS NULL`. Index `(org_id, user_id)`.

**Encryption.** Use `node:crypto` AES-256-GCM (zero new dependencies) with a 32-byte key from `PAYROLL_ENCRYPTION_KEY` (hex). Random 12-byte IV per record; store the auth tag. **Fail closed at boot** if the module is mounted and the key is missing or malformed — do not silently fall back to plaintext.
*If the key cannot be provisioned in this environment, the fallback is plaintext storage + strict read masking, and that must be recorded as an accepted risk in §11 — not chosen silently.*

**Access rule (deliberate, stricter than D-8):** managers get **no access to bank details of anyone, including direct reports**. D-8 grants visibility of *compensation* (what someone is paid); a bank account is a *payment instrument* and a fraud-redirection target. Only the employee (self) and org `hr` may read it, always masked to `••••1234`. The full number is decrypted only inside Phase 6's bank-advice generation.

### 4.7 `payroll_settings` — org singleton

UNIQUE `(org_id)`. Phase-1 knobs only:

| Column | Type | Default | Registry # |
|---|---|---|---|
| `payroll_cycle` | ENUM(`monthly`) | `monthly` | 35 |
| `period_start_day` | INTEGER | `1` | 35 |
| `attendance_cutoff_day` | INTEGER | `25` | 35 |
| `pay_day` | INTEGER | `1` | 35 |
| `pay_day_in_next_month` | BOOLEAN | `true` | 35 |
| `currency` | STRING(3) | `'INR'` | 36 |
| `financial_year_start_month` | INTEGER | `4` | 37 |
| `manager_can_view_team_compensation` | BOOLEAN | **`true`** (D-8) | 38 |
| `payroll_require_separate_checker` | BOOLEAN | **`false`** (D-13) | 39 |
| `manager_direct_compensation_authority` | BOOLEAN | **`false`** (D-13) | 40 |

CHECK constraints: `period_start_day BETWEEN 1 AND 28`, `attendance_cutoff_day BETWEEN 1 AND 31`, `pay_day BETWEEN 1 AND 31`, `financial_year_start_month BETWEEN 1 AND 12`.

> `financial_year_start_month` is a small, deliberate extension beyond the parent plan's Phase-1 setting list. Justification: the structure history view and `revision_type = 'increment'` are FY-anchored, so the knob is needed here rather than invented twice. Register it as #37.

**Lazy provisioning.** Do not backfill a row for every existing org in the migration — that ages badly and needs re-running for every org created afterwards. Instead `payroll_settings.service.getOrCreate(orgId, transaction)` creates the row on first access. Race two concurrent first-accesses with `findOrCreate` inside a transaction; the UNIQUE `(org_id)` constraint is the backstop, and a caught unique-violation re-reads.

### 4.8 `payroll_audit_logs` — append-only

Schema mirrors [attendance_audit_logs.model.js](src/modules/attendance/models/attendance_audit_logs.model.js) exactly — `actor_id`, `target_user_id`, `entity_type` STRING(50), `entity_id` UUID, `action` STRING(50), `old_values` JSONB, `new_values` JSONB, `reason` TEXT, `ip_address` STRING(45), `request_id` STRING(100) — **plus two D-13 columns**: `proposed_by` UUID NULL, `approved_by` UUID NULL, so "who proposed and who approved" is a column filter rather than a JSONB dig.

* **Not paranoid.** No `deleted_at`. The repository exposes `create` and read methods **only** — no `update`, no `destroy`. That is the enforcement.
* **Redaction.** The repository strips a hard-coded deny-list (`account_number`, `account_number_encrypted`, `PAYROLL_ENCRYPTION_KEY`) from `old_values`/`new_values` before insert. An audit trail must never become the place the secret leaks.
* Indexes: `(org_id, entity_type, entity_id)`, `(org_id, target_user_id, created_at)`, `(org_id, created_at)`, `(org_id, actor_id)`.

### 4.9 Migration hygiene

* Create order: `salary_components` → `salary_structure_templates` → `salary_structure_template_components` → `employee_salary_structures` → `employee_salary_structure_components` → `employee_bank_accounts` → `payroll_settings` → `payroll_audit_logs`. `down()` reverses it.
* `down()` must drop every generated enum type with `CASCADE` (the 00030 migration's closing block is the template). Missing this makes the migration non-re-runnable — a real trap already hit in this repo.
* **Verify both directions before moving on:** `npx sequelize-cli db:migrate` then `db:migrate:undo` then `db:migrate` again.

---

## 5. Core Logic — the three pure modules

Per **D-10**, all real arithmetic and all authority decisions live in **side-effect-free functions with no database access**, so they are unit-testable without a database. Services orchestrate and persist; these modules decide.

### 5.1 `money.utils.js` (pure)

```js
toPaise(decimalLike)        // '12345.67' | 12345.67 → 1234567 (integer)
fromPaise(paise)            // 1234567 → '12345.67' (string, 2dp — never a float)
roundHalfUp(paise)          // integer-domain rounding
percentOfPaise(base, pct)   // integer math, single rounding at the end
sumPaise([...])             // exact
```

Rules: **all intermediate arithmetic is integer paise.** Never `parseFloat` a money value and multiply. Sequelize returns `DECIMAL` as a **string** — treat that as the safe form and convert straight to paise; a `Number()` round-trip is the bug this module exists to prevent. Negative values throw unless explicitly allowed.

### 5.2 `component_evaluator.utils.js` (pure) — the heart of Phase 1

```js
evaluateStructure({ annualCtc, components, monthsPerYear = 12 })
  → { monthlyGross, annualGross, annualCtcCheck, lines[] }
```

**Deterministic evaluation order** (within each tier, by `display_order`, then `code` as a stable tiebreak):

1. `flat` — the given amount.
2. `percent_of_ctc` — percentage of `annual_ctc`.
3. `percent_of_basic` — percentage of the resolved `is_basic` component. Throws `NO_BASIC_COMPONENT` if any `percent_of_basic` exists without one.
4. `percent_of_gross` — percentage of the **subtotal of all earnings resolved in tiers 1–3**, excluding balancing and excluding other `percent_of_gross` components.
   *This is a definitional choice made to break an otherwise circular dependency (gross includes the balancing component, which is derived from gross). It must be documented in the API response contract so nobody re-derives it differently later.*
5. `balancing` — `annual_ctc − Σ(annual_amount of every other component where is_part_of_ctc)`. Absorbs all rounding drift, which is exactly why §5's "component sums always reconcile" holds.

**Invariants asserted before returning** (each throws a typed `AppError(422, …)`):

| Guard | Error code |
|---|---|
| More than one `balancing` component | `MULTIPLE_BALANCING_COMPONENTS` |
| `percent_of_basic` present with no `is_basic` component | `NO_BASIC_COMPONENT` |
| Percentage outside `0 … 100` | `INVALID_PERCENTAGE` |
| Balancing resolves negative (fixed components exceed CTC) | `CTC_BELOW_FIXED_COMPONENTS` |
| No balancing component **and** `Σ(is_part_of_ctc) ≠ annual_ctc` | `CTC_RECONCILIATION_FAILED` |
| Zero active earning components | `NO_EARNING_COMPONENTS` |

The reconciliation assert is not decorative — it is the guarantee that Phase 2 can trust `annual_ctc` as the sum of its parts, and it must run on **every** evaluate, including previews.

### 5.3 `structure_version.utils.js` (pure)

```js
planRevision({ currentApproved, proposed, joiningDate, today })
  → { closeCurrentTo, newVersion, action } | throws
```

Encodes the versioning invariant so the service is a thin transactional wrapper:

* `effective_from` must be `>= joining_date` → `EFFECTIVE_BEFORE_JOINING`.
* `effective_from` must be `> currentApproved.effective_from` → `RETRO_REVISION_NOT_SUPPORTED` (400). Back-dating **before or onto** the live version is a Phase-7 arrears concern (D-12); Phase 1 rejects it explicitly rather than corrupting history.
* `closeCurrentTo = effective_from − 1 day` → guarantees **non-overlapping and gap-free** in one step.
* `newVersion = (currentApproved?.version ?? 0) + 1`.
* First-ever structure → `action: 'initial'`, version 1, no close.
* Every version after the first requires a non-empty `revision_reason` → `REVISION_REASON_REQUIRED`.

### 5.4 `payroll_access.utils.js` — the authority chokepoint

Re-exports `getAccessibleUserIds` from [hierarchy_access.utils.js](src/common/utilities/hierarchy_access.utils.js) (the one-line re-export pattern already used by [leave_access.utils.js](src/modules/leave/utils/leave_access.utils.js)) **and** adds the pure decision function:

```js
decideAuthority({ requesterId, requesterRole, targetUserId, accessibleUserIds, settings })
  → { scope, canViewCompensation, canViewBankAccount, canPropose, canApproveFor, tier }
```

`accessibleUserIds` is passed in (the caller does the DB read), keeping this function pure and directly unit-testable.

| Situation | Result |
|---|---|
| `targetUserId === requesterId` | `scope: 'self'`, view own compensation ✅, own bank ✅, propose ❌, approve ❌ |
| `accessibleUserIds === null` **and** `requesterRole === 'hr'` | `scope: 'global'`, view ✅, bank ✅, propose ✅, approve ✅ |
| `accessibleUserIds === null` but role is `admin` / `super-admin` | `scope: 'none'` → `403`. **Platform plane, see §6.0** |
| manager, `targetUserId ∈ accessibleUserIds` | `scope: 'report'`, view = `settings.manager_can_view_team_compensation`, bank ❌, propose ✅, approve = `settings.manager_direct_compensation_authority` |
| manager, target **not** in list | `scope: 'none'` → caller raises `403 FORBIDDEN` |
| Approver `=== proposer` **and** `payroll_require_separate_checker` | `canApproveFor: false`, reason `SEPARATE_CHECKER_REQUIRED` (**EC-30**) |

**Enforcement rule (non-negotiable, from §6 of the parent plan).** Every manager-facing handler — read *and* propose — resolves scope **before** any existence lookup, so "not your report" and "does not exist" both return an identical `403 FORBIDDEN`. Never `404`; a `404` here is an employee-enumeration oracle. This is the pattern already established in `leave_approver.controller.js` and the manager-panel authorization audit.

> **Do not infer global authority from `getAccessibleUserIds` alone.** That shared util returns `null` for `GLOBAL_APPROVER_ROLES = ['hr','admin','super-admin']` ([hierarchy_access.utils.js:7](src/common/utilities/hierarchy_access.utils.js#L7)) — it is the *hierarchy* resolver, not the *plane* resolver, and Attendance/Leave rely on that shape. Payroll must therefore treat `null` as "no hierarchy filter" and check `requesterRole === 'hr'` **separately** before granting `scope: 'global'`. Without this second check, a future route misconfiguration that let a platform token reach the service would silently grant org-wide compensation access. `decideAuthority` is the chokepoint where both conditions must hold — and it is pure, so §8's `authority.test.js` proves it. **Do not edit `GLOBAL_APPROVER_ROLES` to fix this**: that utility is shared with Attendance and Leave, and narrowing it would change their authorization behaviour as a side effect.

---

## 6. API Surface

Envelope: success `{ success: true, message, data }` · error `{ success: false, message, errorCode }` via `AppError(status, message, errorCode)`. Controllers are class instances exporting a singleton; **every** handler is `async (req, res, next)` with `try/catch → next(error)`. No `asyncHandler` wrapper exists in this codebase — do not introduce one.

Auth stacks:
```js
// Payroll is TENANT-PLANE only. `hr` is the highest authority inside an organization;
// `admin` / `super-admin` are PLATFORM-plane roles and are deliberately excluded. See §6.0.
const hrAuth      = [authenticate, authorize(['hr']), requireFeature('payroll.access')]
const managerAuth = [authenticate, authorize(['manager','hr']), requireFeature('payroll.access')]
const selfAuth    = [authenticate, requireFeature('payroll.access')]   // no authorize() — D-1
```

### 6.0 Role planes — why `admin` / `super-admin` are excluded

This codebase has **two distinct authority planes**, and Payroll is the module where conflating them is most costly.

| Plane | Roles | Scope |
|---|---|---|
| **Tenant (organization)** | `hr` · `manager` · `employee` | Operate *inside* one org. `hr` is the top of the org tree |
| **Platform (SaaS)** | `super-admin` · `admin` · `worker` | Operate on the product itself — tenants, billing, platform health |

Verified in the live codebase:

* **The org creator is provisioned as `hr`**, not `admin` — [organization.service.js:99-123](src/modules/organization/services/organization.service.js#L99-L123) (`findRoleByKey('hr')`, `upsertRoleProfile('hr', …)`, token `role: 'hr'`). Excluding platform roles therefore **cannot** lock an org owner out of their own payroll.
* **The invitation matrix separates the planes** — [003-seed-role-invitation-policies.js](src/infrastructure/postgres-sql/seeders/003-seed-role-invitation-policies.js): `hr → employee | manager | hr`, while `super-admin → admin | worker` and `admin → worker`. Platform roles have no path to invite org staff.
* **`admin` and `super-admin` are `is_assignable: false`** ([001-seed-roles.js](src/infrastructure/postgres-sql/seeders/001-seed-roles.js)) — they cannot be granted inside a tenant through any normal flow.
* **The schema already encodes the split** — `user_roles.org_id` is nullable, with a dedicated unique index `user_roles_system_user_unique_idx … WHERE org_id IS NULL` for system-scoped roles.

**Severity, stated accurately.** This is **defense in depth, not the closing of an open hole.** A platform admin's token carries `org_id = NULL`, so `requireFeature` already rejects them with `400 MISSING_ORG_CONTEXT` before any payroll service executes. The route stack is the *second* lock. It is still worth building: the schema permits an org-scoped `admin` row even though no flow creates one, and a security boundary should not rest on a side effect of the feature-flag middleware.

**Known inconsistency — do not "harmonize" it away.** The codebase has no single convention: Attendance uses `['hr','admin','super-admin']` ([hr_attendance.routes.js:12](src/modules/attendance/routes/hr_attendance.routes.js#L12)); Leave uses `['hr','super-admin']` ([leave_admin.routes.js:23](src/modules/leave/routes/leave_admin.routes.js#L23)) — it dropped `admin` but kept `super-admin`. Payroll's `['hr']` is a **third, deliberately stricter** variant, chosen because salary data is the most sensitive store in the product. Retro-fitting the other modules is out of scope for this phase; if it is ever done, it must be its own reviewed change.

**Break-glass.** There is **no impersonation or support-access mechanism in this codebase today.** With `authorize(['hr'])`, if an org's only HR user is deactivated or leaves, there is no platform-side path to correct payroll data — recovery is a direct database operation. That is the accepted trade (see §11.8); if a consented impersonation flow is built later, it belongs in the auth module issuing a tenant-plane `hr` token, **not** in a widened payroll role list.

### 6.1 HR — `/api/v1/payroll/hr` *(`hrAuth` — tenant plane, `['hr']` only)*

**Component catalog**

| # | Method | Path | Notes |
|---|---|---|---|
| 1 | POST | `/components/bootstrap` | **Idempotent** seed of the §4.1 default catalog. Inserts only missing `code`s, never overwrites an edited row; returns `{ created[], skipped[] }`. Audit-logged |
| 2 | POST | `/components` | |
| 3 | GET | `/components` | filters `is_active`, `component_type` — **validate in controller** (Express 5) |
| 4 | GET | `/components/:id` | |
| 5 | PUT | `/components/:id` | `is_system` rows: `code`/`component_type`/`calculation_type` immutable → `409 SYSTEM_COMPONENT_IMMUTABLE` |
| 6 | DELETE | `/components/:id` | Deactivate. `409 COMPONENT_IN_USE` if referenced by an active template or **any** approved structure. Never hard-delete |

**Structure templates**

| # | Method | Path | Notes |
|---|---|---|---|
| 7 | POST | `/structure-templates` | |
| 8 | GET | `/structure-templates` | eager-loads components + catalog names in one call |
| 9 | GET | `/structure-templates/:id` | |
| 10 | PUT | `/structure-templates/:id` | |
| 11 | DELETE | `/structure-templates/:id` | deactivate |
| 12 | POST | `/structure-templates/:id/components` | rejects duplicate `component_id` |
| 13 | PUT | `/structure-templates/:id/components/:componentId` | |
| 14 | DELETE | `/structure-templates/:id/components/:componentId` | |
| 15 | POST | `/structure-templates/:id/preview` | `{ annual_ctc }` → full evaluated breakdown, **persists nothing**. The safety valve that lets HR see the split before committing a salary |

**Employee structures**

| # | Method | Path | Notes |
|---|---|---|---|
| 16 | POST | `/employees/:userId/salary-structures` | HR assigns/revises. Lands **`approved`** directly (Tier C authority), unless `payroll_require_separate_checker` is ON, in which case it lands `proposed` and needs a **different `hr` user** to approve (**EC-30**, §7.2 step 5) |
| 17 | GET | `/employees/:userId/salary-structures` | full version history incl. rejected/cancelled |
| 18 | GET | `/employees/:userId/salary-structures/current` | |
| 19 | GET | `/salary-structures/proposals` | **the HR checker queue** — filters `status`, `proposed_by`, `user_id`, pagination |
| 20 | POST | `/salary-structures/:id/approve` | the §7.2 transaction |
| 21 | POST | `/salary-structures/:id/reject` | `rejection_reason` required |

**Settings · Bank · Audit**

| # | Method | Path | Notes |
|---|---|---|---|
| 22 | GET | `/settings` | lazy `getOrCreate` |
| 23 | PUT | `/settings` | partial update; audit-logged with old→new |
| 24 | GET | `/employees/:userId/bank-account` | masked |
| 25 | POST | `/employees/:userId/bank-account/verify` | sets `is_verified`, `verified_by`, `verified_at` |
| 26 | GET | `/audit-logs` | filters `entity_type`, `entity_id`, `target_user_id`, `action`, date range, pagination |

### 6.2 Manager — `/api/v1/payroll/manager` *(`managerAuth` — `['manager','hr']`)*

Every handler: `getAccessibleUserIds` → `decideAuthority` → act. Scope check precedes existence check. `hr` is admitted here so an HR user can exercise the manager views without a second token; `decideAuthority` still resolves them to `scope: 'global'`.

| # | Method | Path | Notes |
|---|---|---|---|
| 27 | GET | `/team/salary-structures` | direct reports + current CTC summary. If `manager_can_view_team_compensation` is OFF → **aggregates only** (headcount, team CTC total/average), never per-head figures (**EC-25**) |
| 28 | GET | `/employees/:userId/salary-structures` | scoped history |
| 29 | GET | `/employees/:userId/salary-structures/current` | scoped |
| 30 | POST | `/employees/:userId/salary-structures/propose` | **Tier B.** Lands `proposed`, `proposed_by = req.user.id`. If `manager_direct_compensation_authority` is ON it runs the full §7.2 approval in the same transaction and lands `approved` |
| 31 | GET | `/salary-structures/proposals` | the manager's own proposals + status/outcome |
| 32 | POST | `/salary-structures/:id/cancel` | own proposal, only while `proposed` |

### 6.3 Self — `/api/v1/payroll` (all routes under `/me`) *(`selfAuth` — no `authorize()`, per D-1)*

| # | Method | Path | Notes |
|---|---|---|---|
| 33 | GET | `/me/salary-structure` | current approved only — a pending proposal is **never** shown to the employee |
| 34 | GET | `/me/salary-structure/history` | approved versions only |
| 35 | GET | `/me/bank-account` | masked |
| 36 | PUT | `/me/bank-account` | upsert own; **any edit resets `is_verified = false`** and re-triggers HR verification |

> **Employee visibility rule.** An employee sees only `approved` structures. Surfacing a `proposed` increment would leak an in-flight HR decision and create an expectation the checker may reject. Enforced in the service, not the controller.

---

## 7. Transactional Behaviour

Unmanaged transactions only — `const t = await db.sequelize.transaction()` … `commit()` / `rollback()`, matching [leave_assignment.service.js](src/modules/leave/services/leave_assignment.service.js). Guard rollback with `if (!transaction.finished)`, the idiom already in use.

### 7.1 Create / propose a structure

1. Begin transaction.
2. Resolve settings (`getOrCreate`).
3. Resolve target's role profile via the three-way fallback (`EmployeeProfile` → `ManagerProfile` → `HrProfile`) — the pattern at [leave_assignment.service.js:112-118](src/modules/leave/services/leave_assignment.service.js#L112-L118). Missing → `404 EMPLOYEE_NOT_FOUND`. Read `joining_date`.
4. Resolve authority (§5.4). Out of scope → `403`.
5. Resolve components: from `template_id`, or an explicit component array (`component_driven`). Snapshot each catalog row's flags.
6. `evaluateStructure(...)` → throws on any §5.2 invariant breach; nothing is persisted.
7. Insert the structure row (`proposed` or `approved` per authority) + its component lines.
8. If it lands `approved`, run §7.2's close-out **inside this same transaction**.
9. Write `payroll_audit_logs` (`action: 'structure.proposed'` / `'structure.assigned'`) — same transaction.
10. Commit.

### 7.2 Approve a proposal — the critical section

1. Begin transaction.
2. `SELECT pg_advisory_xact_lock(hashtext(:key))` with `key = 'payroll:structure:' + user_id`, **before any row lock** — matching the existing lock-ordering convention. This serializes two HR users approving two proposals for the same employee at the same instant.
3. Load the proposal `FOR UPDATE`. Not `proposed` → `409 PROPOSAL_NOT_PENDING` (idempotent guard against a double-click / client retry).
4. **Re-verify scope (EC-29).** Re-run `getAccessibleUserIds` for `proposed_by`: if the subject no longer reports to the proposer, block with `409 PROPOSAL_SCOPE_STALE`. A reorg between proposal and approval must not push a change through a lapsed reporting line.
5. **Separate-checker (EC-30).** If `payroll_require_separate_checker` and `approver === proposed_by` → `403 SEPARATE_CHECKER_REQUIRED`. Never silently self-approve.

   **The checker pool is the org's `hr` users — and only those (§6.0).** Because platform `admin`/`super-admin` are excluded from the tenant plane, they cannot serve as checkers. This makes the maker–checker workflow a genuine **two-HR** feature:
   * *Multiple HR* — HR-A proposes and is blocked from approving; HR-B reviews and approves. This is the intended flow, and it is available because `hr → hr` invitation is permitted ([003-seed-role-invitation-policies.js](src/infrastructure/postgres-sql/seeders/003-seed-role-invitation-policies.js)).
   * *Sole HR* — turning the setting ON makes **every** HR-originated proposal unapprovable. The error message must therefore name **both** remedies explicitly: *"invite a second HR user to act as checker, or disable `payroll_require_separate_checker` in payroll settings."* A message offering only one remedy leaves a sole-HR org believing they are stuck.
   * A manager's Tier-B proposal is **unaffected** — proposer is the manager, approver is HR, so they are inherently different people and the setting never blocks that path.

   **Guard rail:** `PUT /hr/settings` enabling `payroll_require_separate_checker` while the org has fewer than two active `hr` users must return `409 INSUFFICIENT_CHECKERS` naming the count, rather than accepting a setting that silently bricks approvals. Warn at the moment of the decision, not at the moment of failure.
6. Load the current approved open-ended structure `FOR UPDATE`.
7. `planRevision(...)` → `closeCurrentTo`, `newVersion`.
8. Close the current row (`effective_to = closeCurrentTo`).
9. Promote the proposal: `status = 'approved'`, `version`, `approved_by`, `actioned_at = NOW()`.
10. **Supersede competing proposals:** every other `proposed` row for this user with `effective_from <= ` the approved row's → `status = 'rejected'`, `rejection_reason = 'Superseded by an approved revision'`. Prevents a stale proposal later re-opening a closed period.
11. Audit-log with both `proposed_by` and `approved_by` populated.
12. Commit. The partial unique index in §4.4 is the final backstop: if two paths ever raced through, the second commit fails rather than creating two live salaries.

### 7.3 Idempotency & retries

Every state-changing endpoint must survive a duplicate request:
* Approve/reject/cancel are **status-guarded** (step 3) — a retry returns `409`, never a double-transition.
* `/components/bootstrap` is inherently idempotent (insert-if-missing by `code`).
* Structure creation is **not** idempotent by nature; the `effective_from` overlap rules make an accidental duplicate fail with `RETRO_REVISION_NOT_SUPPORTED` rather than stacking two versions on one date. Note this in the API contract so the frontend disables the submit button rather than relying on the server to dedupe.

---

## 8. Tests (`node:test`) — D-10

`package.json`:
```json
"scripts": {
  "test": "node --test tests/unit",
  "test:watch": "node --test --watch tests/unit"
}
```
Existing Postman/OpenAPI artifacts sit at `tests/` root and are untouched by `tests/unit`.

**Suites** (pure functions, no database, no network):

| File | Must cover |
|---|---|
| `tests/unit/payroll/money.utils.test.js` | paise round-trip on string DECIMALs; `0.1 + 0.2` class of float drift; half-up at `.005`; large CTC (₹1 crore) without precision loss; negative guard |
| `tests/unit/payroll/component_evaluator.test.js` | flat-only; `percent_of_ctc` → `percent_of_basic` chain; `percent_of_gross` ordering; balancing absorbs drift so `Σ == CTC` **exactly**; each of the six §5.2 error codes; a CTC that cannot cover fixed components; an indivisible CTC (e.g. ₹1,000,001) still reconciling to the paise |
| `tests/unit/payroll/structure_version.test.js` | initial → version 1; increment → close-out date is exactly `effective_from − 1`; gap-free across three consecutive versions; retro rejection; before-joining rejection; missing `revision_reason` |
| `tests/unit/payroll/authority.test.js` | the full §5.4 matrix — self, HR global, manager+report, manager+non-report, view toggle OFF, `manager_direct_compensation_authority` ON, separate-checker self-approval blocked |

**Integration checks that stay manual in Phase 1** (no HTTP test harness exists yet; do not build one here): the §10 checklist covers them with cURL.

---

## 9. Documentation Deliverables (part of the phase, not afterwork)

Per the parent plan §0, Phase 1 is not done until these are updated:

1. **`public/md_system/api_registry.md`** — a new `## Payroll Module` section, one row per endpoint in §6, matching the existing 13-column format (incl. `Dashboard` and the three UI checkboxes).
2. **`public/md_settings/org_settings_registry.md`** — a new `## Payroll Module` section, entries **#35–#40** (§4.7), using the file's exact seven-field structure, citing real enforcement files. *While editing, delete the stray `</content></invoke>` markup after line 343 — a tool artifact flagged in the parent plan's appendix.*
3. **`public/md_payrolls/combined_api_analysis.md`** — **create it**; request/response contracts for all 36 endpoints, including the `percent_of_gross` definitional note from §5.2.
4. **`public/md_payrolls/implementation_plan.md`** — amend §0 to point at `public/md_payrolls/phases/` (this file's actual location, not the `md_phases/` originally guessed), and mark Phase 1 status.

---

## 10. Exit Criteria — Phase 2 does not begin until every line is checked

Derived from the parent plan's Phase-1 exit criteria plus the edge cases assigned to this phase.

**Schema & wiring**
- [ ] `00037` migrates up, down, and up again cleanly (enum types dropped with `CASCADE`).
- [ ] All 8 models load — `db.SalaryComponent` etc. resolve, no `Duplicate model detected` at boot.
- [ ] `/api/v1/payroll/hr/settings` returns 200 on a growth-plan org and `403 FEATURE_NOT_AVAILABLE` on a free-plan org.

**Functional**
- [ ] `POST /components/bootstrap` twice → second returns all `skipped`, zero duplicates, statutory components present and `is_active = false`.
- [ ] HR creates a template, previews ₹12,00,000 CTC, and the component breakdown **sums exactly** to ₹12,00,000 (to the paise).
- [ ] HR assigns the structure, then revises it effective mid-year → history shows v1 with `effective_to = new.effective_from − 1` and v2 open-ended, **no gap, no overlap**.
- [ ] Attempting a revision effective *on or before* the current version's start → `400 RETRO_REVISION_NOT_SUPPORTED`.

**Authority (D-13) — the core of this phase**
- [ ] A manager proposes an increment for a direct report → row lands `proposed`, and the employee's `GET /me/salary-structure` still shows the **old** figure.
- [ ] HR approves it → v2 becomes effective, `proposed_by` = manager, `approved_by` = HR, both present in `payroll_audit_logs`.
- [ ] A manager proposing for a **non-report** → `403` (identical response shape to a non-existent user id — **EC-24**).
- [ ] Reporting mapping removed between propose and approve → approval blocked `409 PROPOSAL_SCOPE_STALE` (**EC-29**).
- [ ] `payroll_require_separate_checker = true`, proposer tries to self-approve → `403 SEPARATE_CHECKER_REQUIRED`, message naming **both** remedies (invite a second HR / disable the setting) (**EC-30**).
- [ ] Two-HR org: HR-A proposes, HR-A blocked, **HR-B approves successfully** — the maker–checker path works end to end with two tenant-plane users and no platform role involved.
- [ ] Enabling `payroll_require_separate_checker` in an org with one active `hr` user → `409 INSUFFICIENT_CHECKERS`, setting not persisted.
- [ ] `manager_direct_compensation_authority = true` → the manager's proposal takes effect immediately, still fully audit-logged.
- [ ] `manager_can_view_team_compensation = false` → `/team/salary-structures` returns aggregates only, zero per-head salary figures anywhere in the payload (**EC-25**).

**Isolation & secrecy**
- [ ] HR of Org A cannot read/modify any Org B component, template or structure (`404`/`403`, never data).
- [ ] An employee calling any `/hr` or `/manager` route → `403`.
- [ ] A token bearing `role = 'admin'` or `'super-admin'` is rejected `403 FORBIDDEN` on every `/hr/*` and `/manager/*` route (§6.0).
- [ ] The same platform token on `/me/*` is rejected `400 MISSING_ORG_CONTEXT` — `/me/*` carries no `authorize()` by design (D-1), so the stop there is the absent `orgId`, **not** a role gate. Confirm this explicitly rather than assuming it; it is the one path where the role list is not the guard.
- [ ] Bank account: full number never appears in any response, log line, or error message — only `••••1234`. A manager requesting a direct report's bank account → `403`.
- [ ] `payroll_audit_logs` has no update/delete path, and no `old_values`/`new_values` contains an account number.

**Tests**
- [ ] `npm test` runs and all four suites pass.
- [ ] Reconciliation test proves `Σ(components) == annual_ctc` exactly for at least one CTC that does not divide evenly by 12.

---

## 11. Risks & Decisions Needed

| # | Item | Recommendation | Needed by |
|---|---|---|---|
| 1 | **Bank-account encryption key** (`PAYROLL_ENCRYPTION_KEY`). No secret-management pattern exists in this repo today. | Adopt AES-256-GCM via `node:crypto` (zero dependencies) and fail closed if the key is absent. If the key cannot be provisioned, record plaintext-plus-masking as an accepted risk here before proceeding. | Before §4.6 |
| 2 | **`node:test` as the runner** (parent §11 item 3 — this is the phase that establishes it). | Confirm. Built into Node 22, no dependency, and payroll arithmetic is where a silent bug becomes a financial liability. | Phase start |
| 3 | **Default catalog values** (Basic 50% of CTC, HRA 40% of Basic, Conveyance ₹1,600). | Ship as editable defaults, not policy. Every value is org-configurable on day one; the bootstrap never overwrites an edited row. | Before §4.1 |
| 4 | **Retro revisions rejected in Phase 1.** | Accept. Back-dating touches closed periods, which D-12 routes to arrears in Phase 7. Rejecting loudly now beats corrupting history. | Design |
| 5 | **Flag denormalization onto structure components** (§4.5) means a catalog flag fix does **not** propagate to existing approved structures. | Accept — that is the point (reproducibility). Phase 7 may add an explicit, audited "re-issue structure" action if a genuine correction need appears. | Design |
| 6 | **Statutory components ship inactive.** Anyone demoing Phase 1 will notice PF is not deducted. | Intentional and worth stating up front: Phase 1 defines what someone is *paid*, Phase 4 defines what is *withheld*. | Communication |
| 7 | **36 endpoints is a large surface for one phase.** | Ordering that keeps each step verifiable: §4 schema → §5 pure utils **+ their tests** → components → templates + preview → structures + versioning → the D-13 propose/approve path → settings/bank/audit. The pure utilities are testable before a single route exists. | Sequencing |
| 8 | **No break-glass path** (§6.0). With `authorize(['hr'])` and no impersonation mechanism in the codebase, an org whose only HR user is deactivated has no platform-side route to correct payroll data — recovery is a manual DB operation. | **Accept for Phase 1.** The alternative (keeping `super-admin` on payroll routes) gives every platform operator standing access to every tenant's salary data to cover a rare recovery case — a bad trade for the most sensitive store in the product. If break-glass is genuinely needed, build a consented, audited impersonation flow in the auth module that issues a tenant-plane `hr` token; do **not** widen the payroll role list. | Decision recorded |
| 9 | **Payroll becomes the strictest module**, diverging from Attendance (`hr,admin,super-admin`) and Leave (`hr,super-admin`). A reader may "fix" the inconsistency by widening payroll back. | Accept the divergence and document it in §6.0 so the next reader sees it is deliberate. Do not retro-fit Attendance/Leave inside this phase — that is a separate reviewed change with its own regression surface. | Design |
