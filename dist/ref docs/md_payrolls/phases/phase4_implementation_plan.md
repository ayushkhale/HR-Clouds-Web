# Phase 4 — Statutory & Tax: PF, ESI, PT, TDS, Declarations, Form 16

*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_payrolls/implementation_plan.md) — the module's single source of truth. Every decision below implements a decision recorded there (`D-1` … `D-21`), or adds one (`D-22` … `D-29`) that the parent must be amended to carry. **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**
> **Predecessors:** [phase1](public/md_payrolls/phases/phase1_implementation_plan.md), [phase2](public/md_payrolls/phases/phase2_implementation_plan.md), [phase3](public/md_payrolls/phases/phase3_implementation_plan.md) — **all three implemented and verified in the live code.** Phase 4 changes none of their table semantics and breaks none of their endpoint contracts; it **extends** six of their artefacts additively (§3.2).
> **Status:** Not started.
> **Depends on:** Phase 1 (component catalog + the `pf_applicable` / `esi_applicable` / `is_taxable` flags, `payroll_settings`, `payroll_audit_logs`, `money.utils`, `payroll_access.utils`), Phase 2 (run lifecycle, day ledger, `computePayrollItem`, cohort-batched aggregation, `settings_snapshot` freeze), Phase 3 (the deduction waterfall and its **reserved statutory slot**, `payroll_period_guard`, `calculation_warnings`, the carry-forward mechanism). Reads **nothing new** from Attendance or Leave.

---

## 1. Goal & Boundary

**Goal.** Phase 2 answered *"what does this person earn this month?"* and Phase 3 answered *"what else is added or recovered?"*. Phase 4 answers the last question standing between the module and a legally usable payslip: **"what must be withheld, on what basis, and can it be proven a year later?"**

Four capabilities:

1. **Statutory withholding** — PF (with EPS/EDLI/admin split), ESI (with the contribution-period continuation rule), and state Professional Tax, all config-driven and frozen per run.
2. **Income tax (TDS)** — a full annual projection engine over configurable regimes and slabs, recomputed every month from actuals, true-ing up in the final month of the financial year.
3. **Investment declarations** — employee submits, HR verifies proofs, the declaration window is enforced, and the declared-vs-verified basis switches **deterministically at the proof deadline** (EC-21) with no cron.
4. **Form 16 Part B & the annual tax statement** — a frozen, reconcilable dataset assembled from that FY's approved payslips, plus Part A registration.

This is the phase that flips `statutory_status` from `'not_applied'` to `'applied'` and makes `net_pay` a real take-home figure for the first time.

### 1.1 Explicitly in scope

* **7 tables** (exactly the parent §4 Phase-4 list), 7 models, 7 repositories, 5 services, **6 new pure utility modules**, **33 endpoints (#95–#127)** — 24 HR (#95–#118), 9 Self (#119–#127).
* Extension of `computePayrollItem` with **Step 7** — occupying the slot Phase 3 reserved between 8a and 8b — still a pure function, still no `db` import.
* A third cohort-batched, read-only aggregator (**D-24**), keeping query count O(cohorts).
* 12 new statutory columns on `payroll_run_items` (**§4.8**), all added to `ENGINE_OWNED_COLUMNS`.
* `is_hra` on `salary_components` + `is_statutory` / `is_hra` on the structure-component snapshot (**§4.9**).
* 8 new org settings (registry **#47–#50**) plus the **backfill of the missing #45–#46** (§2 item 6).
* `engine_version` **3 → 4**.
* Unit suites for every pure module; extension of `payroll_calculation.test.js`.

### 1.2 Explicitly NOT in scope (do not build these here)

| Deferred | Phase |
|---|---|
| Reimbursements, benefits, **file attachments of any kind** | 5 |
| **PDF rendering** of Form 16 / payslips / annual statement, CSV export, bank advice, reports | 6 |
| Crons (declaration-window open/close reminders, proof-deadline reminders), arrears/retro TDS, off-cycle & F&F tax settlement, comp-off encashment | 7 |
| ECR / Form 24Q / challan **file generation**, e-filing integration, TRACES integration | — *(not in the parent; do not invent)* |
| Perquisites, LTA, gratuity, superannuation, NPS employer contribution, VPF, multi-country statutory | — *(not in the parent; see §11 item 9 for the recorded limitations)* |

> **Honesty guard, updated.** Phase 4 **removes** the Phase 2/3 honesty guard rather than carrying it forward. Every item calculated by engine 4 carries `statutory_status ∈ { 'applied', 'disabled' }` and the payslip's `statutory_note` becomes version-aware. **`'not_applied'` remains a valid stored value and must keep rendering correctly** — it is what every pre-Phase-4 run item already holds, and D-12 forbids touching those rows. A reviewer seeing engine-4 output still hard-coding *"Phase 2 applies no statutory withholding"* ([payslip_read.service.js:89](src/modules/payroll/services/payslip_read.service.js#L89)) should treat it as a defect.
>
> **What is still not final take-home:** TDS is a *projection*, correct to the extent the employee's declarations and previous-employer figures are correct. That is the nature of TDS, not a limitation of this phase — but §11 item 9 lists the income heads this engine does **not** model, and those must be stated on the projection endpoint's response, not buried.

---

## 2. Pre-Flight Checks (do these before writing code)

Each is a fact verified in the live Phase-1/2/3 code or documentation. Each one silently breaks Phase 4 if missed.

1. **Next migration number is `00043`.** The latest is `00042-org-name-unique-indexes.js` — **not** `00041`. Payroll migrations are not contiguous; two org-module migrations landed after `00040`.
2. **The `source` enum on `payroll_run_item_components` already contains `statutory`** ([payroll_run_item_components.model.js:84](src/modules/payroll/models/payroll_run_item_components.model.js#L84)). Phase 2 declared the full enum deliberately. Phase 4 needs **no `ALTER TYPE`** and must not add one.
3. **Phase 3 reserved the statutory slot explicitly** — the deduction waterfall runs `8a structure → [statutory] → 8b adjustment → 8c loan → 8d carry-forward`, and the code's own comment marks the slot. Phase 4 inserts there and **reorders nothing**. Statutory therefore takes priority over ad-hoc deductions and loan EMI for the EC-15 sufficiency test, which is correct: statutory withholding is not negotiable against a loan installment.
4. **`ENGINE_OWNED_COLUMNS`** ([payroll_run_item.repository.js:22](src/modules/payroll/repositories/payroll_run_item.repository.js#L22)) is the UPSERT allow-list. **All 12 new `payroll_run_items` columns must be added**, or recalculation will silently freeze the first calculation's statutory figures.
5. **`buildSettingsSnapshot` is an explicit allow-list** ([payroll_run.service.js:86](src/modules/payroll/services/payroll_run.service.js#L86)) and `payrollRunRepo.create` hard-codes `engine_version: 3` ([payroll_run.service.js:243](src/modules/payroll/services/payroll_run.service.js#L243)). Phase 4 must change **both** the hard-coded literal and the column default, and must extend the snapshot with the `statutory` block (§5.7).
6. **Documentation debt inherited from Phase 3 — verified, must be repaired by this phase (§9):**
   * The parent's §0 status line still reads *"Phases 1 & 2 implemented … Phase 3 in progress. Phases 4–7 not started"*. Phase 3 is complete.
   * **`D-15` … `D-21` were never added to the parent's §3.** `grep` for them returns nothing. Anyone planning from the parent alone will not know that the exit boundary is `payroll_run_items.period_end` (D-15), that items are UPSERTed with stable UUIDs (D-16), or that variable pay commits at approval (D-18).
   * **Registry entries #45–#46 were never added to `org_settings_registry.md`.** It stops at #44. `negative_net_handling` and the six loan-policy knobs are live in the API and the model but undocumented.
   These are corrections, not scope creep. Phase 4 numbers its own settings from **#47** and backfills #45–#46 in the same edit.
7. **`toPaise` rejects negatives by default** (`422 NEGATIVE_MONEY`, [money.utils.js:67](src/modules/payroll/utils/money.utils.js#L67)). **Every statutory amount is stored and transported positive**; direction is carried by `component_type`. `source: 'rounding'` remains the only negative line in the system. A negative TDS (over-deduction) is **clamped to zero**, never emitted as a credit line (EC-41).
8. **`percentOfPaise(basePaise, pct)` exists and is exact to 4 decimal places of percentage** ([money.utils.js:135](src/modules/payroll/utils/money.utils.js#L135)). PF at 12%, ESI at 0.75%, admin charges at 0.5% and every slab rate use it. Do not hand-roll percentage arithmetic and do not introduce a float path.
9. **`addMonths('YYYY-MM', n)` already exists** — but it lives in [loan_schedule.utils.js:29](src/modules/payroll/utils/loan_schedule.utils.js#L29), not in `payroll_period.utils`. §5.1 moves it to `payroll_period.utils.js` and has `loan_schedule.utils.js` import and re-export it, preserving `module.exports = { buildSchedule, addMonths }` byte-for-byte so no call site changes.
10. **`financial_year_start_month` exists on `payroll_settings`** (default `4`, registry #37) and is already in `settings_snapshot`. The FY is derived from it — do **not** hard-code April.
11. **`employee_salary_structure_components` does not carry `is_statutory`** — the Phase-1 snapshot copies nine behaviour flags but not that one. §4.9 adds it (plus `is_hra`) with a backfill, because the engine must be able to recognise and ignore a statutory line that reached a structure.
12. **Structure assignment uses `salaryComponentRepo.findActiveByIds`** ([employee_salary_structure.service.js:73](src/modules/payroll/services/employee_salary_structure.service.js#L73)), so the Phase-1 statutory catalog rows (`is_active = false`) cannot currently reach a structure. **Phase 4 activates them** when the corresponding head is enabled (§7.1), which removes that accidental protection — so §5.9's explicit `STATUTORY_COMPONENT_NOT_ASSIGNABLE` guard is **mandatory, not defensive**.
13. **`is_basic` has a partial unique index** `(org_id) WHERE is_basic AND is_active AND deleted_at IS NULL`. `is_hra` (§4.9) mirrors it exactly.
14. **The profile tables carry `state` and `location_id`; `organization_locations` carries `state`.** `PROFILE_ATTRS` in the Phase-2 aggregator ([payroll_attendance_aggregator.service.js:50](src/modules/payroll/services/payroll_attendance_aggregator.service.js#L50)) already fetches `location_id` and `work_location` but **not** `state`. §5.6 adds `state` and `dob` to that list — the one and only edit Phase 4 makes to the Phase-2 aggregator, and it is a pure attribute-list addition.
15. **`pan_number` exists on all three profile tables** (`STRING(50)`, nullable). It is required for Form 16 and drives Section 206AA (EC-32).
16. **`payroll_period_guard.assertPeriodOpenForVariablePay`** ([payroll_period_guard.service.js](src/modules/payroll/services/payroll_period_guard.service.js)) is the EC-31 gate. Phase 4 writes **do not** use it: declarations, regime choices and statutory config are *inputs to a future projection*, not money lines targeting a specific run month. §7.6 explains why, and what replaces it.
17. **A run's `settings_snapshot` is frozen at CREATE, not at calculate.** Recalculating a run re-reads `claimed.settings_snapshot` ([payroll_run.service.js:295](src/modules/payroll/services/payroll_run.service.js#L295)). Editing statutory config therefore **does not** affect an existing run, even after recalculation. This is deliberate Phase-2 semantics; §7.1 makes it explicit in the config-update response instead of letting HR discover it.
18. **No upload infrastructure exists** — still no `multer`, no `busboy`, no `pdfkit` (verified in `package.json`). D-19 (CSV as a body string) is the standing precedent. §6.1 #115 registers Form 16 Part A by **reference**, not by file (**D-29**).
19. **Express 5: `req.query` is getter-only.** Every list/filter endpoint validates query params **inside the controller** via `validateOrThrow`. Every Phase-4 endpoint that takes `financial_year` as a query param is affected.
20. **Route-order trap.** `/tax/:financialYear/...` would capture `/tax/declarations` and `/tax/regimes`. §6.1 therefore uses `/tax/financial-years/:financialYear/...` — there is no `:param` directly under `/tax`. Do not "simplify" it back.

---

## 3. Directory Structure

### 3.1 Additions

```text
src/modules/payroll/
├── models/
│   ├── statutory_configs.model.js                  ← new
│   ├── professional_tax_slabs.model.js             ← new
│   ├── tax_regimes.model.js                        ← new
│   ├── tax_slabs.model.js                          ← new
│   ├── investment_declarations.model.js            ← new
│   ├── investment_declaration_items.model.js       ← new
│   └── employee_tax_summaries.model.js             ← new
├── repositories/                                   ← one per model, same names
├── services/
│   ├── statutory_config.service.js                 ← new (config + PT slabs + catalog activation)
│   ├── tax_table.service.js                        ← new (regimes, slabs, FY bootstrap)
│   ├── investment_declaration.service.js           ← new (submit / verify / reopen)
│   ├── employee_tax.service.js                     ← new (summary, regime, prev-employer, Form 16, finalize)
│   ├── statutory_calculation.service.js            ← new (PURE — no db import; the Step-7 composer)
│   └── payroll_statutory_aggregator.service.js     ← new (D-24, batched, read-only)
└── utils/
    ├── tax_period.utils.js                         ← PURE (FY + ESI contribution period arithmetic)
    ├── statutory_pf.utils.js                       ← PURE (PF / EPS / EDLI / admin, EC-18)
    ├── statutory_esi.utils.js                      ← PURE (ESI eligibility, continuation, EC-19)
    ├── statutory_pt.utils.js                       ← PURE (state slab resolution)
    ├── tax_projection.utils.js                     ← PURE (annual liability: slabs, 87A, surcharge, cess)
    ├── tds_monthly.utils.js                        ← PURE (monthly TDS from projection + YTD, EC-20/32/41)
    └── payroll_tax_defaults.js                     ← India FY regime/slab defaults (data, not logic)
```

`statutory_calculation.service.js` lives under `services/` to match `payroll_calculation.service.js`'s precedent, but imports **no `db`, no repository, no model** — its test asserts that, exactly as the Phase-2 test does.

### 3.2 Extensions to existing files (additive only)

| File | Change |
|---|---|
| `services/payroll_calculation.service.js` | One new optional input `statutoryContext`; Step 7 delegates to `statutory_calculation.service`. **Stays pure**; omitting the input reproduces Phase-3 output byte-for-byte |
| `services/payroll_run.service.js` | `buildSettingsSnapshot(settings, statutoryConfig, ptSlabs, taxTables)` gains the **`statutory` block frozen at CREATE** (§5.8) and `create` validates the tax tables up front; `engine_version: 4`; a once-per-run `prepareForRun` call; a per-cohort statutory aggregation call; the 12 new item columns copied in `_buildCohortRows`; `ZERO_FIGURES` gains them; `#37 eligibility` gains statutory readiness counters incl. the EC-46 cliff warning |
| `repositories/payroll_run_item.repository.js` | 12 new names in `ENGINE_OWNED_COLUMNS`; one new lean read `findStatutoryPeriodAggregates` (§5.8) returning `ytd_taxable` / `ytd_tds` / `ytd_pt` / **`ytd_pf`** / ESI prior state |
| `services/payroll_attendance_aggregator.service.js` | `PROFILE_ATTRS` gains `state` and `dob`. **Nothing else.** No logic change, no new query |
| `services/payslip_read.service.js` | Version-aware `statutory_note`; a `statutory` block in `_projectDetail`; `income_tax_amount` on `_projectListRow` |
| `services/salary_component.service.js` | `is_statutory` components rejected from templates/structures (§5.9); `is_hra` uniqueness guard mirroring `is_basic` |
| `services/salary_structure_template.service.js`, `employee_salary_structure.service.js` | Same `STATUTORY_COMPONENT_NOT_ASSIGNABLE` guard at both composition points |
| `utils/payroll_period.utils.js` | Gains `addMonths`, `monthsBetween` (§5.1) |
| `utils/money.utils.js` | Gains **`roundNearestTen(paise)`** — §288A / §288B statutory rounding (§5.5). Purely additive; no existing helper changes |
| `utils/loan_schedule.utils.js` | Imports `addMonths` from `payroll_period.utils` and re-exports it. **Public surface unchanged** |
| `utils/payroll_defaults.js` | Six new statutory catalog rows (§4.10); `HRA` gains `is_hra: true` |
| `validators/payroll_hr.validator.js`, `payroll_self.validator.js` | New schemas; `updateSettingsSchema` gains the eight §4.7 keys |
| `controllers/`, `routes/` (HR + Self only) | Extended in place. **No fourth route audience, no new auth stack, no manager routes (D-28)** |

`payroll_variable_pay_aggregator.service.js` and `payroll_period_guard.service.js` are **not modified.**

---

## 4. Database Schema — Migration `00043-create-payroll-statutory-tax.js`

Same shape as `00040`: one `queryInterface.sequelize.transaction()`, tables in FK dependency order, partial unique indexes `WHERE deleted_at IS NULL`, CHECK constraints via raw `ALTER`, and `down()` reversing and dropping every generated enum type with `CASCADE`.

**Conventions.** UUID PK `defaultValue: Sequelize.UUIDV4` · `org_id` UUID NOT NULL FK → `organizations` (`CASCADE`/`CASCADE`) · `created_at`/`updated_at` NOT NULL · `underscored: true`.

**Paranoid policy (extends D-16 / Phase-3 §4).** All seven new tables are **paranoid** — every one is either a user-authored artefact or a rate table whose deletion must leave a tombstone for an auditor.

**Create order:** `statutory_configs` → `professional_tax_slabs` → `tax_regimes` → `tax_slabs` → `investment_declarations` → `investment_declaration_items` → `employee_tax_summaries`, then the `addColumn`s on `payroll_settings`, `payroll_run_items`, `salary_components` and `employee_salary_structure_components`, then the backfills.

### 4.1 `statutory_configs` — the org singleton for PF / ESI / PT / TDS enablement

`UNIQUE (org_id)` WHERE `deleted_at IS NULL`. Lazily provisioned by `getOrCreate(orgId, transaction)`, exactly like `payroll_settings` (Phase 1 §4.7) — including the `findOrCreate`-inside-a-transaction race handling with the unique constraint as backstop.

**Provident Fund**

| Column | Type | Default | Notes |
|---|---|---|---|
| `pf_enabled` | BOOLEAN NOT NULL | `false` | Ships OFF. An org that has been running payroll without PF must opt in explicitly (the Phase-2 `overtime_payable` precedent) |
| `pf_employee_rate` | DECIMAL(5,2) NOT NULL | `12.00` | |
| `pf_employer_rate` | DECIMAL(5,2) NOT NULL | `12.00` | |
| `pf_wage_ceiling` | DECIMAL(14,2) NOT NULL | `15000.00` | |
| `pf_restrict_to_ceiling` | BOOLEAN NOT NULL | `true` | **EC-18.** `true` → PF wage = `min(pf_applicable_earnings, ceiling)`; `false` → full wages |
| `pf_lop_reduces_ceiling` | BOOLEAN NOT NULL | `true` | When the employee has LOP/proration, the ceiling is scaled by `payable_days / divisor` before the `min()` — EPFO practice is to apply the ceiling to wages actually payable |
| `pf_include_overtime` | BOOLEAN NOT NULL | `false` | OT is not basic wages for PF (**D-25**) |
| `eps_enabled` | BOOLEAN NOT NULL | `true` | |
| `eps_rate` | DECIMAL(5,2) NOT NULL | `8.33` | Carved **out of** the employer share, never added to it |
| `eps_wage_ceiling` | DECIMAL(14,2) NOT NULL | `15000.00` | Applied **always**, independent of `pf_restrict_to_ceiling` |
| `pf_admin_charge_rate` | DECIMAL(6,4) NOT NULL | `0.5000` | % of PF wage |
| `pf_admin_charge_min` | DECIMAL(14,2) NOT NULL | `0.00` | Per-employee floor; the ₹500/month establishment minimum is **not** modelled (§11 item 9) |
| `edli_enabled` | BOOLEAN NOT NULL | `true` | |
| `edli_rate` | DECIMAL(6,4) NOT NULL | `0.5000` | |
| `edli_wage_ceiling` | DECIMAL(14,2) NOT NULL | `15000.00` | |

**Employees' State Insurance**

| Column | Type | Default | Notes |
|---|---|---|---|
| `esi_enabled` | BOOLEAN NOT NULL | `false` | |
| `esi_employee_rate` | DECIMAL(5,2) NOT NULL | `0.75` | |
| `esi_employer_rate` | DECIMAL(5,2) NOT NULL | `3.25` | |
| `esi_wage_threshold` | DECIMAL(14,2) NOT NULL | `21000.00` | Coverage ceiling |
| `esi_include_overtime` | BOOLEAN NOT NULL | `true` | OT **is** wages for ESI *contribution* — but see §5.4: it is excluded from the *eligibility* test (**D-25**) |

> **D-25 — the overtime line's statutory flags become config-driven, resolving a Phase-2 placeholder.** Phase 2 emits the `OVERTIME` component with `pf_applicable: false, esi_applicable: false` and its own comment says *"the last two are Phase-2 placeholders and Phase 4 must revisit them"* ([payroll_calculation.service.js:227](src/modules/payroll/services/payroll_calculation.service.js#L227)). Phase 4 resolves it: **overtime is excluded from the PF wage and included in the ESI contribution wage**, both defaulting per the statute and both overridable by `pf_include_overtime` / `esi_include_overtime`. The engine reads the config, not the line's flags, when assembling statutory bases (§5.7 step 1) — so the two flags on the emitted line become **descriptive of the resolved treatment** rather than a hard-coded guess, and `computeStatutory` sets them from the config so a payslip line and the wage base it fed can never disagree.
>
> This changes the persisted `esi_applicable` value on OT lines from engine 4 onwards. Runs produced by engines 2 and 3 are frozen (D-12) and keep `false`; nothing reads that flag retroactively, because statutory bases are only ever computed at calculation time.

**Professional Tax**

| Column | Type | Default | Notes |
|---|---|---|---|
| `pt_enabled` | BOOLEAN NOT NULL | `false` | |

Slab data lives in `professional_tax_slabs` (§4.2). No default slabs ship (§11 item 4).

**Income tax / TDS**

| Column | Type | Default | Notes |
|---|---|---|---|
| `income_tax_enabled` | BOOLEAN NOT NULL | `false` | |
| `tds_no_pan_rate` | DECIMAL(5,2) NOT NULL | `20.00` | Section 206AA (**EC-32**) |
| `tds_no_pan_enforced` | BOOLEAN NOT NULL | `true` | |
| `cess_rate` | DECIMAL(5,2) NOT NULL | `4.00` | Health & education cess |

**Audit / provenance:** `updated_by` UUID NULL FK users (SET NULL), plus the standard timestamps. The `updated_at` of this row appears in every run's frozen snapshot so a payslip can name the config generation it used.

CHECKs: every rate `BETWEEN 0 AND 100`; every ceiling/threshold `> 0`; `eps_rate <= pf_employer_rate`.

> **Why a plain singleton and not an effective-dated table (D-26).** The parent's §4 lists `statutory_configs` without specifying versioning. A run's arithmetic is already made reproducible by the Phase-2 `settings_snapshot` freeze, so effective-dating would add a second, overlapping reproducibility mechanism with its own overlap/gap invariants to maintain. The accepted trade — and it is a real one — is that a run **created after** a config edit uses the new config even for an old period. §7.1 therefore makes the config-update response state exactly which live runs are affected, and `#37 eligibility` surfaces `statutory_config_updated_at`. If a mid-year statutory change ever needs to be applied retroactively, the operator's path is Phase 2's documented one: cancel the run and re-create it.

### 4.2 `professional_tax_slabs`

| Column | Type | Notes |
|---|---|---|
| `state_code` | STRING(20) NOT NULL | Normalised uppercase, e.g. `MH`, `KA`, `TN`. The org's own vocabulary — no lookup table |
| `state_name` | STRING(100) NOT NULL | Display only |
| `from_amount` | DECIMAL(14,2) NOT NULL | **Inclusive** lower bound of monthly gross |
| `to_amount` | DECIMAL(14,2) NULL | **Exclusive** upper bound; NULL = ∞. Ranges are half-open `[from, to)` — see the boxed note below |
| `monthly_amount` | DECIMAL(14,2) NOT NULL | `CHECK (monthly_amount >= 0)` |
| `gender` | ENUM(`any`,`male`,`female`) NOT NULL DEFAULT `any` | Some states differ by gender |
| `month_overrides` | JSONB NOT NULL DEFAULT `{}` | `{ "2": 300.00 }` — the Maharashtra-February case, data-driven rather than a code branch |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_by` | UUID NULL FK users (SET NULL) | |

**Indexes** — `(org_id, state_code, is_active)` · `(org_id, state_code, from_amount)`.

**No unique constraint on the range.** Overlap and gap validation is enforced **in the service, over the whole set for a state, in one transaction** (§7.2), because a state's slabs are only meaningful as a complete, contiguous set. A partial index cannot express "these ranges tile `[0, ∞)` without overlap".

> **Slab ranges are half-open `[from, to)` — binding for `professional_tax_slabs` AND `tax_slabs`.** An *inclusive* `to_amount` cannot tile the reals: `[0, 10000]` followed by `[10001, 20000]` leaves a gap that swallows `10000.50`, and `[0, 10000]` followed by `[10000, 20000]` overlaps at the boundary. Neither is acceptable when the value being bucketed is a money amount, and a payable gross **routinely carries paise** after LOP and joining proration — so this is a reachable case, not a theoretical one.
>
> Therefore, everywhere in this phase: **selection is `from_amount <= value AND (to_amount IS NULL OR value < to_amount)`**, contiguity is the exact equality `next.from_amount === prev.to_amount`, the first range starts at `0`, and exactly one range has `to_amount = NULL`. The seeded values in `payroll_tax_defaults.js` (§3.1) must be written in this convention — an Indian slab published as "₹2,50,001 to ₹5,00,000" is stored as `from = 250000, to = 500000`, **not** `from = 250001`. §5.3, §5.5 and §7.2 all restate this; if they ever disagree with this note, this note wins.

### 4.3 `tax_regimes`

| Column | Type | Notes |
|---|---|---|
| `financial_year` | STRING(7) NOT NULL | `'2026-27'` |
| `code` | ENUM(`old`,`new`) NOT NULL | |
| `name` | STRING(100) NOT NULL | |
| `standard_deduction` | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| `allows_chapter_via` | BOOLEAN NOT NULL DEFAULT true | `false` for the new regime |
| `allows_hra_exemption` | BOOLEAN NOT NULL DEFAULT true | `false` for the new regime |
| `chapter_via_limits` | JSONB NOT NULL DEFAULT `{}` | `{ "80C": 150000, "80D": 25000, "80CCD1B": 50000, "80TTA": 10000, … }` — per-section caps, FY-scoped |
| `rebate_87a_income_limit` | DECIMAL(14,2) NOT NULL DEFAULT 0 | 0 = no rebate |
| `rebate_87a_max_amount` | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| `surcharge_slabs` | JSONB NOT NULL DEFAULT `[]` | `[{ "from": 5000000, "rate": 10 }, …]`, with marginal relief applied by §5.5 |
| `is_default` | BOOLEAN NOT NULL DEFAULT false | The org's default for employees who never choose |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |

**Indexes** — UNIQUE `(org_id, financial_year, code)` WHERE `deleted_at IS NULL` · UNIQUE `(org_id, financial_year)` WHERE `is_default = true AND is_active = true AND deleted_at IS NULL` (exactly one default per FY, mirroring the `is_basic` precedent) · `(org_id, financial_year)`.

> **Why Chapter VI-A caps are JSONB and not an eighth table.** The parent's §4 fixes the Phase-4 table list at seven. A caps table would be a pure key→limit map, FY-scoped and regime-scoped — precisely a JSONB column's job — and it would need its own CRUD surface for no analytical benefit (nobody aggregates over deduction caps). The trade is that a cap is not queryable in SQL; it is only ever read whole by the projection engine.

### 4.4 `tax_slabs`

`regime_id` FK `tax_regimes` (CASCADE) · `org_id` · `financial_year` STRING(7) NOT NULL (denormalised so the cohort read never joins) · `age_band` ENUM(`below_60`,`60_to_79`,`80_plus`) NOT NULL DEFAULT `below_60` · `from_amount` DECIMAL(14,2) NOT NULL (**inclusive**) · `to_amount` DECIMAL(14,2) NULL (**exclusive**, NULL = ∞ — the half-open `[from, to)` rule of §4.2 applies identically) · `rate_percent` DECIMAL(5,2) NOT NULL (`CHECK BETWEEN 0 AND 100`) · `display_order` INTEGER NOT NULL DEFAULT 0.

**Indexes** — `(org_id, financial_year, regime_id, age_band, from_amount)` · `(regime_id)`.

Like PT slabs, contiguity/overlap is validated **service-side over the whole set** for a `(regime, age_band)` pair, replaced atomically (§7.2). The new regime declares only `below_60` — §5.5 falls back to `below_60` when a band has no slabs and records `AGE_BAND_FALLBACK` in the trace.

### 4.5 `investment_declarations`

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID NOT NULL FK users (CASCADE) | |
| `financial_year` | STRING(7) NOT NULL | |
| `status` | ENUM(`draft`,`submitted`,`under_review`,`verified`,`partially_verified`,`rejected`) NOT NULL DEFAULT `draft` | |
| `total_declared` · `total_verified` | DECIMAL(14,2) NOT NULL DEFAULT 0 | Maintained from items inside the same transaction; **never** the source of truth for the engine (§5.6 reads items) |
| `submitted_at` | DATE NULL | |
| `verified_by` · `verified_at` | UUID FK users (SET NULL) / DATE | |
| `verifier_remarks` · `rejection_reason` | TEXT NULL | |
| `proof_deadline` | DATEONLY **NULL** | **NULL while `draft`; frozen at first submission** from the org setting and never rewritten by a later reopen/re-submit. An org that moves its deadline must not silently change the basis of an already-submitted declaration (**EC-21**). It cannot be NOT NULL: the row is created in `draft` by #123, before a submission exists to freeze against |
| `reopened_count` | INTEGER NOT NULL DEFAULT 0 | |
| `reopened_by` · `reopened_at` | UUID / DATE | |

**Indexes** — UNIQUE `(org_id, user_id, financial_year)` WHERE `deleted_at IS NULL` (**EC-40**) · `(org_id, financial_year, status)` (the HR verification queue) · `(org_id, user_id)` · `(org_id, financial_year, submitted_at)` (the §5.8 engine predicate, which admits a reopened-but-previously-submitted declaration).

> **`submitted_at` is the engine's visibility key, not `status` (**EC-43**).** A declaration that has ever been submitted keeps `submitted_at` set for the life of the FY — a reopen (#109) changes `status` back to `draft` but **never clears `submitted_at`**. §5.8 keys engine visibility on `submitted_at IS NOT NULL`, so an employee editing a reopened declaration cannot make their own investments vanish from a payroll run that happens to calculate mid-edit. Without this, a January reopen would spike that employee's TDS for the month, and the over-withholding is only partially recoverable (EC-41 clamps later months to zero but payroll never refunds).

### 4.6 `investment_declaration_items`

`declaration_id` FK (CASCADE) · `org_id` · `user_id` (denormalised for the cohort read) · `financial_year` STRING(7) NOT NULL · `section` STRING(20) NOT NULL (`80C`, `80D`, `80CCD1B`, `80E`, `80G`, `80TTA`, `HRA`, `HOME_LOAN_INTEREST`, …) · `sub_category` STRING(150) NULL · `declared_amount` DECIMAL(14,2) NOT NULL `CHECK (>= 0)` · `verified_amount` DECIMAL(14,2) NULL (NULL until acted on) · `proof_status` ENUM(`pending`,`submitted`,`verified`,`rejected`) NOT NULL DEFAULT `pending` · `proof_reference` TEXT NULL (a receipt/policy number today; **Phase 5 adds the attachment FK over this same row** — D-29) · `metadata` JSONB NOT NULL DEFAULT `{}` · `verifier_remarks` TEXT NULL · `display_order` INTEGER NOT NULL DEFAULT 0.

**`metadata` shape for `section = 'HRA'`:** `{ rent_paid_annual, is_metro, landlord_name, landlord_pan }`. Validated per-section by Joi; unknown sections accept an empty object.

**Indexes** — `(declaration_id, display_order)` · `(org_id, user_id, financial_year)` (the engine's cohort predicate) · `(org_id, financial_year, proof_status)`.

> **No unique constraint on `(declaration_id, section)`.** An employee legitimately declares several 80C instruments. Caps are applied per **section** in the projection (§5.5), summing the items.

> **`sub_category = 'EPF_AUTO'` is reserved (§5.5, EC-44).** The projection injects the employee's own PF contribution into 80C automatically, under that exact `sub_category`. A user-supplied item carrying it is rejected by #123's validator with `422 RESERVED_DECLARATION_SUB_CATEGORY` — the same principle as the reserved engine component codes in Phase 3. Without the reservation an employee could declare their EPF manually and have it counted twice, taking the 80C total past the cap's intent.

### 4.7 `employee_tax_summaries` — durable state only

`UNIQUE (org_id, user_id, financial_year)` WHERE `deleted_at IS NULL`. Lazily provisioned by `getOrCreate`.

| Column | Type | Notes |
|---|---|---|
| `financial_year` | STRING(7) NOT NULL | |
| `tax_regime` | ENUM(`old`,`new`) NOT NULL | |
| `regime_source` | ENUM(`org_default`,`employee`,`hr`) NOT NULL DEFAULT `org_default` | |
| `regime_changed_by` · `regime_changed_at` | UUID FK users (SET NULL) / DATE | |
| `previous_employer_gross` · `previous_employer_taxable` · `previous_employer_tds` · `previous_employer_pf` · `previous_employer_pt` | DECIMAL(14,2) NOT NULL DEFAULT 0 | Form 12B figures, HR-entered (**EC-33**) |
| `previous_employer_recorded_by` · `previous_employer_recorded_at` | UUID / DATE | |
| `is_finalized` | BOOLEAN NOT NULL DEFAULT false | |
| `finalized_by` · `finalized_at` | UUID FK users (SET NULL) / DATE | |
| `form16_snapshot` | JSONB NULL | The frozen Part-B dataset, written once at finalization (D-6 principle) |
| `form16_part_a_ack_number` | STRING(50) NULL | TRACES acknowledgement |
| `form16_part_a_issued_on` | DATEONLY NULL | |
| `form16_part_a_reference_url` | TEXT NULL | **D-29** |
| `form16_part_a_recorded_by` · `form16_part_a_recorded_at` | UUID / DATE | |

**Indexes** — `(org_id, financial_year, is_finalized)` · `(org_id, user_id)`.

> **D-27 — this table stores only what cannot be derived.** Every year-to-date *actual* (taxable earnings, TDS deducted, PF, ESI, PT) is **always** computed by aggregating approved/paid `payroll_run_items` (§5.6). Nothing is incremented here at run approval and nothing is decremented at run cancel.
>
> The consequence is worth stating plainly: **Phase 4 adds no hook to `payroll_run.service.approve` or `.cancel` at all.** The two most dangerous code paths in the module — the ones Phase 3 warned could corrupt money — are untouched. Cancelling and re-approving a run automatically produces correct YTD figures, because there is no second copy of the truth to fall out of sync. The only price is one extra aggregate query per cohort, which the module already pays twice.
>
> Finalization is the single exception, and deliberately so: `form16_snapshot` is a **freeze**, not a cache, and it is what makes a re-issued Form 16 identical to the original.

### 4.8 `payroll_run_items` additions — 12 columns

`addColumn` on the Phase-2 table. **All 12 must be added to `ENGINE_OWNED_COLUMNS`** (§2 item 4).

| Column | Type | Default | Purpose |
|---|---|---|---|
| `pf_wage` | DECIMAL(14,2) NOT NULL | `0` | Post-ceiling PF base |
| `esi_wage` | DECIMAL(14,2) NOT NULL | `0` | ESI contribution base |
| `taxable_earnings` | DECIMAL(14,2) NOT NULL | `0` | Σ(earning lines where `is_taxable`) — the YTD spine for TDS and Form 16 |
| `esi_covered` | BOOLEAN NOT NULL | `false` | **EC-19** continuation signal |
| `pf_employee_amount` | DECIMAL(14,2) NOT NULL | `0` | |
| `pf_employer_amount` | DECIMAL(14,2) NOT NULL | `0` | Employer PF **excluding** EPS |
| `eps_amount` | DECIMAL(14,2) NOT NULL | `0` | Legally distinct head; every PF challan needs the split |
| `esi_employee_amount` · `esi_employer_amount` | DECIMAL(14,2) NOT NULL | `0` | |
| `professional_tax_amount` | DECIMAL(14,2) NOT NULL | `0` | |
| `income_tax_amount` | DECIMAL(14,2) NOT NULL | `0` | Monthly TDS |
| `statutory_snapshot` | JSONB NULL | `NULL` | The full reproducibility trace (§5.7) |

`pf_admin_charges` and `edli_charges` are **not** columns — they are employer-side charges nobody aggregates independently of PF, and they live in `statutory_snapshot` and as component lines. If a Phase-6 report needs them summed, it sums the component lines.

Also `changeColumn` `payroll_runs.engine_version` default `3` → `4`, and extend the `statutory_status` values in use to `applied` | `disabled` | `not_applied` (the column is already `STRING(20)`, so **no enum migration**).

### 4.9 `salary_components` and `employee_salary_structure_components` additions

| Table | Column | Type | Notes |
|---|---|---|---|
| `salary_components` | `is_hra` | BOOLEAN NOT NULL DEFAULT false | Identifies the House Rent Allowance earning for the Rule 2A exemption. Partial unique index `(org_id) WHERE is_hra = true AND is_active = true AND deleted_at IS NULL`, mirroring `is_basic` |
| `employee_salary_structure_components` | `is_statutory` | BOOLEAN NOT NULL DEFAULT false | Snapshot completeness (Phase 1 §4.5 principle) — lets the engine recognise and ignore a statutory line that reached a structure |
| `employee_salary_structure_components` | `is_hra` | BOOLEAN NOT NULL DEFAULT false | Same, for the exemption base |

**Backfills, inside the migration transaction:**

```sql
UPDATE salary_components SET is_hra = true
  WHERE code = 'HRA' AND is_system = true AND deleted_at IS NULL;

UPDATE employee_salary_structure_components c SET
  is_statutory = COALESCE(sc.is_statutory, false),
  is_hra       = COALESCE(sc.is_hra, false)
FROM salary_components sc
WHERE sc.id = c.component_id;
```

The `is_hra` backfill must run **after** the `salary_components` backfill. An org that renamed its HRA component keeps `is_hra = false` and gets `HRA_COMPONENT_UNRESOLVED` in the projection trace (a warning, never an error) until HR flags it via `PUT /components/:id`.

### 4.10 `payroll_defaults.js` additions — six statutory catalog rows

All ship `is_statutory: true`, `is_system: true`, **`is_active: false`**, `is_part_of_ctc` as noted, and `calculation_type: 'flat'` with `value: 0` — because Phase 4 makes the catalog row a **label and provenance carrier only**; every number comes from `statutory_configs` (**D-23**).

| code | name | component_type | is_part_of_ctc |
|---|---|---|---|
| `EPS` | Employee Pension Scheme (Employer) | `employer_contribution` | true |
| `PF_ADMIN_CHARGES` | PF Administrative Charges | `employer_contribution` | true |
| `EDLI` | EDLI Charges (Employer) | `employer_contribution` | true |
| `ESI_EMPLOYEE` | Employees' State Insurance (Employee) | `deduction` | false |
| `ESI_EMPLOYER` | Employees' State Insurance (Employer) | `employer_contribution` | true |
| `TDS` | Income Tax (TDS) | `deduction` | false |

`POST /hr/components/bootstrap` is already idempotent insert-if-missing-by-code, so an org that bootstrapped in Phase 1 simply re-runs it and gains the six new rows without touching its edited ones. `PF_EMPLOYEE`, `PF_EMPLOYER` and `PROFESSIONAL_TAX` already exist from Phase 1 and are **left alone** (their stale `value`/`calculation_type` become inert — §5.9 documents this).

### 4.11 `payroll_settings` additions — registry **#47–#50**

| Column | Type | Default | Registry # |
|---|---|---|---|
| `tax_declaration_window_start_month` | INTEGER NOT NULL | `4` | 50 |
| `tax_declaration_window_end_month` | INTEGER NOT NULL | `1` | 50 |
| `tax_proof_deadline_month` | INTEGER NOT NULL | `2` | 50 |
| `tax_proof_deadline_day` | INTEGER NOT NULL | `28` | 50 |
| `default_tax_regime` | ENUM(`old`,`new`) NOT NULL | `new` | 50 |
| `allow_employee_regime_switch` | BOOLEAN NOT NULL | `true` | 50 |
| `pt_state_source` | ENUM(`work_location`,`profile_state`) NOT NULL | `work_location` | 49 |
| `tds_monthly_rounding` | ENUM(`none`,`nearest_rupee`,`nearest_ten`) NOT NULL | `nearest_rupee` | 50 |

CHECKs: all month columns `BETWEEN 1 AND 12`; `tax_proof_deadline_day BETWEEN 1 AND 31`.

The declaration window may **wrap the year end** (April → January is the normal Indian cycle), so the window test is `startMonth <= endMonth ? (m >= start && m <= end) : (m >= start || m <= end)`. That branch is a named pure function in `tax_period.utils` with its own test — it is the single most commonly mis-implemented line in this feature.

Registry #47 (PF) and #48 (ESI) document `statutory_configs` fields, not `payroll_settings` fields; they still belong in `org_settings_registry.md` because they are org-configurable decisions, and the registry's rule is about decisions, not about which table holds them.

### 4.12 Migration hygiene

* `down()` reverses in exact inverse order, drops the three `payroll_settings` enum types, the seven tables' enum types, and restores `payroll_runs.engine_version` default to `3`.
* `down()` removes all 12 `payroll_run_items` columns, `salary_components.is_hra`, and both `employee_salary_structure_components` columns.
* Enum types to drop with `CASCADE`: `enum_statutory_configs_*` (none — the config table has no enums), `enum_professional_tax_slabs_gender`, `enum_tax_regimes_code`, `enum_tax_slabs_age_band`, `enum_investment_declarations_status`, `enum_investment_declaration_items_proof_status`, `enum_employee_tax_summaries_tax_regime`, `enum_employee_tax_summaries_regime_source`, `enum_payroll_settings_default_tax_regime`, `enum_payroll_settings_pt_state_source`, `enum_payroll_settings_tds_monthly_rounding`.
* **Verify both directions:** `db:migrate` → `db:migrate:undo` → `db:migrate`.

---

## 5. Core Logic

### 5.1 `tax_period.utils.js` (pure) and the `addMonths` move

```
financialYearOf(periodMonth, fyStartMonth)          // '2026-07', 4 → '2026-27'
fyMonths(financialYear, fyStartMonth)               // → ['2026-04', …, '2027-03']
monthIndexInFy(periodMonth, financialYear, start)   // 0-based
monthsRemainingInFy(periodMonth, financialYear, s)  // INCLUDING the current month
isLastMonthOfFy(periodMonth, financialYear, start)
esiContributionPeriod(periodMonth)                  // → { start: 'YYYY-04'|'YYYY-10', end, label }
isDeclarationWindowOpen({ today, settings, financialYear, fyStartMonth })
proofDeadlineFor(financialYear, settings, fyStartMonth)   // → 'YYYY-MM-DD'
ageBandAt(dob, asOfDate)                            // → 'below_60' | '60_to_79' | '80_plus' | null
```

* **All month arithmetic is string arithmetic on `'YYYY-MM'`.** No `Date` object, no timezone — the Phase-2 §2 item 9 rule holds unchanged.
* **ESI contribution periods are hard constants: April–September and October–March.** They are statutory and not org-configurable, and they are **independent of `financial_year_start_month`** — an org that sets a January FY still has April/October ESI periods. Encoding them as a setting would invite an org to set them wrong.
* `ageBandAt` uses the FY-end date (31 March equivalent) as the reference, per the Act. A NULL `dob` returns `null`; §5.5 falls back to `below_60` and records `DOB_MISSING_AGE_BAND_ASSUMED`.

**The `addMonths` move (§2 item 9).** `addMonths` and a new `monthsBetween` are added to `payroll_period.utils.js`; `loan_schedule.utils.js` changes its local definition to `const { addMonths } = require('./payroll_period.utils')` and keeps `module.exports = { buildSchedule, addMonths }` unchanged. `loan_schedule.test.js` must still pass untouched — that is the proof the move is behaviour-preserving.

### 5.2 `statutory_pf.utils.js` (pure) — **EC-18**

```
computePf({ pfApplicableEarningsPaise, payableDays, divisorDays, config })
  → { pf_wage, pf_employee, pf_employer_total, eps, epf_employer, admin_charges, edli, trace }
```

1. **Ceiling proration.** `effectiveCeiling = config.pf_lop_reduces_ceiling ? scaleByDays(ceiling, payableDays, divisorDays) : ceiling`.
2. **PF wage.** `pf_restrict_to_ceiling ? min(earnings, effectiveCeiling) : earnings`. **EC-18 in both directions.**
3. `pf_employee = percentOfPaise(pf_wage, pf_employee_rate)`.
4. `pf_employer_total = percentOfPaise(pf_wage, pf_employer_rate)`.
5. `eps = eps_enabled ? percentOfPaise(min(pf_wage, prorated eps_wage_ceiling), eps_rate) : 0`, then **`eps = min(eps, pf_employer_total)`** — the pension share is carved out of the employer share, never added to it, and a misconfigured `eps_rate > pf_employer_rate` must not manufacture money. The CHECK constraint in §4.1 makes this unreachable; the clamp is the second lock.
6. `epf_employer = pf_employer_total − eps`.
7. `admin_charges = max(percentOfPaise(pf_wage, pf_admin_charge_rate), pf_admin_charge_min)`; `edli = edli_enabled ? percentOfPaise(min(pf_wage, prorated edli_wage_ceiling), edli_rate) : 0`.
8. **Invariant asserted before returning:** `eps + epf_employer === pf_employer_total`, exactly, in paise. Throws `PF_SPLIT_RECONCILIATION_FAILED`.

`trace` records every input and intermediate so `statutory_snapshot` can explain the figure.

### 5.3 `statutory_pt.utils.js` (pure)

```
resolvePtState({ profile, locationStateById, settings })   → { state_code, source } | { state_code: null, reason }
computePt({ monthlyGrossPaise, stateCode, gender, periodMonth, slabs }) → { amount, slab_id, trace }
```

* **State resolution chain** (order fixed by `payroll_settings.pt_state_source`):
  * `work_location` → `locationStateById.get(profile.location_id)` → fall back to `profile.state` → fall back to `null`.
  * `profile_state` → `profile.state` → fall back to the location → fall back to `null`.
  * The resolved code is **normalised** (uppercase, trimmed, spaces collapsed) on both sides before matching, so `"Maharashtra"` and `"maharashtra"` resolve identically. Slab rows store `state_code`; the service also matches `state_name` case-insensitively as a fallback so an org that typed a full state name on the profile still resolves.
* **Slab selection:** active slabs for the state, filtered by `gender ∈ { any, employee gender }`, where `from_amount <= gross` **and (`to_amount IS NULL` or `gross < to_amount`)** — the half-open rule of §4.2. Ties (a misconfigured overlap that survived the §7.2 set validation) resolve to the **highest `from_amount`**, deterministically.
* **`month_overrides`** is consulted with the period's calendar month number as the key; a hit replaces `monthly_amount` entirely.
* **Unresolvable state, or no matching slab, while `pt_enabled` is true** → returns `{ amount: 0, unresolved: true }`. §5.7 turns that into the item warning `PT_STATE_UNRESOLVED` — **a warning, not an error**. Blocking a whole payroll run because one employee's profile lacks a state would be disproportionate; `#37 eligibility` and `#42 preview` both surface `pt_unresolved_count` so HR sees it before approving.
* **The PT base is the month's payable gross** (post-LOP, post-proration, including adjustment earnings and overtime), which is what every state's slab is written against.

### 5.4 `statutory_esi.utils.js` (pure) — **EC-19**

```
computeEsi({ esiApplicableEarningsPaise, overtimePaise, priorState, config })
  → { covered, assessed_this_month, esi_wage, esi_employee, esi_employer, trace }
```

`priorState` is `{ has_prior_item_in_period, was_covered_in_period }`, supplied by the aggregator (§5.6) for the **current ESI contribution period only**.

The rule, in the order it must be evaluated:

1. `!config.esi_enabled` → `{ covered: false, … zeros }`.
2. **`priorState.was_covered_in_period === true` → covered, unconditionally.** This is EC-19: an employee whose wages cross the threshold mid-period **continues** contributing until the period ends, on their **actual** wage, not the capped one.
3. `priorState.has_prior_item_in_period === false` (this is the employee's first payroll month inside this contribution period — a joiner, or the period's first month) → covered iff `esi_eligibility_wage <= config.esi_wage_threshold`.
4. Otherwise (a prior month existed and was *not* covered) → **not covered**, even if wages have since dropped below the threshold. Coverage is assessed at entry to the contribution period, not monthly.

**Two distinct wage figures, and conflating them is the classic bug:**
* `esi_eligibility_wage` = Σ(ESI-applicable earnings) **excluding overtime and excluding periodic-bonus adjustments** — see below.
* `esi_contribution_wage` = Σ(ESI-applicable earnings) **including overtime** when `config.esi_include_overtime`, and **excluding periodic-bonus adjustments** — overtime *is* wages once someone is covered.

> **Periodic bonuses are excluded from ESI wages entirely (EC-45).** Phase 3 adjustments carry their own `esi_applicable` snapshot flag, so an HR user creating a bonus with that flag set would, under a naive Σ, do two harmful things at once: inflate the contribution, and — far worse — push the employee's **eligibility wage** over ₹21,000 for that one month, which rule 3 above then reads as "assessed out", **dropping their ESI coverage for the remainder of the contribution period**. A single annual bonus would silently de-insure someone for up to six months.
>
> Under the ESI Act, a bonus paid at intervals exceeding two months is not "wages". The engine therefore excludes any earning line with `source: 'adjustment'` whose originating adjustment `category ∈ { bonus, incentive }` from **both** ESI figures, regardless of the flag on the adjustment row. The exclusion is driven by `category`, not by the flag, because the flag is HR-editable and this rule is statutory. `ad_hoc_earning` and `arrear` adjustments remain included — they are ordinary wages paid late, not periodic bonuses.
>
> This requires the adjustment's `category` to reach the engine. §5.7 step 1 reads it from the component line's `source_ref_id` → the `adjustments` array already passed into `computePayrollItem` by Phase 3, so **no new query and no schema change** is needed; the aggregator simply carries `category` through in the context.

`esi_employee = percentOfPaise(esi_contribution_wage, esi_employee_rate)`, `esi_employer = percentOfPaise(esi_contribution_wage, esi_employer_rate)`. Employee ESI is conventionally rounded **up** to the next rupee and employer ESI **down**; this engine rounds both half-up to the paise like everything else and records the choice in the trace — see §11 item 7.

### 5.5 `tax_projection.utils.js` (pure) — the annual liability

```
projectAnnualTax({ regime, slabs, ageBand, income, exemptions, deductions, config })
  → { taxable_income, tax_before_rebate, rebate_87a, surcharge, marginal_relief,
      cess, total_liability, trace }
```

**Income assembly (the caller supplies these; this function does no I/O):**

```
gross_taxable        = ytd_taxable + current_month_taxable
                     + projected_monthly_taxable × months_after_current
                     + previous_employer_taxable
hra_exemption        = regime.allows_hra_exemption ? rule2A(...) : 0
professional_tax     = ytd_pt + projected_pt_remaining + previous_employer_pt   // Section 16(iii)
standard_deduction   = regime.standard_deduction
epf_auto_80c         = ytd_pf + current_month_pf
                     + projected_monthly_pf × months_after_current
                     + previous_employer_pf                                     // §5.5a
chapter_via          = regime.allows_chapter_via
                       ? Σ per-section min(declared_or_verified + injected, cap)
                       : 0
taxable_income       = roundNearestTen(                                         // Section 288A
                         max(0, gross_taxable − hra_exemption − standard_deduction
                                              − professional_tax − chapter_via))
```

* **`projected_monthly_taxable` comes from the employee's currently-effective approved salary structure**, not from an average of actuals. Rationale: future LOP is unknowable, and projecting from a month that happened to contain unpaid leave would under-withhold and then whip-saw the employee in March. Documented on the projection response as `projection_basis: 'structure_monthly_taxable'`.
* **Rule 2A HRA exemption** = `max(0, min(actual HRA received for the year, max(0, rent_paid_annual − 10% × hra_base), (is_metro ? 50% : 40%) × hra_base))`, where **`hra_base` = Σ(pf_applicable earning components)**. Basic + DA + retaining allowance is exactly the PF wage definition and exactly the Rule 2A base, so no new flag is needed — this is documented in the module header so nobody "fixes" it later. `hra_base` is annualised the same way as taxable income. Missing HRA declaration, or `is_hra` unresolved → exemption 0, trace records `HRA_EXEMPTION_NOT_CLAIMED` / `HRA_COMPONENT_UNRESOLVED`.

  > **Both clamps are mandatory, and the inner one is the load-bearing one.** An employee who pays no rent, or rent below 10% of `hra_base`, makes the middle leg **negative**. A bare `min()` selects it, and `gross_taxable − hra_exemption` then *increases* taxable income above gross — the engine would invent income. The outer `max(0, …)` is defence in depth against any future leg turning negative. Rule 2A's own language ("the excess of rent paid over 10% of salary") means the leg is nil, not negative, when rent is low.

* **Chapter VI-A** sums `investment_declaration_items` by `section`, adds the §5.5a auto-injections, applies `regime.chapter_via_limits[section]` as a per-section cap, and **ignores sections absent from the limits map** (a declared section with no configured cap contributes 0 and is traced as `SECTION_NOT_CONFIGURED` — never an uncapped deduction). The cap is applied **after** injection, so a ₹1.5L declarer with ₹60k of EPF still deducts exactly ₹1.5L, not ₹2.1L.
* **Slab tax:** walk the `(regime, age_band)` slab set ascending, accumulating `rate × (portion of taxable_income inside the bracket)` — slab tax is **marginal, not a single-bracket lookup**. Bracket membership uses the half-open rule of §4.2: `from_amount <= income AND (to_amount IS NULL OR income < to_amount)`. A band with no slabs falls back to `below_60` with `AGE_BAND_FALLBACK` in the trace.
* **Rebate 87A:** `taxable_income <= regime.rebate_87a_income_limit` → `rebate = min(tax_before_rebate, regime.rebate_87a_max_amount)`.
* **Surcharge with marginal relief:** for the highest applicable `surcharge_slabs` threshold `T` with rate `r`,
  `surcharge = percentOfPaise(tax_after_rebate, r)`, then
  `relief = max(0, (tax_after_rebate + surcharge) − (tax_at_T + (taxable_income − T)))`, and `surcharge -= relief`.
  Marginal relief is included because omitting it over-withholds by lakhs for a narrow but real income band, and because a payroll engine that gets ₹51 lakh wrong is not usable at all. Its own test case is mandatory.
* **Cess:** `percentOfPaise(tax_after_rebate + surcharge, config.cess_rate)`.
* **Statutory rounding (§288A / §288B) — two distinct roundings, both mandatory:**
  * **§288A** rounds `taxable_income` to the nearest ₹10 **before** the slab walk (shown in the block above). This is the larger of the two effects, because it moves the number that feeds the brackets.
  * **§288B** rounds the **final** `total_liability` to the nearest ₹10, *after* cess. `roundNearestTen` discards paise first, then moves to the nearest multiple of ten, per the section's own wording.
  Without §288B the last month's exact true-up (§5.6 step 2) forces the year's collected TDS to equal an unrounded figure, and Form 16 then reports a total that is not a multiple of ten — a form-level compliance defect. The magnitude is ≤ ₹9 per employee per year, which is why this is a correctness-of-presentation fix rather than a money bug, but it is nine lines of code and there is no reason to ship without it.
* **All arithmetic is integer paise.** The only division is inside `percentOfPaise`, `divRoundHalfUp` and `roundNearestTen`.

#### 5.5a Auto-injected Chapter VI-A contributions — **EC-44**

The employee's **own PF contribution is a §80C deduction** and is deducted by this engine, not declared by the employee. Nothing else in the system will inject it, so a projection that reads only `investment_declaration_items` under-deducts by up to the full ₹1.5L cap — roughly **₹46,800 of over-withholding per year** for an old-regime employee in the 30% bracket. That is the single largest arithmetic error this phase could ship.

`projectAnnualTax` therefore receives an `injections` map, assembled by §5.7 from the statutory context:

```
injections['80C'] = ytd_pf + current_month_pf
                  + projected_monthly_pf × months_after_current
                  + previous_employer_pf
```

* **`sub_category: 'EPF_AUTO'` is reserved** (§4.6) and rejected on #123, so the same rupee can never be counted twice.
* **`previous_employer_pf` is consumed here** — it is the only place that column is read, and it is why the column exists rather than being dead weight (it was unused in the first draft of this plan).
* **New-regime employees are unaffected**: `allows_chapter_via = false` zeroes `chapter_via` wholesale, injections included. Since `default_tax_regime` is `new`, the blast radius is old-regime electors — which is precisely the population that elects old *because* they have §80C deductions.
* The trace records `chapter_via.80C.declared`, `.injected` and `.capped` separately, so `#113` / `#120` can show an employee exactly why their 80C total is what it is without them wondering whether their PF was counted.

**Data this requires, which the aggregator must supply (§5.7, §5.8):** `ytdPf`, `projectedMonthlyPf` and `previousEmployer.pf`. `projected_monthly_pf` is derived from the **structure**, on the same basis as `projected_monthly_taxable` — run §5.2's PF computation against the structure's un-LOP'd monthly PF-applicable earnings, so a month with unpaid leave does not depress the projection.

### 5.6 `tds_monthly.utils.js` (pure) — **EC-20, EC-32, EC-41**

```
computeMonthlyTds({ annualLiability, ytdTdsDeducted, previousEmployerTds,
                    monthsRemainingIncludingCurrent, isLastMonthOfFy,
                    currentMonthTaxable, hasPan, config, rounding })
  → { amount, is_true_up, warnings, trace }
```

1. `remaining = annualLiability − ytdTdsDeducted − previousEmployerTds`.
2. `isLastMonthOfFy` → `raw = remaining` (**exact true-up** — this is what makes the parent's Form-16 reconciliation exit criterion achievable). Otherwise `raw = divRoundHalfUp(remaining, monthsRemainingIncludingCurrent)`.
3. **`raw < 0` → `0`**, with warning `TDS_OVERDEDUCTED_REFUND_AT_ITR`. **EC-41**: a regime switch or a late-verified deduction can make the year's liability lower than what has already been withheld. A negative TDS line is never emitted — payroll does not refund tax; the employee claims it at ITR. This is also why `ytdTdsDeducted` is never recomputed: it is a fact about money already remitted to the government.
4. **Section 206AA (EC-32):** `config.tds_no_pan_enforced && !hasPan` → `raw = max(raw, percentOfPaise(currentMonthTaxable, config.tds_no_pan_rate))`, warning `PAN_MISSING_206AA_APPLIED`.

   **Precedence against the true-up is explicit: 206AA wins.** In the final month, step 2 sets `raw = remaining` and step 4 may then raise it above `remaining`. That is correct — 206AA is a *floor on the deduction*, not a recomputation of the liability, and it applies to every payment including the last. The consequence is that a PAN-less employee's total withheld exceeds their computed liability, which is exactly what the section intends; the excess is recovered by the employee at ITR once a PAN is furnished. `is_true_up` stays `true` in the trace and `206AA_OVERRODE_TRUE_UP` is added to `warnings` so the payslip and Form 16 can explain the divergence.

5. Rounding per `tds_monthly_rounding`: `none` (paise), `nearest_rupee`, or `nearest_ten`. Applied last so the true-up in step 2 stays exact to the extent rounding permits, and the residue is absorbed by the same month.

   **This is a convention, not §288B.** §288B governs the *annual total* and is applied in §5.5; monthly TDS rounding is an operational preference. An earlier draft of this plan attributed §288B to this step — that attribution was wrong and must not reappear in the code comments. Note the interaction: with `nearest_ten` monthly **and** §288B annual rounding, the sum of twelve rounded monthly figures reconciles to the rounded annual figure because the final month is `remaining` (annual − Σ prior) and both endpoints are multiples of ten.

> **EC-20, stated precisely.** A regime switch changes `annualLiability` and nothing else. `ytdTdsDeducted` is derived from what was actually withheld in approved runs and is structurally immutable (D-27). The next run's TDS therefore self-corrects — upward if the new regime costs more, clamped at zero if it costs less. **No recomputation of past months, ever.**

### 5.7 `statutory_calculation.service.js` (pure) — the Step-7 composer

```
computeStatutory({ earningLines, ledger, window, settings, statutoryContext })
  → { lines[], figures, warnings, snapshot }        // throws AppError on an invariant breach
```

`statutoryContext` is assembled by the aggregator (§5.8) and contains: `config`, `ptSlabs`, `taxTables` (regimes + slabs for the FY), `employee` (`pan`, `dob`, `gender`, `state`, `location_id`), `regime`, `declarationItems`, `declarationBasis` (`declared` | `verified`), **`ytd` (`taxable`, `tds`, `pt`, `pf`)**, `esiPriorState`, **`previousEmployer` (`taxable`, `tds`, `pt`, `pf`)**, `projectedMonthlyTaxable`, `projectedMonthlyPt`, **`projectedMonthlyPf`**, `fy` (`financial_year`, `month_index`, `months_remaining`, `is_last_month`).

**`ytd.pf`, `previousEmployer.pf` and `projectedMonthlyPf` exist solely to feed §5.5a's §80C injection.** Omitting any of the three silently reverts the engine to the under-deduction bug that §5.5a exists to fix, and it fails *quietly* — the payslip still balances, the reconciliation asserts still pass, and only the employee's tax is wrong. §8 tests the injection explicitly for that reason.

**Order of operations (binding):**

1. **Bases.** From `earningLines` (structure + overtime + adjustment earnings, all post-LOP and post-proration), compute:
   * `pf_applicable_earnings` = Σ where `pf_applicable`, **excluding** the OT line unless `config.pf_include_overtime` (**D-25**);
   * `esi_applicable_earnings` and `esi_eligibility_earnings` per §5.4;
   * `pt_gross` = Σ of all earning lines;
   * `taxable_earnings` = Σ where `is_taxable`;
   * `hra_received` = Σ where the line's `is_hra` snapshot flag is true.
   **Lines whose `is_statutory` snapshot flag is true are excluded from every base and never contribute to gross** (§5.9), and each one emits `STATUTORY_STRUCTURE_LINE_IGNORED:{code}`.
2. **PF** (§5.2) → `PF_EMPLOYEE` deduction (order 1000); `PF_EMPLOYER` (1500), `EPS` (1510), `PF_ADMIN_CHARGES` (1520), `EDLI` (1530) as `employer_contribution`.
3. **ESI** (§5.4) → `ESI_EMPLOYEE` deduction (1010); `ESI_EMPLOYER` employer_contribution (1540).
4. **PT** (§5.3) → `PROFESSIONAL_TAX` deduction (1020).
5. **TDS** — `projectAnnualTax` (§5.5) then `computeMonthlyTds` (§5.6) → `TDS` deduction (1030).
6. **Zero-amount lines are not emitted.** A disabled head, or a covered-but-zero-wage employee, produces no component line at all — a payslip must not carry a ₹0 PF row that implies PF was computed.
7. **Assertions before returning:** every line amount `>= 0` (`INVALID_STATUTORY_AMOUNT`); the PF split reconciles (§5.2); `figures` matches the emitted lines exactly.

**Flags on every emitted statutory line (binding, so two implementers cannot choose differently):**

| Flag | Value | Why |
|---|---|---|
| `is_taxable` | `false` | A withholding is not an earning; taxability was already decided on the earnings that formed the base |
| `is_lop_applicable` | `false` | The base was already LOP-reduced; applying LOP again would double-count |
| `pf_applicable` · `esi_applicable` | `false` | A statutory line is never itself part of another statutory base |
| `is_part_of_ctc` | `true` for `employer_contribution`, `false` for `deduction` | Employer PF/ESI/EDLI/admin are real cost to company; an employee-side withholding is not additional cost |
| `component_id` | the catalog row's id when one exists (§4.10), else `null` | Provenance for Phase-6 report joins |

> **`ctc_cost` now exceeds `annual_ctc / 12`, and that is intended.** The Phase-2 engine computes `ctc_cost = gross + Σ(employer_contribution lines)` by `component_type`, so the new employer lines flow in automatically. But Phase 1's `annual_ctc` was evaluated over a structure that **cannot** contain statutory components (§5.9), so the two figures now legitimately differ: `annual_ctc` is the contracted package, `ctc_cost` is the true monthly employer outlay. This is a semantic change to a field Phases 2–3 already populate, and it must be documented in `combined_api_analysis.md` (§9 item 3) rather than left for a Phase-6 report author to discover and "correct".

> **`is_part_of_ctc` does not affect `ctc_cost`** — the engine sums by `component_type`, not by this flag. It is set correctly anyway because the flag is persisted on every component row and Phase-6 cost reports will read it.

`snapshot` is the JSONB written to `payroll_run_items.statutory_snapshot`:

```jsonc
{
  "v": 4,
  "config_updated_at": "…",
  "pf":  { "enabled": true, "wage": "15000.00", "ceiling_applied": true, "restricted": true, … },
  "esi": { "enabled": true, "covered": true, "reason": "continuation", "eligibility_wage": "…", "contribution_wage": "…" },
  "pt":  { "enabled": true, "state_code": "MH", "source": "work_location", "slab_id": "…", "month_override": false },
  "tax": { "financial_year": "2026-27", "regime": "new", "declaration_basis": "declared",
           "annual_liability": "…", "ytd_tds": "…", "months_remaining": 7, "is_true_up": false,
           "chapter_via": { "80C": "150000.00" }, "hra_exemption": "0.00",
           "surcharge": "0.00", "marginal_relief": "0.00", "cess": "…" },
  "warnings": ["PT_STATE_UNRESOLVED"]
}
```

**Display-order band 1000–1999 is reserved for statutory** and sits between structure lines (`< 1000`) and adjustment earnings (`8000+`), consistent with the Phase-3 comment block.

### 5.8 `payroll_statutory_aggregator.service.js` — **D-24**

The Phase-3 sibling pattern verbatim: read-only, batched, cohort-scoped, writes nothing.

**`prepareForRun({ orgId, periodMonth, settingsSnapshot })` — once per run, exactly 1 query:**

| Source | Read from | Notes |
|---|---|---|
| `statutory_configs` | **`settingsSnapshot.statutory.config`** | frozen at run CREATE |
| `professional_tax_slabs` | **`settingsSnapshot.statutory.pt_slabs`** | frozen at run CREATE |
| `tax_regimes` | **`settingsSnapshot.statutory.tax.regimes`** | frozen at run CREATE |
| `tax_slabs` | **`settingsSnapshot.statutory.tax.slabs`** | frozen at run CREATE |
| `organization_locations` | **live query** — the only one | `id → state` map, for §5.3 |

> **Rates come from the frozen snapshot; employee master data does not (§2 item 17).** An earlier draft of this plan had `prepareForRun` query all five sources live, which directly contradicted the freeze it was handed `settingsSnapshot` to honour — recalculating a run would silently have picked up a PF-rate edit made weeks later, breaking the reproducibility guarantee that §4.1's D-26 trade depends on. **Rates, ceilings, thresholds, caps and slabs are frozen.**
>
> **`organization_locations` is deliberately excluded from the freeze.** A location's `state` is employee master data, not a rate: if HR discovers an office was recorded in the wrong state, the fix must be reachable by recalculating the run. Freezing it would make a data-entry error permanently unfixable for that period — the opposite of the reproducibility the freeze exists to provide. The distinction to apply when extending this later: **freeze what an auditor must see unchanged; read live what an operator must be able to correct.**

**Building the frozen block.** `buildSettingsSnapshot(settings, statutoryConfig, ptSlabs, taxTables)` (§3.2) assembles `settings_snapshot.statutory` inside `payroll_run.service.create`. Volume is bounded and small: one config row, ≤ ~40 PT slab rows for a typical multi-state org, 2 regimes and ~20 slab rows for the FY — a few KB of JSONB, on the same order as the day ledger Phase 2 already stores per item. Both regimes' slabs are frozen, not just the org default, because employees choose regimes individually.

**Validation happens at CREATE, not at calculate.** `create` throws `422 TAX_TABLES_MISSING` when `income_tax_enabled` is true and no active regime or no slabs exist for the FY — so the misconfiguration is caught when HR creates the run, with nothing persisted, rather than after a cohort pass. `prepareForRun` re-asserts the block's presence and throws the same code if a run created before this phase (or a hand-edited snapshot) lacks it; the run service's existing `_markFailed` then produces a `failed` run naming the FY. Erroring 1,000 items identically would bury an org-wide misconfiguration, so it is never an item-level error.

**`aggregateForCohort({ orgId, cohort, periodMonth, fyContext })` — 3 queries per cohort:**

1. `investment_declarations` ⋈ `investment_declaration_items` — `user_id IN cohort`, `financial_year = fy`, **`submitted_at IS NOT NULL`**, `status != 'rejected'`.

   > **Visibility keys on `submitted_at`, not on `status` (EC-43).** A declaration that has ever been submitted stays visible to the engine even after HR reopens it to `draft` (#109). Keying on `status IN ('submitted',…)` — as an earlier draft of this plan did — would make an employee's entire ₹1.5L of §80C vanish from any run that calculates while their declaration is reopened for edits, spiking their TDS for that month. The over-withholding is only partly recoverable: later months clamp to zero (EC-41), but payroll never refunds, so a reopen late in the FY becomes a permanent over-deduction settled only at ITR. A **never-submitted** `draft` is still invisible — there is nothing to honour — and a `rejected` declaration is excluded outright.

2. `employee_tax_summaries` — `user_id IN cohort`, `financial_year = fy` (regime + **all four** previous-employer figures, including `previous_employer_pf` for §5.5a). A user with no row gets the org default regime and zeros; **the aggregator does not create rows** (it writes nothing).
3. **`payrollRunItemRepo.findStatutoryPeriodAggregates(orgId, cohort, { fyMonths, esiPeriodMonths, periodMonthExclusive })`** — one scan of `payroll_run_items ⋈ payroll_runs` with `run.status IN ('approved','paid')` and `period_month < periodMonth`, returning per user:
   * `SUM(taxable_earnings) FILTER (WHERE period_month IN fyMonths)` → `ytd_taxable`
   * `SUM(income_tax_amount) FILTER (…)` → `ytd_tds`
   * `SUM(professional_tax_amount) FILTER (…)` → `ytd_pt`
   * `SUM(pf_employee_amount) FILTER (…)` → **`ytd_pf`** — required by §5.5a's §80C injection. Omitting it does not fail loudly; it just under-deducts §80C for every old-regime employee
   * `COUNT(*) FILTER (WHERE period_month IN esiPeriodMonths)` → `esi_prior_item_count`
   * `BOOL_OR(esi_covered) FILTER (WHERE period_month IN esiPeriodMonths)` → `esi_prior_covered`

   Built on the exact shape of the existing `findCarryForwardBalances` ([payroll_run_item.repository.js](src/modules/payroll/repositories/payroll_run_item.repository.js)) — same `include`-with-`attributes: []` join, same `group`, same `raw: true`.

**Total: 1 once + 3 per cohort.** A 3,000-employee run moves from ~83 queries (P2+P3) to ~124 — still O(cohorts), never O(headcount). The once-per-run cost dropped from 5 to 1 when the rate tables moved into the frozen snapshot.

**Declaration basis (EC-21), decided here and passed to the pure engine:**
`declarationBasis = declaration.proof_deadline && compareDates(window.end, declaration.proof_deadline) >= 0 ? 'verified' : 'declared'`.
Before the deadline, an item contributes `declared_amount` unless `proof_status === 'rejected'` (then 0). On or after the deadline, it contributes `verified_amount ?? 0`. A NULL `proof_deadline` (never submitted) cannot occur here, because query 1 admits only declarations with `submitted_at IS NOT NULL` and submission freezes the deadline — the guard is written defensively anyway. **This needs no cron**: the basis is a pure function of the run's period and the frozen `proof_deadline`, so a February run automatically switches basis and the correction lands in that month's TDS. Phase 7's cron can add a *reminder*; it is not, and must not become, the correctness mechanism.

> **The deadline is a workforce-wide cliff, and HR must see it coming (EC-46).** On the first run at or after the proof deadline, **every** declaration HR has not yet verified drops to `verified_amount ?? 0` simultaneously. That is EC-21 behaving exactly as designed — an unverified claim is not a deduction — but if HR has 300 declarations still in `submitted`, 300 employees spike in the same payslip. `#37 eligibility` therefore reports `unverified_declaration_count` **and** `proof_deadline_passed` (§6.3), so the cliff is visible in the pre-run readiness check that HR already runs, weeks before it bites. Surfacing it is the whole mitigation; the arithmetic is not changed.

### 5.9 `is_statutory` components are never assignable — **D-23**

Enforced at three write points, all returning `422 STATUTORY_COMPONENT_NOT_ASSIGNABLE`:

* `salary_structure_template.service.addComponent` / `updateComponent`
* `employee_salary_structure.service._resolveComponents` (the `component_driven` branch)
* `salary_structure_template.service.resolveTemplateComponents` (defensive — catches a template built before this guard existed)

And one read-side guard: **`computeStatutory` drops any earning/deduction line whose `is_statutory` snapshot flag is true** before computing bases, emitting `STATUTORY_STRUCTURE_LINE_IGNORED`. Both are needed. The write guard prevents new bad data; the read guard protects the arithmetic from any structure approved before the guard shipped — and without it, an org that had activated `PF_EMPLOYEE` and put it in a structure would be double-deducting PF from the moment Phase 4 goes live, silently, at 12% of basic.

> **What happens to the Phase-1 statutory catalog rows.** `PF_EMPLOYEE` carries `calculation_type: 'percent_of_basic', value: 12` from the Phase-1 bootstrap. Those numbers are now **inert** — the engine reads `statutory_configs`, never the catalog row. The catalog row survives as a label (`component_name`), a display order and a provenance FK (`component_id` on the emitted line, so Phase-6 reports can join). §7.1 activates these rows when the head is enabled, purely so the catalog reflects reality; activation grants no assignability.

### 5.10 Engine wiring — `computePayrollItem` Step 7

One new optional input, one new block, placed **after** the `realEarningLines` / `grossPaise` snapshot and **before** the Step-8b adjustment-deduction block:

```js
// Step 7 — statutory (Phase 4). Occupies the slot Phase 3 reserved between 8a and 8b.
let statutory = null
if (statutoryContext) {
  statutory = computeStatutory({ earningLines: realEarningLines, ledger, window, settings, statutoryContext })
  components.push(...statutory.lines)
  warnings.push(...statutory.warnings)
}
```

Because `baseDeductionsPaise` is summed from `components` **after** both this block and the 8b block, statutory deductions are automatically included in `netSoFarPaise` and therefore take priority over loan EMI (8c) and carry-forward recovery (8d). No other line of the existing engine moves.

`grossPaise` is unaffected: statutory lines are `deduction` and `employer_contribution` only, and `realEarningLines` was already captured.

The returned `item` gains the 12 §4.8 figures plus `statutory_status`:
`statutoryContext == null` → `'not_applied'`; context present with every head disabled → `'disabled'`; otherwise `'applied'`.

**Backwards compatibility is a hard requirement and a test:** omitting `statutoryContext` must reproduce Phase-3 output byte-for-byte for every money figure. The existing `payroll_calculation.test.js` assertions must pass **unchanged**.

**`STATUTORY_EXCEEDS_NET` (EC-36).** When statutory deductions alone drive the raw net below zero, the Phase-3 machinery already handles it — `clamp_and_carry_forward` emits `NET_PAY_SHORTFALL_CARRIED`, `block` produces an `error` item. Phase 4 adds only the warning so the payslip and the preview name the cause. Carrying a *statutory* shortfall forward is unusual; it is surfaced loudly rather than redesigned, and `#42 preview` reports `statutory_shortfall_count` so HR can act before approving.

---

## 6. API Surface

Envelope, controller class/singleton style, `try/catch → next(error)`, the leave `validate` wrapper, and the auth stacks (`hrAuth` = `['hr']`, `selfAuth`) are **all unchanged**. Phase 4 introduces no new role list; D-14's tenant-plane-only rule holds.

> **D-28 — Phase 4 adds no manager endpoints.** Tax and declaration data — landlord PAN, rent paid, insurance policies, previous-employer income — is materially more sensitive than "what is this person paid", which is what D-8 grants a manager. This mirrors the Phase-1 §4.6 decision to withhold bank details from managers even though D-8 grants compensation visibility. Statutory *figures* still reach a manager through the existing, already-gated payslip endpoints (#53/#54) as ordinary component lines; declaration **detail** does not, ever. `payroll_manager.routes.js` is not touched by this phase.

**Route-order rules (§2 item 20):** register `/tax/bootstrap`, `/tax/regimes*`, `/tax/declarations*` before `/tax/financial-years/:financialYear/*`; register `/employees/:userId/tax/summary|regime|previous-employer|projection` before `/employees/:userId/tax/form16/:financialYear` and `/employees/:userId/tax/financial-years/:financialYear/*`.

### 6.1 HR — `/api/v1/payroll/hr` *(`hrAuth`)* — Tier C

| # | Method | Path | Notes |
|---|---|---|---|
| 95 | GET | `/statutory/config` | Lazy `getOrCreate`. Returns `updated_at` and `updated_by` |
| 96 | PUT | `/statutory/config` | Partial update, audit-logged old→new. Response **names every live `draft`/`calculated` run whose frozen snapshot predates this edit** and states that they must be cancelled and re-created to pick it up (§2 item 17). Enabling a head activates its catalog rows (§7.1) |
| 97 | GET | `/statutory/pt-slabs` | Filters `state_code`, `is_active` — **validate in controller** |
| 98 | PUT | `/statutory/pt-slabs/states/:stateCode` | **Replace a state's whole slab set atomically.** Validates contiguity/overlap over the submitted set (§7.2). `422 PT_SLAB_RANGE_INVALID` naming the gap or overlap |
| 99 | DELETE | `/statutory/pt-slabs/states/:stateCode` | Deactivates the state's set. Never hard-deletes |
| 100 | POST | `/tax/bootstrap` | `{ financial_year }` — **idempotent** seed of the §3.1 `payroll_tax_defaults` regimes + slabs for that FY. Inserts only missing `(financial_year, code)` pairs, never overwrites an edited regime; returns `{ created[], skipped[] }`. Audit-logged |
| 101 | GET | `/tax/regimes` | `?financial_year=` — regimes with their slab counts |
| 102 | PUT | `/tax/regimes/:id` | Rates, caps, standard deduction, rebate, surcharge, `is_default`. Setting `is_default` clears the sibling in one transaction |
| 103 | GET | `/tax/regimes/:id/slabs` | Grouped by `age_band` |
| 104 | PUT | `/tax/regimes/:id/slabs` | **Replace the whole set** for one or more age bands atomically; same contiguity validation. `422 TAX_SLAB_RANGE_INVALID` |
| 105 | GET | `/tax/declarations` | The verification queue. Filters `financial_year`, `status`, `user_id`, `proof_status`; paginated |
| 106 | GET | `/tax/declarations/:id` | Header + items + the employee's current regime |
| 107 | POST | `/tax/declarations/:id/verify` | `{ items: [{ item_id, verified_amount, proof_status, proof_reference?, verifier_remarks? }], remarks? }`. `proof_reference` lets HR record the receipt/policy number it verified against — without it, that column is unwritable after submission. Sets the header to `verified` when every item is `verified`, `partially_verified` otherwise. §7.3 |
| 108 | POST | `/tax/declarations/:id/reject` | `rejection_reason` required. Every item → `verified_amount = 0`, `proof_status = 'rejected'`. §7.3 — **takes the same advisory lock as verify** |
| 109 | POST | `/tax/declarations/:id/reopen` | Returns it to `draft` so the employee can edit. Only while the declaration window is open; `reason` required; increments `reopened_count`. **`submitted_at` and `proof_deadline` are preserved**, so the declaration stays visible to the engine throughout the edit (EC-43) and existing verification survives (§7.3a). §7.3 |
| 110 | GET | `/employees/:userId/tax/summary` | `?financial_year=` — regime, previous-employer figures, **derived** YTD actuals, declaration status, finalization state |
| 111 | PUT | `/employees/:userId/tax/regime` | HR override. `regime_source = 'hr'`. Blocked when `is_finalized` (`409 FINANCIAL_YEAR_FINALIZED`) |
| 112 | PUT | `/employees/:userId/tax/previous-employer` | Form 12B figures (**EC-33**). Blocked when `is_finalized` |
| 113 | GET | `/employees/:userId/tax/projection` | `?financial_year=&as_of_period=` — the full §5.5 trace, **persists nothing**. The "why is my TDS this number" endpoint |
| 114 | GET | `/employees/:userId/tax/form16/:financialYear` | Part-B dataset. Returns the frozen `form16_snapshot` when finalized, otherwise a live assembly marked `is_provisional: true` |
| 115 | PUT | `/employees/:userId/tax/form16/:financialYear/part-a` | `{ ack_number, issued_on, reference_url? }` — **D-29**, reference only, no file |
| 116 | POST | `/employees/:userId/tax/financial-years/:financialYear/finalize` | One employee. §7.5 |
| 117 | POST | `/tax/financial-years/:financialYear/finalize` | Org-wide, cohort-batched, resumable, per-employee error isolation. §7.5 |
| 118 | GET | `/tax/financial-years/:financialYear/statutory-summary` | Org-wide month-by-month totals: PF employee/employer/EPS, ESI employee/employer, PT, TDS, headcounts. The challan-preparation view. Aggregated from approved/paid items only |

### 6.2 Self — `/api/v1/payroll` (under `/me`) *(`selfAuth`)*

| # | Method | Path | Notes |
|---|---|---|---|
| 119 | GET | `/me/tax/summary` | `?financial_year=` — regime, YTD TDS/PF/ESI/PT, declaration status, projected annual liability, remaining monthly TDS |
| 120 | GET | `/me/tax/projection` | The same §5.5 trace as #113, for oneself, with the §11 item 9 limitations stated in the payload |
| 121 | GET | `/me/tax/monthly` | `?financial_year=` — month-by-month TDS / PF / ESI / PT from approved runs. The annual tax statement's data half |
| 122 | GET | `/me/tax/declarations` | `?financial_year=` — own declaration + items + window state + `proof_deadline` |
| 123 | PUT | `/me/tax/declarations` | **Upsert the whole item set** for the FY while `draft` and the window is open. Replace-set, not per-item CRUD — the whole declaration is one decision. Verification on unchanged items is **preserved** (§7.3a); `sub_category: 'EPF_AUTO'` is rejected (§4.6). §7.3 |
| 124 | POST | `/me/tax/declarations/submit` | `draft` → `submitted`. Freezes `proof_deadline` **on first submission only**. `409 DECLARATION_NOT_DRAFT` on retry. §7.3 |
| 125 | PUT | `/me/tax/regime` | Employee choice. `403 REGIME_SWITCH_NOT_ALLOWED` when `allow_employee_regime_switch` is off; `409 FINANCIAL_YEAR_FINALIZED` after finalization |
| 126 | GET | `/me/tax/form16/:financialYear` | Own Part-B dataset. `404` until the FY is finalized — an employee must never receive a provisional Form 16 |
| 127 | PUT | `/me/tax/declarations/proofs` | **Record proof references after submission, without a reopen.** `{ items: [{ item_id, proof_reference }] }` → sets `proof_reference` and `proof_status = 'submitted'` on the employee's own items. Allowed while `status IN ('submitted','under_review')` and the declaration is not `rejected`; **never** touches `declared_amount`, `verified_amount` or the header status. §7.3 lock |

> **Why #127 exists.** Without it the `proof_reference` column is unwritable by anyone after submission: #123 is gated on `draft`, and an earlier draft of #107 had no `proof_reference` field. That left the parent's requirement — *"employee submits, HR verifies proofs"* — with no proof-recording path at all, and forced HR to reopen a declaration to `draft` (#109) just to let an employee attach a receipt number, which is exactly the transition EC-43 shows is hazardous. #127 makes the reopen unnecessary for the common case; #109 remains for genuine amendments to the *claim*.
>
> The **document** is still Phase 5's problem (D-29). #127 records the reference; Phase 5 adds the attachment FK over the same row.

### 6.3 Extended existing endpoints (no new numbers)

| # | Endpoint | Addition |
|---|---|---|
| 37 | `GET /hr/runs/eligibility` | `statutory: { config_updated_at, pf_enabled, esi_enabled, pt_enabled, income_tax_enabled, tax_tables_present, missing_pan_count, pt_unresolved_count, unsubmitted_declaration_count, `**`unverified_declaration_count`**`, `**`proof_deadline`**`, `**`proof_deadline_passed`**`, previous_employer_unrecorded_count }`. The three added fields are the **EC-46 cliff warning**: they let HR see, weeks ahead, how many declarations will drop to a zero basis on the first run at or after the proof deadline |
| 42 | `GET /hr/runs/:id/preview` | `statutory: { pf_employee_total, pf_employer_total, eps_total, esi_employee_total, esi_employer_total, pt_total, tds_total, esi_covered_count, pt_unresolved_count, statutory_shortfall_count, pan_missing_count }` |
| 44 | `GET /hr/runs/:id/items/:itemId` | The 12 figures + `statutory_snapshot` |
| 53–56 | Payslip list & detail (manager + self) | `income_tax_amount` on the list row; a `statutory` block and version-aware `statutory_note` on the detail. **`statutory_snapshot` is NOT exposed on the self/manager payslip** — it is HR-facing diagnostics containing declaration-derived figures |

---

## 7. Transactional Behaviour

Unmanaged transactions only, `if (!t.finished) await t.rollback()`. Every state transition writes `payroll_audit_logs` **inside its own transaction**.

### 7.0 Lock ordering (extends the Phase-3 §7.1 total order)

```
1. payroll:run:{orgId}:{period_month}
2. payroll:lock:{orgId}
3. payroll:loan:{userId} / payroll:structure:{userId} / payroll:tax:{userId}:{fy}
4. row locks (FOR UPDATE), parents before children
```

Phase 4 introduces no cross-rank cycle: **no Phase-4 writer takes the run advisory lock at all** (§7.6), so ranks 1–2 are never held with a rank-3 lock.

> **`payroll:tax:{userId}:{fy}` is the *only* Phase-4 lock, and every writer that touches one employee's tax state takes it.** That means all of: declaration upsert (#123), submit (#124), verify (#107), reject (#108), reopen (#109), regime switch (#111/#125), previous-employer entry (#112), Part-A record (#115) and **per-employee finalization (#116, and each employee inside #117)**.
>
> An earlier draft of this plan gave finalization an org-scoped `payroll:tax_year:{orgId}:{fy}` lock instead. That was wrong for a reason worth recording: a per-user mutation guarded by an org-scoped key does **not** mutually exclude the per-user writers, so a regime switch could commit between finalization's read of `tax_regime` and its write of `form16_snapshot` — producing a frozen Form 16 computed under a regime the row no longer claims. The `FOR UPDATE` on the summary row prevents corruption *of that row*, but not that stale read. **One lock key per employee-FY closes it.** The org-scoped key is dropped entirely; #117 needs no lock of its own because it is a loop over individually-locked, idempotent operations.

### 7.1 Statutory config update (#96)

Single short transaction: load `getOrCreate` `FOR UPDATE` → validate → update → **activate the catalog rows for every newly-enabled head** (`pf_enabled` → `PF_EMPLOYEE`, `PF_EMPLOYER`, `EPS`, `PF_ADMIN_CHARGES`, `EDLI`; `esi_enabled` → `ESI_EMPLOYEE`, `ESI_EMPLOYER`; `pt_enabled` → `PROFESSIONAL_TAX`; `income_tax_enabled` → `TDS`) by `code` + `is_system` + `is_statutory`, creating none — **disabling a head does NOT deactivate its catalog rows**, because a historical payslip's component line joins to them → audit `statutory_config.updated` with old→new → commit.

Then, **outside the transaction and read-only**, list the org's `draft`/`calculated` runs whose `settings_snapshot` predates this edit and return them in the response as `affected_runs[]` with the explicit instruction that recalculation will **not** pick up the change. This is the mitigation for D-26's accepted trade, and it must be in the response body, not only in documentation.

### 7.2 Slab-set replacement (#98, #104)

Both are **replace-the-whole-set, one transaction, all-or-nothing**:

1. Validate the submitted set **in memory, before any write**, against the half-open `[from, to)` convention of §4.2:
   * every `from_amount < to_amount` (or `to_amount` NULL);
   * sorted ascending by `from_amount`, **`next.from_amount === prev.to_amount` exactly** — not `prev.to_amount + 0.01`. This is the whole point of the half-open convention: with exact equality the ranges tile `[0, ∞)` with no gap and no overlap, and a gross carrying paise always lands in exactly one bucket;
   * exactly one range with `to_amount = NULL`, and it is the last;
   * `from_amount` of the first range is `0`.
   Failure → `422 PT_SLAB_RANGE_INVALID` / `TAX_SLAB_RANGE_INVALID` naming the offending **pair** and the gap or overlap amount, so the operator can see which boundary is wrong rather than being told the set is bad.
2. Soft-delete the existing rows for that `(org, state)` / `(org, regime, age_band)`.
3. Insert the new set.
4. Audit with the full old and new sets.

A partial slab set is worse than none — it silently under-charges an income band — so partial application is never possible.

### 7.3 Declaration lifecycle (#123, #124, #107, #108, #109)

**Every one of the five takes `payroll:tax:{userId}:{fy}` and loads the declaration `FOR UPDATE`.** They all mutate the same aggregate — the header status, `total_declared` / `total_verified`, and the item set — so guarding only two of them (as an earlier draft did) leaves the others free to interleave. The concrete race that opens: an employee's second #123 reads `status = 'draft'` before their #124 commits, both proceed, and the item set changes *after* `total_declared` was computed and `proof_deadline` frozen — a declaration whose header no longer describes its own items.

**Upsert (#123)** — one transaction: lock → load `FOR UPDATE` (creating the row on first call with `proof_deadline = NULL`) → `status === 'draft'` else `409 DECLARATION_NOT_DRAFT` → window open else `422 DECLARATION_WINDOW_CLOSED` → reject any item carrying the reserved `sub_category: 'EPF_AUTO'` (§4.6) → **replace the item set under the §7.3a preservation rule** → recompute `total_declared` and `total_verified` → audit → commit.

**Submit (#124)** — one transaction: lock → load `FOR UPDATE` → `status === 'draft'` else `409 DECLARATION_NOT_DRAFT` (idempotent against a double-click) → window open else `422 DECLARATION_WINDOW_CLOSED` → recompute `total_declared` from items → **freeze `proof_deadline` only if it is still NULL** (a re-submission after a reopen keeps the original deadline — §4.5) → `status = 'submitted'`, set `submitted_at` **if not already set** → audit → commit.

**Verify (#107)** — one transaction: lock → load `FOR UPDATE` → `status IN ('submitted','under_review')` else `409 DECLARATION_NOT_VERIFIABLE` → every submitted `item_id` must belong to this declaration (`403` otherwise, never `404` — the enumeration rule) → `verified_amount <= declared_amount` else `422 VERIFIED_EXCEEDS_DECLARED` (HR may verify less, never more — the declared figure is the employee's claim and the ceiling) → update items, **including the optional `proof_reference`** → recompute `total_verified` → set the header status → audit with the per-item deltas → commit.

**Reject (#108)** — one transaction: lock → load `FOR UPDATE` → `status IN ('submitted','under_review')` else `409 DECLARATION_NOT_VERIFIABLE` → `rejection_reason` required → every item `verified_amount = 0`, `proof_status = 'rejected'` → `total_verified = 0` → `status = 'rejected'` → audit → commit. A `rejected` declaration is excluded from §5.8 query 1 outright, so the next run computes TDS with no Chapter VI-A at all.

**Reopen (#109)** — one transaction: lock → load `FOR UPDATE` → `status != 'draft'` else `409 DECLARATION_ALREADY_DRAFT` → window open else `422 DECLARATION_WINDOW_CLOSED` → `reason` required → `status = 'draft'`, increment `reopened_count`, set `reopened_by/at` → **`submitted_at` and `proof_deadline` are left untouched** (§4.5, EC-43) → audit → commit. Verification already recorded on items is **preserved**, not cleared — see §7.3a.

**Concurrency:** all five serialise on the one advisory lock. Two HR users verifying the same declaration: the second sees the updated status and either proceeds (still `under_review`) or is refused. An employee editing while HR verifies is impossible, because the two require mutually exclusive statuses *and* now hold the same lock while checking. No partial verify is ever visible, because the whole set moves in one transaction.

### 7.3a Item-set replacement must not destroy verification (**EC-47**)

`#123` replaces the whole item set, and after a reopen that set may contain items HR has already verified. Silently discarding a verifier's work — or silently keeping a `verified_amount` against an amount the employee has since changed — are both unacceptable. The rule, applied inside #123's transaction:

| Case | Behaviour |
|---|---|
| Item present in the new set, `declared_amount` **unchanged** | Row is updated in place. `verified_amount`, `proof_status`, `proof_reference` and `verifier_remarks` are **preserved** |
| Item present, `declared_amount` **changed** | Row is updated; `verified_amount` → NULL, `proof_status` → `pending`, `verifier_remarks` cleared. The claim changed, so the verification no longer applies |
| Item **absent** from the new set but previously `verified` | `422 CANNOT_REMOVE_VERIFIED_ITEM` naming the item. Removing a verified claim is a decision for HR (via #107 setting it to zero), not a side effect of an employee's edit |
| Item absent and never verified | Soft-deleted |
| Item new | Inserted with `proof_status: 'pending'` |

Matching is by `item_id` when the client echoes it back, and by `(section, sub_category)` otherwise. `total_declared` and `total_verified` are recomputed from the surviving set in the same transaction, so the header can never drift from its items.

**Verification does not touch any run.** The effect reaches payroll on the next calculation, through the aggregator. **EC-35** — verifying less than was declared after TDS was already withheld on the declared basis needs no correction step: the next month's projection recomputes the annual liability from the new basis and the remaining months absorb the difference. That self-correction is the whole reason the projection is recomputed every month rather than cached.

### 7.4 Regime switch (#111, #125) — **EC-20**

One transaction: advisory `payroll:tax:{userId}:{fy}` → `getOrCreate` the summary `FOR UPDATE` → `is_finalized` → `409 FINANCIAL_YEAR_FINALIZED` → for the self path, `allow_employee_regime_switch` → else `403 REGIME_SWITCH_NOT_ALLOWED` → the target regime must exist and be active for the FY → else `422 TAX_REGIME_UNAVAILABLE` → update `tax_regime`, `regime_source`, `regime_changed_by/at` → audit `tax.regime_changed` with old→new → commit.

**Nothing else changes.** No past month is recomputed, no `ytd_tds` is touched, no run is marked stale. The switch is an input to the *next* projection.

### 7.5 Financial-year finalization (#116, #117)

**Per employee**, inside one transaction:

1. Advisory **`payroll:tax:{userId}:{fy}`** — the same key every other per-employee tax writer takes (§7.0), so a concurrent regime switch or verification cannot commit between this transaction's read of the regime and its write of `form16_snapshot`. Then `getOrCreate` the summary `FOR UPDATE`.
2. `is_finalized` → return the existing snapshot with `already_finalized: true`. **Idempotent, not an error** — this is what makes the bulk path resumable.
3. Aggregate the FY's `approved`/`paid` run items for the user. Zero items → `422 NO_PAYROLL_IN_FINANCIAL_YEAR`.
4. Assemble the Part-B dataset (§7.7) and **assert** that its reported totals equal the summed item columns exactly, in paise. Mismatch → `422 FORM16_RECONCILIATION_FAILED`. This assertion *is* the parent's exit criterion, enforced in code rather than left to a manual check.
5. Write `form16_snapshot`, `is_finalized`, `finalized_by/at`; audit `tax.year_finalized` with the totals; commit.

**Org-wide (#117)** iterates cohorts of 200, **one transaction per employee**, isolating failures into a `failed[]` list with `user_id` + `error_code`, and returns `{ finalized, skipped, failed[] }`. Pre-flight (outside any transaction) checks that every month of the FY has an `approved`/`paid` run; missing months → `409 FINANCIAL_YEAR_INCOMPLETE` listing them, overridable with `{ acknowledge_missing_months: true, reason }` for an org that adopted the product mid-year.

**#117 takes no lock of its own.** It is a sequential loop over per-employee operations that are each individually locked (step 1) and idempotent (step 2), which is what makes two concurrent bulk finalizations converge rather than collide, and what makes a crashed run resumable by simply re-issuing it. Adding an org-scoped lock around the loop would serialise every single-employee #116 behind a multi-minute batch for no correctness gain.

**No un-finalize endpoint exists.** A finalized FY is immutable, in line with D-12. A genuine correction is a Phase-7 concern and would be a revised Form 16 with a new version, not an edit.

### 7.6 Why Phase-4 writes do not use `payroll_period_guard`

Phase 3's EC-31 guard exists because an adjustment names a **specific `period_month`** and therefore competes with one specific run for one specific month's money. Nothing in Phase 4 does that: a declaration, a regime choice, a previous-employer figure and a statutory config are all **standing inputs** consumed by whichever run next calculates. They cannot land in a closed period because they never target a period.

The consequence must be stated so it is not mistaken for an oversight: **verifying a declaration after March's run is approved does not retroactively change March's TDS.** It changes April's, which is exactly how TDS works and exactly what the true-up in §5.6 step 2 exists to settle. Retro-correcting a closed period remains forbidden by D-12 and remains Phase 7's arrears problem.

`#96` (statutory config) is the one Phase-4 write that could plausibly want the guard, and it deliberately does not use it — because of the frozen-snapshot semantics (§2 item 17), a config change genuinely has no effect on an existing run, so marking runs `requires_recalculation` would be a lie that forces a pointless recalculation. §7.1's `affected_runs[]` response tells the truth instead.

### 7.7 Form 16 Part B assembly

Assembled **only** from `approved`/`paid` run items of the FY, plus the summary's previous-employer figures and the verified declaration:

```
Gross salary (17(1))              = Σ taxable_earnings  + previous_employer_taxable
Less: exemptions u/s 10 (HRA)     = Rule 2A, old regime only
Less: standard deduction (16(ia)) = regime.standard_deduction
Less: professional tax (16(iii))  = Σ professional_tax_amount + previous_employer_pt
= Income chargeable under Salaries
Less: Chapter VI-A (verified amounts + §5.5a injections, per-section capped)
      where 80C injection = Σ pf_employee_amount + previous_employer_pf   (actuals, not projections)
= Total income                     → rounded to nearest ₹10 (Section 288A)
Tax on total income → rebate 87A → surcharge (net of marginal relief) → cess
                                   → rounded to nearest ₹10 (Section 288B)
Less: TDS deducted                = Σ income_tax_amount + previous_employer_tds
= Balance payable / refundable
```

**Form 16 uses the same §5.5 code path as the projection, with actuals substituted for projections.** Every deduction the projection applied must appear here — the §80C PF injection (§5.5a), `previous_employer_pt` in §16(iii), and both statutory roundings. A Form 16 that omits a deduction the monthly TDS honoured would report a higher liability than was withheld against, turning a correct year into an apparent shortfall. This is not a second implementation: `projectAnnualTax` is called with `months_after_current = 0` and YTD figures summed over the whole FY, so there is exactly one place where tax is computed.

Plus per-quarter TDS detail (derived from `period_month`), the employee's PAN and the org's TAN/PAN from `organization_profiles`, and the Part-A reference (#115) when recorded.

**Two things this deliberately does not do:** it does not render a PDF (Phase 6, D-11 — `pdfkit` is still not a dependency), and it does not attach a Part-A file (Phase 5, D-29). The dataset is complete; only the delivery layer is deferred, exactly as payslip-as-JSON in Phase 2 preceded the payslip PDF in Phase 6.

---

## 8. Tests (`node:test`) — D-10

Runner and script are in place. All new suites are pure — no database, no network.

| File | Must cover |
|---|---|
| `tests/unit/payroll/tax_period.test.js` | FY derivation for April-start and January-start orgs; FY month list across the year boundary; `monthsRemainingInFy` at the first, middle and last month; ESI period boundaries at March/April and September/October; **a declaration window that wraps the year end** (Apr→Jan) open in December and closed in March; age band at exactly 60 and exactly 80; NULL `dob` → null |
| `tests/unit/payroll/statutory_pf.test.js` | **EC-18 both directions** — `restrict_to_ceiling` on/off at a wage above and below the ceiling; ceiling proration with LOP on and off; EPS capped at its own ceiling independent of `pf_restrict_to_ceiling`; `eps + epf_employer == pf_employer_total` exactly for a wage that does not divide cleanly; `eps_rate > pf_employer_rate` clamps rather than manufacturing money; admin-charge floor; every head disabled → all zeros, no lines |
| `tests/unit/payroll/statutory_esi.test.js` | **EC-19** — crossing the threshold mid-period continues coverage on the *actual* wage to period end; not covered at period entry stays uncovered even when wages later drop below the threshold; a joiner mid-period is assessed on their first month; **overtime excluded from the eligibility test but included in the contribution wage**; `esi_include_overtime` off; the exact-threshold boundary (₹21,000 covered, ₹21,000.01 not); **EC-45** — a `bonus`/`incentive` adjustment is excluded from **both** ESI figures, and specifically **does not** push a ₹19,000 employee over the threshold and out of coverage, while an `ad_hoc_earning` of the same size **does** count |
| `tests/unit/payroll/statutory_pt.test.js` | slab selection at both range boundaries **under the half-open rule** — a gross of exactly `to_amount` falls in the *next* slab, not this one; **a gross carrying paise (`10000.50`) between two contiguous slabs resolves to exactly one slab and never zero**; open-ended top slab; gender-specific slabs; `month_overrides` for February; unresolved state → `{ amount: 0, unresolved: true }`, never a throw; `pt_state_source` both ways; case/whitespace-insensitive state matching |
| `tests/unit/payroll/tax_projection.test.js` | old vs new regime on the same income; standard deduction; per-section Chapter VI-A caps, including an over-declared 80C and a section absent from the limits map; **§5.5a — the auto-injected EPF raises 80C when the employee declared nothing, is capped with declarations at ₹1.5L rather than summing past it, includes `previous_employer_pf`, and is ignored entirely under the new regime**; **Rule 2A with zero rent and with rent below 10% of `hra_base` yields exemption 0, never a negative that inflates taxable income**; the three legs each selected as the minimum, metro and non-metro; 87A rebate at and just above the limit; **surcharge with marginal relief at the ₹50 lakh boundary** (the income just over the threshold must not pay more net than the income at it); cess; **§288A/§288B — taxable income and total liability are both multiples of ₹10, and a slab-boundary income rounds the way the section prescribes**; marginal slab accumulation across three brackets; age-band slabs and the `below_60` fallback; zero/negative taxable income clamps to 0 |
| `tests/unit/payroll/tds_monthly.test.js` | even division across remaining months; **exact true-up in the last month of the FY**; **EC-41** — liability below YTD deducted clamps to 0 with `TDS_OVERDEDUCTED_REFUND_AT_ITR`, never negative; **EC-32** — 206AA raises TDS to 20% of monthly taxable when PAN is missing and does **not** lower it when the computed rate is higher; **206AA overrides the final-month true-up upward and records `206AA_OVERRODE_TRUE_UP`**; each `tds_monthly_rounding` mode; **twelve `nearest_ten` monthly figures sum exactly to a §288B-rounded annual liability**; previous-employer TDS reduces the remaining liability |
| `tests/unit/payroll/statutory_calculation.test.js` | the module **imports no `db`**; all heads disabled → zero lines and `statutory_status: 'disabled'`; a `is_statutory` structure line is excluded from every base and warns; the 1000–1999 display-order band; **no ₹0 lines emitted**; **every emitted line carries the §5.7 flag table's values — `is_part_of_ctc` true only for `employer_contribution`**; `figures` matches the emitted lines exactly; **`ytd.pf` / `projectedMonthlyPf` / `previousEmployer.pf` reach `projectAnnualTax` as the `80C` injection** (a regression guard for the silent under-deduction); PT unresolved is a warning, not a throw |
| `tests/unit/payroll/payroll_calculation.test.js` *(extend)* | **omitting `statutoryContext` reproduces Phase-3 output byte-for-byte** — every existing assertion passes unchanged; statutory deductions land between structure and adjustment deductions and therefore reduce the net a loan EMI is tested against (**EC-15 interaction**); `Σ earnings − Σ deductions + shortfall + rounding == net_pay` exactly with structure + OT + adjustments + statutory + loan + carry-forward + rounding all present; statutory alone driving net negative clamps and warns `STATUTORY_EXCEEDS_NET` (and errors under `block`) |
| `tests/unit/payroll/loan_schedule.test.js` *(unchanged)* | Must still pass after the `addMonths` move (§5.1) — that is the proof it is behaviour-preserving |

**Integration checks stay manual** (no HTTP harness exists; do not build one here) — §10 covers them.

---

## 9. Documentation Deliverables (part of the phase, not afterwork)

1. **`public/md_system/api_registry.md`** — two new sections (`## Payroll Module - HR Administration (Phase 4)`, `- Employee Self-Service (Phase 4)`), one row per endpoint **#95–#127**, matching the existing 13-column format. **No Manager section** (D-28) — state that explicitly rather than leaving a reader to wonder.
2. **`public/md_settings/org_settings_registry.md`** — entries **#47–#50** (§4.1, §4.2, §4.11), using the file's exact seven-field structure and citing real enforcement files. **Also backfill the missing #45–#46** (`negative_net_handling`; the six loan-policy knobs) from Phase 3 (§2 item 6). *(And delete the stray `</content></invoke>` markup the parent's Appendix records — Phase 3 was meant to and did not.)*
3. **`public/md_payrolls/combined_api_analysis.md`** — a Phase-4 section with request/response contracts for all 33 endpoints, including the declaration item `metadata` shape per section, the reserved `EPF_AUTO` sub-category, the `statutory_snapshot` schema, the Form 16 Part-B dataset shape, and **the `ctc_cost` semantic change** (§5.7): from engine 4 onward it includes employer statutory contributions and therefore exceeds `annual_ctc / 12`.
4. **`public/md_payrolls/phases/phase4_api_analysis.md`** and **`phase4_business_walkthrough.md`** — mirroring the Phase-1/2/3 artefacts. The walkthrough must narrate the **FY-end declaration cycle** end to end (declare in April → proofs in January → verify → the proof-deadline basis switch → March true-up → finalize → Form 16), because that sequence spans six endpoints and four edge cases and is the one flow nobody can infer from the endpoint list alone.
5. **`public/md_payrolls/implementation_plan.md`** — a single edit repairing all of the following:
   * §0 status line → Phases 1–3 implemented, Phase 4 in progress.
   * §3 → add **D-15 … D-21** (never added, §2 item 6) **and D-22 … D-29** from this plan.
   * §4 → Phase-4 table list confirmed at seven; note the `payroll_run_items`, `salary_components` and structure-snapshot column additions.
   * §5 Step 7 → point at §5.7 of this plan; Step 6 → note that the OT line's PF/ESI flags become config-driven in engine 4 (the Phase-2 placeholder is now resolved); Step 9 → note that `ctc_cost` now carries employer statutory contributions.
   * §9 → add **EC-32 … EC-47** (§10.4).
   * §11 → mark open decision **1 (statutory jurisdiction)** as DECIDED: India, config-driven (**D-22**).

---

## 10. Exit Criteria — Phase 5 does not begin until every line is checked

### 10.1 Schema & wiring

- [ ] `00043` migrates up, down, and up again cleanly (every new enum type dropped with `CASCADE`; all 12 `payroll_run_items` columns, `salary_components.is_hra` and both structure-snapshot columns removed; `engine_version` default restored to `3`).
- [ ] The seven new models load; **every Phase-1/2/3 endpoint is regression-checked** — `/hr/settings`, `/hr/components`, `/hr/runs/:id/calculate`, `/hr/adjustments`, `/hr/loans/:id/approve`, `/me/salary-structure`, `/me/payslips/:runId`, `/me/loans`.
- [ ] A run calculated with **every statutory head disabled** produces figures **byte-identical** to the Phase-3 engine for the same inputs, with `engine_version: 4` and `statutory_status: 'disabled'`.
- [ ] `PUT /hr/settings` → `GET /hr/settings` round-trips every payroll setting **#35–#50**.
- [ ] The `is_hra` / `is_statutory` backfills produce exactly one `is_hra` component per bootstrapped org and flag every statutory snapshot line.
- [ ] `POST /hr/components/bootstrap` on an org bootstrapped in Phase 1 adds the six new statutory rows and leaves every edited row untouched.

### 10.2 Statutory arithmetic

- [ ] **EC-18** — PF respects the ceiling **both ways**: `restrict_to_ceiling = true` caps PF wage at ₹15,000 for a ₹40,000 basic; `false` computes on the full ₹40,000. With LOP and `pf_lop_reduces_ceiling = true`, the ceiling is prorated.
- [ ] `EPS + PF_EMPLOYER == the total employer PF` exactly, to the paise, on every item.
- [ ] **EC-19** — an employee at ₹20,000 in July who rises to ₹23,000 in August **continues** ESI on ₹23,000 through September and stops in October; one at ₹23,000 in April is not covered in April and **stays uncovered** in May even at ₹19,000; a September joiner at ₹19,000 is covered from September.
- [ ] **D-25** — overtime is excluded from the PF wage and from the ESI *eligibility* test, and included in the ESI *contribution* wage; the emitted `OVERTIME` line's `pf_applicable` / `esi_applicable` flags match the config that produced the bases, and flipping either config knob changes both the line and the base together.
- [ ] PT resolves from `organization_locations.state`, honours a February override, and an employee with no resolvable state yields **PT ₹0 + a warning**, with `pt_unresolved_count` visible in `#37` and `#42` — the run still reaches `calculated`.
- [ ] `Σ earnings − Σ deductions + shortfall + rounding == net_pay` **exactly** on every item with all of structure, OT, adjustments, statutory, loan EMI, carry-forward and rounding present (**EC-17**).
- [ ] Statutory deductions are applied **before** loan EMI, so an employee whose net covers the EMI without statutory but not with it has the EMI **skipped**, not partially charged (**EC-15 interaction**).
- [ ] **EC-45** — a ₹19,000 employee paid a ₹5,000 `bonus` adjustment flagged `esi_applicable` **stays ESI-covered** (the bonus enters neither ESI figure), while the same amount as an `ad_hoc_earning` does count toward both.
- [ ] **Half-open slabs (§4.2)** — a monthly gross of `10000.50` between two contiguous PT slabs returns exactly one slab's amount, never ₹0; a taxable income landing exactly on a tax-slab boundary is taxed in the **upper** bracket.
- [ ] `PUT /statutory/pt-slabs/states/MH` submitting the legacy inclusive form (`[0,10000]`, `[10001,20000]`) is **rejected** with `422 PT_SLAB_RANGE_INVALID` naming the ₹1 gap, so an org cannot silently carry the old convention forward.
- [ ] Every emitted statutory line matches the §5.7 flag table; `is_part_of_ctc` is `true` on employer contributions and `false` on employee deductions; `ctc_cost` exceeds `annual_ctc / 12` by exactly the employer-contribution total.

### 10.3 Tax, declarations & Form 16

- [ ] `POST /tax/bootstrap` twice for one FY → second returns all `skipped`, zero duplicates; an edited regime is never overwritten.
- [ ] A ₹12,00,000 CTC employee's monthly TDS × 12 equals the projected annual liability to within one month's rounding, and the **March true-up closes the gap exactly**.
- [ ] **EC-20 / EC-41** — switching regime in month 7 changes the projection, leaves `ytd_tds` untouched, and (when the new regime is cheaper) clamps monthly TDS to ₹0 with `TDS_OVERDEDUCTED_REFUND_AT_ITR`. **No negative TDS line exists anywhere.**
- [ ] **EC-21** — a declaration with declared-but-unverified 80C reduces TDS for every run **before** the frozen `proof_deadline` and stops reducing it from the first run **on or after** it, with no cron, no manual step, and the difference recovered across the remaining months.
- [ ] **EC-35** — verifying ₹80,000 against a declared ₹1,50,000 raises the next month's TDS and reconciles by March.
- [ ] **EC-32** — an employee with no PAN has TDS raised to 20% of monthly taxable with `PAN_MISSING_206AA_APPLIED`; an employee whose computed rate already exceeds 20% is unaffected.
- [ ] Marginal relief: an employee at ₹50,00,001 taxable does not have a **lower** net than one at ₹50,00,000.
- [ ] **EC-44 / §5.5a** — an old-regime employee who declares **nothing** and contributes ₹5,000/month of PF has ₹60,000 of §80C applied automatically; one who also declares ₹1,20,000 of LIC is capped at ₹1,50,000 (not ₹1,80,000); the same employee under the **new** regime gets no §80C at all. An item submitted with `sub_category: 'EPF_AUTO'` → `422 RESERVED_DECLARATION_SUB_CATEGORY`.
- [ ] `previous_employer_pt` reduces the projected §16(iii) deduction, and `previous_employer_pf` raises the §80C injection — verified by a before/after on `#113`. **Neither column is dead.**
- [ ] **§288A/§288B** — `#113`'s `taxable_income` and `total_liability` are both exact multiples of ₹10; the sum of the FY's twelve `income_tax_amount` values equals the §288B-rounded annual liability.
- [ ] **EC-43** — HR reopens a submitted declaration (#109), a run is calculated while it sits in `draft`, and the employee's §80C is **still applied** (the engine reads it via `submitted_at`); a **never-submitted** draft is correctly invisible.
- [ ] **EC-46** — with 3 of 5 declarations unverified past the proof deadline, `#37 eligibility` reports `unverified_declaration_count: 3` and `proof_deadline_passed: true` **before** the run is calculated.
- [ ] **EC-47** — after a reopen, `#123` re-submitting an item with an **unchanged** `declared_amount` preserves its `verified_amount`; changing the amount resets it to `pending`; omitting a **verified** item → `422 CANNOT_REMOVE_VERIFIED_ITEM`.
- [ ] `#127` records a `proof_reference` on a `submitted` declaration **without** a reopen and without altering any amount or the header status; `#107` can also write `proof_reference`.
- [ ] **The parent's headline criterion** — `POST /tax/financial-years/:fy/finalize` produces a Form 16 Part B whose gross, PT, Chapter VI-A and TDS totals equal the summed run-item columns for that FY **exactly**, enforced by the §7.5 step-4 assertion; a deliberately corrupted item makes finalization fail with `FORM16_RECONCILIATION_FAILED` rather than emitting a wrong Form 16.
- [ ] `GET /me/tax/form16/:fy` returns `404` before finalization and the frozen snapshot after; re-fetching after another run is approved returns the **identical** snapshot.

### 10.4 Edge cases newly registered by this phase

- [ ] **EC-32** PAN missing → Section 206AA 20% floor. *(above)*
- [ ] **EC-33** Mid-year joiner with no previous-employer figures recorded → under-withholding, surfaced as `previous_employer_unrecorded_count` in `#37` and a per-item warning; recording the figures corrects the next run.
- [ ] **EC-34** Employee exits mid-FY → the last approved run is not a true-up (payroll cannot know it is the last); FY finalization produces a correct Form 16 from actuals.
- [ ] **EC-35** Verified < declared after TDS was withheld on the declared basis → self-corrects. *(above)*
- [ ] **EC-36** Statutory deductions alone drive net negative → Phase-3 clamp/carry-forward with `STATUTORY_EXCEEDS_NET`; `block` mode yields an `error` item and `409 RUN_HAS_ERRORS`.
- [ ] **EC-37** A head disabled mid-FY leaves prior months' figures untouched and Form 16 reports actuals.
- [ ] **EC-38** PF above ceiling with `restrict_to_ceiling = false` **and** LOP → ceiling proration and the unrestricted base do not interact incorrectly.
- [ ] **EC-39** March (FY end) trues up; April starts a fresh FY with zero YTD, verified for an org with `financial_year_start_month = 4` **and** one with a non-April FY.
- [ ] **EC-40** A second declaration for the same `(user, FY)` → unique-index violation surfaced as `409 DECLARATION_ALREADY_EXISTS`.
- [ ] **EC-41** Negative remaining liability clamps to zero. *(above)*
- [ ] **EC-42** Editing statutory config does **not** change an existing run even after recalculation — because `prepareForRun` reads the frozen `settings_snapshot.statutory`, not the live tables; `#96`'s `affected_runs[]` names every run in that state. **Correcting a location's `state` and recalculating DOES change PT**, because master data is deliberately not frozen (§5.8).
- [ ] **EC-43** Reopened-but-previously-submitted declarations stay visible to the engine. *(above)*
- [ ] **EC-44** Employee PF auto-injected into §80C. *(above)*
- [ ] **EC-45** Periodic bonuses excluded from both ESI wage figures. *(above)*
- [ ] **EC-46** Unverified-past-deadline cliff surfaced in `#37` before it bites. *(above)*
- [ ] **EC-47** Item-set replacement preserves verification. *(above)*

### 10.5 Lifecycle, concurrency & idempotency

- [ ] Recalculating a run twice produces identical statutory figures and identical item UUIDs (**D-16**), and all 12 columns change when the config changes on a **new** run (proving `ENGINE_OWNED_COLUMNS` is complete).
- [ ] Approving and then cancelling a run leaves every `employee_tax_summaries` row untouched, and the next calculation's YTD figures automatically exclude the cancelled run (**D-27** — no reversal code exists because none is needed).
- [ ] Two concurrent `POST /tax/declarations/:id/verify` → one verification, the second refused by the status guard; no partial verification is ever persisted.
- [ ] **All five declaration writers hold the same lock (§7.0)** — a concurrent `#123` upsert and `#124` submit for one employee serialise, and `total_declared` always matches the surviving item set afterwards. Same for `#108` reject and `#109` reopen racing `#107` verify.
- [ ] **A regime switch (#111/#125) cannot commit between finalization's regime read and its snapshot write** — both take `payroll:tax:{userId}:{fy}`. Verified by issuing the two concurrently and confirming `form16_snapshot.regime` always equals the row's `tax_regime`.
- [ ] Two concurrent `POST /tax/financial-years/:fy/finalize` → each employee finalized exactly once; the second run reports them as `skipped`.
- [ ] A single-employee `#116` issued **during** a bulk `#117` is not blocked org-wide; it waits only on that one employee's lock.
- [ ] Re-running the bulk finalize after a crash resumes and completes without duplicating any snapshot.
- [ ] `PUT /statutory/pt-slabs/states/MH` with a gap between ₹10,000 and ₹15,000 → `422 PT_SLAB_RANGE_INVALID`, **nothing persisted**, the previous set still active.
- [ ] **`POST /runs` with `income_tax_enabled` and no tax tables for the FY → `422 TAX_TABLES_MISSING` at CREATE**, with no draft run persisted — the misconfiguration is caught before any calculation work happens.
- [ ] `income_tax_enabled = true` with no tax tables for the FY → the run reaches `failed` with `TAX_TABLES_MISSING` naming the FY, not 1,000 identical error items.

### 10.6 Authority & secrecy

- [ ] An `employee` token on any `/hr` Phase-4 route → `403`; an `admin` / `super-admin` token → `403` everywhere (**D-14**).
- [ ] **No manager route exposes declaration detail** (D-28) — `/api/v1/payroll/manager` has zero Phase-4 endpoints, verified by route enumeration.
- [ ] An employee can read only their own declaration, projection, summary and Form 16; substituting another user's id anywhere under `/me` returns their own data or `403`, never someone else's (**EC-24**).
- [ ] HR of Org A cannot read or mutate any Org B config, slab, declaration or tax summary.
- [ ] `landlord_pan` and `pan_number` never appear in any list response; PAN appears in full only in the owner's own Form 16 and in HR's single-employee views.
- [ ] Every config change, slab replacement, verification, rejection, reopen, regime switch, previous-employer entry, Part-A record and finalization appears in `payroll_audit_logs` with actor and reason. A bulk finalize writes **one audit row per employee finalized plus one for the batch**, not one per component.

### 10.7 Performance & tests

- [ ] A 500-employee run with all statutory heads on issues **1 once-per-run + 3 extra queries per cohort** over the Phase-3 baseline (verified by query log); a 3,000-employee run stays at ~124 queries, confirming O(cohorts).
- [ ] `settings_snapshot` for a run in a 5-state, 2-regime org stays under ~10 KB, confirming the frozen statutory block is bounded (§5.8).
- [ ] Peak RSS during a 3,000-employee run stays flat across cohorts.
- [ ] `npm test` passes: all Phase-1/2/3 suites **and** the seven new Phase-4 suites plus the extended `payroll_calculation.test.js`.

---

## 11. Risks & Decisions Needed

| # | Item | Recommendation | Needed by |
|---|---|---|---|
| 1 | **Statutory jurisdiction** — the parent's §11 open decision 1, unresolved until now. | **D-22 — India, confirmed, and config-driven.** Every rate, ceiling, threshold and slab is a data row, so a legislative change is an HR edit, not a deploy. A second country is **not** abstracted for: the parent already records that it would require abstracting the statutory layer, and building that abstraction speculatively would double this phase's surface for a requirement nobody has stated. | Phase start |
| 2 | **Where statutory numbers come from.** A catalog component coded `PF_EMPLOYEE` with `percent_of_basic = 12` could reach a salary structure and double-deduct PF the day Phase 4 ships. | **D-23** — statutory components are **engine-synthesised only**, never structure lines. Enforced at three write points **and** at the read side by the `is_statutory` snapshot flag (§5.9). Both guards are required: the write guard is useless against a structure approved before it shipped, and Phase 4 itself removes the accidental protection by activating those catalog rows (§2 item 12). | Before §5.9 |
| 3 | **Where YTD figures live.** Incrementing a summary table at run approval mirrors Phase-3's D-18, but a cancelled run would then need an exact reversal — the machinery Phase 3 called the phase's most dangerous code. | **D-27** — derive every YTD actual from approved/paid run items, always. `employee_tax_summaries` stores only non-derivable state. **Phase 4 therefore adds no hook to run approve or cancel at all**, at the cost of one aggregate query per cohort. This is the single most load-bearing decision in the phase. | Before §4.7 |
| 4 | **No default PT slabs ship.** An org that enables PT with no slabs gets `PT_STATE_UNRESOLVED` for everyone. | Accept. PT slabs are state-legislated, differ across ~20 states and change; shipping stale defaults would produce confidently wrong deductions, which is worse than none. Mitigated by making the unresolved case a **loud warning surfaced in `#37` and `#42` before approval**, and by documenting Maharashtra/Karnataka slab sets as *examples* in the API analysis rather than as seeds. | Before §4.2 |
| 5 | **`statutory_configs` is a plain singleton, not effective-dated** (**D-26**). A run created after a config edit uses the new config even for an old period. | Accept, mitigate, document. The `settings_snapshot` freeze already makes each run reproducible; effective-dating would add a second overlapping mechanism with its own overlap/gap invariants. `#96` returns `affected_runs[]` and `#37` returns `statutory_config_updated_at`, so the condition is visible rather than latent. The operator's remedy is the documented Phase-2 one: cancel and re-create the run. **The freeze only holds if `prepareForRun` actually reads the snapshot** — see item 14. | Before §4.1 |
| 6 | **Marginal relief on surcharge is intricate** and is not in the parent's stated scope (which lists only slabs, standard deduction, Chapter VI-A and cess). | **Include it.** Omitting it over-withholds by lakhs in a narrow band just above each surcharge threshold, and produces the absurd result that earning ₹1 more lowers take-home. It is ~15 lines of pure arithmetic with a decisive test (§8). Flag it in the phase completion report as a deliberate, justified extension. | Before §5.5 |
| 7 | **ESI rounding convention.** ESIC convention rounds employee ESI **up** and employer ESI **down** to the rupee; this engine rounds both half-up to the paise, like every other figure. | Accept for this phase and **record the convention in `statutory_snapshot`**. Introducing a per-head rounding mode would fork `money.utils`' single rounding policy — the one rule that makes EC-17 reconciliation hold module-wide. If an ESIC filing rejects the paise, the fix is a rounding option on the *export* (Phase 6), not on the engine. | Design |
| 8 | **Form 16 has no PDF and Part A has no file** — the parent's Phase-4 scope says "Form 16 Part B + annual statement; Part A upload-and-attach". | **D-29** — Phase 4 delivers the complete Part-B **dataset**, frozen and reconciled, and registers Part A by **reference** (`ack_number`, `issued_on`, `reference_url`). The PDF is Phase 6 (D-11: `pdfkit` is confirmed *before Phase 6* and is still not a dependency); the binary attachment is Phase 5, which owns the local-vs-S3 decision the parent's §11 item 4 defers to it — and Phase 5 will add its FK over the same `investment_declaration_items.proof_reference` and `employee_tax_summaries` rows, no restructuring. **This is a deliberate deferral of the delivery layer, not of the requirement**, and it mirrors payslip-as-JSON in Phase 2 preceding the payslip PDF in Phase 6. Confirm before starting §6.1 #114–#115 if a rendered Form 16 is needed inside Phase 4. | **Confirm at phase start** |
| 9 | **Income heads this engine does not model.** Perquisites (17(2)), LTA, gratuity, superannuation, employer NPS 80CCD(2), VPF, house-property loss, other-sources income, and the ₹7.5 lakh 17(2)(vii) employer-contribution threshold. | Accept and **state the limitation in the `#113` / `#120` projection response payload**, not only in this document. An employee who sees "your projected tax" must be able to see what it does and does not account for. Each is additive later over the same `investment_declaration_items` table (a new `section` value) or a new income column on `employee_tax_summaries`; none requires restructuring. | Communication |
| 10 | **The `addMonths` move** (§5.1) touches `loan_schedule.utils.js`, live Phase-3 money code. | Accept — it is a pure import swap with an unchanged public surface, and `loan_schedule.test.js` passing untouched is the proof. The alternative (a second `addMonths` in `tax_period.utils`) puts two copies of month arithmetic in a module whose whole discipline is single-source date handling. | Before §5.1 |
| 11 | **Documentation debt inherited from Phase 3** (§2 item 6): a stale parent status line, seven missing architectural decisions (D-15…D-21) and two missing registry entries (#45–#46). | **Repair all three in this phase's §9 deliverables**, and treat the parent's status line and decision list as a **required** edit at the end of every phase, not an optional one. Phase 3 already flagged this pattern (its §11 item 14) and it recurred anyway — which is the argument for making it an exit-criterion checkbox rather than a note. | Before Phase 5 |
| 12 | **Overtime's statutory treatment** — Phase 2 shipped `pf_applicable: false, esi_applicable: false` on the OT line as an explicit placeholder and instructed Phase 4 to revisit it. Leaving it would silently under-contribute ESI for every org that pays overtime. | **D-25** (§4.1) — exclude OT from the PF wage, include it in the ESI *contribution* wage but not the ESI *eligibility* test, both config-overridable. The emitted line's flags are set **from the config** so a payslip line can never disagree with the base it fed. Frozen engine-2/3 runs are unaffected. | Before §5.4 |
| 13 | **33 endpoints and 7 tables is a large surface**, and the two dangerous parts (the engine and the tax tables) are at opposite ends of it. | §12's ordering keeps each step verifiable and deployable: schema → repositories → **pure utils with their tests** → the pure composer → configuration APIs (data must exist before the engine can read it) → declarations → aggregator → engine wiring → tax summaries and Form 16 → projections → routes → docs. The engine is not wired until step 9, by which point every arithmetic decision is already under a passing test. | Sequencing |
| 14 | **The snapshot freeze is easy to defeat by accident.** `prepareForRun` receives `settingsSnapshot` *and* has repositories in scope; reading a rate table live is a one-line mistake that no test fails on unless one is written for it. | Reading rates live was in fact the first draft's behaviour and it silently contradicted §2 item 17. Guard it three ways: `prepareForRun` **takes no repository for `statutory_configs` / `professional_tax_slabs` / `tax_regimes` / `tax_slabs`** so a live read is not reachable; the §10.4 EC-42 criterion asserts a config edit does not change a recalculated run; and the §10.4 companion asserts a **location `state` correction DOES** change it, proving the master-data exception is intact rather than accidentally frozen too. | Before §5.8 |
| 15 | **Two silent-failure modes are invisible to every reconciliation assert.** A missing §80C PF injection (§5.5a) and a missing `ytd_pf` in the aggregator both produce payslips that balance perfectly, reconcile exactly, and are wrong only in the employee's tax. | This class of bug cannot be caught by the module's existing invariants, which is precisely why §8 requires an explicit regression test asserting the injection reaches `projectAnnualTax`, and why §10.3 requires a numeric before/after on `#113` for both `previous_employer_pf` and `previous_employer_pt`. **Treat "the totals reconcile" as insufficient evidence for anything in §5.5.** | Before §5.5a |

---

## 12. Build Order & Dependencies

Each step leaves the system **deployable and green**. Steps 1–4 change no runtime behaviour; the engine does not see statutory data until step 8, and no HTTP surface exists until step 11.

| # | Step | Depends on | Done when |
|---|---|---|---|
| 1 | Migration `00043` (§4) + 7 models + the 12 `payroll_run_items` columns + `is_hra` / `is_statutory` + backfills + `engine_version` default | — | `db:migrate` → `undo` → `migrate` clean; Phase-1/2/3 endpoints regression-checked; backfills verified on a bootstrapped org |
| 2 | 7 repositories; `ENGINE_OWNED_COLUMNS` gains all 12 names; `findStatutoryPeriodAggregates` (§5.8) **including `ytd_pf`** | 1 | The aggregate read returns correct sums for a hand-seeded FY, `ytd_pf` among them; recalculation still preserves exclusions and overrides |
| 3 | **Pure utils** — `tax_period`, `statutory_pf`, `statutory_esi`, `statutory_pt`, `tax_projection` (incl. §5.5a injection, the HRA clamps and §288A/B), `tds_monthly`; `money.utils.roundNearestTen`; the `addMonths` move (§5.1) | — *(parallel with 1–2)* | Six suites pass; `loan_schedule.test.js` passes **untouched** |
| 4 | `statutory_calculation.service.js` (§5.7) — the pure composer | 3 | Its suite passes, including the "imports no `db`" assertion and the no-₹0-lines rule |
| 5 | `statutory_config.service` + PT slab set-replacement (§7.1, §7.2) + catalog activation + `payroll_defaults` additions + `updateSettingsSchema` keys | 1, 2 | Config round-trips; slab gap/overlap rejected atomically; bootstrap adds the six rows idempotently |
| 6 | `tax_table.service` — regimes, slabs, `payroll_tax_defaults`, FY bootstrap (§6.1 #100–#104) | 1, 2 | Bootstrap is idempotent; slab replacement validated; exactly one default regime per FY |
| 7 | `investment_declaration.service` — all five writers under one lock (§7.3), the §7.3a preservation rule, `EPF_AUTO` rejection | 1, 2 | Window enforcement, `verified <= declared`, all five lock paths, §7.3a's five cases, and idempotency all behave |
| 8 | `payroll_statutory_aggregator.service` (§5.8) — snapshot-sourced rates, live location map, `submitted_at` visibility | 2, 5, 6, 7 | Correct maps for a hand-seeded cohort; **1 + 3-per-cohort** query count confirmed; a reopened declaration is still visible; no repository for the four rate tables is in scope (§11 item 14) |
| 9 | **Engine wiring** — `computePayrollItem` Step 7; `payroll_run.service` `buildSettingsSnapshot` statutory block + CREATE-time tax-table validation / `engine_version` / `prepareForRun` / cohort call / 12 columns; §5.9 assignability guards | 4, 8 | Extended `payroll_calculation.test.js` passes **and** every Phase-3 assertion passes unchanged with `statutoryContext` omitted; a seeded employee's PF/ESI/PT/TDS appear as component lines; **a config edit does not change a recalculated run, while a location `state` correction does**; recalculation is idempotent |
| 10 | `employee_tax.service` — summary, regime switch, previous employer, projection, Form 16 Part B, Part A, finalization under the **per-user** lock (§7.4, §7.5, §7.7) | 9 | Finalization's reconciliation assertion fires on corrupted input and passes on clean input; a concurrent regime switch cannot interleave; bulk finalize is resumable and does not block single-employee finalize |
| 11 | Controllers → routes → validators, in audience order **HR (#95–#118) → Self (#119–#127)**; payslip/preview/eligibility projection updates (§6.3) | 5, 6, 7, 9, 10 | Route-order check passes (`/tax/declarations` before `/tax/financial-years/:fy`; `/me/tax/declarations/proofs` before any `/me/tax/declarations/:param`); the version-aware `statutory_note` renders correctly for engine-2, -3 and -4 items |
| 12 | Documentation & registries (§9), **including the Phase-3 debt repair** | 11 | All five deliverables updated; D-15…D-29 present in the parent; registry complete through #50 |

**Critical-path note.** Steps 4 → 8 → 9 are the chain that can corrupt money, and step 9 is the only one that touches code Phase 2 and Phase 3 already proved correct. Do not begin step 9 until step 4's suites are green **and** step 8's query count is measured. The specific failure to guard against is the double deduction described in §5.9: a structure carrying an activated statutory component, plus an engine that also computes it. Verify the read-side guard on a deliberately corrupted structure before wiring anything else.
